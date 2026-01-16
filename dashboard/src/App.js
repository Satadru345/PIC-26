import React, { useState, useEffect, useRef, useContext, createContext, useCallback } from 'react';
import Auth from './components/Auth'; 
import axios from 'axios';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, Label 
} from 'recharts';
import { 
  LayoutDashboard, Zap, AlertOctagon, Activity, FileText, Server, XCircle, CheckCircle, TrendingUp, Mail, CreditCard, History, Wallet, Check, Lock
} from 'lucide-react';

// =========================================================================
// 1. CONFIGURATION & CONSTANTS
// =========================================================================

const BASE_URL = "http://localhost:8080/api/energy";
const ENDPOINTS = {
    DASHBOARD: `${BASE_URL}/dashboard`,
    LOGS: `${BASE_URL}/logs`,
    EMAILS: `${BASE_URL}/emails`,
    BILLS: `${BASE_URL}/bills/pending`,
    HISTORY: `${BASE_URL}/payment/history`,
    BALANCE: `${BASE_URL}/payment/balance`,
    CREATE_ORDER: `${BASE_URL}/payment/create-order`,
    VERIFY_PAYMENT: `${BASE_URL}/payment/verify`
};

const loadRazorpayScript = () => {
    return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

// =========================================================================
// 2. THE BRAIN: ENERGY CONTEXT (Global Data Store)
// =========================================================================

const EnergyContext = createContext();

const EnergyProvider = ({ children, token, onLogout }) => {
    // --- GLOBAL STATE ---
    const [data, setData] = useState(null); 
    const [logs, setLogs] = useState([]);   
    const [emailLogs, setEmailLogs] = useState([]); 
    const [bills, setBills] = useState([]); 
    const [transactions, setTransactions] = useState([]); 
    const [commonBalance, setCommonBalance] = useState(0); 
    const [graphHistory, setGraphHistory] = useState([]); 
    const [isConnected, setIsConnected] = useState(false);

    // --- SECURITY INTERCEPTOR ---
    useEffect(() => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } else {
            delete axios.defaults.headers.common['Authorization'];
        }
    }, [token]);

    // --- DATA FETCHING ENGINE ---
    const fetchData = useCallback(async () => {
        if (!token) return;

        try {
            // Parallel Fetching for Performance
            const [dashRes, logsRes, emailsRes, billsRes, historyRes, balRes] = await Promise.all([
                axios.get(ENDPOINTS.DASHBOARD),
                axios.get(ENDPOINTS.LOGS),
                axios.get(ENDPOINTS.EMAILS),
                axios.get(ENDPOINTS.BILLS),
                axios.get(ENDPOINTS.HISTORY),
                axios.get(ENDPOINTS.BALANCE)
            ]);

            // Update States
            setData(dashRes.data);
            setLogs(logsRes.data);
            setEmailLogs(emailsRes.data);
            setBills(billsRes.data);
            setTransactions(historyRes.data);
            setCommonBalance(balRes.data);
            setIsConnected(true);

            // Graph Logic (The "Heartbeat")
            setGraphHistory(prev => {
                const now = new Date();
                const timeLabel = now.getHours() + ':' + now.getMinutes() + ':' + now.getSeconds();
                const validPower = Number(dashRes.data.totalPower) || 0; 
                const newPoint = { time: timeLabel, power: validPower };
                
                // Keep last 20 points
                let updated = [...prev, newPoint];
                if (updated.length > 20) updated.shift(); 
                return updated;
            });

        } catch (err) {
            console.error("Connection Lost or Auth Failed:", err);
            
            // --- SECURITY PROTOCOL: AUTO LOGOUT ---
            if (err.response && err.response.status === 403) {
                console.warn("⚠️ Security Alert: Session Expired. Logging out.");
                onLogout(); 
            } else {
                setIsConnected(false);
            }
        }
    }, [token, onLogout]);

    // --- THE LOOP ---
    useEffect(() => {
        if (!token) return;
        
        fetchData(); // Initial Fetch
        const interval = setInterval(fetchData, 1000);
        
        // Visibility Listener: Refetch immediately when user returns to tab
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                fetchData();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [fetchData, token]);

    return (
        <EnergyContext.Provider value={{ 
            data, logs, emailLogs, bills, transactions, commonBalance, graphHistory, isConnected, 
            setBills, setCommonBalance, fetchData // Expose setters needed for Payment Logic
        }}>
            {children}
        </EnergyContext.Provider>
    );
};

