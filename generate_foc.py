
import json
import csv
import io

csv_data = """Ship Speed (Knots),A-GL-Type,B-GL-Type,C-GL-Type,D-GL-Type,E-GL-Type,F-GL-Type,A-FL-Type,B-FL-Type,C-FL-Type,D-FL-Type,E-FL-Type,F-FL-Type
19.50,3.53,3.60,3.77,3.97,4.08,4.44,3.37,3.45,3.62,3.86,3.86,3.86
19.00,3.33,3.33,3.49,3.67,3.78,4.11,3.09,3.17,3.33,3.54,3.54,3.54
18.50,3.08,3.10,3.25,3.41,3.53,3.83,2.86,2.92,3.07,3.27,3.27,3.27
18.00,2.84,2.92,3.06,3.21,3.32,3.61,2.61,2.69,2.82,3.00,3.00,3.00
17.50,2.63,2.76,2.89,3.03,3.14,3.41,2.40,2.46,2.59,2.75,2.75,2.75
17.00,2.46,2.60,2.73,2.86,2.97,3.22,2.23,2.29,2.40,2.56,2.56,2.56
16.50,2.32,2.45,2.57,2.69,2.80,3.04,2.08,2.14,2.25,2.39,2.39,2.39
16.00,2.19,2.31,2.42,2.53,2.64,2.86,1.93,1.99,2.08,2.22,2.22,2.22
15.50,2.06,2.18,2.29,2.39,2.50,2.71,1.79,1.85,1.94,2.07,2.07,2.07
15.00,2.02,2.06,2.17,2.25,2.37,2.56,1.67,1.73,1.81,1.93,1.93,1.93
14.50,1.90,1.95,2.05,2.13,2.24,2.42,1.54,1.61,1.69,1.79,1.79,1.79
14.00,1.79,1.84,1.93,2.01,2.12,2.28,1.43,1.49,1.57,1.67,1.67,1.67
13.50,1.70,1.74,1.82,1.89,2.01,2.16,1.34,1.40,1.48,1.57,1.57,1.57
13.00,1.61,1.65,1.73,1.79,1.91,2.05,1.25,1.32,1.38,1.47,1.47,1.47"""

reader = csv.DictReader(io.StringIO(csv_data))
rows = list(reader)

# Columns: Ship Speed (Knots), A-GL-Type ... F-GL-Type, A-FL-Type ... F-FL-Type
headers = reader.fieldnames
types = [h for h in headers if h != "Ship Speed (Knots)"]

foc_management = []

for t in types:
    mode = "laden" if "GL" in t else "ballast"
    profile_id = f"{('L' if mode == 'laden' else 'B')}_{t}_1770100905212"
    
    data_points = []
    for row in rows:
        speed = float(row["Ship Speed (Knots)"])
        foc_raw = float(row[t])
        foc = round(foc_raw, 2) # Raw value from sheet
        
        data_points.append({
            "speed": speed,
            "foc": foc,
            "rpm": 0
        })
    
    foc_management.append({
        "id": profile_id,
        "mode": mode,
        "type": t,
        "data": data_points
    })

with open('foc_data.json', 'w') as f:
    json.dump(foc_management, f, indent=2)
