import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);

const userDocRef    = (uid)       => doc(db, "users",  uid);
const historyDocRef = (uid)       => doc(db, "users",  uid, "data", "history");
const memberDocRef  = (gid, name) => doc(db, "groups", gid, "members", name);
const chatDocRef    = (gid)       => doc(db, "groups", gid, "data", "chat");
const pollsDocRef   = (gid)       => doc(db, "groups", gid, "data", "polls");
const adminDocRef   = (gid)       => doc(db, "groups", gid, "data", "admin");
const ledgerDocRef  = (gid)       => doc(db, "groups", gid, "data", "ledger");
const membersColRef = (gid)       => collection(db, "groups", gid, "members");
const memberUidDocRef = (gid, uid) => doc(db, "groups", gid, "memberUids", uid);

async function fsGet(ref) {
  try { const s = await getDoc(ref); return s.exists() ? s.data().value : null; } catch { return null; }
}
async function fsSet(ref, value) {
  try { await setDoc(ref, { value }, { merge: false }); } catch (e) { console.warn("fsSet", e); }
}
async function fsDel(ref) { try { await deleteDoc(ref); } catch {} }

// ── Constants ────────────────────────────────────────────────────
const TABS        = ["Dashboard","Group","Chat","Stats","Stakes","History"];
const WEEK_DAYS   = ["M","T","W","T","F","S","S"];
const AVATARS     = ["🦄","🐬","🍉","🐞","🌈","⭐","🌷","🐧","✏️","🙂"];
const REACTIONS   = ["👍","👎","🦄","🌈","💖","⭐","🔥","🐬","✨","💫"];
const DURATIONS   = [{label:"1 Month",days:30},{label:"1 Quarter",days:90},{label:"6 Months",days:180},{label:"1 Year",days:365}];
const FREQUENCIES = ["Daily","Weekly","Bi-Weekly","Monthly"];
const APP_URL     = "https://wordcountability.vercel.app";

const LF = {
  // NOTE: 'teal' is misnamed — it's actually a purple/violet (#E040FB). Rename in a future refactor.
  pink:"#FF2D9B", hotpink:"#FF6EC7", teal:"#E040FB", yellow:"#FFC200",
  purple:"#C97FFF", blue:"#C77DFF", orange:"#FF7A00", lime:"#CCFF66",
  white:"#FFFFFF", offwhite:"#FFF0FA",
};

