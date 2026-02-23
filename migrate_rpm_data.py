import json
import os
import uuid

SHIPS_FILE = r"c:\Antigravity\SSRPMS(3500-8500)\backend\data\ships.json"

def migrate_rpm():
    print(f"Reading {SHIPS_FILE}...")
    try:
        with open(SHIPS_FILE, "r", encoding="utf-8") as f:
            ships = json.load(f)
    except Exception as e:
        print(f"Error loading file: {e}")
        return

    updated_count = 0
    for ship in ships:
        # Check if focManagement exists
        foc_mgmt = ship.get("focManagement", [])
        
        # New structure for RPM-Speed
        rpm_config = []
        
        if foc_mgmt:
            print(f"Migrating ship: {ship.get('name')} ({ship.get('code')})...")
            
            for entry in foc_mgmt:
                # Create a corresponding entry in meRpmSpeedConfig
                new_entry = {
                    "id": str(uuid.uuid4()), # Generate new ID
                    "mode": entry.get("mode"),
                    "type": entry.get("type"),
                    "data": []
                }
                
                # Extract speed and rpm from focManagement data
                for point in entry.get("data", []):
                    rpm = point.get("rpm", 0)
                    speed = point.get("speed", 0)
                    # Only add if speed is present. RPM might be 0, which is fine to init.
                    new_entry["data"].append({
                        "speed": speed, 
                        "rpm": rpm
                    })
                
                # Sort by speed descending to match existing logic convention
                new_entry["data"].sort(key=lambda x: x["speed"], reverse=True)
                
                rpm_config.append(new_entry)
            
            ship["meRpmSpeedConfig"] = rpm_config
            updated_count += 1
            print(f"  Migrated {len(rpm_config)} profiles to meRpmSpeedConfig.")

    if updated_count > 0:
        print(f"Saving {SHIPS_FILE}...")
        try:
            with open(SHIPS_FILE, "w", encoding="utf-8") as f:
                json.dump(ships, f, indent=2)
            print("Migration complete.")
        except Exception as e:
            print(f"Error saving file: {e}")
    else:
        print("No ships needed migration.")

if __name__ == "__main__":
    migrate_rpm()
