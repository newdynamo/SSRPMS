import json

SHIPS_FILE = r"c:\Antigravity\SSRPMS(3500-8500)\backend\data\ships.json"
TARGET_CODES = ["HCT", "HBO"]

def verify_cleared_data():
    print(f"Verifying {SHIPS_FILE}...")
    try:
        with open(SHIPS_FILE, "r", encoding="utf-8") as f:
            ships = json.load(f)
    except Exception as e:
        print(f"Error loading file: {e}")
        return

    all_cleared = True
    for ship in ships:
        if ship.get("code") in TARGET_CODES:
            print(f"Checking {ship['name']} ({ship['code']})...")
            foc_mgmt = ship.get("focManagement", [])
            
            if not foc_mgmt:
                print("  No focManagement data found.")
                continue

            for entry in foc_mgmt:
                for point in entry.get("data", []):
                    if point.get("rpm", 0) != 0:
                        print(f"  [FAIL] RPM not cleared for {entry['id']} @ {point['speed']}kts: {point['rpm']}")
                        all_cleared = False
            
    if all_cleared:
        print("SUCCESS: All RPM data cleared.")
    else:
        print("FAIL: Some RPM data remains.")

if __name__ == "__main__":
    verify_cleared_data()
