import re

with open('src/App.jsx', 'r') as f:
    code = f.read()

# Fix the broken line 613
old = """{endDate&&<div style={{fontSize:16,color:LF.teal,textShadow:"-1px -1px 0 rgba(0,0,0,0.9),1px -1px 0 rgba(0,0,0,0.9),-1px 1px 0 rgba(0,0,0,0.9),1px 1px 0 rgba(0,0,0,0.9)",fontWeight:800,marginTop:3}}>🏁 {daysLeft}d left · {admin.frequency} check-ins · {admin.payoutMode==="winners"?"🏆 Payout to winners":admin.payoutMode==="pain"?"😈 To The Pain":`🎁 Prize for top ${admin.prizeMetric==="pct"?"% achiever":"performer"}`:("💝 Donate to charity")}</div>}"""

new = """{endDate&&(()=>{const ml=admin.payoutMode==="winners"?"🏆 Payout to winners":admin.payoutMode==="pain"?"😈 To The Pain":admin.prizeEnabled?"🎁 Prize":"💝 Donate to charity";return <div style={{fontSize:16,color:LF.teal,fontWeight:800,marginTop:3}}>🏁 {daysLeft}d left · {admin.frequency} check-ins · {ml}</div>;})()}"""

if old in code:
    code = code.replace(old, new)
    with open('src/App.jsx', 'w') as f:
        f.write(code)
    print("✅ Fixed! Now run: git add src/App.jsx && git commit -m 'fix build' && git push")
else:
    print("❌ Pattern not found - the file may already be fixed or different")
    # Show what line 613 actually looks like
    lines = code.split('\n')
    print("Line 613:", lines[612][:200])
