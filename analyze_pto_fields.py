import json

with open('backend/data/reports.json', 'r', encoding='utf-8') as f:
    reports = json.load(f)

print("HLS CARTAGENA - Dec 2025 PTO Fields:")
for r in reports:
    ship = r.get('items', {}).get('R001')
    if ship != "HLS CARTAGENA": continue
    
    date_str = r.get('tasks', {}).get('T04') or r.get('submittedAt')
    if not date_str or not date_str.startswith("2025-12"): continue
    
    items = r.get('items', {})
    pto_rh_1 = items.get('RH_R115_E09_1')
    pto_rh_2 = items.get('RH_R115_E09_2')
    pto_p_1 = items.get('RH_R152_E09_1')
    pto_p_2 = items.get('RH_R152_E09_2')
    
    print(f"Date: {date_str}, PTO_RH_1: {pto_rh_1}, PTO_RH_2: {pto_rh_2}, PTO_P_1: {pto_p_1}, PTO_P_2: {pto_p_2}")
