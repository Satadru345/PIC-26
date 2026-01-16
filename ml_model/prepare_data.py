import pandas as pd
import numpy as np
import os

# Configuration
INPUT_FILE = 'household_power_consumption.csv'
OUTPUT_FILE = 'refined_training_data.csv'

def clean_and_transform_data():
    print("--- STARTING DATA PREPARATION ---")
    
    # Check if file exists
    if not os.path.exists(INPUT_FILE):
        print(f"ERROR: {INPUT_FILE} not found. Please place it in this folder.")
        return

    print("1. Loading dataset (this might take 10-20 seconds)...")
    # The dataset uses ';' as separator usually. Reading first 50k rows for training to keep it fast.
    # We use low_memory=False to avoid Dtype warnings.
    df = pd.read_csv(
        INPUT_FILE,
        sep=',',
        nrows=50000,
        low_memory=False
    )

    # If only 1 column exists, retry with semicolon
    if len(df.columns) == 1:
        df = pd.read_csv(
        INPUT_FILE,
        sep=';',
        nrows=50000,
        low_memory=False
        )

    # Clean column names
    df.columns = df.columns.str.strip()


    print("2. Cleaning missing values...")
    # Replace '?' with NaN and convert columns to numeric
    cols_to_numeric = ['Global_active_power', 'Global_reactive_power', 'Voltage', 
                       'Global_intensity', 'Sub_metering_1', 'Sub_metering_2', 'Sub_metering_3']
    
    print(df.columns)
    print(len(df.columns))

    for col in cols_to_numeric:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    df.dropna(inplace=True)

    print("3. Calculating Appliance Loads...")
    # Logic: 
    # Global_active_power is in kW (Kilowatts). 
    # Sub_metering columns are in Watt-hours per minute.
    # To compare, we convert Global Active Power to Watt-hours per minute: (kW * 1000 / 60)
    
    total_wh_per_minute = (df['Global_active_power'] * 1000 / 60)
    
    # Calculate 'Remainder' power (Lights, Fans, Chargers)
    # Remainder = Total - (Kitchen + Laundry + AC/Heater)
    remainder_wh = total_wh_per_minute - (df['Sub_metering_1'] + df['Sub_metering_2'] + df['Sub_metering_3'])
    
    # Clean negative values (sensor noise)
    remainder_wh = remainder_wh.clip(lower=0.5) # Minimum 0.5Wh to keep graph alive
    
    # Create the final clean dataframe
    refined_df = pd.DataFrame({
        'Voltage': df['Voltage'],
        'AC_Geyser_Load': df['Sub_metering_3'],       # High Load
        'Fridge_WashingMachine_Load': df['Sub_metering_2'], # Medium Load
        'Microwave_Oven_Load': df['Sub_metering_1'],  # Medium/Pulse Load
        'Fan_Light_Load': remainder_wh                # Low Load
    })
    
    # Add synthesized "Current" (Amps) for the dashboard graphs
    # I = P / V (Approximation using Wh * 60 to get Watts)
    # Using Power Factor 0.9 for AC/Fridge, 1.0 for Heater/Resistive
    refined_df['AC_Current'] = (refined_df['AC_Geyser_Load'] * 60) / (refined_df['Voltage'] * 0.9)
    refined_df['Fridge_Current'] = (refined_df['Fridge_WashingMachine_Load'] * 60) / (refined_df['Voltage'] * 0.85)
    refined_df['Fan_Current'] = (refined_df['Fan_Light_Load'] * 60) / (refined_df['Voltage'] * 0.95)

    # Round to 2 decimal places for clean display
    refined_df = refined_df.round(2)

    print(f"4. Saving to {OUTPUT_FILE}...")
    refined_df.to_csv(OUTPUT_FILE, index=False)
    
    print("--- SUCCESS! Data is ready for the Simulator. ---")
    print(f"Generated {len(refined_df)} rows of training data.")

if __name__ == "__main__":
    clean_and_transform_data()