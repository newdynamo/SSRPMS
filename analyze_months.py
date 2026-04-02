import json

with open('backend/data/reports.json', 'r', encoding='utf-8') as f:
    reports = json.load(f)

vessel_months = {}
for r in reports:
    ship = r.get('items', {}).get('R001')
    if not ship: continue
    
    date_str = r.get('tasks', {}).get('T04') or r.get('submittedAt')
    if not date_str: continue
    
    month = date_str[:7] # YYYY-MM
    
    if ship not in vessel_months:
        vessel_months[ship] = set()
    vessel_months[ship].add(month)

for ship, months in sorted(vessel_months.items()):
    print(f"{ship}: {sorted(list(months))}")
