import json

with open('backend/data/reports.json', 'r', encoding='utf-8') as f:
    reports = json.load(f)

for r in reports:
    ship = r.get('items', {}).get('R001')
    if ship != "HLS CARTAGENA": continue
    
    t04 = r.get('tasks', {}).get('T04')
    submittedAt = r.get('submittedAt')
    print(f"Ship: {ship}, T04: {t04}, submittedAt: {submittedAt}")
