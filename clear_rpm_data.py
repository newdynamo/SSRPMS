import json

SHIPS_FILE = r"c:\Antigravity\SSRPMS(3500-8500)\backend\data\ships.json"
TARGET_CODES = ["HCT", "HBO"]

def clear_rpm_data():
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
            print(f"Clearing RPM data for {ship['name']} ({ship['code']})...")
            foc_mgmt = ship.get("focManagement", [])
            
            if not foc_mgmt:
                print("  No focManagement data found.")
                continue

            for entry in foc_mgmt:
                # We want to clear RPM data for ALL entries (Laden and Ballast)
                # Setting RPM to 0 matches the 'empty' state
                print(f"  Clearing RPMs for entry: {entry.get('id')} ({entry.get('mode')})")
                for point in entry.get("data", []):
                    if "rpm" in point:
                        point["rpm"] = 0
            
            updated_count += 1

    if updated_count > 0:
        print(f"Saving {SHIPS_FILE}...")
        with open(SHIPS_FILE, "w", encoding="utf-8") as f:
            json.dump(ships, f, indent=2)
        print("Clear complete.")
    else:
        print("No target ships found.")

if __name__ == "__main__":
    clear_rpm_data()
