import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import './App.css';

// Configuration
const DATA_FILE = '/refined_training_data.csv'; 
const BACKEND_URL = 'http://localhost:8080/api/energy/stream';

function App() {
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Counts
  const [counts, setCounts] = useState({
    fan: 0, light: 0, ac: 0, fridge: 0, geyser: 0, microwave: 0, tv: 0, washing_machine: 0
  });

  const [csvData, setCsvData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [generatedDevices, setGeneratedDevices] = useState([]);
  const [multipliers, setMultipliers] = useState({});

  // --- WORKER REF ---
  const workerRef = useRef(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCounts(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
  };

  // --- INITIALIZE WORKER ON MOUNT ---
  useEffect(() => {
    // 1. Create the worker pointing to the file in 'public' folder
    workerRef.current = new Worker(process.env.PUBLIC_URL + '/timerWorker.js');

    // 2. Listen for the "TICK" message from the worker
    workerRef.current.onmessage = (event) => {
      if (event.data === "TICK") {
        // This runs every second, regardless of tab visibility
        setCurrentIndex(prevIndex => {
             // We need to access the LATEST csvData length. 
             // Since we can't easily access state inside this callback without dependencies,
             // we rely on the fact that we won't start simulation until data is loaded.
             return (prevIndex + 1); 
        });
      }
    };

    // 3. Cleanup when App closes
    return () => {
      workerRef.current.terminate();
    };
  }, []);

  // --- HANDLE CSV INDEX WRAPPING ---
  // We do the modulo check here to ensure we always have access to the latest csvData length
  useEffect(() => {
      if (csvData.length > 0 && currentIndex >= csvData.length) {
          setCurrentIndex(0);
      }
  }, [currentIndex, csvData.length]);


  // --- START / STOP LOGIC ---
  const startSimulation = () => {
    Papa.parse(DATA_FILE, {
      download: true,
      header: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          setCsvData(results.data);
          generateDeviceList();
          setIsSimulating(true);
          
          // TELL WORKER TO START
          if (workerRef.current) {
            workerRef.current.postMessage("START");
          }
        } else {
          alert("Error: refined_training_data.csv is empty or not found!");
        }
      }
    });
  };

  const stopSimulation = () => {
    setIsSimulating(false);
    setCurrentIndex(0);
    setMultipliers({});
    
    // TELL WORKER TO STOP
    if (workerRef.current) {
      workerRef.current.postMessage("STOP");
    }
  };

  const generateDeviceList = () => {
    const devices = [];
    const add = (type, count, csvKey, baseWatts) => {
      for (let i = 1; i <= count; i++) {
        devices.push({
          id: `${type}_${i}`,
          type: type,
          name: `${type} ${i}`,
          csvKey: csvKey,
          baseWatts: baseWatts 
        });
      }
    };

    add('Fan', counts.fan, 'Fan_Light_Load', 65);
    add('Light', counts.light, 'Fan_Light_Load', 15);
    add('AC', counts.ac, 'AC_Geyser_Load', 1500);
    add('Geyser', counts.geyser, 'AC_Geyser_Load', 2000);
    add('Fridge', counts.fridge, 'Fridge_WashingMachine_Load', 150);
    add('WashingMachine', counts.washing_machine, 'Fridge_WashingMachine_Load', 500);
    add('Microwave', counts.microwave, 'Microwave_Oven_Load', 1000);
    add('TV', counts.tv, 'Fan_Light_Load', 100);

    setGeneratedDevices(devices);
  };

  const escalateAnomaly = (deviceId) => {
    setMultipliers(prev => {
      const current = prev[deviceId] || 1.0;
      const next = parseFloat((current + 0.2).toFixed(1)); 
      return { ...prev, [deviceId]: next };
    });
  };

  const restoreNormal = (deviceId) => {
    setMultipliers(prev => {
      const newState = { ...prev };
      delete newState[deviceId];
      return newState;
    });
  };

  // --- TRANSMISSION LOGIC (Remains mostly the same, triggers on currentIndex change) ---
  useEffect(() => {
    if (!isSimulating || generatedDevices.length === 0) return;

    // Safety check: Ensure we have data for this index
    if (!csvData[currentIndex]) return;

    generatedDevices.forEach(device => {
        const data = calculateReadings(device);
        const isInjecting = data.multiplier > 1.0; 
        
        fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: device.id,
                type: device.type,
                v: data.v,
                p: data.p,
                injecting: isInjecting 
            })
        }).catch(err => { 
            // Silent catch to prevent console spam if backend is momentarily down
        });
    });

  }, [currentIndex, isSimulating, generatedDevices, csvData]); // Added dependencies for safety


  const calculateReadings = (device) => {
    // Safety check
    if (!csvData[currentIndex]) return { v: 0, c: 0, p: 0, multiplier: 1 };
    
    const row = csvData[currentIndex];
    const multiplier = multipliers[device.id] || 1.0;
    const voltage = parseFloat(row['Voltage']) || 230;

    let power = 0;
    
    if (['AC', 'Geyser', 'WashingMachine', 'Microwave', 'Fridge'].includes(device.type)) {
      const csvVal = parseFloat(row[device.csvKey]) || 0;
      let rawPower = (csvVal * 60); 

      // Calibrations
      if (device.type === 'Fridge' && rawPower > 200) rawPower = 180;
      if (device.type === 'Microwave' && rawPower > 1400) rawPower = 1200; 
      if (device.type === 'WashingMachine' && rawPower > 1900) rawPower = 1900; 

      if (rawPower < 10) rawPower = device.baseWatts * (voltage / 230); 
      power = rawPower;
    } else {
      power = device.baseWatts * Math.pow((voltage / 230), 2);
    }

    const noise = (Math.random() * 4) - 2;
    power += noise;
    power = power * multiplier;
    let current = power / voltage;

    return {
      v: voltage.toFixed(1),
      c: current.toFixed(2),
      p: power.toFixed(0),
      multiplier: multiplier
    };
  };

  return (
    <div className="container">
      <header><h1>SmartHive Simulator</h1><p>Digital Twin Source (IoT Sensor)</p></header>
      {!isSimulating ? (
        <div className="setup-panel">
          <h2>Configure Building</h2>
          {Object.keys(counts).map(key => (
            <div className="input-group" key={key}>
              <label>{key.replace('_', ' ').toUpperCase()}</label>
              <input type="number" name={key} value={counts[key]} onChange={handleInputChange} min="0" />
            </div>
          ))}
          <button className="btn-primary" onClick={startSimulation}>Start Simulation</button>
        </div>
      ) : (
        <div className="simulation-panel">
          <div className="top-bar">
             <h2>Live Digital Twin <span className="row-badge">Row: {currentIndex}</span></h2>
             <button className="stop-btn" onClick={stopSimulation}>Stop Simulation</button>
          </div>
          <div className="dashboard-grid">
            {generatedDevices.map(device => {
              const data = calculateReadings(device);
              const isInjecting = data.multiplier > 1.0;
              return (
                <div key={device.id} className="card">
                  <div className="card-header">
                    <span className="device-id">{device.name}</span>
                    {isInjecting && <span className="status-badge warning" style={{backgroundColor: '#e67e22'}}>INJECTING x{data.multiplier}</span>}
                  </div>
                  <div className="readings">
                    <div className="reading-item"><span className="reading-label">VOLTAGE (V)</span><div className="reading-value">{data.v}</div></div>
                    <div className="reading-item"><span className="reading-label">POWER (W)</span><div className="reading-value">{data.p}</div></div>
                  </div>
                  <div className="controls">
                    <button className="btn-inject" onClick={() => escalateAnomaly(device.id)}>⚡ Inject (+0.2x)</button>
                    {isInjecting && (<button className="btn-restore" onClick={() => restoreNormal(device.id)}>♻ Restore</button>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
export default App;