// =========================================================================
// 3. THE UI: DASHBOARD COMPONENT (Visual Layer)
// =========================================================================

const Dashboard = ({ onLogout }) => {
    // CONSUME DATA FROM CONTEXT
    const { 
        data, logs, emailLogs, bills, transactions, commonBalance, graphHistory, isConnected,
        setBills, setCommonBalance
    } = useContext(EnergyContext);

    // UI STATE
    const [selectedDevice, setSelectedDevice] = useState(null); 
    const [selectedEmail, setSelectedEmail] = useState(null); 
    const [selectedTxn, setSelectedTxn] = useState(null); 
    const [displayBalance, setDisplayBalance] = useState(0); 
    const [activeSection, setActiveSection] = useState('monitor');

    // PAYMENT STATE
    const [showPayModal, setShowPayModal] = useState(false);
    const [payerName, setPayerName] = useState("");
    const [payerEmail, setPayerEmail] = useState("");
    const [paymentSuccessMsg, setPaymentSuccessMsg] = useState(null);

    // REFS
    const monitorRef = useRef(null);
    const graphRef = useRef(null);
    const analyticsRef = useRef(null);
    const logsRef = useRef(null);
    const gmailRef = useRef(null);
    const billingRef = useRef(null);
    const historyRef = useRef(null);
    const balanceRef = useRef(null);

    const scrollToSection = (sectionName, ref) => {
        setActiveSection(sectionName);
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ANIMATION EFFECT
    useEffect(() => {
        if (displayBalance < commonBalance) {
            const step = Math.ceil((commonBalance - displayBalance) / 10);
            const timer = setTimeout(() => setDisplayBalance(prev => prev + step), 30);
            return () => clearTimeout(timer);
        } else if (displayBalance > commonBalance) {
            setDisplayBalance(commonBalance); 
        }
    }, [commonBalance, displayBalance]);

    // PAYMENT HANDLERS
    const proceedToRazorpay = async () => {
        const res = await loadRazorpayScript();
        if (!res) { alert("Razorpay SDK failed to load"); return; }
        const totalAmount = bills.reduce((sum, bill) => sum + bill.amount, 0);

        try {
            const orderData = await axios.post(ENDPOINTS.CREATE_ORDER, { amount: totalAmount });
            const orderJson = (typeof orderData.data === 'string') ? JSON.parse(orderData.data) : orderData.data;

            const options = {
                key: "rzp_test_S0IvbKCzGAoXnH", 
                amount: orderJson.amount,
                currency: orderJson.currency,
                name: "SmartHive Maintenance",
                description: "Consolidated Utility Bill",
                order_id: orderJson.id,
                handler: async function (response) {
                    try {
                        const verifyPayload = {
                            orderId: response.razorpay_order_id,
                            paymentId: response.razorpay_payment_id,
                            signature: response.razorpay_signature,
                            payerName: payerName,
                            payerEmail: payerEmail
                        };
                        const verifyRes = await axios.post(ENDPOINTS.VERIFY_PAYMENT, verifyPayload);
                        if (verifyRes.data === true) {
                            setShowPayModal(false);
                            setPaymentSuccessMsg(`Payment of ₹${totalAmount} successful at ${new Date().toLocaleString()}`);
                            setBills([]); // Optimistic update
                            const balRes = await axios.get(ENDPOINTS.BALANCE); // Fetch fresh balance
                            setCommonBalance(balRes.data);
                            setTimeout(() => setPaymentSuccessMsg(null), 8000); 
                        } else {
                            alert("Payment Verification Failed!");
                        }
                    } catch (verifyErr) {
                        console.error("Verification Error:", verifyErr);
                        alert("Server error during verification");
                    }
                },
                prefill: { name: payerName, email: payerEmail },
                theme: { color: "#3b82f6" }
            };
            const paymentObject = new window.Razorpay(options);
            paymentObject.open();
        } catch (err) {
            console.error("Payment Error:", err);
            if (err.response && err.response.status === 403) {
                alert("Session Expired.");
                onLogout();
            } else {
                alert("Payment Init Failed.");
            }
        }
    };

    // RENDER LOADING
    if (!data && !isConnected) return (
        <div style={{height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0b1120', color: '#3b82f6', flexDirection: 'column'}}>
            <Activity size={48} className="spin" />
            <h2 style={{marginTop: '20px'}}>Establishing Neural Link...</h2>
        </div>
    );

    const activeThreats = data ? data.devices.filter(d => d.breakdown) : [];
    const currentDetailDevice = selectedDevice ? data.devices.find(d => d.deviceId === selectedDevice.deviceId) : null;
    const totalDue = bills.reduce((sum, bill) => sum + bill.amount, 0);

    return (
        <div className="app-container">
            {/* SIDEBAR */}
            <div className="sidebar">
                <div className="brand"><Zap size={28} strokeWidth={2.5} /> SmartHive</div>
                <div className={`nav-item ${activeSection === 'monitor' ? 'active' : ''}`} onClick={() => scrollToSection('monitor', monitorRef)}><LayoutDashboard size={20}/> Monitor</div>
                <div className={`nav-item ${activeSection === 'graph' ? 'active' : ''}`} onClick={() => scrollToSection('graph', graphRef)}><TrendingUp size={20}/> Load Graph</div>
                <div className={`nav-item ${activeSection === 'analytics' ? 'active' : ''}`} onClick={() => scrollToSection('analytics', analyticsRef)}><Server size={20}/> Analytics</div>
                <div className={`nav-item ${activeSection === 'logs' ? 'active' : ''}`} onClick={() => scrollToSection('logs', logsRef)}><FileText size={20}/> System Logs</div>
                <div className={`nav-item ${activeSection === 'gmail' ? 'active' : ''}`} onClick={() => scrollToSection('gmail', gmailRef)}><Mail size={20}/> Gmail Logs</div>
                <div className={`nav-item ${activeSection === 'billing' ? 'active' : ''}`} onClick={() => scrollToSection('billing', billingRef)}><CreditCard size={20}/> Maintenance Billing</div>
                <div className={`nav-item ${activeSection === 'history' ? 'active' : ''}`} onClick={() => scrollToSection('history', historyRef)}><History size={20}/> Payment History</div>
                <div className={`nav-item ${activeSection === 'balance' ? 'active' : ''}`} onClick={() => scrollToSection('balance', balanceRef)}><Wallet size={20}/> Common Balance</div>
                
                <div className="nav-item" onClick={onLogout} style={{marginTop: 'auto', color: '#ef4444', marginBottom: '5px'}}>
                    <Lock size={20}/> Logout
                </div>
                <div style={{color: isConnected ? '#10b981' : '#ef4444', display:'flex', alignItems:'center', gap:'10px', fontSize:'0.9rem', marginBottom: '10px'}}>
                    <div style={{width:8, height:8, borderRadius:'50%', background: isConnected ? '#10b981' : '#ef4444'}}></div>
                    {isConnected ? 'Server Online' : 'Reconnecting...'}
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="main-area">
                
                {/* 1. MONITOR */}
                <div ref={monitorRef} style={{scrollMarginTop: '20px'}}>
                    <div className="top-header" style={{marginBottom: '50px'}}>
                        <div><h1 style={{margin:0, fontSize:'2rem', letterSpacing: '1px', background: '-webkit-linear-gradient(45deg, #f8fafc, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>APPLIANCE INTEGRITY MONITOR</h1><p style={{marginTop: '5px', marginBottom: 0, color:'#64748b', fontSize: '0.9rem', fontWeight: 500, letterSpacing: '0.5px'}}>REAL-TIME LOAD ANALYSIS & BREAKDOWN DEFENCE</p></div>
                        <div className="system-status"><CheckCircle size={16}/> SYSTEM {activeThreats.length > 0 ? 'COMPROMISED' : 'NOMINAL'}</div>
                    </div>
                    {activeThreats.length > 0 && (<div className="threat-panel" style={{margin: '30px 0'}}><div className="threat-content"><div className="threat-title"><AlertOctagon size={24}/> CRITICAL BREAKDOWN PREDICTED</div><div style={{color: '#fca5a5'}}>The following appliances have exceeded failure thresholds: {activeThreats.map(t => <b key={t.deviceId}> {t.deviceId},</b>)}</div></div></div>)}
                    <div className="kpi-grid">
                        <div className="card"><div className="card-label">Total Consumption</div><div className="card-value" style={{color: '#3b82f6'}}>{data?.totalPower.toFixed(0)} <span style={{fontSize:'1rem'}}>W</span></div></div>
                        <div className="card"><div className="card-label">Monitored Appliances</div><div className="card-value">{data?.devices.length}</div></div>
                        <div className="card"><div className="card-label">Active Anomalies</div><div className="card-value" style={{color: '#f59e0b'}}>{data?.devices.filter(d=>d.anomaly && !d.breakdown).length}</div></div>
                    </div>
                </div>

                {/* 2. GRAPH */}
                <div ref={graphRef} style={{scrollMarginTop: '20px'}}>
                    <h2 style={{fontSize:'1.2rem', marginBottom:'20px'}}>Real-Time Load Graph</h2>
                    <div className="card" style={{ padding: '20px' }}>
                        <div style={{ width: '100%', height: '400px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={graphHistory} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                                    <defs><linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.3} />
                                    <XAxis dataKey="time" stroke="#94a3b8" tick={{fontSize: 14}} minTickGap={30}><Label value="Time" offset={0} position="insideBottom" dy={20} fill="#94a3b8" style={{fontSize: '0.9rem'}} /></XAxis>
                                    <YAxis stroke="#94a3b8" tick={{fontSize: 14}} width={60}><Label value="Power (W)" angle={-90} position="insideLeft" fill="#94a3b8" fontSize={14} style={{textAnchor: 'middle'}} /></YAxis>
                                    <Tooltip contentStyle={{backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f1f5f9'}} itemStyle={{color: '#3b82f6'}}/>
                                    <Area type="monotone" dataKey="power" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorPower)" isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* 3. ANALYTICS */}
                <div ref={analyticsRef} style={{scrollMarginTop: '20px'}}>
                    <div style={{display: 'grid', gridTemplateColumns: selectedDevice ? '1fr 350px' : '1fr', gap: '30px', transition: 'all 0.3s'}}>
                        <div>
                            <h2 style={{fontSize:'1.2rem', marginBottom:'20px'}}>Appliance Analytics</h2>
                            <div className="device-grid">
                                {data?.devices.map(device => {
                                    let statusClass = 'normal'; let badge = <span className="status-badge ok">OK</span>; let message = "System Nominal";
                                    if (device.uiStatus === 'FAIL') { statusClass = 'breakdown'; badge = <span className="status-badge crit">CRITICAL</span>; message = "POTENTIAL BREAKDOWN AHEAD"; } 
                                    else if (device.uiStatus === 'WARN') { statusClass = 'anomaly'; badge = <span className="status-badge warn" style={{color: '#f97316', background: 'rgba(249, 115, 22, 0.2)'}}>WARN</span>; message = "Anomaly Detected"; } 
                                    else if (device.uiStatus === 'SPIKE') { statusClass = 'spike'; badge = <span className="status-badge spike" style={{color: '#eab308', background: 'rgba(234, 179, 8, 0.2)'}}>SPIKE</span>; message = "Temporary Spike"; }
                                    return (
                                        <div key={device.deviceId} className={`device-card ${statusClass}`} onClick={() => setSelectedDevice(device)}>
                                            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}><div style={{fontWeight:'700'}}>{device.deviceId}</div> {badge}</div>
                                            <div style={{display:'flex', justifyContent:'space-between', color:'#94a3b8', fontSize:'0.9rem'}}><span>Power</span> <span style={{color: '#f1f5f9'}}>{device.power} W</span></div>
                                            <div style={{fontSize:'0.75rem', marginTop:'10px', color: device.uiStatus==='OK'?'#94a3b8': (device.uiStatus==='SPIKE'?'#eab308':(device.uiStatus==='WARN'?'#f97316':'#ef4444'))}}>{message}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {currentDetailDevice && (<div className="card" style={{border: '1px solid #3b82f6', height: 'fit-content'}}><div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}><h2 style={{margin:0, fontSize:'1.2rem'}}>{currentDetailDevice.deviceId} Details</h2><XCircle size={20} style={{cursor:'pointer', color:'#94a3b8'}} onClick={() => setSelectedDevice(null)} /></div><div style={{textAlign:'center', padding:'20px', background:'rgba(59,130,246,0.05)', borderRadius:'8px', marginBottom:'20px'}}><div style={{fontSize:'0.9rem', color:'#94a3b8'}}>CURRENT LOAD</div><div style={{fontSize:'2.5rem', fontWeight:'800', color:'#3b82f6'}}>{currentDetailDevice.power} W</div></div></div>)}
                    </div>
                </div>

                {/* 4. LOGS */}
                <div ref={logsRef} style={{scrollMarginTop: '20px'}}><h2 style={{fontSize:'1.2rem', marginBottom:'20px'}}>System Logs (Anomaly and Potential Breakdown)</h2><div className="card"><div className="logs-table-container"><table><thead><tr><th>Timestamp</th><th>Device ID</th><th>Event Type</th><th>Value</th></tr></thead><tbody>{logs.map(log => (<tr key={log.id}><td>{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Just Now'}</td><td>{log.deviceId}</td><td>{log.breakdown ? <span style={{color:'#ef4444'}}>BREAKDOWN PREDICTED</span> : <span style={{color:'#f59e0b'}}>Anomaly Detected</span>}</td><td>{log.power} W</td></tr>))}</tbody></table></div></div></div>

                {/* 5. GMAIL */}
                <div ref={gmailRef} style={{scrollMarginTop: '20px', paddingBottom: '20px'}}><h2 style={{fontSize:'1.2rem', marginBottom:'20px'}}>Gmail Incident History</h2><div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px'}}><div className="card" style={{maxHeight: '400px', overflowY: 'auto'}}><div className="card-label" style={{marginBottom: '15px'}}>Sent Alerts</div>{emailLogs.map(email => (<div key={email.id} onClick={() => setSelectedEmail(email)} style={{padding: '15px', background: selectedEmail?.id === email.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)', marginBottom: '10px', borderRadius: '6px', cursor: 'pointer', border: selectedEmail?.id === email.id ? '1px solid #3b82f6' : '1px solid transparent'}}><div style={{display:'flex', justifyContent:'space-between', marginBottom: '5px'}}><span style={{fontWeight:'bold', color: '#f8fafc'}}>{email.deviceId}</span><span style={{fontSize:'0.8rem', color: '#94a3b8'}}>{new Date(email.sentAt).toLocaleTimeString()}</span></div><div style={{fontSize:'0.8rem', color: '#cbd5e1'}}>To: {email.recipient}</div></div>))}</div><div className="card" style={{position: 'relative'}}><div className="card-label">Message Content</div>{selectedEmail ? (<div style={{marginTop: '15px'}}><div style={{fontSize:'0.9rem', color:'#94a3b8', marginBottom:'10px'}}>Subject: <span style={{color:'#fff'}}>{selectedEmail.subject}</span></div><div style={{fontSize:'0.9rem', color:'#94a3b8', marginBottom:'20px'}}>Date: <span style={{color:'#fff'}}>{new Date(selectedEmail.sentAt).toLocaleString()}</span></div><div style={{background: '#f1f5f9', color: '#0f172a', padding: '20px', borderRadius: '4px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.9rem'}}>{selectedEmail.body}</div></div>) : (<div style={{height: '200px', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b'}}>Select an email to view content</div>)}</div></div></div>

                {/* 6. BILLING */}
                <div ref={billingRef} style={{scrollMarginTop: '20px'}}>
                    <h2 style={{fontSize:'1.2rem', marginBottom:'20px'}}>Maintenance Billing</h2>
                    {paymentSuccessMsg && (
                        <div style={{background: '#10b981', color: '#fff', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold'}}>
                            <Check size={24}/> {paymentSuccessMsg}
                        </div>
                    )}
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 400px', gap: '30px'}}>
                        <div className="card">
                            <div className="card-label">Outstanding Dues</div>
                            {bills.length === 0 ? (
                                <div style={{padding: '40px', textAlign: 'center', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', marginTop: '10px'}}>
                                    <CheckCircle size={48} style={{margin: '0 auto 10px auto'}}/>
                                    <div style={{fontSize: '1.2rem', fontWeight: 'bold'}}>All Dues Cleared</div>
                                    <div>No pending maintenance charges</div>
                                </div>
                            ) : (
                                <div className="logs-table-container">
                                     <table>
                                       <thead><tr><th>Device</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                                       <tbody>
                                         {bills.map(bill => (
                                           <tr key={bill.id}>
                                             <td>{bill.deviceId}</td>
                                             <td>₹{bill.amount}</td>
                                             <td style={{color: '#ef4444', fontWeight: 'bold'}}>PENDING</td>
                                             <td>{new Date(bill.generatedAt).toLocaleDateString()}</td>
                                           </tr>
                                         ))}
                                       </tbody>
                                     </table>
                                </div>
                            )}
                        </div>
                        <div className="card" style={{border: '1px solid #3b82f6', height: 'fit-content'}}>
                            <div className="card-label">Consolidated Invoice</div>
                            <div style={{marginTop: '20px', marginBottom: '20px'}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#94a3b8'}}>
                                    <span>Total Items</span>
                                    <span>{bills.length}</span>
                                </div>
                                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '1.5rem', fontWeight: 'bold', color: '#fff'}}>
                                    <span>Total Due</span>
                                    <span>₹{totalDue}</span>
                                </div>
                            </div>
                            {totalDue > 0 && !showPayModal && (
                                <button onClick={() => setShowPayModal(true)} style={{width: '100%', padding: '15px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s'}}>
                                    PAY TOTAL DUE
                                </button>
                            )}
                            {showPayModal && (
                                <div style={{background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '6px'}}>
                                    <div style={{marginBottom: '10px'}}>
                                        <label style={{display: 'block', color: '#94a3b8', fontSize: '0.8rem', marginBottom: '5px'}}>Full Name</label>
                                        <input type="text" value={payerName} onChange={e=>setPayerName(e.target.value)} style={{width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px'}} />
                                    </div>
                                    <div style={{marginBottom: '15px'}}>
                                        <label style={{display: 'block', color: '#94a3b8', fontSize: '0.8rem', marginBottom: '5px'}}>Email (For Receipt)</label>
                                        <input type="email" value={payerEmail} onChange={e=>setPayerEmail(e.target.value)} style={{width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px'}} />
                                    </div>
                                    <div style={{display: 'flex', gap: '10px'}}>
                                        <button onClick={()=>setShowPayModal(false)} style={{flex: 1, padding: '10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Cancel</button>
                                        <button onClick={proceedToRazorpay} disabled={!payerName || !payerEmail} style={{flex: 1, padding: '10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: (!payerName || !payerEmail) ? 0.5 : 1}}>PROCEED</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 7. HISTORY */}
                <div ref={historyRef} style={{scrollMarginTop: '20px'}}>
                    <h2 style={{fontSize:'1.2rem', marginBottom:'20px'}}>Payment History (Ledger)</h2>
                    <div className="card">
                        <div className="logs-table-container">
                             <table>
                               <thead><tr><th>Date</th><th>Transaction ID</th><th>Payer</th><th>Amount</th><th>Items</th></tr></thead>
                               <tbody>
                                 {transactions.map(txn => (
                                   <tr key={txn.id} onClick={() => setSelectedTxn(txn)} style={{cursor: 'pointer', background: selectedTxn?.id === txn.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent'}}>
                                     <td>{new Date(txn.timestamp).toLocaleString()}</td>
                                     <td>{txn.razorpayPaymentId}</td>
                                     <td>{txn.payerName}</td>
                                     <td style={{color: '#10b981', fontWeight: 'bold'}}>₹{txn.amount}</td>
                                     <td style={{fontSize: '0.8rem', color: '#94a3b8'}}>{txn.itemsPaid}</td>
                                   </tr>
                                 ))}
                               </tbody>
                             </table>
                        </div>
                    </div>
                    {selectedTxn && (
                        <div className="card" style={{marginTop: '20px', border: '1px dashed #94a3b8'}}>
                            <div style={{textAlign: 'center', marginBottom: '20px'}}>
                                <CheckCircle size={40} color="#10b981" style={{margin: '0 auto 10px'}}/>
                                <h3 style={{margin: 0}}>Payment Receipt</h3>
                                <div style={{color: '#94a3b8'}}>Sent to: {selectedTxn.payerEmail}</div>
                            </div>
                            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '0.9rem'}}>
                                <div><strong>Transaction ID:</strong> {selectedTxn.razorpayPaymentId}</div>
                                <div><strong>Amount Paid:</strong> ₹{selectedTxn.amount}</div>
                                <div><strong>Date:</strong> {new Date(selectedTxn.timestamp).toLocaleString()}</div>
                                <div><strong>Status:</strong> <span style={{color: '#10b981'}}>SUCCESS</span></div>
                            </div>
                            <div style={{marginTop: '20px', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px'}}>
                                <strong>Services Covered:</strong> {selectedTxn.itemsPaid}
                            </div>
                        </div>
                    )}
                </div>

                {/* 8. BALANCE */}
                <div ref={balanceRef} style={{scrollMarginTop: '20px', paddingBottom: '50px'}}>
                     <h2 style={{fontSize:'1.2rem', marginBottom:'20px'}}>Common Balance Fund</h2>
                     <div style={{display: 'grid', gridTemplateColumns: '1fr 300px', gap: '30px'}}>
                         <div className="card" style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', border: '1px solid #334155'}}>
                             <div style={{color: '#94a3b8', fontSize: '1.2rem', marginBottom: '10px'}}>TOTAL ACCUMULATED FUNDS</div>
                             <div style={{fontSize: '4rem', fontWeight: '800', color: '#10b981', textShadow: '0 0 20px rgba(16, 185, 129, 0.3)'}}>
                                 ₹{displayBalance.toLocaleString()}
                             </div>
                         </div>
                         <div className="card" style={{maxHeight: '300px', overflowY: 'auto'}}>
                             <div className="card-label" style={{marginBottom: '15px'}}>Recent Inflows</div>
                             {transactions.slice(0, 10).map(txn => (
                                 <div key={txn.id} style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.9rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '5px'}}>
                                     <div>
                                         <div style={{fontWeight: 'bold', color: '#f8fafc'}}>+ ₹{txn.amount}</div>
                                         <div style={{fontSize: '0.7rem', color: '#64748b'}}>{new Date(txn.timestamp).toLocaleDateString()}</div>
                                     </div>
                                     <div style={{textAlign: 'right', fontSize: '0.8rem', color: '#94a3b8'}}>
                                         {txn.itemsPaid.substring(0, 15)}...
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>
                </div>

            </div>
        </div>
    );
};

// =========================================================================
// 4. ROOT APP COMPONENT (The Gatekeeper)
// =========================================================================

function App() {
    const [token, setToken] = useState(localStorage.getItem('jwtToken'));

    const handleLogin = (newToken) => {
        setToken(newToken);
    };

    const handleLogout = useCallback(() => {
        console.log("🔒 Logging out due to security threat or user request");
        localStorage.removeItem('jwtToken');
        setToken(null);
    }, []);

    // IF NO TOKEN -> AUTH SCREEN
    if (!token) {
        return <Auth onLogin={handleLogin} />;
    }

    // IF TOKEN -> DASHBOARD (Wrapped in Provider for Background State)
    return (
        <EnergyProvider token={token} onLogout={handleLogout}>
            <Dashboard onLogout={handleLogout} />
        </EnergyProvider>
    );
}

export default App;