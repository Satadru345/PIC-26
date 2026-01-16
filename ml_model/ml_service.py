from flask import Flask, request, jsonify
import joblib
import pandas as pd
import numpy as np

app = Flask(__name__)

# Load Models & Scalers
print("Loading Intelligence...")
try:
    models = joblib.load('anomaly_models.pkl')
    scalers = joblib.load('scalers.pkl')
    print("MODELS LOADED SUCCESSFULLY.")
except:
    print("ERROR: Models not found. Run train_model.py first!")

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        # Expected JSON: {"voltage": 230, "power": 1500, "deviceType": "AC"}
        
        voltage = float(data.get('voltage'))
        power = float(data.get('power'))
        device_type = data.get('deviceType')
        
        # 1. Select the Correct Brain
        if device_type not in models:
            # Fallback for unknown devices (Use Fan logic as generic low power)
            model = models['Fan']
            scaler = scalers['Fan']
        else:
            model = models[device_type]
            scaler = scalers[device_type]
            
        # 2. Prepare Data
        features = pd.DataFrame([[voltage, power]], columns=['Voltage', 'Power'])
        features_scaled = scaler.transform(features)
        
        # 3. Predict
        # 1 = Normal, -1 = Anomaly
        prediction = model.predict(features_scaled)[0]
        
        # Distance to boundary (Positive = Normal, Negative = Anomaly)
        score = model.decision_function(features_scaled)[0]
        
        is_anomaly = True if prediction == -1 else False

        # Debug Print
        if is_anomaly:
            print(f"!!! ANOMALY DETECTED: {device_type} at {power}W ({voltage}V) !!!")

        return jsonify({
            "status": "success",
            "anomaly": is_anomaly,
            "score": float(score)
        })

    except Exception as e:
        print("ERROR:", e)
        return jsonify({"status": "error", "message": str(e)})

if __name__ == '__main__':
    app.run(port=5000, debug=True)