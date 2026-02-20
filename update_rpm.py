import json
import os

SHIPS_FILE = r"c:\Antigravity\SSRPMS(3500-8500)\backend\data\ships.json"
TARGET_CODES = ["HCT", "HBO"]

# Data from Google Sheet
# https://docs.google.com/spreadsheets/d/1suxtpJFCeVqgXMaHCTobyzPxUc8sXMsOdXwf2ZvOz-A/export?format=csv

LADEN_RPM = {
    15.0: 51.6,
    15.5: 53.2,
    16.0: 54.8,
    16.5: 56.5,
    17.0: 58.2,
    17.5: 59.8,
    18.0: 61.5,
    18.5: 63.2,
    19.0: 65.0,
    19.5: 66.9
}

BALLAST_RPM = {
    15.0: 51.0,
    15.5: 52.6,
    16.0: 54.1,
    16.5: 55.6,
    17.0: 57.2,
    17.5: 58.7,
    18.0: 60.3,
    18.5: 61.9,
    19.0: 63.5,
    19.5: 65.2
}

def update_ships():
    print(f"Reading {SHIPS_FILE}...")
    try:
        with open(SHIPS_FILE, "r", encoding="utf-8") as f:
            ships = json.load(f)
    except Exception as e:
        print(f"Error loading file: {e}")
        return

    updated_count = 0
    for ship in ships:
        if ship.get("code") in TARGET_CODES:
            print(f"Updating {ship['name']} ({ship['code']})...")
            foc_mgmt = ship.get("focManagement", [])
            
            # Ensure focManagement exists
            if not foc_mgmt:
                ship["focManagement"] = []
                foc_mgmt = ship["focManagement"]

            # 1. Update Existing Laden Entries
            for entry in foc_mgmt:
                if entry.get("mode") == "laden":
                    print(f"  Updating Laden entry: {entry.get('id')}")
                    # Update RPM for existing speeds, keep FOC
                    for point in entry.get("data", []):
                        spd = point.get("speed")
                        if spd in LADEN_RPM:
                            point["rpm"] = LADEN_RPM[spd]
            
            # 2. Update/Add Ballast Entry
            # We need to find if there are existing ballast entries and update them, 
            # OR create new ones if they don't exist.
            # The previous script logic only added if missing.
            # We should probably update ALL ballast entries found, and if none, create one default.
            
            ballast_entries = [e for e in foc_mgmt if e.get("mode") == "ballast"]
            
            if ballast_entries:
                for entry in ballast_entries:
                     print(f"  Updating Ballast entry: {entry.get('id')}")
                     for point in entry.get("data", []):
                        spd = point.get("speed")
                        if spd in BALLAST_RPM:
                            point["rpm"] = BALLAST_RPM[spd]
            else:
                print("  Adding new Ballast Reference entry...")
                new_ballast_data = []
                for spd in sorted(BALLAST_RPM.keys()):
                    new_ballast_data.append({
                        "speed": spd,
                        "foc": 0,
                        "rpm": BALLAST_RPM[spd]
                    })
                
                # Create a default ballast profile if none exists
                new_entry = {
                    "id": f"foc-ballast-ref-{ship['code']}",
                    "mode": "ballast",
                    "type": "Reference",
                    "data": new_ballast_data
                }
                ship["focManagement"].append(new_entry)

            updated_count += 1

    if updated_count > 0:
        print(f"Saving {SHIPS_FILE}...")
        with open(SHIPS_FILE, "w", encoding="utf-8") as f:
            json.dump(ships, f, indent=2)
        print("Update complete.")
    else:
        print("No target ships found.")

if __name__ == "__main__":
    update_ships()
