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
const memberUidDocRef    = (gid, uid) => doc(db, "groups", gid, "memberUids", uid);
const notifDocRef        = (uid)       => doc(db, "users",  uid, "data", "notifications");
const userIndexDocRef    = (uid)       => doc(db, "_index", "users", "members", uid);

async function fsGet(ref) {
  try { const s = await getDoc(ref); return s.exists() ? s.data().value : null; } catch { return null; }
}
async function fsSet(ref, value) {
  try { await setDoc(ref, { value }, { merge: false }); } catch (e) { console.warn("fsSet", e); }
}
async function fsDel(ref) { try { await deleteDoc(ref); } catch {} }
async function writeUserIndex(uid, d){
  // Full user snapshot used by cron-reminders to find users due for a reminder.
  // Must include notifPrefs (for reminderTime/writingReminder) and oneSignalPlayerId at top level.
  try{
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";
    await fsSet(userIndexDocRef(uid),JSON.stringify({
      ...d,
      uid,
      timezone: tz,
      updatedAt: Date.now(),
    }));
  }catch(e){console.warn("writeUserIndex",e);}
}

// ── Constants ────────────────────────────────────────────────────
const TABS        = ["Dashboard","Group","Chat","Stats","Stakes","History"];
const WEEK_DAYS   = ["M","T","W","T","F","S","S"];
const AVATARS     = ["🦄","🐬","🍉","🐞","🌈","⭐","🌷","🐧","✏️","🙂"];
const REACTIONS   = ["👍","👎","🦄","🌈","💖","⭐","🔥","🐬","✨","💫"];
const DURATIONS   = [{label:"1 Month",days:30},{label:"1 Quarter",days:90},{label:"6 Months",days:180},{label:"1 Year",days:365}];
const FREQUENCIES = ["Daily","Weekly","Bi-Weekly","Monthly"];
const APP_URL     = "https://wordcountability.vercel.app";

const ONESIGNAL_APP_ID     = import.meta.env.VITE_ONESIGNAL_APP_ID     || "";
const ONESIGNAL_SAFARI_ID  = import.meta.env.VITE_ONESIGNAL_SAFARI_WEB_ID || "";

const MOTIVATIONAL_MESSAGES = [
  "Yoda says: Become writer only by writing.",
  "Frankly my dear, sit down and write!",
  "You coulda been a published author, you coulda been a Booker Prize winner, instead of a bum who avoids the blank page.",
  "Dirty Harry says: Go ahead, write your story.",
  "Jerry Maguire says: Show me the finished draft.",
  "You can't handle the blank page!",
  "Houston, we have a future author.",
  "Cher wants you to snap out of your writer's block.",
  "A finished first draft, for lack of a better project, is better than an unfinished polished draft.",
  "Cookie Monster says: Me want story!!!!",
];

