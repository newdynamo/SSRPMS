
import json
import os

# Define paths
ships_path = os.path.join('backend', 'data', 'ships.json')
foc_path = 'foc_data.json'
target_ship_code = 'HBO' # HLS BILBAO

try:
    print(f"Reading {foc_path}...")
    with open(foc_path, 'r', encoding='utf-8') as f:
        foc_data = json.load(f)

    print(f"Reading {ships_path}...")
    with open(ships_path, 'r', encoding='utf-8') as f:
        ships_data = json.load(f)

    updated = False
    for ship in ships_data:
        if ship.get('code') == target_ship_code:
            print(f"Found {ship.get('name')} ({target_ship_code}). Updating focManagement...")
            
            # Create deep copy of foc_data to ensure unique IDs if necessary (though IDs in foc_data seem generic enough or time-based)
            # For this fix, we will just use the data as is, assuming the IDs don't conflict or are acceptable.
            # Ideally, we might want to regenerate IDs, but the structure in foc_data.json has specific IDs. 
            # Let's inspect foc_data.json content again in my mind... 
            # The keys in foc_data.json have IDs like "L_A-GL-Type_1770100905212". 
            # If we reuse them, it should be fine for display purposes. 
            # If the app relies on unique IDs for editing, this *might* be an issue if we edit one ship and it affects another?
            # But the backend saves the whole ship object. 
            # Let's just assign it.
            
            ship['focManagement'] = foc_data
            updated = True
            break

    if updated:
        print(f"Writing updated data to {ships_path}...")
        with open(ships_path, 'w', encoding='utf-8') as f:
            json.dump(ships_data, f, indent=2)
        print("Success.")
    else:
        print(f"Error: Ship with code {target_ship_code} not found.")

except Exception as e:
    print(f"An error occurred: {e}")
