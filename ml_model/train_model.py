import pandas as pd
import numpy as np
from sklearn.svm import OneClassSVM
from sklearn.preprocessing import StandardScaler
import joblib
import os

# Configuration
INPUT_FILE = 'refined_training_data.csv' 
MODEL_FILE = 'anomaly_models.pkl'
SCALER_FILE = 'scalers.pkl'

print("--- STARTING HYBRID TRAINING (REAL + SIMULATOR SYNC) ---")

if not os.path.exists(INPUT_FILE):
    print(f"ERROR: {INPUT_FILE} not found!")
    exit()

df = pd.read_csv(INPUT_FILE)
training_sets = {}
np.random.seed(42) # Lock randomness

# --- SIMULATOR BASE VALUES (The "Ideal" Normals) ---
# We use these to bridge the gap between CSV reality and Simulator settings
BASE_WATTS = {
    'Fan': 65, 'Light': 15, 'AC': 1500, 'Geyser': 2000,
    'Fridge': 150, 'WashingMachine': 2200, 'Microwave': 1000, 'TV': 100
}

def create_hybrid_set(device_name, real_data_df, min_w, max_w):
    # 1. Real Data (Filtered)
    real_clean = real_data_df[
        (real_data_df['Power'] >= min_w) & 
        (real_data_df['Power'] <= max_w)
    ].copy()
    
    # 2. Simulator Ideal Data (Synthetic)
    # We generate 1000 points centered on the Simulator's Base Wattage
    # This guarantees the Model accepts the Simulator's "Normal" as valid.
    base = BASE_WATTS[device_name]
    
    # Generate Gaussian distribution around base (e.g., 1500 +/- 50W)
    syn_power = np.random.normal(base, base * 0.05, 1000) 
    syn_volt = np.random.normal(230, 5, 1000)
    
    synthetic_df = pd.DataFrame({'Voltage': syn_volt, 'Power': syn_power})
    
    # 3. Combine Both
    hybrid_df = pd.concat([real_clean, synthetic_df], ignore_index=True)
    
    return hybrid_df

print("2. Building Hybrid Datasets...")

# --- FAN ---
fan_raw = df['Fan_Light_Load']
fan_df = pd.DataFrame({'Voltage': df['Voltage'], 'Power': fan_raw})
# Mix Real (<85W) with Ideal (65W)
training_sets['Fan'] = create_hybrid_set('Fan', fan_df, 0, 85)

# --- LIGHT ---
light_power = 15 * (df['Voltage'] / 230) ** 2
noise = np.random.normal(0, 1.5, len(light_power))
light_df = pd.DataFrame({'Voltage': df['Voltage'], 'Power': light_power + noise})
# Light is purely synthetic in both cases, but we stick to the pattern
training_sets['Light'] = light_df 

# --- AC (THE CRITICAL FIX) ---
ac_raw = df['AC_Geyser_Load'] * 60
ac_df = pd.DataFrame({'Voltage': df['Voltage'], 'Power': ac_raw})
# Mix Real (800-1900W) with Ideal (1500W)
training_sets['AC'] = create_hybrid_set('AC', ac_df, 800, 1900)

# --- GEYSER ---
# Geyser in CSV is often same as AC. We force the Ideal (2000W) to dominate.
training_sets['Geyser'] = create_hybrid_set('Geyser', ac_df, 1800, 2200)

# --- FRIDGE ---
fridge_raw = df['Fridge_WashingMachine_Load'] * 60
fridge_df = pd.DataFrame({'Voltage': df['Voltage'], 'Power': fridge_raw})
training_sets['Fridge'] = create_hybrid_set('Fridge', fridge_df, 50, 180)

# --- WASHING MACHINE ---
wm_raw = df['Fridge_WashingMachine_Load'] * 60
wm_df = pd.DataFrame({'Voltage': df['Voltage'], 'Power': wm_raw})
training_sets['WashingMachine'] = create_hybrid_set('WashingMachine', wm_df, 400, 2800)

# --- MICROWAVE ---
mw_raw = df['Microwave_Oven_Load'] * 60
mw_df = pd.DataFrame({'Voltage': df['Voltage'], 'Power': mw_raw})
training_sets['Microwave'] = create_hybrid_set('Microwave', mw_df, 600, 1400)

# --- TV ---
tv_df = pd.DataFrame({'Voltage': df['Voltage'], 'Power': fan_raw + 20})
training_sets['TV'] = create_hybrid_set('TV', tv_df, 50, 120)

# --- TRAIN ---
models = {}
scalers = {}

print("3. Training Models (gamma=0.1 for stability)...")

for device, data in training_sets.items():
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(data[['Voltage', 'Power']])
    scalers[device] = scaler

    # Reduced gamma to 0.1 to bridge the gap between Real Data (1000W) and Ideal (1500W)
    # This creates a single "Safe Zone" covering both.
    model = OneClassSVM(nu=0.01, gamma=0.1)
    model.fit(X_scaled)
    models[device] = model
    
    print(f"   {device}: Trained on {len(data)} samples.")

joblib.dump(models, MODEL_FILE)
joblib.dump(scalers, SCALER_FILE)
print("--- SUCCESS: HYBRID MODELS SAVED ---")