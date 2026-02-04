
import json
import os

# Define paths
ships_path = os.path.join('backend', 'data', 'ships.json')
foc_path = 'foc_data.json'

print(f"Reading {foc_path}...")
with open(foc_path, 'r', encoding='utf-8') as f:
    foc_data = json.load(f)

print(f"Reading {ships_path}...")
with open(ships_path, 'r', encoding='utf-8') as f:
    ships_data = json.load(f)

updated = False
for ship in ships_data:
    if ship.get('code') == 'HCT':
        print("Found HLS CARTAGENA (HCT). Updating focManagement...")
        ship['focManagement'] = foc_data
        updated = True
        break

if updated:
    print(f"Writing updated data to {ships_path}...")
    with open(ships_path, 'w', encoding='utf-8') as f:
        json.dump(ships_data, f, indent=2)
    print("Success.")
else:
    print("Error: Ship with code HCT not found.")
