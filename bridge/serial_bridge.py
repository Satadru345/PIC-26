import serial
import time
import requests
import re
import json

# ================= CONFIGURATION =================
SERIAL_PORT = 'COM8'  # <--- CHECK YOUR ARDUINO PORT (e.g., COM3, /dev/ttyUSB0)
BAUD_RATE = 115200
BACKEND_URL = 'http://localhost:8080/api/energy/stream'

# Virtual Device Config (Appearing as a real node)
DEVICE_ID = "Light_1" 
DEVICE_TYPE = "Light"

# ================= THE BRIDGE LOGIC =================

def parse_and_send(line):
    try:
        # Regex to extract numeric values
        # Expecting line: "Published to ESP-01: Irms:0.450|Power:103.50"
        irms_match = re.search(r'Irms:([\d\.]+)', line)
        power_match = re.search(r'Power:([\d\.]+)', line)

        if irms_match and power_match:
            # 1. Extract Raw Values
            current_val = float(irms_match.group(1)) # Not used in payload, but good for logs
            power_val = float(power_match.group(1))
            
            # 2. Voltage is usually constant in your sim (230), or calculated
            voltage_val = 230.0 

            # 3. Construct Payload EXACTLY matching App.js structure
            # App.js sends: { id, type, v, p, injecting }
            payload = {
                "id": DEVICE_ID,         # Matches 'id' in App.js
                "type": DEVICE_TYPE,     # Matches 'type' in App.js
                "v": str(voltage_val),   # Matches 'v' (Sim sends string "230.0")
                "p": str(power_val),     # Matches 'p' (Sim sends string)
                "injecting": True
            }

            # 4. POST to Backend
            headers = {'Content-Type': 'application/json'}
            response = requests.post(BACKEND_URL, data=json.dumps(payload), headers=headers)
            
            if response.status_code == 200 or response.status_code == 201:
                print(f"✅ SENT: {payload['p']}W | V: {payload['v']} -> Backend")
            else:
                print(f"❌ FAILED: Backend returned {response.status_code}")
        else:
            print(f"⚠️ Ignored Malformed Line: {line.strip()}")

    except Exception as e:
        print(f"Error parsing/sending: {e}")

def main():
    print(f"🔌 Connecting to {SERIAL_PORT} at {BAUD_RATE}...")
    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        time.sleep(2) # Wait for connection to settle
        print("🚀 Bridge Active! Listening for Arduino data...")

        while True:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8').strip()
                if "Published to ESP-01" in line:
                    parse_and_send(line)
                    
    except serial.SerialException:
        print(f"❌ Could not open port {SERIAL_PORT}. Close Arduino Monitor & Check Port!")
    except KeyboardInterrupt:
        print("\n🛑 Bridge Stopped.")
        if 'ser' in locals() and ser.is_open:
            ser.close()

if __name__ == "__main__":
    main()