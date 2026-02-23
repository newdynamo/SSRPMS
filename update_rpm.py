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
            
            # Create meRpmSpeedConfig if it doesn't exist
            ship["meRpmSpeedConfig"] = []
            rpm_mgmt = ship["meRpmSpeedConfig"]

            # Add Laden Profile
            laden_data = []
            for spd in sorted(LADEN_RPM.keys()):
                laden_data.append({"speed": spd, "rpm": LADEN_RPM[spd]})
            
            rpm_mgmt.append({
                "id": f"rpm-laden-ref-{ship['code']}",
                "mode": "laden",
                "type": "Reference",
                "data": laden_data
            })

            # Add Ballast Profile
            ballast_data = []
            for spd in sorted(BALLAST_RPM.keys()):
                ballast_data.append({"speed": spd, "rpm": BALLAST_RPM[spd]})
            
            rpm_mgmt.append({
                "id": f"rpm-ballast-ref-{ship['code']}",
                "mode": "ballast",
                "type": "Reference",
                "data": ballast_data
            })

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
