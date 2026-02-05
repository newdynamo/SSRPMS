
import requests
import csv
import io
import json
import os

SHIP_CODE = "GPLD" # PUTERI LEDANG
SHEET_URL = "https://docs.google.com/spreadsheets/d/1Jr19dwCsH36rPnrO6qjTz8rCNMwYEa3ClB6XAZsRH5c/export?format=csv"
SHIPS_JSON_PATH = os.path.join('backend', 'data', 'ships.json')

def fetch_csv_data(url):
    print(f"Fetching CSV from {url}...")
    response = requests.get(url)
    response.raise_for_status()
    return response.text

def parse_csv_data(csv_text):
    foc_management = []
    # Use io.StringIO to handle multiline cells correctly
    f = io.StringIO(csv_text)
    reader = csv.reader(f)
    
    current_mode = None
    headers = None
    
    # Store data by mode and type
    # structure: { 'laden': { 'TypeA': [], 'TypeB': [] ... }, 'ballast': ... }
    parsed_data = {} 

    for row in reader:
        if not row: continue

        first_col = row[0].strip().upper()
        # print(f"DEBUG: Col 0: {repr(first_col)}") 

        if "LADEN" in first_col:
            current_mode = "laden"
            headers = None 
            print(f"Detected mode: LADEN")
            continue
        elif "BALLAST" in first_col:
            current_mode = "ballast"
            headers = None
            print(f"Detected mode: BALLAST")
            continue
            
        # Check for header row (allowing for newlines in the cell)
        if "SPEED" in first_col and ("SHIP" in first_col or "KNOTS" in first_col):
            # Header row
            headers = [h.strip() for h in row]
            print(f"Detected headers: {headers}")
            continue
            
        if current_mode and headers:
            # Data row
            try:
                speed_str = row[0].strip()
                if not speed_str: continue
                    
                speed = float(speed_str)
                
                # Iterate through columns to get FOC for each type
                for col_idx in range(1, len(row)):
                    if col_idx >= len(headers): break
                    
                    type_name = headers[col_idx]
                    if not type_name: continue
                    
                    foc_str = row[col_idx].strip()
                    if not foc_str: continue
                    
                    try:
                        foc = float(foc_str)
                    except ValueError:
                        continue # Skip invalid numbers

                    if current_mode not in parsed_data:
                        parsed_data[current_mode] = {}
                    if type_name not in parsed_data[current_mode]:
                        parsed_data[current_mode][type_name] = []
                        
                    parsed_data[current_mode][type_name].append({
                        "speed": speed,
                        "foc": foc,
                        "rpm": 0 
                    })
            except ValueError:
                # Not a data row (maybe empty or text)
                pass

    # Convert parsed_data to final structure
    for mode, types in parsed_data.items():
        for type_name, data_points in types.items():
            # Create a simple ID
            safe_type = type_name.lower().replace(" ", "-")
            entry = {
                "id": f"foc-{mode}-{safe_type}",
                "mode": mode,
                "type": type_name,
                "data": data_points
            }
            foc_management.append(entry)
            
    return foc_management

def update_ships_json(foc_data):
    print(f"Reading {SHIPS_JSON_PATH}...")
    with open(SHIPS_JSON_PATH, 'r', encoding='utf-8') as f:
        ships = json.load(f)
        
    updated = False
    for ship in ships:
        if ship.get('code') == SHIP_CODE:
            print(f"Found ship {SHIP_CODE}. Updating focManagement...")
            # Validate if we have data
            if not foc_data:
                print("Warning: No FOC data parsed. Aborting update.")
                return
            
            ship['focManagement'] = foc_data
            updated = True
            break
            
    if updated:
        print(f"Writing updated data to {SHIPS_JSON_PATH}...")
        with open(SHIPS_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(ships, f, indent=2)
        print("Success.")
    else:
        print(f"Error: Ship with code {SHIP_CODE} not found.")

def main():
    try:
        csv_text = fetch_csv_data(SHEET_URL)
        # Verify we got some content
        print(f"Fetched {len(csv_text)} bytes.")
        
        foc_data = parse_csv_data(csv_text)
        print(f"Parsed {len(foc_data)} profiles.")
        
        # Debug print first profile
        if foc_data:
            print("Sample profile:", foc_data[0]['id'], "with", len(foc_data[0]['data']), "points")
            
        update_ships_json(foc_data)
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
