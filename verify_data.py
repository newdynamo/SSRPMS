import json

SHIPS_FILE = r"c:\Antigravity\SSRPMS(3500-8500)\backend\data\ships.json"
TARGET_CODES = ["HCT", "HBO"]
CHECK_SPEED = 19.5
LADEN_EXPECTED = 66.9
BALLAST_EXPECTED = 65.2

def verify_ships():
    print(f"Verifying {SHIPS_FILE}...")
    try:
        with open(SHIPS_FILE, "r", encoding="utf-8") as f:
            ships = json.load(f)
    except Exception as e:
        print(f"Error loading file: {e}")
        return

    for ship in ships:
        if ship.get("code") in TARGET_CODES:
            print(f"\nScanning {ship['name']} ({ship['code']})...")
            foc_mgmt = ship.get("focManagement", [])
            
            if not foc_mgmt:
                print("  [FAIL] No focManagement data found.")
                continue

            for entry in foc_mgmt:
                mode = entry.get("mode")
                entry_id = entry.get("id")
                data = entry.get("data", [])
                
                # Determine expected value based on mode
                expected = LADEN_EXPECTED if mode == "laden" else BALLAST_EXPECTED
                
                # Find the point for our check speed
                point = next((d for d in data if d["speed"] == CHECK_SPEED), None)
                
                if point:
                    rpm = point.get("rpm")
                    status = "OK" if abs(rpm - expected) < 0.1 else "MISMATCH"
                    print(f"  [{mode.upper()}] ID: {entry_id} -> Speed: {CHECK_SPEED}kts, RPM: {rpm} (Expected: {expected}) -> {status}")
                else:
                     print(f"  [{mode.upper()}] ID: {entry_id} -> Speed: {CHECK_SPEED}kts NOT FOUND")

if __name__ == "__main__":
    verify_ships()
