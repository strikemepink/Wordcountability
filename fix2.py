import re

with open('src/App.jsx', 'r') as f:
    code = f.read()

# Fix any remaining backtick template literal inside JSX ternary on this specific pattern
# The broken pattern: ...:(`🎁 Prize for top ${admin.prizeMetric==="pct"?"% achiever":"performer"}`):...
old = ':`\U0001f381 Prize for top ${admin.prizeMetric==="pct"?"% achiever":"performer"}`'
new = ':(admin.prizeEnabled?"🎁 Prize for top "+(admin.prizeMetric==="pct"?"% achiever":"performer"):"💝 Donate to charity")'

# Also fix the full surrounding ternary
broken = re.search(r'\{endDate&&<div[^>]*>.*?</div>\}', code, re.DOTALL)
if broken:
    print("Found endDate block")

# Most surgical fix: replace just the backtick portion
code2 = re.sub(
    r':`🎁 Prize for top \$\{admin\.prizeMetric==="pct"\?"% achiever":"performer"\}`',
    ':"🎁 Prize for top "+(admin.prizeMetric==="pct"?"% achiever":"performer")',
    code
)

if code2 != code:
    with open('src/App.jsx', 'w') as f:
        f.write(code2)
    print("✅ Fixed! Run: git add src/App.jsx && git commit -m 'fix build' && git push")
else:
    # Try finding it differently - maybe encoding issue with emoji
    print("Trying alternate search...")
    # Find the line with the problem
    lines = code.split('\n')
    for i, line in enumerate(lines):
        if 'Prize for top' in line and '`' in line:
            print(f"Found on line {i+1}: {line[:150]}")
            fixed = re.sub(
                r'`[^`]*Prize for top[^`]*`',
                '"🎁 Prize for top "+(admin.prizeMetric==="pct"?"% achiever":"performer")',
                line
            )
            # Also remove the extra ternary colon before the closing paren
            fixed = re.sub(r'\):"💝 Donate to charity"\)', '):"💝 Donate to charity")', fixed)
            lines[i] = fixed
            print(f"Fixed to: {fixed[:150]}")
    code2 = '\n'.join(lines)
    with open('src/App.jsx', 'w') as f:
        f.write(code2)
    print("✅ Done! Run: git add src/App.jsx && git commit -m 'fix build' && git push")
