with open('app/routes/rescue.py', 'r', encoding='utf-8') as f:
    content = f.read()
    lines = content.split('\n')

routes = []
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('@router.') and any(m in stripped for m in ['get(', 'post(', 'patch(', 'put(', 'delete(']):
        func_block = '\n'.join(lines[i:i+20])
        has_auth = 'get_current_user' in func_block
        routes.append({'line': i+1, 'route': stripped, 'has_auth': has_auth})

print("=== rescue.py ROUTE AUTHENTICATION STATUS ===")
for r in routes:
    auth_str = '[AUTH    ]' if r['has_auth'] else '[NO_AUTH ]'
    print(f"L{r['line']:4d} {auth_str} {r['route']}")

with open('app/routes/holding.py', 'r', encoding='utf-8') as f:
    content2 = f.read()
    lines2 = content2.split('\n')

routes2 = []
for i, line in enumerate(lines2):
    stripped = line.strip()
    if stripped.startswith('@router.') and any(m in stripped for m in ['get(', 'post(', 'patch(', 'put(', 'delete(']):
        func_block = '\n'.join(lines2[i:i+20])
        has_auth = 'get_current_user' in func_block
        routes2.append({'line': i+1, 'route': stripped, 'has_auth': has_auth})

print("\n=== holding.py ROUTE AUTHENTICATION STATUS ===")
for r in routes2:
    auth_str = '[AUTH    ]' if r['has_auth'] else '[NO_AUTH ]'
    print(f"L{r['line']:4d} {auth_str} {r['route']}")

print(f"\nrescue.py total lines: {len(lines)}")
print(f"holding.py total lines: {len(lines2)}")
