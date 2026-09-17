

import re

with open('app/routes/reports.py', 'r', encoding='utf-8') as f:
    content = f.read()
    lines = content.split('\n')

# Find all route definitions
routes = []
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('@router.') and ('get(' in stripped or 'post(' in stripped or 'patch(' in stripped or 'put(' in stripped or 'delete(' in stripped):
        # Look for Depends(get_current_user) in the function signature (next ~20 lines)
        func_block = '\n'.join(lines[i:i+20])
        has_auth = 'get_current_user' in func_block
        routes.append({
            'line': i+1,
            'route': stripped,
            'has_auth': has_auth
        })

print("=== reports.py ROUTE AUTHENTICATION STATUS ===")
for r in routes:
    auth_str = '[AUTH    ]' if r['has_auth'] else '[NO_AUTH ]'
    print(f"L{r['line']:4d} {auth_str} {r['route']}")
