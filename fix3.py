import re

with open('src/App.jsx', 'r') as f:
    code = f.read()

fixes = [
    # Fix the backtick template inside JSX ternary (the original build error)
    (
        '`\U0001f381 Prize for top ${admin.prizeMetric==="pct"?"% achiever":"performer"}`',
        '"🎁 Prize for top "+(admin.prizeMetric==="pct"?"% achiever":"performer")'
    ),
    # Fix changeWindowOpen template literal in JSX
    (
        'admin.changeWindowOpen?`\U0001f513 Change window open \u2014 closes in ~${changeHoursLeft}h`',
        'admin.changeWindowOpen?"🔓 Change window open — closes in ~"+(changeHoursLeft||"?")+"h"'
    ),
]

changed = 0
for old, new in fixes:
    if old in code:
        code = code.replace(old, new)
        changed += 1
        print(f"✅ Fixed: {old[:60]}...")

# Also use regex to catch any remaining backtick template inside JSX ternary
pattern = r'`([^`]*)\$\{([^}]+)\}([^`]*)`'
def replace_template(m):
    before = m.group(1).replace('"', '\\"')
    expr = m.group(2)
    after = m.group(3).replace('"', '\\"')
    if before and after:
        return f'"{before}"+({expr})+"{after}"'
    elif before:
        return f'"{before}"+({expr})'
    elif after:
        return f'({expr})+"{after}"'
    else:
        return f'({expr})'

# Only apply inside JSX ternary expressions (after ? or :)
new_code = re.sub(r'(?<=[?:])\s*`[^`]*\$\{[^`]*`', lambda m: replace_template(re.search(pattern, m.group(0))), code)
if new_code != code:
    code = new_code
    changed += 1
    print("✅ Fixed additional template literals")

with open('src/App.jsx', 'w') as f:
    f.write(code)

if changed > 0:
    print(f"\n✅ {changed} fix(es) applied! Now run:")
    print("git add src/App.jsx && git commit -m 'fix build' && git push --force")
else:
    print("ℹ️  No changes needed - file may already be fixed")
    print("Try: git push --force")