const DEFAULT_NOTIF_PREFS = {
  writingReminder:      true,
  reminderFrequency:    "Daily",
  reminderTime:         "09:00",
  checkInWarning:       true,
  missedCheckIn:        true,
  challengeStarting:    true,
  memberHitGoal:        true,
  newPoll:              true,
  pollClosingSoon:      true,
  newChatMessage:       true,
  chatFrequency:        "Every message",
  progressNotif:        true,
  progressNotifCombined: true,
  progressNotifFrequency: "Daily",
  progressNotifTime:    "09:00",
};

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
  .settings-panel{position:fixed;top:0;right:0;height:100%;width:min(380px,100%);background:#1A0044f5;border-left:1.5px solid #ffffff22;backdrop-filter:blur(16px);z-index:200;display:flex;flex-direction:column;overflow:hidden;transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);}
  .settings-panel-overlay{position:fixed;inset:0;background:#00000066;z-index:199;}
  .settings-section{padding:18px 20px 0;}
  .settings-section-title{font-size:11px;color:#ffffffbb;text-transform:uppercase;letter-spacing:2px;font-weight:900;margin-bottom:10px;}
  .notif-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #ffffff11;}
  .toggle{position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;}
  .toggle input{opacity:0;width:0;height:0;}
  .toggle-slider{position:absolute;inset:0;background:#ffffff33;border-radius:24px;cursor:pointer;transition:background 0.2s;}
  .toggle-slider:before{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform 0.2s;}
  .toggle input:checked+.toggle-slider{background:linear-gradient(135deg,#FF2D9B,#BF5FFF);}
  .toggle input:checked+.toggle-slider:before{transform:translateX(20px);}
  .notif-feed{position:fixed;top:0;right:0;height:100%;width:min(380px,100%);background:#1A0044f5;border-left:1.5px solid #ffffff22;backdrop-filter:blur(16px);z-index:200;display:flex;flex-direction:column;overflow:hidden;}
  @keyframes slideInRight{from{transform:translateX(100%);}to{transform:translateX(0);}}`;

// ── Helpers ──────────────────────────────────────────────────────
function getWeekKey(){const now=new Date();const day=now.getDay();const monday=new Date(now);monday.setDate(now.getDate()-(day===0?6:day-1));return monday.toISOString().slice(0,10);}
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
  const msg = `Join my writing accountability group on Wordcountability! 📝🌈\n${APP_URL}\nGroup ID: ${groupId}\n\n📲 Install the app to get writing reminders:\n⚠️ iPhone users: you MUST open the link in Safari (not Chrome) first, then tap Share ⬆️ → Add to Home Screen.\n🤖 Android users: open the link in Chrome, tap the menu ⋮ → Add to Home Screen.`;
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
  {name:"Red Cross",                url:"https://www.redcross.org"},
  {name:"World Central Kitchen",    url:"https://www.wck.org"},
  {name:"Planned Parenthood",       url:"https://www.plannedparenthood.org"},
  {name:"NAACP Legal Defense Fund", url:"https://www.naacpldf.org"},
  {name:"Doctors Without Borders",  url:"https://www.msf.org"},
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
            <div style={{background:"#FF2D9B22",border:"1.5px solid #FF2D9B55",borderRadius:10,padding:"8px 12px",marginBottom:10,fontSize:13,color:LF.hotpink,fontWeight:800,lineHeight:1.6}}>
              ⚠️ You must use <span style={{color:LF.yellow}}>Safari</span> — this won't work in Chrome or other browsers on iPhone.
            </div>
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
              On <span style={{color:"#FFC200"}}>iPhone</span>: open in <span style={{color:"#FFC200"}}>Safari</span> ⬆️ Share → Add to Home Screen<br/>
              On <span style={{color:"#FFC200"}}>Android</span>: Chrome menu ⋮ → Add to Home Screen
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
            <div style={{fontWeight:900,color:LF.hotpink,marginBottom:6}}>Push Notifications</div>
            If you enable push notifications, a push subscription token is stored in your account and shared with OneSignal, Inc. to enable delivery of notifications to your device. OneSignal does not receive your email address or writing data. OneSignal's privacy policy is available at{" "}
            <a href="https://onesignal.com/privacy" target="_blank" rel="noreferrer" style={{color:LF.lime}}>onesignal.com/privacy</a>.
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

// ── OneSignal helpers ─────────────────────────────────────────────
function initOneSignal(){
  if(!ONESIGNAL_APP_ID||typeof window==="undefined")return;
  if(window.__oneSignalInitialized)return;
  window.__oneSignalInitialized=true;
  const script=document.createElement("script");
  script.src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  script.defer=true;
  script.onload=()=>{
    window.OneSignalDeferred=window.OneSignalDeferred||[];
    window.OneSignalDeferred.push(async(OneSignal)=>{
      await OneSignal.init({
        appId:ONESIGNAL_APP_ID,
        safari_web_id:ONESIGNAL_SAFARI_ID,
        notifyButton:{enable:false},
        allowLocalhostAsSecureOrigin:true,
      });
    });
  };
  document.head.appendChild(script);
}

async function requestNotifPermission(){
  if(typeof window==="undefined"||!window.OneSignalDeferred)return null;
  return new Promise(resolve=>{
    window.OneSignalDeferred.push(async(OneSignal)=>{
      try{
        const state=await OneSignal.Notifications.permissionNative;
        if(state==="denied"){resolve("denied");return;}
        await OneSignal.Notifications.requestPermission();
        const id=await OneSignal.User.PushSubscription.id;
        resolve(id||null);
      }catch{resolve(null);}
    });
  });
}

async function getOneSignalPlayerId(){
  if(typeof window==="undefined"||!window.OneSignalDeferred)return null;
  return new Promise(resolve=>{
    window.OneSignalDeferred.push(async(OneSignal)=>{
      try{const id=await OneSignal.User.PushSubscription.id;resolve(id||null);}
      catch{resolve(null);}
    });
  });
}

async function getNotifPermissionState(){
  if(typeof window==="undefined"||!window.OneSignalDeferred)return "default";
  return new Promise(resolve=>{
    window.OneSignalDeferred.push(async(OneSignal)=>{
      try{const s=await OneSignal.Notifications.permissionNative;resolve(s||"default");}
      catch{resolve("default");}
    });
  });
}

// Called from App whenever a notif-worthy event occurs
async function sendNotifToSelf(uid, db, type, title, body){
  // Store in-app notification
  try{
    const ref=notifDocRef(uid);
    const val=await fsGet(ref);
    const existing=val?JSON.parse(val):[];
    const notif={id:Date.now(),type,title,body,ts:Date.now(),read:false};
    const updated=[notif,...existing].slice(0,50);
    await fsSet(ref,JSON.stringify(updated));
  }catch(e){console.warn("notif store",e);}
  // Push via Vercel function (scaffold — will be active once /api/notify exists)
  try{
    const playerId=await getOneSignalPlayerId();
    if(!playerId)return;
    await fetch("/api/notify",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({playerId,title,body,type}),
    });
  }catch{/* function doesn't exist yet — silent fail */}
}

// ── SettingsPanel ─────────────────────────────────────────────────
function SettingsPanel({me, uid, db, onClose, onAvatarChange, onSignOut, onOpenAdmin, onOpenPrivacy, onUpdateMe}){
  const [section,setSection]=useState("profile"); // profile | notifications | accolades | about
  const [notifPerms,setNotifPerms]=useState("default"); // default | granted | denied
  const [notifPrefs,setNotifPrefs]=useState(me.notifPrefs||DEFAULT_NOTIF_PREFS);
  const [selectedAvatar,setSelectedAvatar]=useState(me.avatar);
  const [savingAvatar,setSavingAvatar]=useState(false);
  const [enableStatus,setEnableStatus]=useState(null); // null | "enabling" | "success" | "denied"
  const [syncStatus,setSyncStatus]=useState(null); // null | "syncing" | "success" | "failed"
  const [hasPlayerId,setHasPlayerId]=useState(!!me.oneSignalPlayerId);
  // drafts initialized lazily from notifPrefs so they stay in sync after saves
  const initPrefs=me.notifPrefs||DEFAULT_NOTIF_PREFS;
  const [reminderTimeDraft,setReminderTimeDraft]=useState(initPrefs.reminderTime||"09:00");
  const [reminderFreqDraft,setReminderFreqDraft]=useState(initPrefs.reminderFrequency||"Daily");
  const [savingReminder,setSavingReminder]=useState(false);
  const [reminderSaved,setReminderSaved]=useState(!!(initPrefs.reminderTime&&initPrefs.writingReminder));
  const [resettingReminder,setResettingReminder]=useState(false);
  const [progressTimeDraft,setProgressTimeDraft]=useState(initPrefs.progressNotifTime||"09:00");
  const [progressFreqDraft,setProgressFreqDraft]=useState(initPrefs.progressNotifFrequency||"Daily");
  const [savingProgress,setSavingProgress]=useState(false);
  const [progressSaved,setProgressSaved]=useState(!!(initPrefs.progressNotifTime&&initPrefs.progressNotif&&initPrefs.progressNotifCombined===false));
  const [resettingProgress,setResettingProgress]=useState(false);

  useEffect(()=>{
    initOneSignal();
    getNotifPermissionState().then(async(s)=>{
      setNotifPerms(s);
      // If permission already granted but player ID missing, silently retry saving it
      if(s==="granted"&&!me.oneSignalPlayerId){
        const id=await getOneSignalPlayerId();
        if(id){
          await onUpdateMe({oneSignalPlayerId:id});
          setHasPlayerId(true);
        }
      }
    });
  },[]);

  async function handleAvatarSave(){
    if(selectedAvatar===me.avatar)return;
    setSavingAvatar(true);
    await onAvatarChange(selectedAvatar);
    setSavingAvatar(false);
  }

  // Explicit enable button — clean single user gesture, no async before requestPermission
  async function handleEnableNotifs(){
    setEnableStatus("enabling");
    const result=await requestNotifPermission();
    if(result==="denied"){
      setEnableStatus("denied");
      setNotifPerms("denied");
      return;
    }
    if(result){
      setEnableStatus("success");
      setNotifPerms("granted");
      await onUpdateMe({notifPrefs,oneSignalPlayerId:result});
      setHasPlayerId(true);
      return;
    }
    // Permission prompt dismissed without granting
    setEnableStatus(null);
  }

  // Manual sync — re-fetches player ID from OneSignal and saves to Firestore
  async function handleSyncPlayerId(){
    setSyncStatus("syncing");
    // Give OneSignal a moment to fully initialize before asking for the ID
    await new Promise(r=>setTimeout(r,1500));
    const id=await getOneSignalPlayerId();
    if(id){
      await onUpdateMe({oneSignalPlayerId:id});
      setHasPlayerId(true);
      setSyncStatus("success");
    }else{
      setSyncStatus("failed");
    }
  }

  // Toggles only save prefs — no permission request
  async function handleNotifToggle(key,value){
    const updated={...notifPrefs,[key]:value};
    setNotifPrefs(updated);
    await onUpdateMe({notifPrefs:updated});
  }

  // Save reminder time + frequency explicitly
  async function handleReminderSave(){
    setSavingReminder(true);
    const updated={...notifPrefs,reminderTime:reminderTimeDraft,reminderFrequency:reminderFreqDraft};
    setNotifPrefs(updated);
    await onUpdateMe({notifPrefs:updated});
    setSavingReminder(false);
    setReminderSaved(true);
    setReminderTimeDraft(reminderTimeDraft);
    setReminderFreqDraft(reminderFreqDraft);
  }

  // Reset reminder — clears reminderTime and turns off writingReminder in Firestore
  async function handleReminderReset(){
    setResettingReminder(true);
    const updated={...notifPrefs,writingReminder:false,reminderTime:null};
    setNotifPrefs(updated);
    await onUpdateMe({notifPrefs:updated});
    setReminderSaved(false);
    setReminderTimeDraft("09:00");
    setResettingReminder(false);
  }

  async function handleProgressSave(){
    setSavingProgress(true);
    const updated={...notifPrefs,progressNotifTime:progressTimeDraft,progressNotifFrequency:progressFreqDraft};
    setNotifPrefs(updated);
    await onUpdateMe({notifPrefs:updated});
    setSavingProgress(false);
    setProgressSaved(true);
  }

  async function handleProgressReset(){
    setResettingProgress(true);
    const updated={...notifPrefs,progressNotif:false,progressNotifTime:null};
    setNotifPrefs(updated);
    await onUpdateMe({notifPrefs:updated});
    setProgressSaved(false);
    setProgressTimeDraft("09:00");
    setResettingProgress(false);
  }

  async function handlePrefChange(key,value){
    const updated={...notifPrefs,[key]:value};
    setNotifPrefs(updated);
    await onUpdateMe({notifPrefs:updated});
  }

  const firstName=me.name?.split(" ")[0]||me.name||"?";

  const NOTIF_ROWS=[
    {key:"writingReminder",   label:"Writing Reminder",        icon:"✍️"},
    {key:"checkInWarning",    label:"Check-in deadline (24h)", icon:"⏰"},
    {key:"missedCheckIn",     label:"Missed check-in",         icon:"💔"},
    {key:"challengeStarting", label:"Challenge starting (24h)",icon:"🚀"},
    {key:"memberHitGoal",     label:"Member hit their goal",   icon:"🌟"},
    {key:"newPoll",           label:"New poll posted",         icon:"📊"},
    {key:"pollClosingSoon",   label:"Poll closing soon",       icon:"⏳"},
    {key:"newChatMessage",    label:"New chat message",        icon:"💬"},
  ];

  return(
    <>
      <div className="settings-panel-overlay" onClick={onClose}/>
      <div className="settings-panel" style={{animation:"slideInRight 0.3s cubic-bezier(0.4,0,0.2,1)"}}>
        {/* Header */}
        <div style={{padding:"20px 20px 14px",borderBottom:"1px solid #ffffff18",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{fontSize:18,fontWeight:900,color:LF.white}}>Settings</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#ffffffcc",fontSize:22,cursor:"pointer",lineHeight:1,padding:4}}>✕</button>
        </div>

        {/* Section tabs */}
        <div style={{display:"flex",borderBottom:"1px solid #ffffff18",flexShrink:0,overflowX:"auto"}}>
          {[{id:"profile",icon:"👤"},{id:"notifications",icon:"🔔"},{id:"accolades",icon:"🏆"},{id:"about",icon:"ℹ️"}].map(s=>(
            <button key={s.id} onClick={()=>setSection(s.id)} style={{flex:1,background:"none",border:"none",borderBottom:`3px solid ${section===s.id?LF.pink:"transparent"}`,color:section===s.id?LF.pink:"#ffffffaa",fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:900,textTransform:"uppercase",letterSpacing:1,padding:"10px 4px",cursor:"pointer",whiteSpace:"nowrap",transition:"color 0.2s"}}>
              {s.icon}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{flex:1,overflowY:"auto",paddingBottom:24}}>

          {/* ── PROFILE ── */}
          {section==="profile"&&(
            <div className="settings-section">
              <div style={{textAlign:"center",padding:"20px 0 16px"}}>
                <div style={{fontSize:56,marginBottom:8}}>{selectedAvatar}</div>
                <div style={{fontSize:18,fontWeight:900,color:LF.white}}>{me.name}</div>
                <div style={{fontSize:13,color:"#ffffffbb",fontWeight:700,marginTop:2}}>#{me.groupId}</div>
              </div>
              <div style={{marginBottom:16}}>
                <div className="settings-section-title">Change Avatar</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
                  {AVATARS.map(a=>(
                    <button key={a} onClick={()=>setSelectedAvatar(a)} style={{width:52,height:52,fontSize:26,border:`2px solid ${selectedAvatar===a?LF.pink:"#ffffff33"}`,borderRadius:14,cursor:"pointer",background:selectedAvatar===a?"#FF2D9B22":"#ffffff18",transition:"all 0.2s",transform:selectedAvatar===a?"scale(1.1)":"scale(1)",boxShadow:selectedAvatar===a?"0 0 14px #FF2D9B66":"none"}}>{a}</button>
                  ))}
                </div>
                {selectedAvatar!==me.avatar&&(
                  <button className="btn" onClick={handleAvatarSave} disabled={savingAvatar} style={{width:"100%",marginTop:12,fontSize:15}}>
                    {savingAvatar?"Saving…":"Save Avatar ✨"}
                  </button>
                )}
              </div>
              <div style={{borderTop:"1px solid #ffffff18",paddingTop:16,display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={onOpenPrivacy} style={{background:"#ffffff11",border:"1px solid #ffffff22",borderRadius:14,padding:"12px 16px",cursor:"pointer",textAlign:"left",fontFamily:"'Outfit',sans-serif",color:"#fff",fontSize:14,fontWeight:700}}>
                  🔒 Privacy Policy
                </button>
                {me.isAdmin&&(
                  <button onClick={()=>{onOpenAdmin();onClose();}} style={{background:`linear-gradient(135deg,${LF.yellow}33,${LF.orange}33)`,border:`1px solid ${LF.yellow}44`,borderRadius:14,padding:"12px 16px",cursor:"pointer",textAlign:"left",fontFamily:"'Outfit',sans-serif",color:LF.yellow,fontSize:14,fontWeight:800}}>
                    ⚙️ Admin Settings
                  </button>
                )}
                <button onClick={onSignOut} style={{background:"#FF444411",border:"1px solid #FF444433",borderRadius:14,padding:"12px 16px",cursor:"pointer",textAlign:"left",fontFamily:"'Outfit',sans-serif",color:"#FF8888",fontSize:14,fontWeight:700}}>
                  ↩ Sign Out
                </button>
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {section==="notifications"&&(
            <div className="settings-section">
              <div style={{marginBottom:16,marginTop:12}}>

                {/* Status banner */}
                {notifPerms==="denied"?(
                  <div style={{background:"#FF444411",border:"2px solid #FF444433",borderRadius:14,padding:"12px 14px",marginBottom:16}}>
                    <div style={{fontSize:14,fontWeight:800,color:"#FF8888",marginBottom:4}}>🚫 Notifications blocked</div>
                    <div style={{fontSize:13,color:"#ffffffcc",fontWeight:700,lineHeight:1.6}}>
                      You've blocked notifications for this site. To re-enable, go to your browser or device Settings → Notifications → Wordcountability and allow notifications.
                    </div>
                  </div>
                ):notifPerms==="granted"?(
                  <div style={{background:"#CCFF6611",border:"1px solid #CCFF6633",borderRadius:14,padding:"10px 14px",marginBottom:16}}>
                    {hasPlayerId?(
                      <div style={{fontSize:13,color:LF.lime,fontWeight:700}}>✅ Push notifications are enabled</div>
                    ):(
                      <>
                        <div style={{fontSize:13,color:LF.yellow,fontWeight:700,marginBottom:10}}>⚠️ Notifications are allowed but not fully connected. Tap below to finish setup.</div>
                        {syncStatus==="success"&&<div style={{fontSize:13,color:LF.lime,fontWeight:700,marginBottom:8}}>✅ Connected! You're all set.</div>}
                        {syncStatus==="failed"&&<div style={{fontSize:13,color:"#FF8888",fontWeight:700,marginBottom:8}}>Couldn't connect — try closing and reopening the app, then tap again.</div>}
                        <button
                          className="btn"
                          onClick={handleSyncPlayerId}
                          disabled={syncStatus==="syncing"||syncStatus==="success"}
                          style={{fontSize:14,padding:"10px 20px",width:"100%"}}
                        >
                          {syncStatus==="syncing"?"Connecting…":syncStatus==="success"?"✅ Connected!":"🔗 Finish Notification Setup"}
                        </button>
                      </>
                    )}
                  </div>
                ):(
                  <>
                    <div style={{background:"#ffffff0a",border:"1px solid #ffffff22",borderRadius:14,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#ffffffcc",fontWeight:700}}>
                      🔔 Enable push notifications to get writing reminders and group updates on your device.
                    </div>
                    {enableStatus==="success"&&(
                      <div style={{background:"#CCFF6611",border:"1px solid #CCFF6633",borderRadius:14,padding:"10px 14px",marginBottom:12,fontSize:13,color:LF.lime,fontWeight:700}}>
                        ✅ Notifications enabled! You're all set.
                      </div>
                    )}
                    {enableStatus==="denied"&&(
                      <div style={{background:"#FF444411",border:"1px solid #FF444433",borderRadius:14,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#FF8888",fontWeight:700}}>
                        🚫 Permission denied. Go to your browser settings to allow notifications for this site.
                      </div>
                    )}
                    <button
                      className="btn"
                      onClick={handleEnableNotifs}
                      disabled={enableStatus==="enabling"}
                      style={{width:"100%",fontSize:15,marginBottom:16}}
                    >
                      {enableStatus==="enabling"?"Requesting permission…":"🔔 Enable Push Notifications"}
                    </button>
                  </>
                )}

                {NOTIF_ROWS.map(({key,label,icon})=>(
                  <div key={key}>
                    <div className="notif-row">
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:18}}>{icon}</span>
                        <span style={{fontSize:14,color:LF.white,fontWeight:700}}>{label}</span>
                      </div>
                      <label className="toggle">
                        <input type="checkbox" checked={!!notifPrefs[key]} onChange={e=>handleNotifToggle(key,e.target.checked)}/>
                        <span className="toggle-slider"/>
                      </label>
                    </div>

                    {/* Nudge if toggles on but permission not yet granted */}
                    {notifPrefs[key]&&notifPerms==="default"&&(
                      <div style={{fontSize:12,color:LF.hotpink,fontWeight:700,padding:"4px 0 6px 28px"}}>
                        ↑ Tap "Enable Push Notifications" above to activate this.
                      </div>
                    )}

                    {/* Writing reminder sub-options */}
                    {key==="writingReminder"&&notifPrefs.writingReminder&&(
                      <div style={{background:"#ffffff08",borderRadius:12,padding:"10px 12px",margin:"6px 0 4px",display:"flex",flexDirection:"column",gap:8}}>
                        {reminderSaved?(
                          <>
                            <div style={{fontSize:13,color:LF.lime,fontWeight:800}}>
                              ✅ Reminder set for {(()=>{const t=notifPrefs.reminderTime||"09:00";const[h,m]=t.split(":");const hr=parseInt(h);return`${hr===0?12:hr>12?hr-12:hr}:${m} ${hr<12?"AM":"PM"}`;})()}  · {notifPrefs.reminderFrequency||"Daily"}
                            </div>
                            <button
                              className="btn btn-red"
                              onClick={handleReminderReset}
                              disabled={resettingReminder}
                              style={{fontSize:13,padding:"8px 16px",alignSelf:"flex-start"}}
                            >
                              {resettingReminder?"Resetting…":"Reset Reminder"}
                            </button>
                          </>
                        ):(
                          <>
                            <div>
                              <div style={{fontSize:12,color:"#ffffffbb",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Frequency</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                {["Daily","Weekly","Monthly"].map(f=>(
                                  <button key={f} onClick={()=>setReminderFreqDraft(f)} style={{padding:"5px 12px",border:`2px solid ${reminderFreqDraft===f?LF.pink:"#ffffff33"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,background:reminderFreqDraft===f?`linear-gradient(135deg,${LF.pink},${LF.purple})`:"#ffffff18",color:"#fff",fontWeight:700}}>{f}</button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div style={{fontSize:12,color:"#ffffffbb",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Time</div>
                              <select value={reminderTimeDraft} onChange={e=>setReminderTimeDraft(e.target.value)} className="inp" style={{maxWidth:160,padding:"8px 12px",fontSize:14}}>
                                {Array.from({length:24},(_,i)=>{const h=i%12===0?12:i%12;const ampm=i<12?"AM":"PM";const val=`${String(i).padStart(2,"0")}:00`;return(<option key={i} value={val}>{h}:00 {ampm}</option>);})}
                              </select>
                            </div>
                            <button
                              className="btn"
                              onClick={handleReminderSave}
                              disabled={savingReminder}
                              style={{fontSize:14,padding:"10px 20px",alignSelf:"flex-start"}}
                            >
                              {savingReminder?"Saving…":"Save Reminder ✨"}
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Progress Check-in — shown inline after writing reminder row */}
                    {key==="writingReminder"&&(
                      <div style={{marginTop:4}}>
                        <div className="notif-row">
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:18}}>📊</span>
                            <span style={{fontSize:14,color:LF.white,fontWeight:700}}>Progress Check-in</span>
                          </div>
                          <label className="toggle">
                            <input type="checkbox" checked={!!notifPrefs.progressNotif} onChange={e=>handlePrefChange("progressNotif",e.target.checked)}/>
                            <span className="toggle-slider"/>
                          </label>
                        </div>
                        {notifPrefs.progressNotif&&notifPerms==="default"&&(
                          <div style={{fontSize:12,color:LF.hotpink,fontWeight:700,padding:"4px 0 6px 28px"}}>
                            ↑ Tap "Enable Push Notifications" above to activate this.
                          </div>
                        )}
                        {notifPrefs.progressNotif&&(
                          <div style={{background:"#ffffff08",borderRadius:12,padding:"10px 12px",margin:"6px 0 4px",display:"flex",flexDirection:"column",gap:8}}>
                            <div style={{fontSize:13,color:"#ffffffcc",fontWeight:700,lineHeight:1.5}}>
                              A personalised update on where you stand — on track, behind, or crushing it 🎉
                            </div>
                            <div className="notif-row" style={{padding:0}}>
                              <span style={{fontSize:13,color:LF.white,fontWeight:700}}>Combine with writing reminder</span>
                              <label className="toggle">
                                <input type="checkbox" checked={notifPrefs.progressNotifCombined!==false} onChange={e=>{handlePrefChange("progressNotifCombined",e.target.checked);setProgressSaved(false);}}/>
                                <span className="toggle-slider"/>
                              </label>
                            </div>
                            {notifPrefs.progressNotifCombined!==false?(
                              <div style={{fontSize:12,color:"#ffffffaa",fontWeight:700}}>
                                ✅ Will arrive with your writing reminder ({notifPrefs.reminderFrequency||"Daily"} at {(()=>{const t=notifPrefs.reminderTime||"09:00";const[h,m]=t.split(":");const hr=parseInt(h);return`${hr===0?12:hr>12?hr-12:hr}:${m} ${hr<12?"AM":"PM"}`;})()})
                              </div>
                            ):(
                              progressSaved?(
                                <>
                                  <div style={{fontSize:13,color:LF.lime,fontWeight:800}}>
                                    ✅ Progress check-in set for {(()=>{const t=notifPrefs.progressNotifTime||"09:00";const[h,m]=t.split(":");const hr=parseInt(h);return`${hr===0?12:hr>12?hr-12:hr}:${m} ${hr<12?"AM":"PM"}`;})()}  · {notifPrefs.progressNotifFrequency||"Daily"}
                                  </div>
                                  <button
                                    className="btn btn-red"
                                    onClick={handleProgressReset}
                                    disabled={resettingProgress}
                                    style={{fontSize:13,padding:"8px 16px",alignSelf:"flex-start"}}
                                  >
                                    {resettingProgress?"Resetting…":"Reset Progress Check-in"}
                                  </button>
                                </>
                              ):(
                                <>
                                  <div>
                                    <div style={{fontSize:12,color:"#ffffffbb",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Frequency</div>
                                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                      {["Daily","Weekly"].map(f=>(
                                        <button key={f} onClick={()=>setProgressFreqDraft(f)} style={{padding:"5px 12px",border:`2px solid ${progressFreqDraft===f?LF.pink:"#ffffff33"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,background:progressFreqDraft===f?`linear-gradient(135deg,${LF.pink},${LF.purple})`:"#ffffff18",color:"#fff",fontWeight:700}}>{f}</button>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{fontSize:12,color:"#ffffffbb",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Time</div>
                                    <select value={progressTimeDraft} onChange={e=>setProgressTimeDraft(e.target.value)} className="inp" style={{maxWidth:160,padding:"8px 12px",fontSize:14}}>
                                      {Array.from({length:24},(_,i)=>{const h=i%12===0?12:i%12;const ampm=i<12?"AM":"PM";const val=`${String(i).padStart(2,"0")}:00`;return(<option key={i} value={val}>{h}:00 {ampm}</option>);})}
                                    </select>
                                  </div>
                                  <button
                                    className="btn"
                                    onClick={handleProgressSave}
                                    disabled={savingProgress}
                                    style={{fontSize:14,padding:"10px 20px",alignSelf:"flex-start"}}
                                  >
                                    {savingProgress?"Saving…":"Save Progress Check-in ✨"}
                                  </button>
                                </>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Chat frequency sub-option */}
                    {key==="newChatMessage"&&notifPrefs.newChatMessage&&(
                      <div style={{background:"#ffffff08",borderRadius:12,padding:"10px 12px",margin:"6px 0 4px"}}>
                        <div style={{fontSize:12,color:"#ffffffbb",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Frequency</div>
                        <div style={{display:"flex",gap:6}}>
                          {["Every message","Digest"].map(f=>(
                            <button key={f} onClick={()=>handlePrefChange("chatFrequency",f)} style={{padding:"5px 12px",border:`2px solid ${notifPrefs.chatFrequency===f?LF.teal:"#ffffff33"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,background:notifPrefs.chatFrequency===f?`linear-gradient(135deg,${LF.teal},${LF.blue})`:"#ffffff18",color:"#fff",fontWeight:700}}>{f}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

              </div>
            </div>
          )}

          {/* ── ACCOLADES ── */}
          {section==="accolades"&&(
            <div className="settings-section" style={{paddingTop:20}}>
              <div className="card" style={{textAlign:"center",padding:"32px 20px",border:`2px solid ${LF.yellow}33`}}>
                <div style={{fontSize:48,marginBottom:12}}>🏆</div>
                <div style={{fontSize:18,fontWeight:900,color:LF.yellow,marginBottom:8}}>Accolades</div>
                <div style={{fontSize:14,color:"#ffffffcc",fontWeight:700,lineHeight:1.6}}>
                  Earn badges as you write, hit goals, and show up for your crew. Coming soon!
                </div>
              </div>
            </div>
          )}

          {/* ── ABOUT ── */}
          {section==="about"&&(
            <div className="settings-section" style={{paddingTop:20,display:"flex",flexDirection:"column",gap:12}}>
              <div className="card" style={{border:`2px solid ${LF.purple}44`}}>
                <div style={{fontSize:15,fontWeight:900,color:LF.hotpink,marginBottom:8}}>About Wordcountability</div>
                <div style={{fontSize:14,color:"#ffffffcc",fontWeight:700,lineHeight:1.7,fontStyle:"italic"}}>Content coming soon ✍️</div>
              </div>
              <div className="card" style={{border:`2px solid ${LF.purple}44`}}>
                <div style={{fontSize:15,fontWeight:900,color:LF.hotpink,marginBottom:8}}>About the Developer</div>
                <div style={{fontSize:14,color:"#ffffffcc",fontWeight:700,lineHeight:1.7,fontStyle:"italic"}}>Content coming soon 🌈</div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

// ── NotifFeed ─────────────────────────────────────────────────────
function NotifFeed({notifications, onClose, onMarkAllRead}){
  const unread=notifications.filter(n=>!n.read).length;
  return(
    <>
      <div className="settings-panel-overlay" onClick={onClose}/>
      <div className="notif-feed" style={{animation:"slideInRight 0.3s cubic-bezier(0.4,0,0.2,1)"}}>
        <div style={{padding:"20px 20px 14px",borderBottom:"1px solid #ffffff18",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{fontSize:18,fontWeight:900,color:LF.white}}>Notifications{unread>0&&<span style={{background:`linear-gradient(135deg,${LF.pink},${LF.purple})`,color:"#fff",fontSize:12,fontWeight:800,padding:"2px 8px",borderRadius:20,marginLeft:8}}>{unread}</span>}</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {unread>0&&<button onClick={onMarkAllRead} style={{background:"none",border:"none",color:LF.hotpink,fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:800,textDecoration:"underline"}}>Mark all read</button>}
            <button onClick={onClose} style={{background:"none",border:"none",color:"#ffffffcc",fontSize:22,cursor:"pointer",lineHeight:1,padding:4}}>✕</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
          {notifications.length===0?(
            <div style={{textAlign:"center",padding:"48px 24px",color:"#ffffffcc",fontSize:14,fontWeight:700}}>
              <div style={{fontSize:40,marginBottom:12}}>🔔</div>
              No notifications yet
            </div>
          ):(
            notifications.map(n=>(
              <div key={n.id} style={{padding:"12px 20px",borderBottom:"1px solid #ffffff0a",background:n.read?"transparent":"#FF2D9B08",display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{fontSize:20,flexShrink:0,marginTop:2}}>
                  {n.type==="writingReminder"?"✍️":n.type==="checkInWarning"?"⏰":n.type==="missedCheckIn"?"💔":n.type==="challengeStarting"?"🚀":n.type==="memberHitGoal"?"🌟":n.type==="newPoll"?"📊":n.type==="pollClosingSoon"?"⏳":"💬"}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:n.read?700:900,color:n.read?"#ffffffcc":LF.white,marginBottom:2}}>{n.title}</div>
                  <div style={{fontSize:13,color:"#ffffffaa",fontWeight:700,lineHeight:1.5}}>{n.body}</div>
                  <div style={{fontSize:11,color:"#ffffff66",fontWeight:700,marginTop:4}}>{fmtDate(n.ts)}</div>
                </div>
                {!n.read&&<div style={{width:8,height:8,borderRadius:"50%",background:LF.pink,flexShrink:0,marginTop:6}}/>}
              </div>
            ))
          )}
        </div>
      </div>
    </>
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
  const sparkPositions=useRef([]);
  function triggerSpark(){
    sparkPositions.current=Array.from({length:6},()=>({left:15+Math.random()*70,top:10+Math.random()*80}));
    setSpark(s=>s+1);
    setTimeout(()=>setSpark(0),600);
  }
  const [saving,setSaving]=useState(false);
  const [showPrivacy,setShowPrivacy]=useState(false);
  const [shareCopied,setShareCopied]=useState(false);
  const [showPwaPrompt,setShowPwaPrompt]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [showNotifFeed,setShowNotifFeed]=useState(false);
  const [inAppNotifs,setInAppNotifs]=useState([]);
  // timer
  const [timerRunning,setTimerRunning]=useState(false);
  const [timerSecs,setTimerSecs]=useState(0);
  const [timerSessions,setTimerSessions]=useState([]);
  const timerRef=useRef(null);
  // past-day logging
  const [showPastDayModal,setShowPastDayModal]=useState(false);
  const [pastDaySelected,setPastDaySelected]=useState(null);
  const [pastDayInput,setPastDayInput]=useState("");
  const [pastDaySaving,setPastDaySaving]=useState(false);
  // countdown tick
  const [tick,setTick]=useState(0);
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
  // charity picker modal
  const [showCharityModal,setShowCharityModal]=useState(false);
  const [charityCustomUrl,setCharityCustomUrl]=useState("");
  const [charityFetchedName,setCharityFetchedName]=useState(null);
  const [charityFetchLoading,setCharityFetchLoading]=useState(false);
  const [charityEditName,setCharityEditName]=useState("");
  const [charityCustomStep,setCharityCustomStep]=useState("url"); // "url" | "confirm"
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
  useEffect(()=>{const id=setInterval(()=>setTick(t=>t+1),60000);return()=>clearInterval(id);},[]);
  useEffect(()=>{if(chatEndRef.current)chatEndRef.current.scrollIntoView({behavior:"smooth"});},[messages]);
  useEffect(()=>{
    if(!admin.changeWindowOpen||!admin.changeWindowEnd||!me?.groupId)return;
    if(new Date(admin.changeWindowEnd)<new Date()){
      const upd={...admin,changeWindowOpen:false,changeWindowEnd:null};
      setAdmin(upd); fsSet(adminDocRef(me.groupId),JSON.stringify(upd));
    }
  },[admin,me]);

  // Show charity picker when user opens Stakes tab and hasn't picked yet (charity mode, not locked)
  useEffect(()=>{
    if(tab==="Stakes"&&admin.payoutMode==="charity"&&me&&!me.charityName&&!isLocked){
      setShowCharityModal(true);
    }
  },[tab]);

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
      initOneSignal();
      writeUserIndex(uid,d);
      // Load in-app notifications
      const notifVal=await fsGet(notifDocRef(uid));
      if(notifVal)setInAppNotifs(JSON.parse(notifVal));
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
    writeUserIndex(uid,d).catch(()=>{});
    pub(d).catch(()=>{});
    fsSet(memberUidDocRef(groupId,uid),JSON.stringify({uid,joinedAt:Date.now()})).catch(()=>{});
    loadMembers(groupId,name); loadChat(groupId); loadPolls(groupId); loadAdminData(groupId); loadLedger(groupId);
    if(!localStorage.getItem("pwaPromptShown")){setShowPwaPrompt(true);localStorage.setItem("pwaPromptShown","1");}
  }

  async function saveProgress(n){
    if(!n||n<=0||!me)return;
    const checks=[...me.dailyChecks]; checks[todayIdx()]=true;
    const newTotal=(me.totalProgress||0)+n;
    const newWeekProgress=me.progressThisWeek+n;
    const upd={...me,progressThisWeek:newWeekProgress,totalProgress:newTotal,dailyChecks:checks};
    setMe(upd); triggerSpark();
    fsSet(userDocRef(uid),JSON.stringify(upd)); pub(upd);
    loadMembers(me.groupId,me.name); updateLedgerProgress(n);
    maybeNotifyGoalHit(newWeekProgress);
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

  // ── Period / past-day helpers ──
  function cadenceDaysLocal(freq){return freq==="Daily"?1:freq==="Weekly"?7:freq==="Bi-Weekly"?14:30;}

  function getPastDaysInPeriod(){
    const now=new Date();
    const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    let periodStart;
    const firstCI=admin.firstCheckIn?new Date(admin.firstCheckIn):null;
    if(firstCI&&admin.startDate&&firstCI<=now){
      // Challenge is underway — find the start of the current period
      const cadDays=cadenceDaysLocal(admin.frequency||"Weekly");
      let cursor=new Date(firstCI);
      while(cursor<=now) cursor.setDate(cursor.getDate()+cadDays);
      // cursor = next upcoming deadline; step back one cadence = start of this period
      cursor.setDate(cursor.getDate()-cadDays);
      const thisPeriodDeadline=new Date(cursor);
      const pStart=new Date(thisPeriodDeadline);
      pStart.setDate(pStart.getDate()-cadDays);
      periodStart=pStart>new Date(admin.startDate)?pStart:new Date(admin.startDate);
    } else {
      // No active challenge yet, or firstCheckIn is still in the future — allow up to 7 days prior
      periodStart=new Date(today);
      periodStart.setDate(periodStart.getDate()-6);
    }
    const days=[];
    const start=new Date(Math.max(periodStart.getTime(),today.getTime()-86400000*13));
    let d=new Date(start.getFullYear(),start.getMonth(),start.getDate());
    while(d<today){
      days.push(new Date(d));
      d.setDate(d.getDate()+1);
    }
    return days;
  }

  async function logPastDayInline(){
    const n=parseInt(logInput);
    if(!n||n<=0||!pastDaySelected)return;
    setPastDaySaving(true);
    const dayOfWeek=(pastDaySelected.getDay()+6)%7;
    const checks=[...me.dailyChecks];
    checks[dayOfWeek]=true;
    // Don't count words logged before the challenge start date toward any progress totals
    const beforeStart=admin.startDate&&pastDaySelected<new Date(admin.startDate);
    const newTotal=beforeStart?(me.totalProgress||0):(me.totalProgress||0)+n;
    const newWeekProgress=beforeStart?me.progressThisWeek:me.progressThisWeek+n;
    const upd={...me,progressThisWeek:newWeekProgress,totalProgress:newTotal,dailyChecks:checks};
    setMe(upd); triggerSpark();
    await fsSet(userDocRef(uid),JSON.stringify(upd));
    await pub(upd);
    loadMembers(me.groupId,me.name);
    if(!beforeStart){updateLedgerProgress(n);maybeNotifyGoalHit(newWeekProgress);}
    setLogInput("");
    setPastDaySaving(false);
    setPastDaySelected(null);
  }

  async function logPastDay(){
    const n=parseInt(pastDayInput);
    if(!n||n<=0||!pastDaySelected)return;
    setPastDaySaving(true);
    // Mark the correct day-of-week dot
    const dayOfWeek=(pastDaySelected.getDay()+6)%7; // Mon=0
    const checks=[...me.dailyChecks];
    checks[dayOfWeek]=true;
    // Don't count words logged before the challenge start date toward any progress totals
    const beforeStart=admin.startDate&&pastDaySelected<new Date(admin.startDate);
    const newTotal=beforeStart?(me.totalProgress||0):(me.totalProgress||0)+n;
    const newWeekProgress=beforeStart?me.progressThisWeek:me.progressThisWeek+n;
    const upd={...me,progressThisWeek:newWeekProgress,totalProgress:newTotal,dailyChecks:checks};
    setMe(upd); triggerSpark();
    await fsSet(userDocRef(uid),JSON.stringify(upd));
    await pub(upd);
    loadMembers(me.groupId,me.name);
    if(!beforeStart){updateLedgerProgress(n);maybeNotifyGoalHit(newWeekProgress);}
    setPastDayInput("");
    setPastDaySaving(false);
    setShowPastDayModal(false);
    setPastDaySelected(null);
  }

  // ── Check-in period info for countdown card ──
  function getCheckInPeriodInfo(){
    if(!admin.firstCheckIn||!admin.startDate)return null;
    const now=new Date();
    const firstCI=new Date(admin.firstCheckIn);
    const cadDays=cadenceDaysLocal(admin.frequency||"Weekly");
    const startDate=new Date(admin.startDate);
    const endDate=admin.endDate?new Date(admin.endDate):null;
    // Is the challenge active?
    const isActive=now>=startDate&&(!endDate||now<=endDate);
    const isUpcoming=now<startDate;
    if(!isActive&&!isUpcoming)return null;
    // Find next check-in deadline after now
    let cursor=new Date(firstCI);
    if(cursor>now){
      // firstCheckIn is still in the future — it IS the next check-in
    } else {
      while(cursor<=now) cursor.setDate(cursor.getDate()+cadDays);
    }
    const nextCheckIn=new Date(cursor);
    // Calculate period number: how many full cadence periods since firstCheckIn have passed
    const msPerPeriod=cadDays*86400000;
    const periodNumber=firstCI<=now?Math.floor((now-firstCI)/msPerPeriod)+1:0;
    // Total periods in challenge
    const totalPeriods=endDate&&firstCI?Math.round((endDate-startDate)/msPerPeriod):null;
    const msLeft=nextCheckIn-now;
    const dLeft=Math.floor(msLeft/86400000);
    const hLeft=Math.floor((msLeft%86400000)/3600000);
    const mLeft=Math.floor((msLeft%3600000)/60000);
    return{nextCheckIn,periodNumber,totalPeriods,dLeft,hLeft,mLeft,isActive,isUpcoming};
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
      const res=await fetch("/api/fetch-title",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({url}),
      });
      const data=await res.json();
      return data.name||null;
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

  async function saveCharityFromModal(name, url){
    const upd={...me,charity:url||"",charityName:name};
    setMe(upd);
    await fsSet(userDocRef(uid),JSON.stringify(upd));
    pub(upd);
    setShowCharityModal(false);
    setCharityCustomUrl("");
    setCharityFetchedName(null);
    setCharityEditName("");
    setCharityCustomStep("url");
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
    const wasCharity=admin.payoutMode==="charity";
    const nowCharity=upd.payoutMode==="charity";
    setAdmin(upd); setAdminDraft(upd); setShowAdmin(false);
    fsSet(adminDocRef(me.groupId),JSON.stringify(upd));
    // If switching to charity mode and admin hasn't picked yet, show picker
    if(nowCharity&&(!me.charityName)&&!isLocked){
      setShowCharityModal(true);
    }
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
    notifyNewPoll(poll.question);
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

  async function handleAvatarChange(newAvatar){
    const upd={...me,avatar:newAvatar};
    setMe(upd);
    await fsSet(userDocRef(uid),JSON.stringify(upd));
    await pub(upd,uid);
    loadMembers(me.groupId,me.name);
  }

  // Merges partial updates into the live me state and saves to Firestore + index
  // Used by SettingsPanel so it always writes against the latest me, never stale props
  // Always writes the Firestore oneSignalPlayerId to the index — never the live OneSignal ID
  // from the current device, which may differ from the saved iPhone player ID.
  async function handleUpdateMe(updates){
    const upd={...me,...updates};
    setMe(upd);
    await fsSet(userDocRef(uid),JSON.stringify(upd));
    // Always use the oneSignalPlayerId already saved in Firestore for the index,
    // so a Mac/desktop save never overwrites the iPhone player ID.
    writeUserIndex(uid,upd);
  }

  async function addInAppNotif(type,title,body){
    const notif={id:Date.now(),type,title,body,ts:Date.now(),read:false};
    setInAppNotifs(prev=>{
      const updated=[notif,...prev].slice(0,50);
      fsSet(notifDocRef(uid),JSON.stringify(updated));
      return updated;
    });
    // Also attempt push (silent fail until /api/notify exists)
    try{
      const playerId=await getOneSignalPlayerId();
      if(playerId){
        await fetch("/api/notify",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({playerId,title,body,type}),
        });
      }
    }catch{}
  }

  async function markAllNotifsRead(){
    const updated=inAppNotifs.map(n=>({...n,read:true}));
    setInAppNotifs(updated);
    await fsSet(notifDocRef(uid),JSON.stringify(updated));
  }

  // ── Notification event triggers ──
  // Called when the current user hits 100% — notifies themselves (group push handled server-side later)
  async function maybeNotifyGoalHit(newProgress){
    const wasUnder=me.progressThisWeek<me.goalValue;
    const nowOver=newProgress>=me.goalValue;
    if(wasUnder&&nowOver){
      await addInAppNotif("memberHitGoal","🌟 Goal crushed!",`You hit your ${fmtGoal(me)} goal this week. Amazing work!`);
      // Push fan-out: notify group members who want "memberHitGoal" notifications
      if(me?.groupId){
        fetch("/api/notify",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            groupId:me.groupId,
            notifType:"memberHitGoal",
            excludeUid:uid,
            title:`🌟 ${me.name} crushed their goal!`,
            body:`${me.avatar} ${me.name} just hit their ${fmtGoal(me)} goal. Get inspired!`,
          }),
        }).catch(()=>{});
      }
    }
  }

  // Called when a new poll is submitted — notifies group members (push via server later)
  async function notifyNewPoll(question){
    // In-app notif for self
    await addInAppNotif("newPoll","📊 New poll","\""+question+"\" — cast your vote in Chat!");
    // Push fan-out to all group members who want poll notifications (excludes self)
    if(me?.groupId){
      fetch("/api/notify",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          groupId:me.groupId,
          notifType:"newPoll",
          excludeUid:uid,
          title:"📊 New poll in "+me.groupId,
          body:"\""+question+"\" — cast your vote!",
        }),
      }).catch(()=>{});
    }
  }

  // Called when a member's poll is closing within an hour
  async function notifyPollClosingSoon(question){
    await addInAppNotif("pollClosingSoon","⏳ Poll closing soon","\""+question+"\" closes in under an hour. Vote if you haven't!");
  }

  // Called when challenge is 24h away
  async function notifyChallengeSoon(){
    await addInAppNotif("challengeStarting","🚀 Challenge starting soon","Your writing challenge begins in less than 24 hours. Get ready!");
  }

  // Called on missed check-in (can be triggered at deadline evaluation)
  async function notifyMissedCheckIn(){
    await addInAppNotif("missedCheckIn","💔 Missed check-in",`You missed this check-in. ${me.goalType==="words"?`Goal was ${fmtGoal(me)}.`:"Keep going — you've got this!"}`);
  }

  // Check-in deadline warning (24h before) — called when admin settings include a firstCheckIn
  async function maybeNotifyCheckInWarning(){
    if(!admin.firstCheckIn)return;
    const deadline=new Date(admin.firstCheckIn);
    const msLeft=deadline-new Date();
    if(msLeft>0&&msLeft<=86400000){
      await addInAppNotif("checkInWarning","⏰ Check-in tomorrow",`Your check-in deadline is in less than 24 hours. Goal: ${fmtGoal(me)}.`);
    }
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
      {showSettings&&<SettingsPanel me={me} uid={uid} db={db} onClose={()=>setShowSettings(false)} onAvatarChange={handleAvatarChange} onSignOut={()=>signOut(auth)} onOpenAdmin={()=>{setAdminDraft({...admin});setShowAdmin(true);}} onOpenPrivacy={()=>{setShowSettings(false);setShowPrivacy(true);}} onUpdateMe={handleUpdateMe}/>}
      {showNotifFeed&&<NotifFeed notifications={inAppNotifs} onClose={()=>setShowNotifFeed(false)} onMarkAllRead={markAllNotifsRead}/>}

      {/* ── Charity Picker Modal ── */}
      {showCharityModal&&(
        <div className="modal-bg">
          <div className="card modal" style={{padding:24}}>
            <div style={{fontSize:22,fontWeight:900,color:LF.pink,marginBottom:4}}>💝 Pick Your Charity</div>
            <div style={{fontSize:14,color:"#ffffffcc",fontWeight:700,marginBottom:18,lineHeight:1.6}}>
              {me.charityName
                ? `Currently: ${me.charityName}. Choose a new one below.`
                : "Stakes go to each member's chosen charity. Pick yours!"}
            </div>

            {/* Pre-populated options */}
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
              {CHARITY_SUGGESTIONS.map(c=>{
                const sel=me.charityName===c.name;
                return(
                  <button key={c.url} onClick={()=>saveCharityFromModal(c.name,c.url)}
                    style={{background:sel?`linear-gradient(135deg,${LF.pink}33,${LF.purple}33)`:"#ffffff0a",border:`2px solid ${sel?LF.pink:"#ffffff22"}`,borderRadius:14,padding:"12px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.2s"}}>
                    <div style={{fontSize:15,fontWeight:800,color:sel?LF.pink:LF.white}}>{sel?"✨ ":""}{c.name}</div>
                  </button>
                );
              })}

              {/* Custom option */}
              <div style={{border:`2px solid ${charityCustomStep==="confirm"?LF.teal:"#ffffff22"}`,borderRadius:14,padding:"12px 14px",background:"#ffffff0a"}}>
                <div style={{fontSize:15,fontWeight:800,color:LF.white,marginBottom:charityCustomStep==="url"?10:0}}>🔗 Custom charity</div>

                {charityCustomStep==="url"&&(<>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <input className="inp" placeholder="https://www.yourcharity.org" value={charityCustomUrl}
                      onChange={e=>{setCharityCustomUrl(e.target.value);setCharityFetchedName(null);setCharityCustomStep("url");}}
                      style={{flex:1,fontSize:14,padding:"8px 12px"}}/>
                    <button className="btn btn-teal" style={{padding:"8px 14px",fontSize:13,flexShrink:0}}
                      disabled={charityFetchLoading||!isValidUrl(charityCustomUrl)}
                      onClick={async()=>{
                        if(!isValidUrl(charityCustomUrl))return;
                        setCharityFetchLoading(true);
                        const name=await fetchCharityName(normalizeUrl(charityCustomUrl));
                        setCharityFetchLoading(false);
                        setCharityFetchedName(name||"");
                        setCharityEditName(name||"");
                        setCharityCustomStep("confirm");
                      }}>
                      {charityFetchLoading?"…":"Look up"}
                    </button>
                  </div>
                  {charityCustomUrl&&!isValidUrl(charityCustomUrl)&&(
                    <div style={{fontSize:12,color:LF.pink,fontWeight:800,marginTop:6}}>Please enter a valid URL</div>
                  )}
                </>)}

                {charityCustomStep==="confirm"&&(<>
                  <div style={{fontSize:13,color:"#ffffffcc",fontWeight:700,marginTop:6,marginBottom:8}}>
                    We found this name — edit if needed:
                  </div>
                  <input className="inp" value={charityEditName} onChange={e=>setCharityEditName(e.target.value)}
                    placeholder="Charity name" style={{marginBottom:10,fontSize:14}}/>
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn" style={{flex:1,fontSize:13}}
                      disabled={!charityEditName.trim()}
                      onClick={()=>saveCharityFromModal(charityEditName.trim(),normalizeUrl(charityCustomUrl))}>
                      Save ✨
                    </button>
                    <button onClick={()=>{setCharityCustomStep("url");setCharityFetchedName(null);}}
                      style={{flex:1,background:"#ffffff18",border:"2px solid #ffffff22",borderRadius:50,cursor:"pointer",fontSize:13,color:"#fff",fontFamily:"'Outfit',sans-serif",fontWeight:700}}>
                      ← Back
                    </button>
                  </div>
                </>)}
              </div>
            </div>

            {/* Skip / close — only if they already have a charity */}
            {me.charityName&&(
              <button onClick={()=>setShowCharityModal(false)}
                style={{width:"100%",background:"none",border:"none",color:"#ffffffaa",fontSize:13,cursor:"pointer",fontFamily:"'Outfit',sans-serif",textDecoration:"underline",marginTop:4}}>
                Keep current ({me.charityName})
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Past-Day Log Modal ── */}
      {showPastDayModal&&(()=>{
        const days=getPastDaysInPeriod();
        const dayNames=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
        return(
          <div className="modal-bg" onClick={()=>{setShowPastDayModal(false);setPastDaySelected(null);setPastDayInput("");}}>
            <div className="card modal" style={{padding:24}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:20,fontWeight:900,color:LF.pink,marginBottom:4}}>📅 Log a Previous Day</div>
              <div style={{fontSize:14,color:"#ffffffcc",fontWeight:700,marginBottom:16,lineHeight:1.6}}>
                Pick a day from this check-in period and add your {me.goalType==="words"?"words":"minutes"}.
              </div>
              {days.length===0?(
                <div style={{fontSize:14,color:"#ffffffcc",fontWeight:700,textAlign:"center",padding:"16px 0"}}>No previous days available in this period yet.</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16,maxHeight:220,overflowY:"auto"}}>
                  {[...days].reverse().map((d,i)=>{
                    const dow=(d.getDay()+6)%7;
                    const label=`${dayNames[dow]}, ${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;
                    const sel=pastDaySelected&&pastDaySelected.toDateString()===d.toDateString();
                    return(
                      <button key={i} onClick={()=>setPastDaySelected(d)}
                        style={{background:sel?`linear-gradient(135deg,${LF.pink}33,${LF.purple}33)`:"#ffffff0a",border:`2px solid ${sel?LF.pink:"#ffffff22"}`,borderRadius:14,padding:"10px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.2s"}}>
                        <div style={{fontSize:14,fontWeight:800,color:sel?LF.pink:LF.white}}>{sel?"✨ ":""}{label}</div>
                      </button>
                    );
                  })}
                </div>
              )}
              {pastDaySelected&&(
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:13,color:"#ffffffcc",fontWeight:800,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>
                    {me.goalType==="words"?"Words written":"Minutes written"}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <input className="inp" type="number" placeholder={me.goalType==="words"?"e.g. 500":"e.g. 45"} value={pastDayInput} onChange={e=>setPastDayInput(e.target.value)} style={{flex:1}} autoFocus/>
                    <button className="btn" onClick={logPastDay} disabled={pastDaySaving||!pastDayInput} style={{padding:"11px 18px"}}>
                      {pastDaySaving?"✨":"+ Log"}
                    </button>
                  </div>
                </div>
              )}
              <button onClick={()=>{setShowPastDayModal(false);setPastDaySelected(null);setPastDayInput("");}}
                style={{width:"100%",background:"none",border:"none",color:"#ffffffaa",fontSize:13,cursor:"pointer",fontFamily:"'Outfit',sans-serif",textDecoration:"underline"}}>
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

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
          {/* Bell icon */}
          <button onClick={()=>setShowNotifFeed(true)} style={{position:"relative",background:"#ffffff18",border:"1px solid #ffffff33",borderRadius:50,width:38,height:38,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
            🔔
            {inAppNotifs.filter(n=>!n.read).length>0&&(
              <span style={{position:"absolute",top:2,right:2,width:10,height:10,background:LF.pink,borderRadius:"50%",border:"2px solid #1A0044"}}/>
            )}
          </button>
          {/* Avatar / settings icon */}
          <button onClick={()=>setShowSettings(true)} style={{background:`linear-gradient(135deg,${LF.pink},${LF.purple})`,border:"none",borderRadius:50,width:38,height:38,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,flexShrink:0,boxShadow:`0 2px 12px ${LF.pink}44`}}>
            {me.avatar}
          </button>
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
          {(()=>{
            const info=getCheckInPeriodInfo();
            if(!info)return null;
            return(
              <div className="card" style={{border:`2px solid ${info.isActive?LF.teal:LF.yellow}55`,background:info.isActive?"#00E5FF08":"#FFD60008"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:info.isActive?10:0}}>
                  <div style={{fontSize:11,fontWeight:900,color:info.isActive?LF.teal:LF.yellow,textTransform:"uppercase",letterSpacing:2}}>
                    {info.isActive?"🟢 Round Active":"⏳ Round Starting Soon"}
                  </div>
                  {info.totalPeriods&&info.periodNumber>0&&(
                    <div style={{fontSize:12,fontWeight:800,color:"#ffffffcc",background:"#ffffff14",borderRadius:50,padding:"3px 10px"}}>
                      Period {info.periodNumber} of {info.totalPeriods}
                    </div>
                  )}
                </div>
                {info.isActive&&(
                  <div style={{display:"flex",alignItems:"center",gap:14}}>
                    <div>
                      <div style={{fontSize:11,color:"#ffffffaa",fontWeight:700,marginBottom:2}}>Next check-in in</div>
                      <div style={{fontSize:26,fontWeight:900,color:LF.yellow,letterSpacing:1}}>
                        {info.dLeft>0&&<span>{info.dLeft}<span style={{fontSize:12,color:"#ffffffcc",marginRight:4}}>d</span></span>}
                        {info.hLeft>0&&<span>{info.hLeft}<span style={{fontSize:12,color:"#ffffffcc",marginRight:4}}>h</span></span>}
                        <span>{info.mLeft}<span style={{fontSize:12,color:"#ffffffcc"}}>m</span></span>
                      </div>
                    </div>
                    <div style={{fontSize:12,color:"#ffffffbb",fontWeight:700,lineHeight:1.5}}>
                      {info.nextCheckIn.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}<br/>
                      {info.nextCheckIn.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <div className="card" style={{border:`2px solid ${pct>=100?LF.lime:LF.pink}66`,position:"relative"}}>
            {spark>0&&["✨","⭐","💫","🌟","✨","⭐"].map((em,i)=><span key={`${spark}-${i}`} style={{position:"absolute",left:`${sparkPositions.current[i]?.left||20}%`,top:`${sparkPositions.current[i]?.top||20}%`,fontSize:16,animation:"pop 0.5s ease forwards",pointerEvents:"none"}}>{em}</span>)}
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
              {(()=>{
                const pastDays=getPastDaysInPeriod();
                const dayNames=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
                // null = today, otherwise a Date object
                const isToday=pastDaySelected===null;
                return(<>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <span className="lbl" style={{marginBottom:0}}>📝 Log Words</span>
                    {pastDays.length>0&&(
                      <select
                        value={pastDaySelected?pastDaySelected.toDateString():"today"}
                        onChange={e=>{
                          if(e.target.value==="today"){setPastDaySelected(null);}
                          else{const d=pastDays.find(d=>d.toDateString()===e.target.value);setPastDaySelected(d||null);}
                        }}
                        className="inp"
                        style={{width:"auto",padding:"5px 10px",fontSize:13,maxWidth:160}}
                      >
                        <option value="today">Today</option>
                        {[...pastDays].reverse().map((d,i)=>{
                          const dow=(d.getDay()+6)%7;
                          return <option key={i} value={d.toDateString()}>{dayNames[dow]}, {d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</option>;
                        })}
                      </select>
                    )}
                  </div>
                  {!isToday&&(
                    <div style={{fontSize:12,color:LF.yellow,fontWeight:800,marginBottom:8}}>
                      📅 Logging for {(()=>{const dow=(pastDaySelected.getDay()+6)%7;return`${dayNames[dow]}, ${pastDaySelected.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;})()}
                    </div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    <input className="inp" type="number" placeholder="words written" value={logInput} onChange={e=>setLogInput(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"){isToday?logProgress():logPastDayInline();}}}
                      style={{flex:1}}/>
                    <button className="btn" onClick={isToday?logProgress:logPastDayInline} disabled={saving||pastDaySaving} style={{padding:"11px 20px"}}>
                      {(saving||pastDaySaving)?"✨":"+ Log"}
                    </button>
                  </div>
                </>);
              })()}
            </div>
          ):(
            <div className="card" style={{border:`2px solid ${timerRunning?LF.teal:LF.pink}55`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <span className="lbl" style={{marginBottom:0}}>⏱️ Writing Timer</span>
                {(()=>{
                  const pastDays=getPastDaysInPeriod();
                  const dayNames=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
                  if(pastDays.length===0)return null;
                  return(
                    <select
                      value={pastDaySelected?pastDaySelected.toDateString():"today"}
                      onChange={e=>{
                        if(e.target.value==="today"){setPastDaySelected(null);}
                        else{const d=pastDays.find(d=>d.toDateString()===e.target.value);setPastDaySelected(d||null);}
                      }}
                      className="inp"
                      style={{width:"auto",padding:"5px 10px",fontSize:13,maxWidth:160}}
                    >
                      <option value="today">Today</option>
                      {[...pastDays].reverse().map((d,i)=>{
                        const dow=(d.getDay()+6)%7;
                        return <option key={i} value={d.toDateString()}>{dayNames[dow]}, {d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</option>;
                      })}
                    </select>
                  );
                })()}
              </div>
              {pastDaySelected?(
                // Past-day time entry for timer mode
                <div>
                  <div style={{fontSize:12,color:LF.yellow,fontWeight:800,marginBottom:8}}>
                    📅 Logging for {(()=>{const dayNames=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];const dow=(pastDaySelected.getDay()+6)%7;return`${dayNames[dow]}, ${pastDaySelected.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;})()}
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <input className="inp" type="number" placeholder="minutes written" value={logInput} onChange={e=>setLogInput(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter")logPastDayInline();}}
                      style={{flex:1}}/>
                    <button className="btn" onClick={logPastDayInline} disabled={pastDaySaving} style={{padding:"11px 20px"}}>
                      {pastDaySaving?"✨":"+ Log"}
                    </button>
                  </div>
                </div>
              ):(
                <>
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
                </>
              )}
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
                    <div style={{fontSize:13,fontWeight:800,color:e.type==="charity"?LF.lime:LF.yellow,wordBreak:"break-word"}}>{e.type==="charity"?`💝 ${e.name} → ${e.charityName||e.charity}`:`🏆 Payout to ${e.name}`}</div>
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
              {me.charityName?(
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                  <div>
                    <div style={{fontSize:17,fontWeight:900,color:LF.lime}}>✨ {me.charityName}</div>
                    <div style={{fontSize:12,color:"#ffffffcc",fontWeight:700,marginTop:2}}>Your stakes go here if you miss your goal.</div>
                  </div>
                  {!isLocked&&(
                    <button className="btn btn-teal" onClick={()=>setShowCharityModal(true)} style={{fontSize:13,padding:"8px 14px",flexShrink:0}}>
                      Change
                    </button>
                  )}
                </div>
              ):(
                <div>
                  <div style={{fontSize:14,color:"#ffffffcc",fontWeight:700,marginBottom:12}}>You haven't picked a charity yet!</div>
                  {!isLocked&&(
                    <button className="btn" onClick={()=>setShowCharityModal(true)} style={{width:"100%",fontSize:15}}>
                      💝 Pick My Charity
                    </button>
                  )}
                  {isLocked&&<div style={{fontSize:13,color:LF.orange,fontWeight:800}}>🔒 Goals are locked — charity can't be changed.</div>}
                </div>
              )}
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
