import sys
sys.path.insert(0, '.')
from planner import generate_plan

print("Testing conservative plan with Rs 100000...")
result = generate_plan(100000, 'conservative')
if 'error' in result:
    print("ERROR:", result['error'])
else:
    print(f"SUCCESS: {result['stock_count']} stocks, avg score {result['avg_score']}")
    for a in result['allocation'][:5]:
        print(f"  {a['symbol']:<20} {a['signal']:<4} score={a['combined_score']} amt=Rs{a['allocated_amount']:,.0f}")
