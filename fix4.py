with open('src/App.jsx', 'r') as f:
    code = f.read()

before = code.count('&amp;&amp;')
code = code.replace('&amp;&amp;', '&&')
print(f"Fixed {before} instances of &amp;&amp; -> &&")

with open('src/App.jsx', 'w') as f:
    f.write(code)

print("✅ Done! Run: git add src/App.jsx && git commit -m 'fix amp' && git push --force")