// ── Global CSS — NO text-shadow anywhere ─────────────────────────
const G = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&display=swap');
  *{box-sizing:border-box;} body{margin:0;}
  .leopard         {background:linear-gradient(135deg,#6B0AC9 0%,#9B30FF 20%,#FF2D9B 45%,#FF7A00 65%,#FFC200 85%,#E040FB 100%);background-attachment:fixed;}
  .leopard-dashboard{background:linear-gradient(135deg,#6B0AC9 0%,#9B30FF 30%,#FF2D9B 70%,#FF6EC7 100%);background-attachment:fixed;}
  .leopard-group   {background:linear-gradient(135deg,#FF2D9B 0%,#BF5FFF 40%,#6B0AC9 100%);background-attachment:fixed;}
  .leopard-chat    {background:linear-gradient(135deg,#E040FB 0%,#C77DFF 35%,#6B0AC9 70%,#BF5FFF 100%);background-attachment:fixed;}
  .leopard-stats   {background:linear-gradient(135deg,#FFC200 0%,#FF7A00 30%,#FF2D9B 65%,#BF5FFF 100%);background-attachment:fixed;}
  .leopard-stakes  {background:linear-gradient(135deg,#FF2D9B 0%,#FF7A00 40%,#FFC200 100%);background-attachment:fixed;}
  .leopard-history {background:linear-gradient(135deg,#BF5FFF 0%,#6B0AC9 35%,#C77DFF 70%,#E040FB 100%);background-attachment:fixed;}
  .leopard-setup   {background:linear-gradient(135deg,#6B0AC9 0%,#9B30FF 20%,#FF2D9B 45%,#FF7A00 65%,#FFC200 85%,#E040FB 100%);background-attachment:fixed;}
  .root{min-height:100vh;font-family:'Outfit',sans-serif;color:#fff;font-weight:600;display:flex;flex-direction:column;align-items:center;padding-bottom:80px;}
  .card{background:#1A004488;border:1.5px solid #ffffff22;border-radius:20px;padding:20px;position:relative;backdrop-filter:blur(4px);}
  .card::before{display:none;}
  .btn{background:linear-gradient(135deg,#FF2D9B,#BF5FFF);color:#fff;border:none;border-radius:50px;padding:11px 24px;font-family:'Outfit',sans-serif;font-size:17px;cursor:pointer;font-weight:700;box-shadow:0 4px 20px #FF2D9B44;transition:transform 0.15s,box-shadow 0.15s;}
  .btn:hover{transform:translateY(-2px);box-shadow:0 6px 28px #FF2D9B66;}
  .btn-teal{background:linear-gradient(135deg,#E040FB,#C77DFF)!important;box-shadow:0 4px 20px #E040FB44!important;}
  .btn-yellow{background:linear-gradient(135deg,#FFC200,#FF7A00)!important;color:#1A0030!important;box-shadow:0 4px 20px #FFC20044!important;}
  .btn-red{background:linear-gradient(135deg,#FF4444,#FF2D9B)!important;box-shadow:0 4px 20px #FF444455!important;}
  .inp{background:#ffffff18;border:2px solid #ffffff44;border-radius:14px;padding:11px 16px;color:#fff;font-family:'Outfit',sans-serif;font-size:16px;font-weight:600;outline:none;transition:all 0.2s;width:100%;}
  .inp::placeholder{color:#ffffffbb;}
  .inp:focus{border-color:#FF2D9B;background:#ffffff22;}
  .tab{background:none;border:none;cursor:pointer;font-family:'Outfit',sans-serif;font-size:15px;font-weight:800;letter-spacing:0.5px;padding:10px 12px 14px;transition:color 0.2s;white-space:nowrap;text-transform:uppercase;color:#fff;}
  .pill{display:flex;background:#ffffff18;border:2px solid #ffffff33;border-radius:50px;padding:4px;gap:4px;}
  .pill button{flex:1;border:none;border-radius:50px;padding:12px 16px;font-family:'Outfit',sans-serif;font-size:16px;font-weight:700;cursor:pointer;transition:all 0.2s;color:#ffffffaa;background:transparent;}
  .pbar-bg{background:#ffffff22;border-radius:50px;height:10px;overflow:hidden;border:1px solid #ffffff22;}
  .pbar-fill{height:100%;border-radius:50px;transition:width 0.6s ease;}
  @keyframes shimmer{0%{background-position:-200% center;}100%{background-position:200% center;}}
  .holo{font-weight:900;background:linear-gradient(90deg,#FF9EE0,#fff,#E0AAFF,#FF9EE0);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmer 3s linear infinite;}
  @keyframes pop{0%{transform:scale(0.5);opacity:0;}60%{transform:scale(1.2);}100%{transform:scale(1);opacity:1;}}
  @keyframes msgIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
  .msg-in{animation:msgIn 0.25s ease forwards;}
  .lbl{font-size:13px;color:#fff;text-transform:uppercase;letter-spacing:2px;font-weight:900;display:block;margin-bottom:10px;}
  .modal-bg{position:fixed;inset:0;background:#00000088;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;}
  .modal{max-width:440px;width:100%;max-height:92vh;overflow-y:auto!important;border:1.5px solid #ffffff33!important;background:#2D006Eee!important;backdrop-filter:blur(12px);}
  .modal.card::before{display:none;}
  .locked-badge{background:linear-gradient(135deg,#FF4444,#BF5FFF);color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;}
  .open-badge{background:linear-gradient(135deg,#AAFF00,#E040FB);color:#1A0030;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;}
  .btn-google{background:#fff;color:#1A0030;border:none;border-radius:50px;padding:12px 28px;font-family:'Outfit',sans-serif;font-size:17px;cursor:pointer;font-weight:700;box-shadow:0 4px 24px #00000044;transition:transform 0.15s,box-shadow 0.15s;display:flex;align-items:center;gap:10px;}
  .btn-google:hover{transform:translateY(-2px);box-shadow:0 6px 32px #00000066;}
  .privacy-modal{max-width:500px;width:100%;max-height:88vh;overflow-y:auto;background:#2D006Eee;border:1.5px solid #ffffff33;border-radius:20px;padding:28px;backdrop-filter:blur(12px);}
`;

// ── Helpers ──────────────────────────────────────────────────────
function getWeekKey(){const now=new Date(),j=new Date(now.getFullYear(),0,1),w=Math.ceil(((now-j)/86400000+j.getDay()+1)/7);return`${now.getFullYear()}-W${w}`;}
function todayIdx(){return(new Date().getDay()+6)%7;}
function fmtGoal(m){if(m.goalType==="words")return`${m.goalValue.toLocaleString()} words`;const h=Math.floor(m.goalValue/60),mn=m.goalValue%60;return h>0?`${h}h`+(mn>0?` ${mn}m`:""):mn+"m";}
function fmtProg(m){if(m.goalType==="words")return`${m.progressThisWeek.toLocaleString()} words`;const h=Math.floor(m.progressThisWeek/60),mn=m.progressThisWeek%60;return h>0?`${h}h`+(mn>0?` ${mn}m`:""):mn+"m";}
function fmtDate(ts){return new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}
function fmtTimer(s){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;if(h>0)return`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;return`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;}
function fmtMoney(n){return`$${n.toFixed(2)}`;}
function normalizeUrl(s){s=s.trim();if(!s)return s;if(!/^https?:\/\//i.test(s))s="https://"+s;return s;}
function isValidUrl(s){s=normalizeUrl(s);try{const u=new URL(s);return(u.protocol==="https:"||u.protocol==="http:")&&u.hostname.includes(".");}catch{return false;}}

// ── Share helper ─────────────────────────────────────────────────
async function shareGroup(groupId, setCopied) {
  const msg = `Join my writing accountability group on Wordcountability! 📝🌈\n${APP_URL}\nGroup ID: ${groupId}\n\nTo get writing reminders, install the app: on iPhone tap Share → Add to Home Screen. On Android tap the menu → Add to Home Screen.`;
  if (navigator.share) {
    try { await navigator.share({ title: "Wordcountability", text: msg, url: APP_URL }); } catch {}
  } else {
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }
}

// ── Ring ─────────────────────────────────────────────────────────
function Ring({pct,size=100,stroke=8}){
  const r=(size-stroke*2)/2,c=2*Math.PI*r,off=c-(Math.min(pct,100)/100)*c;
  return(<svg width={size} height={size} style={{transform:"rotate(-90deg)",filter:`drop-shadow(0 0 8px ${pct>=100?LF.lime:LF.pink}88)`}}>
    <defs><linearGradient id="rg"><stop offset="0%" stopColor={pct>=100?LF.lime:LF.pink}/><stop offset="100%" stopColor={pct>=100?LF.teal:LF.purple}/></linearGradient></defs>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ffffff18" strokeWidth={stroke}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#rg)" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{transition:"stroke-dashoffset 0.6s ease"}}/>
  </svg>);
}

// ── Charity suggestions ──────────────────────────────────────────
const CHARITY_SUGGESTIONS=[
  {name:"Doctors Without Borders", url:"https://www.msf.org"},
  {name:"NAACP Legal Defense Fund", url:"https://www.naacpldf.org"},
  {name:"WWF",                      url:"https://www.worldwildlife.org"},
  {name:"Planned Parenthood",       url:"https://www.plannedparenthood.org"},
  {name:"826 National",             url:"https://826national.org"},
];

// ── PWA Install Prompt ───────────────────────────────────────────
function PwaPrompt({onClose}){
  const isIos=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid=/android/i.test(navigator.userAgent);
  return(
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal" onClick={e=>e.stopPropagation()} style={{textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>📲</div>
        <div style={{fontSize:20,fontWeight:900,color:"#FFC200",marginBottom:8}}>Install Wordcountability</div>
        <div style={{fontSize:14,color:"#ffffffcc",fontWeight:700,lineHeight:1.7,marginBottom:20}}>
          Install the app to your home screen to get writing reminders and quick access. It takes 5 seconds!
        </div>
        {isIos&&(
          <div style={{background:"#ffffff11",border:"2px solid #ffffff22",borderRadius:14,padding:"14px 16px",marginBottom:16,textAlign:"left"}}>
            <div style={{fontSize:13,fontWeight:900,color:"#FF6EC7",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>On iPhone / iPad</div>
            <div style={{fontSize:14,color:"#fff",fontWeight:700,lineHeight:2}}>
              1. Tap the <span style={{color:"#FFC200"}}>Share</span> button at the bottom of Safari ⬆️<br/>
              2. Scroll down and tap <span style={{color:"#FFC200"}}>Add to Home Screen</span><br/>
              3. Tap <span style={{color:"#FFC200"}}>Add</span> ✅
            </div>
          </div>
        )}
        {isAndroid&&(
          <div style={{background:"#ffffff11",border:"2px solid #ffffff22",borderRadius:14,padding:"14px 16px",marginBottom:16,textAlign:"left"}}>
            <div style={{fontSize:13,fontWeight:900,color:"#FF6EC7",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>On Android</div>
            <div style={{fontSize:14,color:"#fff",fontWeight:700,lineHeight:2}}>
              1. Tap the <span style={{color:"#FFC200"}}>menu</span> (⋮) in your browser<br/>
              2. Tap <span style={{color:"#FFC200"}}>Add to Home Screen</span><br/>
              3. Tap <span style={{color:"#FFC200"}}>Add</span> ✅
            </div>
          </div>
        )}
        {!isIos&&!isAndroid&&(
          <div style={{background:"#ffffff11",border:"2px solid #ffffff22",borderRadius:14,padding:"14px 16px",marginBottom:16,textAlign:"left"}}>
            <div style={{fontSize:14,color:"#fff",fontWeight:700,lineHeight:2}}>
              On <span style={{color:"#FFC200"}}>iPhone</span>: Safari Share ⬆️ → Add to Home Screen<br/>
              On <span style={{color:"#FFC200"}}>Android</span>: Browser menu ⋮ → Add to Home Screen
            </div>
          </div>
        )}
        <div style={{fontSize:12,color:"#ffffffbb",marginBottom:16}}>Push notifications only work after installing. 🔔</div>
        <button className="btn" onClick={onClose} style={{width:"100%"}}>Got it! ✨</button>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#ffffffaa",fontSize:12,cursor:"pointer",marginTop:10,fontFamily:"'Outfit',sans-serif",textDecoration:"underline"}}>Maybe later</button>
      </div>
    </div>
  );
}

// ── Privacy Policy Modal ─────────────────────────────────────────
function PrivacyModal({onClose}){
  return(
    <div className="modal-bg" onClick={onClose}>
      <div className="privacy-modal" onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:20,fontWeight:900,color:LF.yellow}}>🔒 Privacy Policy</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#ffffffcc",fontSize:22,cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        <div style={{fontSize:14,color:"#ffffffdd",lineHeight:1.8,display:"flex",flexDirection:"column",gap:16}}>
          <div style={{fontSize:12,color:"#ffffffcc"}}>Last updated: April 2026</div>

          <div>
            <div style={{fontWeight:900,color:LF.hotpink,marginBottom:6}}>What is Wordcountability?</div>
            Wordcountability is a writing accountability app that helps you and your group track weekly writing goals. It is a personal project, not a commercial product.
          </div>

          <div>
            <div style={{fontWeight:900,color:LF.hotpink,marginBottom:6}}>What information do we collect?</div>
            When you sign in with Google, we receive your name and email address from Google. We store your writing progress, goals, group activity, and chat messages so they sync across your devices.
          </div>

          <div>
            <div style={{fontWeight:900,color:LF.hotpink,marginBottom:6}}>How is your information used?</div>
            Your information is used only to make the app work — syncing your progress, showing your group leaderboard, and enabling group chat. We do not use your data for advertising or marketing.
          </div>

          <div>
            <div style={{fontWeight:900,color:LF.hotpink,marginBottom:6}}>Who can see your data?</div>
            Your writing progress and display name are visible to members of your group. Your email address is never shown to other users. No data is sold or shared with third parties.
          </div>

          <div>
            <div style={{fontWeight:900,color:LF.hotpink,marginBottom:6}}>Data storage</div>
            Your data is stored securely using Google Firebase, which is hosted in the United States. Google's privacy policy applies to their infrastructure.
          </div>

          <div>
            <div style={{fontWeight:900,color:LF.hotpink,marginBottom:6}}>Deleting your data</div>
            You can delete your own data at any time using the "Reset all data" option in the Stakes tab. To request complete account deletion, email us at{" "}
            <a href="mailto:erica.kritt.author@gmail.com" style={{color:LF.lime}}>erica.kritt.author@gmail.com</a>.
          </div>

          <div>
            <div style={{fontWeight:900,color:LF.hotpink,marginBottom:6}}>Contact</div>
            Questions about this policy? Email{" "}
            <a href="mailto:erica.kritt.author@gmail.com" style={{color:LF.lime}}>erica.kritt.author@gmail.com</a>.
          </div>
        </div>
        <button className="btn" onClick={onClose} style={{width:"100%",marginTop:24}}>Got it ✨</button>
      </div>
    </div>
  );
}

// ── Sign In ──────────────────────────────────────────────────────
function SignIn({onPrivacy}){
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  async function handleGoogle(){
    setLoading(true); setError("");
    try{
      const provider=new GoogleAuthProvider();
      await signInWithPopup(auth,provider);
    }catch(e){
      setError("Sign-in failed. Please try again.");
      console.error(e);
    }finally{setLoading(false);}
  }

  return(
    <div className="leopard leopard-setup" style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px",fontFamily:"'Outfit',sans-serif",color:"#fff"}}>
      <style>{G}</style>
      <div style={{maxWidth:380,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:24,textAlign:"center"}}>
        <div style={{fontSize:44,fontWeight:900,lineHeight:1.1}}>Wordcountability</div>
        <div style={{fontSize:18,color:LF.hotpink,fontWeight:700,lineHeight:1.5}}>
          Your writing accountability crew. Sign in to sync across all your devices. 📝🌈
        </div>
        <button className="btn-google" onClick={handleGoogle} disabled={loading}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {loading?"Signing in…":"Continue with Google"}
        </button>
        {error&&<div style={{color:LF.pink,fontWeight:800,fontSize:15}}>{error}</div>}
        <div style={{fontSize:13,color:"#ffffffcc",lineHeight:1.6}}>
          Your progress syncs across devices using your Google account.<br/>No separate password needed.
        </div>
        <button onClick={onPrivacy} style={{background:"none",border:"none",color:"#ffffffbb",fontSize:13,cursor:"pointer",fontFamily:"'Outfit',sans-serif",textDecoration:"underline"}}>
          Privacy Policy
        </button>
      </div>
    </div>
  );
}

// ── Setup ────────────────────────────────────────────────────────
function Setup({user,onSave}){
  const [name,setName]=useState(user.displayName?.split(" ")[0]||"");
  const [avatar,setAvatar]=useState("🦄");
  const [gType,setGType]=useState("words"),[gVal,setGVal]=useState("");
  const [grp,setGrp]=useState("");
  const ok=name.trim()&&grp.trim()&&gVal;

  function handleGo(){
    if(!ok)return;
    onSave({name:name.trim()||"Writer",avatar,goalType:gType,goalValue:parseInt(gVal)||1000,groupId:grp.trim(),isAdmin:false,charity:"",charityName:null});
  }

  return(
    <div className="leopard leopard-setup" style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",padding:"32px 24px 48px",fontFamily:"'Outfit',sans-serif",color:"#fff"}}>
      <style>{G}</style>
      <div style={{maxWidth:420,width:"100%",display:"flex",flexDirection:"column",gap:16}}>
        <div style={{textAlign:"center",marginBottom:4}}>
          <div style={{fontSize:38,fontWeight:900,lineHeight:1.1}}>Wordcountability</div>
          <div style={{fontSize:14,color:LF.hotpink,marginTop:6}}>Signed in as {user.email}</div>
        </div>

        <div className="card"><span className="lbl">Your Name</span>
          <input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Alex"/>
        </div>

        <div className="card"><span className="lbl">Pick Your Player</span>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {AVATARS.map(a=><button key={a} onClick={()=>setAvatar(a)} style={{width:64,height:64,fontSize:30,border:`2px solid ${avatar===a?LF.pink:"#ffffff33"}`,borderRadius:16,cursor:"pointer",background:avatar===a?"#FF2D9B22":"#ffffff18",transition:"all 0.2s",transform:avatar===a?"scale(1.1)":"scale(1)",boxShadow:avatar===a?"0 0 16px #FF2D9B66":"none"}}>{a}</button>)}
          </div>
        </div>

        <div className="card"><span className="lbl">Weekly Goal Type</span>
          <div className="pill" style={{marginBottom:12}}>
            <button onClick={()=>setGType("words")} style={{background:gType==="words"?`linear-gradient(135deg,#FF2D9B,#BF5FFF)`:"transparent",color:"#fff"}}>✍️ Word Count</button>
            <button onClick={()=>setGType("time")}  style={{background:gType==="time"?`linear-gradient(135deg,#E040FB,#C77DFF)`:"transparent",color:"#fff"}}>⏱️ Time</button>
          </div>
          <input className="inp" type="number" value={gVal} onChange={e=>setGVal(e.target.value)} placeholder={gType==="words"?"e.g. 2000 words":"e.g. 120 minutes"}/>
          {gType==="time"&&<div style={{fontSize:13,color:"#ffffffcc",marginTop:6}}>Total minutes per week</div>}
        </div>

        <div className="card"><span className="lbl">Group ID</span>
          <input className="inp" value={grp} onChange={e=>setGrp(e.target.value.toLowerCase().replace(/\s/g,""))} placeholder="e.g. unicornwriters" onKeyDown={e=>e.key==="Enter"&&handleGo()}/>
          <div style={{fontSize:13,color:"#ffffffcc",marginTop:8}}>Everyone with the same Group ID shares a leaderboard &amp; chat. Create a new one or enter an existing one.</div>
        </div>

        <button className="btn" onClick={handleGo} style={{fontSize:17,padding:16,opacity:ok?1:0.4}}>
          Let's GO! 🚀
        </button>
        <button onClick={()=>signOut(auth)} style={{background:"none",border:"none",cursor:"pointer",color:"#ffffffbb",fontSize:13,fontFamily:"'Outfit',sans-serif",textDecoration:"underline"}}>
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
export default function App(){
  const [authUser,setAuthUser]=useState(undefined);
  useEffect(()=>onAuthStateChanged(auth,u=>setAuthUser(u)),[]);
  const uid=authUser?.uid;

  const [ready,setReady]=useState(false);
  const [me,setMe]=useState(null);
  const [history,setHistory]=useState([]);
  const [members,setMembers]=useState([]);
  const [tab,setTab]=useState("Dashboard");
  const [logInput,setLogInput]=useState("");
  const [goalInput,setGoalInput]=useState("");
  const [goalTypeEdit,setGoalTypeEdit]=useState("words");
  const [spark,setSpark]=useState(0);
  const [saving,setSaving]=useState(false);
  const [showPrivacy,setShowPrivacy]=useState(false);
  const [shareCopied,setShareCopied]=useState(false);
  const [showPwaPrompt,setShowPwaPrompt]=useState(false);
  // timer
  const [timerRunning,setTimerRunning]=useState(false);
  const [timerSecs,setTimerSecs]=useState(0);
  const [timerSessions,setTimerSessions]=useState([]);
  const timerRef=useRef(null);
  // chat
  const [messages,setMessages]=useState([]);
  const [chatInput,setChatInput]=useState("");
  const chatEndRef=useRef(null);
  // polls
  const [polls,setPolls]=useState([]);
  const [showPollForm,setShowPollForm]=useState(false);
  const [openPicker,setOpenPicker]=useState(null);
  const [pollQ,setPollQ]=useState("");
  const [pollOpts,setPollOpts]=useState(["",""]);
  const [pollDeadline,setPollDeadline]=useState("");
  // admin
  const DEFAULT_ADMIN={duration:"1 Month",frequency:"Weekly",startDate:null,endDate:null,firstCheckIn:null,
    payoutMode:"charity",prizeMetric:"absolute",prizeDescription:"",goalsLocked:false,
    changeWindowOpen:false,changeWindowEnd:null,changeWindowDays:3,stake:25,threshold:3};
  const [admin,setAdmin]=useState(DEFAULT_ADMIN);
  const [showAdmin,setShowAdmin]=useState(false);
  const [adminDraft,setAdminDraft]=useState(DEFAULT_ADMIN);
  const [ledger,setLedger]=useState({charityTotals:{},payoutTotals:{},prizeTotals:{},totalWords:0,totalMinutes:0,entries:[]});

  useEffect(()=>{
    if(authUser===null){setReady(false);setMe(null);setHistory([]);setMembers([]);setMessages([]);setPolls([]);}
    if(authUser?.uid){loadAll(authUser.uid);}
  },[authUser?.uid]);
  useEffect(()=>()=>clearInterval(timerRef.current),[]);
  useEffect(()=>{if(chatEndRef.current)chatEndRef.current.scrollIntoView({behavior:"smooth"});},[messages]);
  useEffect(()=>{
    if(!admin.changeWindowOpen||!admin.changeWindowEnd||!me?.groupId)return;
    if(new Date(admin.changeWindowEnd)<new Date()){
      const upd={...admin,changeWindowOpen:false,changeWindowEnd:null};
      setAdmin(upd); fsSet(adminDocRef(me.groupId),JSON.stringify(upd));
    }
  },[admin,me]);

  async function loadAll(uid){
    try{
      const meVal=await fsGet(userDocRef(uid));
      if(!meVal){setReady(true);return;}
      let d=JSON.parse(meVal);
      const wk=getWeekKey();
      if(d.lastResetWeek!==wk){
        const histVal=await fsGet(historyDocRef(uid));
        const hist=histVal?JSON.parse(histVal):[];
        const met=d.progressThisWeek>=d.goalValue;
        const upd=[{week:d.lastResetWeek,progress:d.progressThisWeek,goal:d.goalValue,goalType:d.goalType,met},...hist].slice(0,40);
        await fsSet(historyDocRef(uid),JSON.stringify(upd));
        d={...d,progressThisWeek:0,dailyChecks:[false,false,false,false,false,false,false],lastResetWeek:wk};
        await fsSet(userDocRef(uid),JSON.stringify(d));
        await pub(d,uid); setHistory(upd);
      } else {
        const histVal=await fsGet(historyDocRef(uid));
        setHistory(histVal?JSON.parse(histVal):[]);
      }
      setMe(d); setGoalInput(String(d.goalValue)); setGoalTypeEdit(d.goalType);
      setReady(true);
      if(d.groupId){loadMembers(d.groupId,d.name);loadChat(d.groupId);loadPolls(d.groupId);loadAdminData(d.groupId);loadLedger(d.groupId);fsSet(memberUidDocRef(d.groupId,uid),JSON.stringify({uid,joinedAt:Date.now()})).catch(()=>{});}
    }catch(e){console.error("loadAll",e);setReady(true);}
  }

  async function pub(d,uidArg){
    if(!d?.groupId)return;
    try{
      await fsSet(memberDocRef(d.groupId,d.name),JSON.stringify({
        name:d.name,avatar:d.avatar,goalValue:d.goalValue,goalType:d.goalType,
        progressThisWeek:d.progressThisWeek,isAdmin:d.isAdmin,charity:d.charity,
        charityName:d.charityName||null,totalProgress:d.totalProgress||0,updatedAt:Date.now()
      }));
    }catch(e){console.warn("pub",e);}
  }

  async function loadMembers(gid,myName){
    try{
      const snap=await getDocs(membersColRef(gid));
      const ms=[];
      snap.forEach(d=>{try{const m=JSON.parse(d.data().value);ms.push({...m,isYou:m.name===myName});}catch{}});
      setMembers(ms);
    }catch{}
  }
  async function loadChat(gid){try{const v=await fsGet(chatDocRef(gid));setMessages(v?JSON.parse(v):[]);}catch{}}
  async function loadPolls(gid){try{const v=await fsGet(pollsDocRef(gid));setPolls(v?JSON.parse(v):[]);}catch{}}
  async function loadAdminData(gid){try{const v=await fsGet(adminDocRef(gid));if(v){const a=JSON.parse(v);setAdmin(a);setAdminDraft(a);}}catch{}}
  async function loadLedger(gid){try{const v=await fsGet(ledgerDocRef(gid));if(v)setLedger(JSON.parse(v));}catch{}}

  async function handleSetup({name,avatar,goalType,goalValue,groupId,isAdmin,charity,charityName}){
    const d={name,avatar,goalType,goalValue,groupId,isAdmin:false,charity:"",charityName:null,
      progressThisWeek:0,totalProgress:0,dailyChecks:[false,false,false,false,false,false,false],lastResetWeek:getWeekKey()};
    setMe(d); setGoalInput(String(goalValue)); setGoalTypeEdit(goalType); setReady(true);
    await fsSet(userDocRef(uid),JSON.stringify(d));
    pub(d).catch(()=>{});
    fsSet(memberUidDocRef(groupId,uid),JSON.stringify({uid,joinedAt:Date.now()})).catch(()=>{});
    loadMembers(groupId,name); loadChat(groupId); loadPolls(groupId); loadAdminData(groupId); loadLedger(groupId);
    if(!localStorage.getItem("pwaPromptShown")){setShowPwaPrompt(true);localStorage.setItem("pwaPromptShown","1");}
  }

  async function saveProgress(n){
    if(!n||n<=0||!me)return;
    const checks=[...me.dailyChecks]; checks[todayIdx()]=true;
    const newTotal=(me.totalProgress||0)+n;
    const upd={...me,progressThisWeek:me.progressThisWeek+n,totalProgress:newTotal,dailyChecks:checks};
    setMe(upd); setSpark(s=>s+1);
    fsSet(userDocRef(uid),JSON.stringify(upd)); pub(upd);
    loadMembers(me.groupId,me.name); updateLedgerProgress(n);
  }

  async function updateLedgerProgress(n){
    try{
      const v=await fsGet(ledgerDocRef(me.groupId));
      const l=v?JSON.parse(v):{charityTotals:{},payoutTotals:{},prizeTotals:{},totalWords:0,totalMinutes:0,entries:[]};
      if(!l.prizeTotals)l.prizeTotals={};
      if(me.goalType==="words")l.totalWords=(l.totalWords||0)+n;
      else l.totalMinutes=(l.totalMinutes||0)+n;
      await fsSet(ledgerDocRef(me.groupId),JSON.stringify(l)); setLedger(l);
    }catch{}
  }

  async function logProgress(){
    const n=parseInt(logInput); if(!n||n<=0)return;
    setSaving(true); await saveProgress(n); setLogInput(""); setSaving(false);
  }

  function startTimer(){if(timerRunning)return;setTimerRunning(true);timerRef.current=setInterval(()=>setTimerSecs(s=>s+1),1000);}
  function pauseTimer(){clearInterval(timerRef.current);setTimerRunning(false);}
  async function stopAndSave(){
    clearInterval(timerRef.current); setTimerRunning(false);
    if(timerSecs<60){setTimerSecs(0);return;}
    const mins=Math.round(timerSecs/60);
    setTimerSessions(s=>[...s,{mins,ts:Date.now()}]); setTimerSecs(0);
    await saveProgress(mins);
  }

  async function updateGoal(){
    const n=parseInt(goalInput); if(!n||n<=0||!me)return;
    const isLocked=admin.goalsLocked&&!admin.changeWindowOpen;
    if(isLocked&&n<me.goalValue){alert("🔒 Goals are locked! You can't lower your goal right now.");return;}
    const upd={...me,goalValue:n,goalType:goalTypeEdit};
    setMe(upd); fsSet(userDocRef(uid),JSON.stringify(upd)); pub(upd);
  }

  async function fetchCharityName(url){
    try{
      const base=new URL(url.startsWith("http")?url:"https://"+url).origin;
      const res=await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(base)}`);
      const data=await res.json(); const html=data.contents||"";
      const og=html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"'<]+)["']/i);
      if(og)return og[1].trim();
      const title=html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if(title)return title[1].trim().split(/[|\-–]/)[0].trim();
      const host=new URL(url.startsWith("http")?url:"https://"+url).hostname.replace(/^www\./,"").split(".")[0];
      return host.charAt(0).toUpperCase()+host.slice(1);
    }catch{return null;}
  }

  async function updateMyCharity(url){
    const upd={...me,charity:url,charityName:null};
    setMe(upd); fsSet(userDocRef(uid),JSON.stringify(upd)); pub(upd);
    if(url&&isValidUrl(url)){
      const name=await fetchCharityName(normalizeUrl(url));
      if(name){const upd2={...upd,charityName:name};setMe(upd2);fsSet(userDocRef(uid),JSON.stringify(upd2));pub(upd2);}
    }
  }

  function cadenceDays(freq){return freq==="Daily"?1:freq==="Weekly"?7:freq==="Bi-Weekly"?14:30;}
  function calcChallengeStart(firstCheckIn,frequency){
    if(!firstCheckIn)return new Date();
    const d=new Date(firstCheckIn);
    d.setDate(d.getDate()-cadenceDays(frequency));
    return d;
  }
  function saveAdminSettings(){
    const dur=DURATIONS.find(d=>d.label===adminDraft.duration);
    const challengeStart=calcChallengeStart(adminDraft.firstCheckIn,adminDraft.frequency);
    const end=new Date(challengeStart); end.setDate(end.getDate()+(dur?dur.days:30));
    const upd={...adminDraft,startDate:challengeStart.toISOString(),endDate:end.toISOString()};
    setAdmin(upd); setAdminDraft(upd); setShowAdmin(false);
    fsSet(adminDocRef(me.groupId),JSON.stringify(upd));
  }

  function toggleGoalLock(){
    const upd={...admin,goalsLocked:!admin.goalsLocked,changeWindowOpen:false,changeWindowEnd:null};
    setAdmin(upd); setAdminDraft(upd); fsSet(adminDocRef(me.groupId),JSON.stringify(upd));
  }

  function openChangeWindow(){
    const days=admin.changeWindowDays||3;
    const end=new Date(); end.setDate(end.getDate()+days);
    const upd={...admin,changeWindowOpen:true,changeWindowEnd:end.toISOString()};
    setAdmin(upd); setAdminDraft(upd); fsSet(adminDocRef(me.groupId),JSON.stringify(upd));
  }

  async function recordPayment(type,name,amount,charity){
    try{
      const v=await fsGet(ledgerDocRef(me.groupId));
      const l=v?JSON.parse(v):{charityTotals:{},payoutTotals:{},prizeTotals:{},totalWords:0,totalMinutes:0,entries:[]};
      if(!l.prizeTotals)l.prizeTotals={};
      const entry={id:Date.now(),type,name,amount,charity,recordedBy:me.name,ts:Date.now()};
      l.entries=[...(l.entries||[]),entry];
      if(type==="charity")l.charityTotals[charity]=(l.charityTotals[charity]||0)+amount;
      else if(type==="payout")l.payoutTotals[name]=(l.payoutTotals[name]||0)+amount;
      else if(type==="prize")l.prizeTotals[name]=amount;
      await fsSet(ledgerDocRef(me.groupId),JSON.stringify(l)); setLedger(l);
    }catch{}
  }

  function sendMessage(){
    if(!chatInput.trim()||!me)return;
    const msg={id:Date.now(),author:me.name,avatar:me.avatar,text:chatInput.trim(),ts:Date.now(),reactions:{}};
    const upd=[...messages,msg].slice(-200);
    setMessages(upd); setChatInput("");
    fsSet(chatDocRef(me.groupId),JSON.stringify(upd));
  }

  function addReaction(msgId,emoji){
    const upd=messages.map(m=>{
      if(m.id!==msgId)return m;
      const r={...m.reactions}; if(!r[emoji])r[emoji]=[];
      r[emoji]=r[emoji].includes(me.name)?r[emoji].filter(n=>n!==me.name):[...r[emoji],me.name];
      return {...m,reactions:r};
    });
    setMessages(upd); fsSet(chatDocRef(me.groupId),JSON.stringify(upd));
  }

  function submitPoll(){
    if(!pollQ.trim()||pollOpts.filter(o=>o.trim()).length<2)return;
    const poll={id:Date.now(),question:pollQ.trim(),options:pollOpts.filter(o=>o.trim()).map(o=>({text:o.trim(),votes:[]})),author:me.name,ts:Date.now(),deadline:pollDeadline||null};
    const upd=[...polls,poll];
    setPolls(upd); setPollQ(""); setPollOpts(["",""]); setPollDeadline(""); setShowPollForm(false);
    fsSet(pollsDocRef(me.groupId),JSON.stringify(upd));
  }
  function deletePoll(pollId){
    if(!window.confirm("Delete this poll?"))return;
    const upd=polls.filter(p=>p.id!==pollId);
    setPolls(upd); fsSet(pollsDocRef(me.groupId),JSON.stringify(upd));
  }
  function votePoll(pollId,optIdx){
    const upd=polls.map(p=>{
      if(p.id!==pollId)return p;
      const opts=p.options.map((o,i)=>{const v=o.votes.filter(n=>n!==me.name);return i===optIdx?{...o,votes:[...v,me.name]}:{...o,votes:v};});
      return {...p,options:opts};
    });
    setPolls(upd); fsSet(pollsDocRef(me.groupId),JSON.stringify(upd));
  }
  function overridePollResult(pollId,winnerText){
    const upd=polls.map(p=>p.id===pollId?{...p,adminOverride:winnerText,overriddenBy:me.name,overriddenAt:Date.now()}:p);
    setPolls(upd); fsSet(pollsDocRef(me.groupId),JSON.stringify(upd));
  }

  async function handleReset(){
    if(!window.confirm("Reset ALL your data? This can't be undone. 😱"))return;
    await fsDel(userDocRef(uid)); await fsDel(historyDocRef(uid));
    if(me?.groupId){
      const gid=me.groupId;
      await fsDel(chatDocRef(gid)); await fsDel(pollsDocRef(gid));
      await fsDel(adminDocRef(gid)); await fsDel(ledgerDocRef(gid));
      try{const snap=await getDocs(membersColRef(gid));snap.forEach(d=>fsDel(d.ref));}catch{}
    }
    setMe(null); setReady(false); setHistory([]); setMembers([]);
    setMessages([]); setPolls([]); setLedger({charityTotals:{},payoutTotals:{},prizeTotals:{},totalWords:0,totalMinutes:0,entries:[]});
  }

  // ── Auth/loading states ──
  if(authUser===undefined)return(
    <div className="leopard" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{G}</style><div style={{fontSize:32}}>🦄</div>
    </div>
  );
  if(!authUser)return(
    <>
      <SignIn onPrivacy={()=>setShowPrivacy(true)}/>
      {showPrivacy&&<PrivacyModal onClose={()=>setShowPrivacy(false)}/>}
    </>
  );
  if(!ready)return(
    <div className="leopard" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{G}</style><div style={{fontSize:32}}>✨</div>
    </div>
  );
  if(!me)return <Setup user={authUser} onSave={handleSetup}/>;

  const pct=Math.min(Math.round((me.progressThisWeek/me.goalValue)*100),100);
  const left=Math.max(me.goalValue-me.progressThisWeek,0);
  const missed=history.filter(h=>!h.met).length;
  const atRisk=missed>=admin.threshold-1;
  const triggered=missed>=admin.threshold;
  const sorted=[...members].sort((a,b)=>(b.progressThisWeek/b.goalValue)-(a.progressThisWeek/a.goalValue));
  const now=new Date();
  const endDate=admin.endDate?new Date(admin.endDate):null;
  const daysLeft=endDate?Math.max(0,Math.ceil((endDate-now)/86400000)):null;
  const challengeStartDate=admin.startDate?new Date(admin.startDate):null;
  const challengeNotStarted=challengeStartDate&&challengeStartDate>now;
  const countdownMs=challengeNotStarted?(challengeStartDate-now):0;
  const countdownDays=Math.floor(countdownMs/86400000);
  const countdownHours=Math.floor((countdownMs%86400000)/3600000);
  const countdownMins=Math.floor((countdownMs%3600000)/60000);
  const isLocked=admin.goalsLocked&&!admin.changeWindowOpen;
  const changeWindowEnds=admin.changeWindowEnd?new Date(admin.changeWindowEnd):null;
  const changeHoursLeft=changeWindowEnds?Math.max(0,Math.ceil((changeWindowEnds-now)/3600000)):null;
  const fmtLeft=()=>{if(me.goalType==="words")return`${left.toLocaleString()} words to go`;const h=Math.floor(left/60),m=left%60;return`${h>0?h+"h ":""}${m>0?m+"m":""} to go`;};
  const totalGroupWords=members.filter(m=>m.goalType==="words").reduce((s,m)=>s+(m.totalProgress||0),0)+(me.goalType==="words"?(me.totalProgress||0):0);
  const totalGroupMinutes=members.filter(m=>m.goalType==="time").reduce((s,m)=>s+(m.totalProgress||0),0)+(me.goalType==="time"?(me.totalProgress||0):0);
  const totalCharity=Object.values(ledger.charityTotals||{}).reduce((s,v)=>s+v,0);
  const totalPayouts=Object.values(ledger.payoutTotals||{}).reduce((s,v)=>s+v,0);
  const totalPrizes=Object.keys(ledger.prizeTotals||{}).length;

  return(
    <div className={`root leopard leopard-${tab.toLowerCase()}`}>
      <style>{G}</style>
      {showPrivacy&&<PrivacyModal onClose={()=>setShowPrivacy(false)}/>}
      {showPwaPrompt&&<PwaPrompt onClose={()=>setShowPwaPrompt(false)}/>}

      {/* ── Header ── */}
      <div style={{width:"100%",maxWidth:500,padding:"22px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:26,fontWeight:900,lineHeight:1,marginBottom:4}}>Wordcountability</div>
          <div style={{fontSize:14,color:LF.hotpink,fontWeight:800,display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"}}>
            {me.avatar} {me.name} · <span style={{color:"#fff"}}>#{me.groupId}</span>
            {me.isAdmin&&<span style={{background:`linear-gradient(135deg,${LF.yellow},${LF.orange})`,color:"#1A0030",fontSize:11,fontWeight:800,padding:"2px 8px",borderRadius:20}}>⭐ ADMIN</span>}
            {triggered&&<span style={{background:`linear-gradient(135deg,${LF.orange},${LF.pink})`,color:"#fff",fontSize:11,fontWeight:800,padding:"2px 8px",borderRadius:20}}>💸 PAY UP!</span>}
            {!triggered&&atRisk&&<span style={{background:`linear-gradient(135deg,${LF.yellow},${LF.orange})`,color:"#1A0030",fontSize:11,fontWeight:800,padding:"2px 8px",borderRadius:20}}>⚠️ AT RISK</span>}
            {isLocked&&<span className="locked-badge">🔒 Locked</span>}
            {admin.changeWindowOpen&&<span className="open-badge">🔓 Window Open</span>}
          </div>
          {endDate&&<div style={{fontSize:13,color:LF.lime,fontWeight:800,marginTop:3}}>🏁 {daysLeft}d left · {admin.frequency}</div>}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          {me.isAdmin&&<button className="btn btn-yellow" onClick={()=>{setAdminDraft({...admin});setShowAdmin(true);}} style={{fontSize:13,padding:"6px 10px"}}>⚙️ Admin</button>}
          <button onClick={()=>signOut(auth)} style={{background:"#ffffff18",border:"1px solid #ffffff33",borderRadius:50,padding:"6px 10px",cursor:"pointer",fontSize:13,color:"#fff",fontFamily:"'Outfit',sans-serif",fontWeight:700}}>↩ Out</button>
        </div>
      </div>

      {/* ── Admin Modal ── */}
      {showAdmin&&me.isAdmin&&(
        <div className="modal-bg">
          <div className="card modal">
            <div style={{fontSize:18,color:LF.yellow,marginBottom:16,fontWeight:900}}>⚙️ Admin Settings</div>

            <span className="lbl">Challenge Duration</span>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
              {DURATIONS.map(d=><button key={d.label} onClick={()=>setAdminDraft(s=>({...s,duration:d.label}))} style={{padding:"7px 14px",border:`2px solid ${adminDraft.duration===d.label?LF.yellow:"#ffffff22"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:14,background:adminDraft.duration===d.label?`linear-gradient(135deg,${LF.yellow},${LF.orange})`:"#ffffff18",color:adminDraft.duration===d.label?"#1A0030":"#fff"}}>{d.label}</button>)}
            </div>

            <span className="lbl">Check-in Frequency</span>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
              {FREQUENCIES.map(f=><button key={f} onClick={()=>setAdminDraft(s=>({...s,frequency:f}))} style={{padding:"7px 14px",border:`2px solid ${adminDraft.frequency===f?LF.teal:"#ffffff22"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:14,background:adminDraft.frequency===f?`linear-gradient(135deg,${LF.teal},${LF.blue})`:"#ffffff18",color:"#fff"}}>{f}</button>)}
            </div>

            <span className="lbl">First Check-in Date &amp; Time</span>
            <input className="inp" type="datetime-local" value={adminDraft.firstCheckIn||""} onChange={e=>setAdminDraft(s=>({...s,firstCheckIn:e.target.value}))} style={{marginBottom:6}}/>
            {adminDraft.firstCheckIn&&(()=>{
              const start=new Date(adminDraft.firstCheckIn);
              start.setDate(start.getDate()-(adminDraft.frequency==="Daily"?1:adminDraft.frequency==="Weekly"?7:adminDraft.frequency==="Bi-Weekly"?14:30));
              return <div style={{background:"#ffffff11",border:"2px solid #ffffff22",borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:13,color:LF.lime,fontWeight:800}}>
                🚀 Challenge starts: {start.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})} at {start.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
              </div>;
            })()}
            {!adminDraft.firstCheckIn&&<div style={{fontSize:12,color:"#ffffffcc",fontWeight:700,marginBottom:14}}>Pick a date to see when the challenge will start.</div>}

            <span className="lbl">What happens when someone fails?</span>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
              {[
                {mode:"charity",icon:"💝",label:"To Charity",desc:"Stakes donated to each member's chosen charity.",grad:`linear-gradient(135deg,${LF.pink},${LF.purple})`,col:"#fff"},
                {mode:"winners",icon:"🏆",label:"Cash to Winners",desc:"Failed stakes split among members who hit their goals.",grad:`linear-gradient(135deg,${LF.yellow},${LF.orange})`,col:"#1A0030"},
                {mode:"pain",   icon:"😈",label:"To The Pain",desc:"No money — whoever fails gets mercilessly ridiculed.",grad:`linear-gradient(135deg,#FF4444,#FF7A00)`,col:"#fff"},
              ].map(({mode,icon,label,desc,grad,col})=>(
                <button key={mode} onClick={()=>setAdminDraft(s=>({...s,payoutMode:mode}))} style={{background:adminDraft.payoutMode===mode?grad:"#ffffff11",border:`2px solid ${adminDraft.payoutMode===mode?"transparent":"#ffffff22"}`,borderRadius:14,padding:"10px 14px",cursor:"pointer",textAlign:"left"}}>
                  <div style={{fontSize:15,color:adminDraft.payoutMode===mode?col:"#fff",fontWeight:800,marginBottom:2}}>{icon} {label}</div>
                  <div style={{fontSize:13,color:adminDraft.payoutMode===mode?col+"cc":"#ffffffaa",fontWeight:700}}>{desc}</div>
                </button>
              ))}
            </div>

            <div style={{background:"#ffffff11",border:"1px solid #ffffff22",borderRadius:14,padding:12,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:adminDraft.prizeEnabled?10:0}}>
                <input type="checkbox" id="prizeToggle" checked={!!adminDraft.prizeEnabled} onChange={e=>setAdminDraft(s=>({...s,prizeEnabled:e.target.checked}))} style={{accentColor:LF.pink,width:18,height:18,flexShrink:0}}/>
                <label htmlFor="prizeToggle" style={{fontSize:14,color:"#fff",fontWeight:700,cursor:"pointer"}}>🏅 Also offer a Prize for the top performer</label>
              </div>
              {adminDraft.prizeEnabled&&(<>
                <span className="lbl" style={{marginTop:6}}>Prize Metric</span>
                <div className="pill" style={{marginBottom:8}}>
                  <button onClick={()=>setAdminDraft(s=>({...s,prizeMetric:"absolute"}))} style={{background:adminDraft.prizeMetric==="absolute"?`linear-gradient(135deg,#E040FB,#C77DFF)`:"transparent",color:"#fff"}}>📈 Most Total</button>
                  <button onClick={()=>setAdminDraft(s=>({...s,prizeMetric:"pct"}))} style={{background:adminDraft.prizeMetric==="pct"?`linear-gradient(135deg,#FF2D9B,#BF5FFF)`:"transparent",color:"#fff"}}>🎯 Highest %</button>
                </div>
                <span className="lbl">What's the Prize?</span>
                <input className="inp" placeholder="e.g. Free developmental edit, gift card..." value={adminDraft.prizeDescription||""} onChange={e=>setAdminDraft(s=>({...s,prizeDescription:e.target.value}))} style={{marginBottom:6}}/>
              </>)}
            </div>

            <span className="lbl">Stake Amount per Person</span>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              {[0,10,25,50,100,250].map(n=><button key={n} onClick={()=>setAdminDraft(s=>({...s,stake:n}))} style={{padding:"7px 14px",border:`2px solid ${adminDraft.stake===n?LF.pink:"#ffffff22"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:14,background:adminDraft.stake===n?`linear-gradient(135deg,${LF.pink},${LF.purple})`:"#ffffff18",color:"#fff"}}>${n}</button>)}
            </div>

            <span className="lbl">Miss Threshold (triggers stake)</span>
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setAdminDraft(s=>({...s,threshold:n}))} style={{flex:1,padding:"10px 0",border:`2px solid ${adminDraft.threshold===n?LF.pink:"#ffffff22"}`,borderRadius:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:15,background:adminDraft.threshold===n?`linear-gradient(135deg,${LF.pink},${LF.purple})`:"#ffffff18",color:"#fff"}}>{n}</button>)}
            </div>

            <div style={{background:"#FF444411",border:"2px solid #FF444433",borderRadius:14,padding:14,marginBottom:14}}>
              <span className="lbl" style={{color:LF.orange}}>🔒 Goal Lock</span>
              <div style={{fontSize:13,color:"#ffffffcc",fontWeight:700,marginBottom:10}}>When locked, members cannot lower their goals. Open a temporary change window to allow edits.</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:13,color:"#fff",fontWeight:800}}>Change window (days):</span>
                <input className="inp" type="number" min="1" max="14" value={adminDraft.changeWindowDays||3} onChange={e=>setAdminDraft(s=>({...s,changeWindowDays:parseInt(e.target.value)||3}))} style={{width:70,padding:"6px 10px",fontSize:13}}/>
              </div>
            </div>

            <div style={{display:"flex",gap:8,position:"sticky",bottom:0,background:"#2D006Eee",paddingTop:12,marginLeft:-20,marginRight:-20,paddingLeft:20,paddingRight:20,paddingBottom:4}}>
              <button className="btn" onClick={saveAdminSettings} style={{flex:1,fontSize:13}}>Save &amp; Activate 🌈</button>
              <button onClick={()=>setShowAdmin(false)} style={{flex:1,background:"#ffffff18",border:"2px solid #ffffff22",borderRadius:50,padding:11,fontFamily:"'Outfit',sans-serif",fontSize:14,color:"#fff",cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <div style={{width:"100%",maxWidth:500,display:"flex",padding:"14px 20px 0",borderBottom:`2px solid ${LF.pink}33`,overflowX:"auto"}}>
        {TABS.map(t=><button key={t} className="tab" onClick={()=>setTab(t)} style={{color:tab===t?LF.pink:"#fff",borderBottom:tab===t?`4px solid ${LF.pink}`:"4px solid transparent"}}>{t}</button>)}
      </div>

      <div style={{width:"100%",maxWidth:500,padding:"18px 20px 0",display:"flex",flexDirection:"column",gap:14}}>

        {/* ── DASHBOARD ── */}
        {tab==="Dashboard"&&(<>
          {challengeNotStarted&&(
            <div className="card" style={{border:`2px solid ${LF.teal}88`,background:"#E040FB11",textAlign:"center"}}>
              <div style={{fontSize:13,color:LF.lime,fontWeight:900,textTransform:"uppercase",letterSpacing:2,marginBottom:6}}>⏳ Challenge Countdown</div>
              <div style={{fontSize:32,fontWeight:900,color:LF.yellow,letterSpacing:2,marginBottom:4}}>
                {countdownDays>0&&<span>{countdownDays}<span style={{fontSize:14,color:"#ffffffcc",marginRight:8}}>d</span></span>}
                {countdownHours>0&&<span>{countdownHours}<span style={{fontSize:14,color:"#ffffffcc",marginRight:8}}>h</span></span>}
                <span>{countdownMins}<span style={{fontSize:14,color:"#ffffffcc"}}>m</span></span>
              </div>
              <div style={{fontSize:13,color:"#ffffffcc",fontWeight:800}}>
                Challenge starts {challengeStartDate.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})} at {challengeStartDate.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
              </div>
              <div style={{fontSize:12,color:"#ffffffcc",fontWeight:700,marginTop:4}}>First check-in: {admin.firstCheckIn?new Date(admin.firstCheckIn).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}</div>
            </div>
          )}
          <div className="card" style={{border:`2px solid ${pct>=100?LF.lime:LF.pink}66`,position:"relative"}}>
            {spark>0&&Array.from({length:6},(_,i)=><span key={`${spark}-${i}`} style={{position:"absolute",left:`${15+Math.random()*70}%`,top:`${10+Math.random()*80}%`,fontSize:16,animation:"pop 0.5s ease forwards",pointerEvents:"none"}}>{"✨⭐💫🌟"[i%4]}</span>)}
            <div style={{display:"flex",alignItems:"center",gap:18}}>
              <div style={{position:"relative",flexShrink:0}}>
                <Ring pct={pct}/>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:20,fontWeight:900,color:pct>=100?LF.lime:LF.yellow}}>{pct}%</span>
                </div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:20,color:LF.white,fontWeight:800,marginBottom:2}}>{fmtProg(me)}</div>
                <div style={{fontSize:14,color:LF.hotpink,fontWeight:800,marginBottom:2}}>of {fmtGoal(me)}</div>
                <div style={{fontSize:14,color:pct>=100?LF.lime:LF.yellow,fontWeight:800}}>{pct>=100?"🌟 GOAL CRUSHED! 🌟":fmtLeft()}</div>
                {history.filter(h=>h.met).length>0&&<div style={{fontSize:14,marginTop:4,color:LF.yellow,fontWeight:800}}>{"🔥".repeat(Math.min(history.filter(h=>h.met).length,3))} {history.filter(h=>h.met).length}wk streak!</div>}
              </div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:16}}>
              {WEEK_DAYS.map((d,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <div style={{width:"100%",height:8,borderRadius:4,background:me.dailyChecks[i]?`linear-gradient(90deg,${LF.pink},${LF.purple})`:i===todayIdx()?LF.pink+"33":"#ffffff18"}}/>
                  <span style={{fontSize:12,color:i===todayIdx()?LF.pink:"#ffffffcc",fontWeight:800}}>{d}</span>
                </div>
              ))}
            </div>
          </div>

          {me.goalType==="words"?(
            <div className="card">
              <span className="lbl">📝 Log Today's Words</span>
              <div style={{display:"flex",gap:10}}>
                <input className="inp" type="number" placeholder="words written today" value={logInput} onChange={e=>setLogInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&logProgress()} style={{flex:1}}/>
                <button className="btn" onClick={logProgress} disabled={saving} style={{padding:"11px 20px"}}>{saving?"✨":"+ Log"}</button>
              </div>
            </div>
          ):(
            <div className="card" style={{border:`2px solid ${timerRunning?LF.teal:LF.pink}55`}}>
              <span className="lbl">⏱️ Writing Timer</span>
              <div style={{textAlign:"center",padding:"12px 0 16px"}}>
                <div style={{fontSize:48,color:timerRunning?LF.pink:LF.yellow,letterSpacing:2,fontWeight:800}}>{fmtTimer(timerSecs)}</div>
                <div style={{fontSize:14,fontWeight:800,marginTop:4,color:timerRunning?LF.pink:timerSecs>0?LF.yellow:"#ffffffcc"}}>{timerRunning?"● WRITING IN PROGRESS...":timerSecs>0?"⏸ Paused":"Hit Start when you begin ✨"}</div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {!timerRunning
                  ?<button className="btn" onClick={startTimer} style={{flex:1,fontSize:14}}>{timerSecs>0?"▶ Resume":"▶ Start"} Writing</button>
                  :<button className="btn btn-teal" onClick={pauseTimer} style={{flex:1,fontSize:14}}>⏸ Pause</button>}
                {timerSecs>0&&<button className="btn btn-red" onClick={()=>{clearInterval(timerRef.current);setTimerRunning(false);setTimerSecs(0);}} style={{flex:1,fontSize:14}}>⏹ Stop</button>}
                {timerSecs>=60&&<button className="btn btn-yellow" onClick={stopAndSave} style={{width:"100%",fontSize:14,marginTop:4}}>✅ Save {Math.round(timerSecs/60)}m</button>}
              </div>
              {timerSessions.length>0&&(
                <div style={{marginTop:12,borderTop:`1px solid ${LF.purple}33`,paddingTop:10}}>
                  <div style={{fontSize:12,color:LF.lime,fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Today's Sessions</div>
                  {timerSessions.map((s,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#fff",fontWeight:800,padding:"2px 0"}}><span>Session {i+1}</span><span style={{color:LF.lime}}>{s.mins}m ✓</span></div>)}
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:800,marginTop:6,color:LF.yellow}}><span>Total today</span><span>{timerSessions.reduce((a,s)=>a+s.mins,0)}m 🔥</span></div>
                </div>
              )}
              <div style={{fontSize:12,color:"#ffffffaa",fontWeight:700,marginTop:10,textAlign:"center"}}>Sessions under 1 min aren't counted 🦄</div>
            </div>
          )}

          <div className="card" style={{border:`2px solid ${triggered?LF.orange:atRisk?LF.yellow:LF.pink}44`,background:triggered?"#2D000888":""}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <span className="lbl">{admin.payoutMode==="pain"?"😈 To The Pain":admin.payoutMode==="prize"?"🎁 Prize":"Your Stake 🔒"}</span>
                {admin.payoutMode==="pain"?(
                  <>
                    <div style={{fontSize:16,color:"#FF6666",fontWeight:800}}>😈 No money — just shame.</div>
                    <div style={{fontSize:13,color:"#ffffffcc",fontWeight:700,marginTop:3}}>Miss your goal and your group WILL hear about it.</div>
                  </>
                ):(
                  <>
                    <div style={{fontSize:16,color:triggered?LF.orange:atRisk?LF.yellow:LF.white,fontWeight:800}}>{fmtMoney(admin.stake)} → {admin.payoutMode==="winners"?"🏆 Winners":(me.charityName||me.charity||"your charity")}</div>
                    <div style={{fontSize:13,color:LF.hotpink,fontWeight:800,marginTop:3}}>{missed}/{admin.threshold} missed · {admin.payoutMode==="winners"?"payout to winners":"your charity"}</div>
                  </>
                )}
              </div>
              <div style={{fontSize:30}}>{admin.payoutMode==="pain"?"😈":triggered?"💸":atRisk?"⚠️":"🔒"}</div>
            </div>
            {triggered&&admin.payoutMode==="charity"&&<button className="btn btn-red" onClick={()=>recordPayment("charity",me.name,admin.stake,me.charity)} style={{marginTop:12,width:"100%",fontSize:13}}>Record Donation →</button>}
            {triggered&&admin.payoutMode==="winners"&&<button className="btn btn-yellow" onClick={()=>recordPayment("payout",me.name,admin.stake,"")} style={{marginTop:12,width:"100%",fontSize:13}}>Record Payout of {fmtMoney(admin.stake)} →</button>}
          </div>
        </>)}

        {/* ── GROUP ── */}
        {tab==="Group"&&(<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:14,color:LF.lime,fontWeight:800}}>#{me.groupId} · This Period 🏆</div>
            <button className="btn btn-teal" onClick={()=>loadMembers(me.groupId,me.name)} style={{fontSize:13,padding:"6px 12px"}}>↻ Refresh</button>
          </div>
          {challengeNotStarted&&(
            <div className="card" style={{border:`2px solid ${LF.teal}88`,background:"#E040FB11",textAlign:"center"}}>
              <div style={{fontSize:13,color:LF.lime,fontWeight:900,textTransform:"uppercase",letterSpacing:2,marginBottom:6}}>⏳ Challenge Countdown</div>
              <div style={{fontSize:32,fontWeight:900,color:LF.yellow,letterSpacing:2,marginBottom:4}}>
                {countdownDays>0&&<span>{countdownDays}<span style={{fontSize:14,color:"#ffffffcc",marginRight:8}}>d</span></span>}
                {countdownHours>0&&<span>{countdownHours}<span style={{fontSize:14,color:"#ffffffcc",marginRight:8}}>h</span></span>}
                <span>{countdownMins}<span style={{fontSize:14,color:"#ffffffcc"}}>m</span></span>
              </div>
              <div style={{fontSize:13,color:"#ffffffcc",fontWeight:800}}>
                Challenge starts {challengeStartDate.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})} at {challengeStartDate.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
              </div>
              <div style={{fontSize:12,color:"#ffffffcc",fontWeight:700,marginTop:4}}>First check-in: {admin.firstCheckIn?new Date(admin.firstCheckIn).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}</div>
            </div>
          )}

          {/* Share invite card */}
          <div className="card" style={{border:`2px solid ${LF.purple}55`}}>
            <span className="lbl">📝 Invite Your Crew</span>
            <div style={{fontSize:14,color:"#ffffffcc",marginBottom:12}}>Share this link — anyone can join by signing in with Google and entering your Group ID.</div>
            <div style={{background:"#ffffff11",borderRadius:12,padding:"10px 14px",marginBottom:12,fontFamily:"monospace",fontSize:13,color:LF.yellow,wordBreak:"break-all"}}>{APP_URL}</div>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:14,color:"#ffffffcc"}}>Group ID:</div>
              <div style={{fontSize:15,fontWeight:900,color:LF.white}}>#{me.groupId}</div>
            </div>
            <button
              className="btn"
              onClick={()=>shareGroup(me.groupId,setShareCopied)}
              style={{width:"100%",fontSize:15,background:`linear-gradient(135deg,${LF.teal},${LF.purple})`}}
            >
              {shareCopied?"✓ Copied to clipboard!":"📤 Share Invite"}
            </button>
            <div style={{fontSize:12,color:"#ffffffcc",marginTop:8,textAlign:"center"}}>
              On mobile, this opens your share sheet (iMessage, WhatsApp, email, etc.)
            </div>
          </div>

          {me.isAdmin&&(
            <div className="card" style={{border:`2px solid ${LF.orange}55`,background:"#FF440011"}}>
              <span className="lbl" style={{color:LF.orange}}>🔒 Goal Lock Controls</span>
              <div style={{fontSize:13,color:"#ffffffcc",fontWeight:700,marginBottom:10}}>
                {isLocked?"Goals are currently locked.":admin.changeWindowOpen?`🔓 Change window open — closes in ~${changeHoursLeft||"?"}h`:"Goals are unlocked."}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button className={admin.goalsLocked?"btn btn-teal":"btn btn-red"} onClick={toggleGoalLock} style={{fontSize:13,padding:"8px 16px"}}>
                  {admin.goalsLocked?"🔓 Unlock Goals":"🔒 Lock Goals"}
                </button>
                {admin.goalsLocked&&!admin.changeWindowOpen&&(
                  <button className="btn btn-yellow" onClick={openChangeWindow} style={{fontSize:13,padding:"8px 16px"}}>
                    🪟 Open {admin.changeWindowDays||3}-Day Window
                  </button>
                )}
                {admin.changeWindowOpen&&(
                  <button className="btn btn-red" onClick={async()=>{const upd={...admin,changeWindowOpen:false,changeWindowEnd:null};await fsSet(adminDocRef(me.groupId),JSON.stringify(upd));setAdmin(upd);setAdminDraft(upd);}} style={{fontSize:13,padding:"8px 16px"}}>
                    Close Window Early
                  </button>
                )}
              </div>
            </div>
          )}

          {!me.isAdmin&&admin.changeWindowOpen&&(
            <div className="card" style={{border:`2px solid ${LF.lime}55`,background:"#CCFF6611"}}>
              <div style={{fontSize:15,color:LF.lime,fontWeight:800,marginBottom:4}}>🔓 Goal Change Window is Open!</div>
              <div style={{fontSize:13,color:"#ffffffcc",fontWeight:700}}>You can adjust your goal until this window closes (~{changeHoursLeft}h left).</div>
            </div>
          )}
          {!me.isAdmin&&isLocked&&(
            <div className="card" style={{border:`2px solid ${LF.orange}44`}}>
              <div style={{fontSize:15,color:LF.orange,fontWeight:800,marginBottom:4}}>🔒 Goals Are Locked</div>
              <div style={{fontSize:13,color:"#ffffffcc",fontWeight:700}}>Raising your goal is always allowed!</div>
            </div>
          )}

          {sorted.length===0&&<div className="card" style={{textAlign:"center",padding:24}}><div style={{fontSize:32,marginBottom:8}}>🦄</div><div style={{fontSize:14,color:LF.pink,fontWeight:800}}>No crew yet! Share your invite link above.</div></div>}
          {sorted.map((w,i)=>{
            const p=Math.min(Math.round((w.progressThisWeek/w.goalValue)*100),100);
            const medals=["🥇","🥈","🥉"];
            const bar=p>=100?`linear-gradient(90deg,${LF.lime},${LF.teal})`:i===0?`linear-gradient(90deg,${LF.yellow},${LF.orange})`:`linear-gradient(90deg,${LF.pink},${LF.purple})`;
            return(
              <div key={w.name} className="card" style={{border:`2px solid ${w.isYou?LF.pink:LF.purple}44`,background:w.isYou?"#FF2D9B11":""}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{fontSize:18}}>{medals[i]||`${i+1}`}</div>
                  <div style={{fontSize:18}}>{w.avatar}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,color:w.isYou?LF.yellow:LF.white,fontWeight:800}}>{w.name}{w.isYou&&<span style={{fontSize:12,color:LF.hotpink}}> ← you!</span>}{w.isAdmin&&<span style={{fontSize:12,color:LF.yellow}}> ⭐</span>}</div>
                    <div style={{fontSize:12,color:"#ffffffcc",fontWeight:700}}>{w.goalType==="words"?`${(w.progressThisWeek||0).toLocaleString()}/${(w.goalValue||0).toLocaleString()}w`:`${w.progressThisWeek||0}/${w.goalValue||0}m`} · 💝 {(w.charityName||w.charity)||"—"}</div>
                  </div>
                  <div style={{fontSize:16,color:p>=100?LF.lime:LF.yellow,fontWeight:900}}>{p}%</div>
                </div>
                <div className="pbar-bg"><div className="pbar-fill" style={{width:`${p}%`,background:bar}}/></div>
              </div>
            );
          })}
        </>)}

        {/* ── CHAT ── */}
        {tab==="Chat"&&(<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:15,fontWeight:800,color:"#fff"}}>💬 Group Chat</div>
            <div style={{display:"flex",gap:6}}>
              <button className="btn" style={{fontSize:12,padding:"6px 10px",background:"#ffffff22",boxShadow:"none"}} onClick={()=>{loadChat(me.groupId);loadPolls(me.groupId);}}>↻ Refresh</button>
              <button className="btn" onClick={()=>setShowPollForm(s=>!s)} style={{fontSize:12,padding:"6px 12px"}}>📊 {showPollForm?"Cancel":"Poll"}</button>
            </div>
          </div>

          {showPollForm&&(
            <div className="card" style={{border:`2px solid ${LF.yellow}55`}}>
              <span className="lbl">📊 Create a Poll</span>
              <input className="inp" placeholder="Your question..." value={pollQ} onChange={e=>setPollQ(e.target.value)} style={{marginBottom:10}}/>
              {pollOpts.map((o,i)=>(
                <div key={i} style={{display:"flex",gap:6,marginBottom:8}}>
                  <input className="inp" placeholder={`Option ${i+1}`} value={o} onChange={e=>{const opts=[...pollOpts];opts[i]=e.target.value;setPollOpts(opts);}} style={{flex:1}}/>
                  {pollOpts.length>2&&<button onClick={()=>setPollOpts(pollOpts.filter((_,j)=>j!==i))} style={{background:"none",border:`2px solid ${LF.pink}55`,borderRadius:10,padding:"0 12px",cursor:"pointer",color:LF.pink,fontSize:16}}>✕</button>}
                </div>
              ))}
              {pollOpts.length<6&&<button onClick={()=>setPollOpts([...pollOpts,""])} style={{background:"none",border:"2px dashed #ffffff33",borderRadius:10,padding:8,width:"100%",cursor:"pointer",color:"#fff",fontSize:14,marginBottom:10}}>+ Add Option</button>}
              <span className="lbl" style={{marginTop:4}}>Voting Deadline (optional)</span>
              <input className="inp" type="datetime-local" value={pollDeadline} onChange={e=>setPollDeadline(e.target.value)} style={{marginBottom:12}}/>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-yellow" onClick={submitPoll} style={{flex:1,fontSize:14}}>Post Poll 📊</button>
                <button onClick={()=>setShowPollForm(false)} style={{flex:1,background:"#ffffff18",border:"2px solid #ffffff22",borderRadius:50,cursor:"pointer",fontSize:14,color:"#fff"}}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{background:"#ffffff11",border:"2px solid #ffffff22",borderRadius:20,padding:12,display:"flex",flexDirection:"column",gap:10,minHeight:240,maxHeight:480,overflowY:"auto"}}>
            {(()=>{
              const items=[...messages.map(m=>({...m,_type:"msg"})),...polls.map(p=>({...p,_type:"poll"}))].sort((a,b)=>a.ts-b.ts);
              if(items.length===0)return <div style={{textAlign:"center",padding:36,color:"#ffffffcc",fontSize:15}}>Say hi to your crew! 🌈</div>;
              return items.map(item=>{
                if(item._type==="msg"){
                  const msg=item; const isMe=msg.author===me.name;
                  return(
                    <div key={msg.id} className="msg-in" style={{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start",gap:3}}>
                      {!isMe&&<div style={{fontSize:12,color:"#ffffffcc",fontWeight:800,paddingLeft:4}}>{msg.avatar} {msg.author}</div>}
                      <div style={{maxWidth:"80%",background:isMe?`linear-gradient(135deg,${LF.pink}cc,${LF.purple}cc)`:"#ffffff18",border:`1px solid ${isMe?LF.pink:"#ffffff33"}`,borderRadius:isMe?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"9px 13px"}}>
                        <div style={{fontSize:14,fontWeight:700,color:"#fff",lineHeight:1.5}}>{msg.text}</div>
                        <div style={{fontSize:11,color:"#ffffffbb",marginTop:3}}>{fmtDate(msg.ts)}</div>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:3,paddingLeft:isMe?0:4,paddingRight:isMe?4:0,justifyContent:isMe?"flex-end":"flex-start",alignItems:"center"}}>
                        {REACTIONS.filter(r=>(msg.reactions[r]||[]).length>0).map(r=>{
                          const cnt=(msg.reactions[r]||[]).length;
                          const reacted=(msg.reactions[r]||[]).includes(me.name);
                          return <button key={r} onClick={()=>addReaction(msg.id,r)} style={{background:reacted?`${LF.pink}33`:"#ffffff18",border:`1px solid ${reacted?LF.pink:"#ffffff33"}`,borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:3}}>
                            {r}<span style={{fontSize:11,color:reacted?LF.pink:"#fff",fontWeight:800}}>{cnt}</span>
                          </button>;
                        })}
                        <div style={{position:"relative"}}>
                          <button onClick={()=>setOpenPicker(openPicker===msg.id?null:msg.id)} style={{background:"#ffffff18",border:"1px solid #ffffff33",borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:12,color:"#fff"}}>＋😊</button>
                          {openPicker===msg.id&&(
                            <div style={{position:"absolute",bottom:"110%",left:isMe?"auto":"0",right:isMe?"0":"auto",background:"#2D006E",border:"2px solid #ffffff33",borderRadius:16,padding:8,display:"flex",flexWrap:"wrap",gap:4,width:196,zIndex:50,boxShadow:"0 8px 32px #00000088"}}>
                              {REACTIONS.map(r=><button key={r} onClick={()=>{addReaction(msg.id,r);setOpenPicker(null);}} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",padding:"2px 4px",borderRadius:8}}>{r}</button>)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
                const poll=item;
                const total=poll.options.reduce((s,o)=>s+o.votes.length,0);
                const leading=poll.options.reduce((best,o)=>o.votes.length>best.votes.length?o:best,poll.options[0]);
                const resolved=poll.adminOverride||null;
                const myVoteIdx=poll.options.findIndex(o=>o.votes.includes(me.name));
                const deadlineDate=poll.deadline?new Date(poll.deadline):null;
                const expired=deadlineDate&&deadlineDate<new Date();
                const canVote=!resolved&&!expired;
                const hoursLeft=deadlineDate&&!expired?Math.ceil((deadlineDate-new Date())/3600000):null;
                return(
                  <div key={poll.id} className="msg-in" style={{background:"#2D006E99",border:`2px solid ${resolved?"#CCFF66":expired?"#ffffff33":LF.pink}55`,borderRadius:16,padding:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{fontSize:11,color:"#ffffffcc",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>📊 {poll.author} · poll</div>
                        <div style={{fontSize:15,fontWeight:900,color:"#fff"}}>{poll.question}</div>
                        {deadlineDate&&<div style={{fontSize:11,color:expired?"#ff8888":hoursLeft&&hoursLeft<24?LF.yellow:"#ffffffcc",fontWeight:700,marginTop:2}}>{expired?"⏰ Voting closed":`⏰ ${hoursLeft}h left`}</div>}
                        {resolved&&<div style={{fontSize:12,color:LF.lime,fontWeight:800,marginTop:2}}>✅ Result: {resolved}</div>}
                      </div>
                      {(me.isAdmin||poll.author===me.name)&&(
                        <button onClick={()=>deletePoll(poll.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:15,color:"#ffffffbb",padding:"0 4px"}}>🗑️</button>
                      )}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
                      {poll.options.map((o,i)=>{
                        const pct2=total>0?Math.round((o.votes.length/total)*100):0;
                        const voted=myVoteIdx===i;
                        const isLeading=o.votes.length>0&&o.votes.length===leading.votes.length;
                        return(
                          <div key={i}>
                            <button onClick={()=>canVote&&votePoll(poll.id,i)} style={{width:"100%",textAlign:"left",padding:"8px 12px",borderRadius:10,cursor:canVote?"pointer":"default",fontFamily:"'Outfit',sans-serif",fontSize:14,fontWeight:voted?900:700,border:`2px solid ${voted?LF.pink:isLeading&&canVote?LF.yellow:"#ffffff33"}`,background:voted?`${LF.pink}33`:isLeading&&canVote?"#FFC20011":"#ffffff11",color:voted?LF.pink:isLeading&&canVote?LF.yellow:"#fff",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <span>{voted?"✓ ":isLeading&&canVote?"🏆 ":""}{o.text}</span>
                              <span style={{fontSize:12,opacity:0.8,marginLeft:8,flexShrink:0}}>{pct2}%</span>
                            </button>
                            <div className="pbar-bg" style={{height:3,marginTop:2}}>
                              <div className="pbar-fill" style={{width:`${pct2}%`,background:voted?`linear-gradient(90deg,${LF.pink},${LF.purple})`:"#ffffff33"}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                      <div style={{fontSize:12,color:"#ffffffcc",fontWeight:700}}>{myVoteIdx>=0?"✓ You voted":canVote?"Tap an option to vote":"Voting closed"}</div>
                      {me.isAdmin&&!resolved&&(
                        <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:11,color:"#ffffffaa",fontWeight:700}}>override:</span>
                          {poll.options.map((o,i)=>(
                            <button key={i} onClick={()=>overridePollResult(poll.id,o.text)} style={{background:"#ffffff11",border:"1px solid #ffffff22",borderRadius:8,padding:"2px 8px",cursor:"pointer",fontSize:11,color:"#ffffffbb",fontWeight:700}}>{o.text}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
            <div ref={chatEndRef}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <input className="inp" placeholder="Say something... ✨" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} style={{flex:1}}/>
            <button className="btn" onClick={sendMessage} style={{padding:"11px 18px",flexShrink:0}}>💌</button>
          </div>
        </>)}

        {/* ── STATS ── */}
        {tab==="Stats"&&(<>
          <div style={{fontSize:15,color:LF.white,fontWeight:800}}>📊 Group Stats &amp; Ledger</div>
          <div className="card">
            <span className="lbl">🌍 Total Group Output — All Time</span>
            <div style={{display:"flex"}}>
              {totalGroupWords>0&&<div style={{flex:1,textAlign:"center",borderRight:totalGroupMinutes>0?`1px solid ${LF.purple}33`:"none"}}>
                <div style={{fontSize:24,color:LF.yellow,fontWeight:900}}>{totalGroupWords.toLocaleString()}</div>
                <div style={{fontSize:13,color:"#ffffffcc",fontWeight:800,marginTop:2}}>Total Words ✍️</div>
              </div>}
              {totalGroupMinutes>0&&<div style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:24,color:LF.yellow,fontWeight:900}}>{Math.round(totalGroupMinutes/60)}h {totalGroupMinutes%60}m</div>
                <div style={{fontSize:13,color:"#ffffffcc",fontWeight:800,marginTop:2}}>Total Time ⏱️</div>
              </div>}
              {totalGroupWords===0&&totalGroupMinutes===0&&<div style={{flex:1,textAlign:"center",padding:16,color:"#ffffffcc",fontSize:13}}>No progress logged yet 🌈</div>}
            </div>
          </div>

          <div className="card">
            <span className="lbl">💸 Money Ledger</span>
            <div style={{display:"flex",marginBottom:14}}>
              <div style={{flex:1,textAlign:"center",borderRight:`1px solid ${LF.purple}33`}}>
                <div style={{fontSize:20,color:LF.white,fontWeight:900}}>{fmtMoney(totalCharity)}</div>
                <div style={{fontSize:13,color:"#ffffffcc",fontWeight:800,marginTop:2}}>Donated 💝</div>
              </div>
              <div style={{flex:1,textAlign:"center",borderRight:`1px solid ${LF.purple}33`}}>
                <div style={{fontSize:20,color:LF.yellow,fontWeight:900}}>{fmtMoney(totalPayouts)}</div>
                <div style={{fontSize:13,color:"#ffffffcc",fontWeight:800,marginTop:2}}>To Winners 🏆</div>
              </div>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:20,color:LF.white,fontWeight:900}}>{totalPrizes}</div>
                <div style={{fontSize:13,color:"#ffffffcc",fontWeight:800,marginTop:2}}>Prizes 🎁</div>
              </div>
            </div>
            {totalCharity===0&&totalPayouts===0&&totalPrizes===0&&<div style={{textAlign:"center",padding:14,color:"#ffffffcc",fontSize:13}}>No payments recorded yet. Keep writing! 🦄</div>}
          </div>

          <div className="card">
            <span className="lbl">🏅 Individual All-Time Progress</span>
            {[...members].sort((a,b)=>(b.totalProgress||0)-(a.totalProgress||0)).map(w=>(
              <div key={w.name} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${LF.purple}22`}}>
                <div style={{fontSize:18}}>{w.avatar}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:w.isYou?LF.yellow:LF.white}}>{w.name}{w.isYou?" (you)":""}</div>
                  <div style={{fontSize:12,color:"#ffffffcc",fontWeight:700}}>💝 {(w.charityName||w.charity)||"—"}</div>
                </div>
                <div style={{fontSize:15,color:LF.white,fontWeight:800}}>{w.goalType==="words"?`${(w.totalProgress||0).toLocaleString()}w`:`${Math.round((w.totalProgress||0)/60)}h`}</div>
              </div>
            ))}
          </div>

          {(ledger.entries||[]).length>0&&(
            <div className="card">
              <span className="lbl">📋 Payment History</span>
              {[...(ledger.entries||[])].reverse().slice(0,20).map(e=>(
                <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${LF.purple}22`}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:800,color:e.type==="charity"?LF.lime:LF.yellow}}>{e.type==="charity"?`💝 ${e.name} → ${e.charity}`:`🏆 Payout to ${e.name}`}</div>
                    <div style={{fontSize:11,color:"#ffffffcc"}}>{fmtDate(e.ts)} · by {e.recordedBy}</div>
                  </div>
                  <div style={{fontSize:13,color:e.type==="charity"?LF.lime:LF.yellow,fontWeight:800}}>{fmtMoney(e.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </>)}

        {/* ── STAKES ── */}
        {tab==="Stakes"&&(<>
          <div className="card">
            <span className="lbl">Goal Type &amp; Target</span>
            {isLocked&&<div style={{fontSize:13,color:LF.orange,fontWeight:800,marginBottom:10}}>🔒 Goals locked — you can raise but not lower{admin.changeWindowOpen?` (~${changeHoursLeft}h window open)`:"."}.</div>}
            <div className="pill" style={{marginBottom:12}}>
              <button onClick={()=>setGoalTypeEdit("words")} style={{background:goalTypeEdit==="words"?`linear-gradient(135deg,${LF.pink},${LF.purple})`:"transparent",color:"#fff"}}>✍️ Words</button>
              <button onClick={()=>setGoalTypeEdit("time")}  style={{background:goalTypeEdit==="time"?`linear-gradient(135deg,${LF.teal},${LF.blue})`:"transparent",color:"#fff"}}>⏱️ Time</button>
            </div>
            <div style={{display:"flex",gap:10}}>
              <input className="inp" type="number" value={goalInput} onChange={e=>setGoalInput(e.target.value)} style={{flex:1}}/>
              <button className="btn" onClick={updateGoal} style={{padding:"11px 18px"}}>Set ✨</button>
            </div>
            <div style={{fontSize:13,color:LF.hotpink,marginTop:8,fontWeight:800}}>Current: {fmtGoal(me)}/week</div>
          </div>

          {admin.payoutMode==="charity"&&(
            <div className="card">
              <span className="lbl">Your Personal Charity 💝</span>
              <input className="inp" value={me.charity||""} onChange={e=>updateMyCharity(e.target.value)} placeholder="https://www.redcross.org" style={{marginBottom:8,borderColor:me.charity&&!isValidUrl(me.charity)?LF.pink:me.charity&&isValidUrl(me.charity)?LF.teal:undefined}}/>
              {me.charity&&!isValidUrl(me.charity)&&<div style={{fontSize:13,color:LF.pink,fontWeight:800,marginBottom:8}}>Please enter a valid URL</div>}
              {me.charity&&isValidUrl(me.charity)&&<div style={{fontSize:13,color:LF.lime,fontWeight:800,marginBottom:8}}>✓ {me.charityName||me.charity}</div>}
              <div style={{fontSize:12,color:"#fff",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Quick picks</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {CHARITY_SUGGESTIONS.map(c=>{
                  const sel=me.charity===c.url;
                  return <button key={c.url} onClick={()=>updateMyCharity(c.url)} style={{background:sel?"#FF2D9B22":"transparent",border:`2px solid ${sel?LF.pink:"#ffffff33"}`,borderRadius:10,padding:"8px 12px",cursor:"pointer",textAlign:"left"}}>
                    <div style={{fontSize:14,fontWeight:800,color:sel?LF.pink:LF.white}}>{sel?"✨ ":""}{c.name}</div>
                    <div style={{fontSize:12,color:"#ffffffcc"}}>{c.url}</div>
                  </button>;
                })}
              </div>
            </div>
          )}

          <div className="card" style={{background:"#ffffff0a",border:"2px solid #ffffff22",textAlign:"center"}}>
            <div style={{fontSize:14,color:LF.white,fontWeight:700,lineHeight:2}}>
              Miss <span style={{color:LF.yellow,fontWeight:900}}>{fmtGoal(me)}</span> for <span style={{color:LF.yellow,fontWeight:900}}>{admin.threshold} check-ins</span><br/>
              → <span style={{color:LF.pink,fontWeight:900}}>{fmtMoney(admin.stake)}</span>{" "}
              {admin.payoutMode==="winners"&&<span>split among 🏆 members who hit their goals</span>}
              {admin.payoutMode==="pain"&&<span style={{color:"#FF6666"}}>😈 you'll be publicly roasted</span>}
              {admin.payoutMode==="charity"&&<span>goes to 💝 {me.charityName||me.charity||"your charity"}</span>}
            </div>
          </div>

          <div style={{textAlign:"center",marginTop:4,display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
            <button onClick={()=>setShowPrivacy(true)} style={{background:"none",border:"none",color:"#ffffffbb",fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif",textDecoration:"underline"}}>Privacy Policy</button>
            <button onClick={handleReset} style={{background:"none",border:"none",color:"#ffffffaa",fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif",textDecoration:"underline"}}>Reset all data…</button>
          </div>
        </>)}

        {/* ── HISTORY ── */}
        {tab==="History"&&(<>
          <div style={{fontSize:14,color:LF.lime,fontWeight:800}}>📅 Your Writing History</div>
          {history.length===0&&<div className="card" style={{textAlign:"center",padding:24}}><div style={{fontSize:28,marginBottom:8}}>🌈</div><div style={{fontSize:14,color:LF.pink,fontWeight:800}}>History appears at end of each period.</div></div>}
          {history.map((h,i)=>(
            <div key={i} className="card" style={{border:`2px solid ${h.met?LF.lime:LF.pink}44`}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:24}}>{h.met?"🌟":"💔"}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:LF.white,fontWeight:800,marginBottom:2}}>{h.week}</div>
                  <div style={{fontSize:16,color:h.met?LF.lime:LF.pink,fontWeight:800}}>
                    {h.goalType==="words"?`${(h.progress||0).toLocaleString()} words`:`${h.progress||0} min`}
                    <span style={{fontSize:12,color:"#ffffffcc",fontWeight:700}}> / {h.goalType==="words"?`${(h.goal||0).toLocaleString()}w`:`${h.goal||0}m`}</span>
                  </div>
                </div>
                <div style={{fontSize:12,color:LF.white,background:h.met?`linear-gradient(135deg,${LF.lime},${LF.teal})`:`linear-gradient(135deg,${LF.pink},${LF.purple})`,padding:"4px 10px",borderRadius:20,fontWeight:800}}>{h.met?"NAILED IT":"missed"}</div>
              </div>
            </div>
          ))}
          {history.length>0&&(
            <div className="card">
              <div style={{display:"flex"}}>
                {[{l:"Periods",v:history.length,c:LF.lime},{l:"Nailed it",v:history.filter(h=>h.met).length,c:LF.lime},{l:"Missed",v:history.filter(h=>!h.met).length,c:LF.pink}].map((s,i)=>(
                  <div key={i} style={{flex:1,textAlign:"center",borderRight:i<2?`1px solid ${LF.purple}33`:"none"}}>
                    <div style={{fontSize:22,color:s.c,fontWeight:900}}>{s.v}</div>
                    <div style={{fontSize:12,color:LF.white,fontWeight:800,marginTop:2}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>)}

      </div>
    </div>
  );
}
