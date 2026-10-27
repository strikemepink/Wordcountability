import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, runTransaction,
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
// Member cards are saved under the member's account ID. Older cards were saved under their
// first name; legacyMemberDocRef points at those so they can be cleaned up.
const memberDocRef       = (gid, uid)  => doc(db, "groups", gid, "members", uid);
const legacyMemberDocRef = (gid, name) => doc(db, "groups", gid, "members", name);
const chatDocRef    = (gid)       => doc(db, "groups", gid, "data", "chat");
const pollsDocRef   = (gid)       => doc(db, "groups", gid, "data", "polls");
const adminDocRef   = (gid)       => doc(db, "groups", gid, "data", "admin");
const ledgerDocRef  = (gid)       => doc(db, "groups", gid, "data", "ledger");
const membersColRef = (gid)       => collection(db, "groups", gid, "members");
const memberUidDocRef    = (gid, uid) => doc(db, "groups", gid, "memberUids", uid);
const notifDocRef        = (uid)       => doc(db, "users",  uid, "data", "notifications");
const checkInAcksDocRef  = (uid)       => doc(db, "users",  uid, "data", "checkInAcks");
const userIndexDocRef    = (uid)       => doc(db, "_index", "users", "members", uid);
const devicesDocRef      = (uid)       => doc(db, "users",  uid, "data", "devices");
// Group admins: groups/{gid}/adminUids/{uid}. The group record (groups/{gid}) notes who created it.
const groupDocRef        = (gid)       => doc(db, "groups", gid);
const adminUidDocRef     = (gid, uid)  => doc(db, "groups", gid, "adminUids", uid);
const adminUidsColRef    = (gid)       => collection(db, "groups", gid, "adminUids");

async function fsGet(ref) {
  try { const s = await getDoc(ref); return s.exists() ? s.data().value : null; } catch { return null; }
}
async function fsSet(ref, value) {
  try { await setDoc(ref, { value }, { merge: false }); } catch (e) { console.warn("fsSet", e); }
}
async function fsDel(ref) { try { await deleteDoc(ref); } catch {} }
// Safely updates a shared list (chat, polls) that several people write to.
// Reads the latest saved copy, applies the change, and saves it in one step, so nobody
// else's new messages or votes get overwritten. Returns the updated list, or null on failure.
async function fsUpdateList(ref, change){
  try{
    return await runTransaction(db, async tx=>{
      const snap=await tx.get(ref);
      const raw=snap.exists()?snap.data().value:null;
      const next=change(raw?JSON.parse(raw):[]);
      tx.set(ref,{value:JSON.stringify(next)});
      return next;
    });
  }catch(e){console.warn("fsUpdateList",e);return null;}
}
async function writeUserIndex(uid, d){
  // Full user snapshot used by cron-reminders to find users due for a reminder.
  // Must include notifPrefs (for reminderTime/writingReminder) at top level. Push devices are
  // stored separately in the devices list (see addDevice).
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
// Saves this device's push ID to the user's list of devices, so notifications reach every
// phone or computer they've enabled. Uses the latest saved list, so one device never erases
// another. Keeps the 10 most recently registered devices.
async function addDevice(uid, playerId){
  if(!uid||!playerId)return;
  await fsUpdateList(devicesDocRef(uid),list=>[...list.filter(x=>x!==playerId),playerId].slice(-10));
}

// Calls one of our own server functions as the signed-in user. The login token lets the
// server confirm who is asking before it sends notifications or returns group data.
async function apiPost(path, body){
  const token=auth.currentUser?await auth.currentUser.getIdToken():null;
  return fetch(path,{
    method:"POST",
    headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},
    body:JSON.stringify(body),
  });
}

// ── Constants ────────────────────────────────────────────────────
const TABS        = ["Dashboard","Group","Chat","Stats","Stakes"];
const TAB_LABELS  = {Dashboard:"Today",Group:"Group",Chat:"Chat",Stats:"Stats",Stakes:"Stakes"};
// App tour: each step shows the tab it describes. "highlight" makes the avatar button glow.
const TOUR_STEPS = [
  {tab:"Dashboard",emoji:"📊",title:"Start on the Today tab",body:"See how far you are from this week's goal and when your next check-in is. This is also where you log your words or run your writing timer."},
  {tab:"Group",emoji:"👀",title:"Meet your group",body:"See everyone's goals and progress. You can also share your group link here to invite new members."},
  {tab:"Dashboard",highlight:"avatar",emoji:"🔔",title:"Set up your notifications",body:"Tap your avatar in the top right corner to open Settings. From there you can set a daily writing reminder or a warning before each check-in."},
  {tab:"Chat",emoji:"💬",title:"Say hi in Chat",body:"Cheer each other on here. You can also post a poll to get everyone's opinion."},
  {tab:"Stats",emoji:"📈",title:"Track progress in Stats",body:"Your own history week to week, plus the whole group's progress at a glance."},
  {tab:"Stakes",emoji:"🎯",title:"Manage your goal in Stakes",body:"Change your goal and charity here, but only when the admin allows it."},
];
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
  // Mapped to the new palette. Colours used for text are deeper shades so they read well on cream.
  pink:"#8C62D1", hotpink:"#6D47B5", violet:"#0062B1", yellow:"#B85400",
  purple:"#8377D1", blue:"#0062B1", orange:"#FF7F11", lime:"#4F7A1F",
  white:"#14213D", offwhite:"#FFF7EE",
};

// ── Global CSS — NO text-shadow anywhere ─────────────────────────
const G = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700;800;900&display=swap');
  /* Palette: teal #00BFB2 · lavender #8377D1 · yellow #F4E409 · orange #FF7F11 · pink #FF1053
              blue #0062B1 · purple #8C62D1 · green #82B63A · mustard #C8A73B · crimson #BF1E41
     Text sits on a cream background, so small text uses deeper shades of these colours.
     Design rule: never pair green with red or pink (reads as Christmas). */
  *{box-sizing:border-box;} body{margin:0;background:#FFF7EE;color:#14213D;}
  .leopard{background:#FFF7EE;color:#14213D;position:relative;}
  .root{min-height:100vh;font-family:'Inter',sans-serif;color:#14213D;font-weight:500;display:flex;flex-direction:column;align-items:center;padding-bottom:104px;position:relative;}
  .root > *, .leopard > *{position:relative;z-index:1;}
  /* Decorative circles: many sizes, each with a thick border in a contrasting palette colour */
  .bgc{position:fixed!important;inset:0;overflow:hidden;pointer-events:none;z-index:0!important;}
  .bgc i{position:absolute;border-radius:50%;border-style:solid;}
  .bgc .c1{width:150px;height:150px;top:-60px;right:-40px;background:#FF7F11;border-width:14px;border-color:#0062B1}
  .bgc .c2{width:30px;height:30px;top:92px;right:-12px;background:#82B63A;border-width:6px;border-color:#F4E409}
  .bgc .c3{width:22px;height:22px;top:6px;left:63%;background:#0062B1;border-width:5px;border-color:#FF1053}
  .bgc .c4{width:110px;height:110px;bottom:120px;right:-50px;background:#00BFB2;border-width:12px;border-color:#8377D1}
  .bgc .c5{width:200px;height:200px;bottom:-110px;left:-80px;background:#8377D1;border-width:16px;border-color:#FF7F11}
  .bgc .c6{width:46px;height:46px;bottom:150px;left:14px;background:#FF1053;border-width:7px;border-color:#8377D1}
  .bgc .c7{width:80px;height:80px;top:44%;left:-46px;background:#F4E409;border-width:10px;border-color:#BF1E41}
  .bgc .c8{width:64px;height:64px;top:30%;right:-30px;background:#8C62D1;border-width:9px;border-color:#00BFB2}
  .bgc .c9{width:38px;height:38px;top:64%;right:6px;background:#C8A73B;border-width:6px;border-color:#0062B1}
  .card{background:rgba(255,255,255,0.92);border:1px solid #14213D1f;border-radius:20px;padding:20px;position:relative;box-shadow:0 2px 14px rgba(20,33,61,0.06);}
  /* Each card gets a thin outline in one of the palette colours, cycling down the page */
  .card:nth-child(5n+1){border:2px solid #C8A73B;}
  .card:nth-child(5n+2){border:2px solid #00BFB2;}
  .card:nth-child(5n+3){border:2px solid #FF7F11;}
  .card:nth-child(5n+4){border:2px solid #8C62D1;}
  .card:nth-child(5n+5){border:2px solid #0062B1;}
  .card::before{display:none;}
  .btn{background:#8C62D1;color:#fff;border:none;border-radius:14px;padding:12px 22px;font-family:'Poppins',sans-serif;font-size:19px;cursor:pointer;font-weight:700;transition:transform 0.15s,filter 0.15s;}
  .btn:hover{filter:brightness(1.06);transform:translateY(-1px);}
  .btn:disabled{opacity:0.6;cursor:default;transform:none;}
  /* Smaller buttons use a deeper purple so their white text stays easy to read */
  .btn-sm{background:#6D47B5;}
  .btn-teal{background:#0062B1!important;}
  .btn-yellow{background:#FF7F11!important;color:#14213D!important;}
  .btn-red{background:#BF1E41!important;}
  .inp{background:#fff;border:1.5px solid #14213D2e;border-radius:12px;padding:11px 14px;color:#14213D;font-family:'Inter',sans-serif;font-size:16px;font-weight:500;outline:none;transition:all 0.2s;width:100%;}
  .inp::placeholder{color:#8A94A3;}
  .inp:focus{border-color:#8C62D1;box-shadow:0 0 0 3px #8C62D133;}
  .pill{display:flex;background:#14213D0d;border:1px solid #14213D1f;border-radius:14px;padding:4px;gap:4px;}
  .pill button{flex:1;border:none;border-radius:10px;padding:11px 14px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s;color:#5B6878;background:transparent;}
  .pbar-bg{background:#14213D14;border-radius:50px;height:10px;overflow:hidden;}
  .pbar-fill{height:100%;border-radius:50px;transition:width 0.6s ease;}
  .holo{font-family:'Poppins',sans-serif;font-weight:700;color:#14213D;}
  @keyframes pop{0%{transform:scale(0.5);opacity:0;}60%{transform:scale(1.2);}100%{transform:scale(1);opacity:1;}}
  @keyframes msgIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
  .msg-in{animation:msgIn 0.25s ease forwards;}
  .lbl{font-size:12px;color:#0062B1;text-transform:uppercase;letter-spacing:0.14em;font-weight:700;display:block;margin-bottom:10px;}
  .modal-bg{position:fixed;inset:0;background:#14213D66;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}
  .modal{max-width:min(440px,calc(100vw - 32px));width:100%;max-height:92vh;overflow-y:auto!important;overflow-x:hidden!important;border:2px solid #8C62D1!important;background:#FFFFFF!important;}
  .modal.card::before{display:none;}
  .locked-badge{background:#BF1E41;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;}
  .open-badge{background:#82B63A;color:#14213D;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;}
  .btn-google{background:#fff;color:#14213D;border:1.5px solid #14213D2e;border-radius:14px;padding:12px 28px;font-family:'Poppins',sans-serif;font-size:17px;cursor:pointer;font-weight:600;box-shadow:0 2px 14px rgba(20,33,61,0.08);transition:transform 0.15s;display:flex;align-items:center;gap:10px;}
  .btn-google:hover{transform:translateY(-1px);}
  .privacy-modal{max-width:500px;width:100%;max-height:88vh;overflow-y:auto;background:#FFFFFF;border:1px solid #14213D1f;border-radius:20px;padding:28px;}
  .settings-panel{position:fixed;top:0;right:0;height:100%;width:min(380px,100%);background:#FFFDF9;border-left:1px solid #14213D1f;z-index:200;display:flex;flex-direction:column;overflow:hidden;transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);}
  .settings-panel-overlay{position:fixed;inset:0;background:#14213D55;z-index:199;}
  .settings-section{padding:18px 20px 0;}
  .settings-section-title{font-size:11px;color:#5B6878;text-transform:uppercase;letter-spacing:2px;font-weight:800;margin-bottom:10px;}
  .notif-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #14213D14;}
  .toggle{position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;}
  .toggle input{opacity:0;width:0;height:0;}
  .toggle-slider{position:absolute;inset:0;background:#14213D26;border-radius:24px;cursor:pointer;transition:background 0.2s;}
  .toggle-slider:before{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);}
  .toggle input:checked+.toggle-slider{background:#8C62D1;}
  .toggle input:checked+.toggle-slider:before{transform:translateX(20px);}
  .notif-feed{position:fixed;top:0;right:0;height:100%;width:min(380px,100%);background:#FFFDF9;border-left:1px solid #14213D1f;z-index:200;display:flex;flex-direction:column;overflow:hidden;}
  @keyframes slideInRight{from{transform:translateX(100%);}to{transform:translateX(0);}}
  /* Header, headings and bottom tab bar */
  .app-header{width:100%;max-width:500px;padding:22px 20px 0;display:flex;justify-content:space-between;align-items:center;}
  .wordmark{font-family:'Poppins',sans-serif;font-weight:700;font-size:23px;line-height:1;}
  .wordmark .wc{color:#FF7F11;} .wordmark .ab{color:#8C62D1;}
  .icon-btn{position:relative;width:42px;height:42px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:19px;cursor:pointer;padding:0;}
  .icon-btn.bell{border:3px solid #00BFB2;} .icon-btn.me{border:3px solid #F4E409;}
  @keyframes tourGlow{from{box-shadow:0 0 0 4px #fff,0 0 0 7px #8C62D1;}to{box-shadow:0 0 0 6px #fff,0 0 0 12px #8C62D1aa;}}
  .tour-glow{animation:tourGlow 0.9s ease-in-out infinite alternate;}
  .dotbadge{position:absolute;top:5px;right:6px;width:9px;height:9px;border-radius:50%;background:#8C62D1;border:2px solid #fff;}
  .eyebrow{font-size:12px;letter-spacing:0.14em;font-weight:700;color:#0062B1;text-transform:uppercase;margin:0 0 8px;}
  .headline{font-family:'Poppins',sans-serif;font-weight:600;font-size:clamp(26px,7.4vw,31px);line-height:1.15;margin:0 0 12px;color:#14213D;}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}
  .chip{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:#fff;border:1px solid #14213D1f;color:#14213D;}
  .card-title{font-family:'Poppins',sans-serif;font-weight:600;font-size:16px;color:#14213D;}
  .bottom-nav{position:fixed!important;left:0;right:0;bottom:0;z-index:50!important;background:rgba(255,255,255,0.97);border-top:1px solid #14213D1f;display:flex;justify-content:center;padding:8px 6px calc(10px + env(safe-area-inset-bottom));}
  .bottom-nav-inner{display:flex;width:100%;max-width:500px;justify-content:space-around;}
  .nav-btn{flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;color:#5B6878;padding:4px 0;}
  .nav-btn.on{color:#6D47B5;}
  .nav-btn svg{width:23px;height:23px;}
  .page-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding-top:4px;}
  .page-title{font-family:'Poppins',sans-serif;font-weight:600;font-size:28px;line-height:1.1;margin:0;color:#14213D;}
  .ghost-btn{background:#fff;border:1.5px solid #14213D2e;border-radius:12px;padding:8px 14px;font-family:'Inter',sans-serif;font-size:14px;font-weight:600;color:#14213D;cursor:pointer;flex-shrink:0;}
  .ghost-btn:hover{border-color:#8C62D1;}
  .muted{color:#5B6878;}`;

// ── Helpers ──────────────────────────────────────────────────────
// Formats a date as "YYYY-MM-DD" using the user's local calendar (not UTC)
function localDateKey(dt){return`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;}
// Week key = the local date of this week's Monday
function getWeekKey(){const now=new Date();const day=now.getDay();const monday=new Date(now);monday.setDate(now.getDate()-(day===0?6:day-1));return localDateKey(monday);}
// Older app versions saved week keys in UTC, which could land one day off (a Sunday or a Tuesday).
// This maps any saved key back to its Monday so those users don't get a wrongful reset.
function normalizeWeekKey(key){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key||""))return key||"";
  const [y,m,d]=key.split("-").map(Number);
  const dt=new Date(y,m-1,d);
  if(dt.getDay()===0)dt.setDate(dt.getDate()+1); // Sunday → following Monday
  else dt.setDate(dt.getDate()-((dt.getDay()+6)%7)); // any other day → that week's Monday
  return localDateKey(dt);
}
// A check-in's goal is the weekly goal scaled to the check-in's length in days:
// Daily = 1/7 of it, Weekly = all of it, Bi-Weekly = double, Monthly (30 days) = 30/7 of it.
function periodGoalFor(weeklyGoal,cadDays){return Math.max(1,Math.round((weeklyGoal||0)*cadDays/7));}
// Plain-English name for a check-in period, used in notification text
function periodName(cadDays){return cadDays===1?"daily goal":cadDays===7?"weekly goal":cadDays===14?"2-week goal":"monthly goal";}
function todayIdx(){return(new Date().getDay()+6)%7;}
function fmtGoal(m){if(m.goalType==="words")return`${m.goalValue.toLocaleString()} words`;const h=Math.floor(m.goalValue/60),mn=m.goalValue%60;return h>0?`${h}h`+(mn>0?` ${mn}m`:""):mn+"m";}
function fmtProg(m){if(m.goalType==="words")return`${m.progressThisWeek.toLocaleString()} words`;const h=Math.floor(m.progressThisWeek/60),mn=m.progressThisWeek%60;return h>0?`${h}h`+(mn>0?` ${mn}m`:""):mn+"m";}
function fmtDate(ts){return new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}
function fmtTimer(s){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;if(h>0)return`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;return`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;}
function fmtMoney(n){return`$${n.toFixed(2)}`;}
function normalizeUrl(s){s=s.trim();if(!s)return s;if(!/^https?:\/\//i.test(s))s="https://"+s;return s;}
function isValidUrl(s){s=normalizeUrl(s);try{const u=new URL(s);return(u.protocol==="https:"||u.protocol==="http:")&&u.hostname.includes(".");}catch{return false;}}

// While older name-based cards are being cleaned up, a person can briefly have two cards.
// Keeps only the most recently updated card for each person.
function dedupeMembers(list){
  const byPerson={};
  list.forEach(m=>{const k=m.uid||m.name;if(!byPerson[k]||(m.updatedAt||0)>(byPerson[k].updatedAt||0))byPerson[k]=m;});
  return Object.values(byPerson);
}

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

// ── Background circles (decorative, shown behind every screen) ──
function BgCircles(){
  return <div className="bgc" aria-hidden="true">{[1,2,3,4,5,6,7,8,9].map(i=><i key={i} className={`c${i}`}/>)}</div>;
}

// ── Bottom tab bar icons (simple line drawings) ──
function TabIcon({name}){
  const common={fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};
  if(name==="Dashboard")return <svg viewBox="0 0 24 24" {...common}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>;
  if(name==="Group")return <svg viewBox="0 0 24 24" {...common}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 5.3"/></svg>;
  if(name==="Chat")return <svg viewBox="0 0 24 24" {...common}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/></svg>;
  if(name==="Stats")return <svg viewBox="0 0 24 24" {...common}><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg>;
  return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.6-.8-1.6-1.2-2.8-1.2-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.2 0-2.3-.5-2.8-1.2"/><path d="M12 6.5v11"/></svg>;
}

// ── Ring ─────────────────────────────────────────────────────────
function Ring({pct,size=100,stroke=8}){
  const r=(size-stroke*2)/2,c=2*Math.PI*r,off=c-(Math.min(pct,100)/100)*c;
  return(<svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#14213D17" strokeWidth={stroke}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={pct>=100?"#82B63A":"#8C62D1"} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{transition:"stroke-dashoffset 0.6s ease"}}/>
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
        <div style={{fontSize:20,fontWeight:700,color:"#B85400",marginBottom:8}}>Install Wordcountability</div>
        <div style={{fontSize:14,color:"#5B6878",fontWeight:500,lineHeight:1.7,marginBottom:20}}>
          Install the app to your home screen to get writing reminders and quick access. It takes 5 seconds!
        </div>
        {isIos&&(
          <div style={{background:"#14213D0a",border:"2px solid #14213D1f",borderRadius:14,padding:"14px 16px",marginBottom:16,textAlign:"left"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#6D47B5",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>On iPhone / iPad</div>
            <div style={{background:"#8C62D122",border:"1.5px solid #8C62D155",borderRadius:10,padding:"8px 12px",marginBottom:10,fontSize:13,color:LF.hotpink,fontWeight:600,lineHeight:1.6}}>
              ⚠️ You must use <span style={{color:LF.yellow}}>Safari</span> — this won't work in Chrome or other browsers on iPhone.
            </div>
            <div style={{fontSize:14,color:"#14213D",fontWeight:500,lineHeight:2}}>
              1. Tap the <span style={{color:"#B85400"}}>Share</span> button at the bottom of Safari ⬆️<br/>
              2. Scroll down and tap <span style={{color:"#B85400"}}>Add to Home Screen</span><br/>
              3. Tap <span style={{color:"#B85400"}}>Add</span> ✅
            </div>
          </div>
        )}
        {isAndroid&&(
          <div style={{background:"#14213D0a",border:"2px solid #14213D1f",borderRadius:14,padding:"14px 16px",marginBottom:16,textAlign:"left"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#6D47B5",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>On Android</div>
            <div style={{fontSize:14,color:"#14213D",fontWeight:500,lineHeight:2}}>
              1. Tap the <span style={{color:"#B85400"}}>menu</span> (⋮) in your browser<br/>
              2. Tap <span style={{color:"#B85400"}}>Add to Home Screen</span><br/>
              3. Tap <span style={{color:"#B85400"}}>Add</span> ✅
            </div>
          </div>
        )}
        {!isIos&&!isAndroid&&(
          <div style={{background:"#14213D0a",border:"2px solid #14213D1f",borderRadius:14,padding:"14px 16px",marginBottom:16,textAlign:"left"}}>
            <div style={{fontSize:14,color:"#14213D",fontWeight:500,lineHeight:2}}>
              On <span style={{color:"#B85400"}}>iPhone</span>: open in <span style={{color:"#B85400"}}>Safari</span> ⬆️ Share → Add to Home Screen<br/>
              On <span style={{color:"#B85400"}}>Android</span>: Chrome menu ⋮ → Add to Home Screen
            </div>
          </div>
        )}
        <div style={{fontSize:12,color:"#5B6878",marginBottom:16}}>Push notifications only work after installing. 🔔</div>
        <button className="btn" onClick={onClose} style={{width:"100%"}}>Got it! ✨</button>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#6B7685",fontSize:12,cursor:"pointer",marginTop:10,fontFamily:"'Inter',sans-serif",textDecoration:"underline"}}>Maybe later</button>
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
          <div style={{fontSize:20,fontWeight:700,color:LF.yellow}}>🔒 Privacy Policy</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5B6878",fontSize:22,cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        <div style={{fontSize:14,color:"#3D4A5C",lineHeight:1.8,display:"flex",flexDirection:"column",gap:16}}>
          <div style={{fontSize:12,color:"#5B6878"}}>Last updated: April 2026</div>

          <div>
            <div style={{fontWeight:700,color:LF.hotpink,marginBottom:6}}>What is Wordcountability?</div>
            Wordcountability is a writing accountability app that helps you and your group track weekly writing goals. It is a personal project, not a commercial product.
          </div>

          <div>
            <div style={{fontWeight:700,color:LF.hotpink,marginBottom:6}}>What information do we collect?</div>
            When you sign in with Google, we receive your name and email address from Google. We store your writing progress, goals, group activity, and chat messages so they sync across your devices.
          </div>

          <div>
            <div style={{fontWeight:700,color:LF.hotpink,marginBottom:6}}>How is your information used?</div>
            Your information is used only to make the app work — syncing your progress, showing your group leaderboard, and enabling group chat. We do not use your data for advertising or marketing.
          </div>

          <div>
            <div style={{fontWeight:700,color:LF.hotpink,marginBottom:6}}>Who can see your data?</div>
            Your writing progress and display name are visible to members of your group. Your email address is never shown to other users. No data is sold or shared with third parties.
          </div>

          <div>
            <div style={{fontWeight:700,color:LF.hotpink,marginBottom:6}}>Data storage</div>
            Your data is stored securely using Google Firebase, which is hosted in the United States. Google's privacy policy applies to their infrastructure.
          </div>

          <div>
            <div style={{fontWeight:700,color:LF.hotpink,marginBottom:6}}>Push Notifications</div>
            If you enable push notifications, a push subscription token is stored in your account and shared with OneSignal, Inc. to enable delivery of notifications to your device. OneSignal does not receive your email address or writing data. OneSignal's privacy policy is available at{" "}
            <a href="https://onesignal.com/privacy" target="_blank" rel="noreferrer" style={{color:LF.lime}}>onesignal.com/privacy</a>.
          </div>

          <div>
            <div style={{fontWeight:700,color:LF.hotpink,marginBottom:6}}>Deleting your data</div>
            You can delete your own data at any time using the "Reset all data" option in the Stakes tab. To request complete account deletion, email us at{" "}
            <a href="mailto:erica.kritt.author@gmail.com" style={{color:LF.lime}}>erica.kritt.author@gmail.com</a>.
          </div>

          <div>
            <div style={{fontWeight:700,color:LF.hotpink,marginBottom:6}}>Contact</div>
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
    <div className="leopard leopard-setup" style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px",fontFamily:"'Inter',sans-serif",color:"#14213D"}}>
      <style>{G}</style><BgCircles/>
      <div style={{maxWidth:380,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:24,textAlign:"center"}}>
        <div className="wordmark" style={{fontSize:"clamp(30px,9vw,40px)"}}><span className="wc">Wordcount</span><span className="ab">ability</span></div>
        <div style={{fontSize:17,color:"#5B6878",fontWeight:500,lineHeight:1.5}}>
          Your writing accountability crew. Sign in to sync across all your devices.
        </div>
        <button className="btn-google" onClick={handleGoogle} disabled={loading}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {loading?"Signing in…":"Continue with Google"}
        </button>
        {error&&<div style={{color:LF.pink,fontWeight:600,fontSize:15}}>{error}</div>}
        <div style={{fontSize:13,color:"#5B6878",lineHeight:1.6}}>
          Your progress syncs across devices using your Google account.<br/>No separate password needed.
        </div>
        <button onClick={onPrivacy} style={{background:"none",border:"none",color:"#5B6878",fontSize:13,cursor:"pointer",fontFamily:"'Inter',sans-serif",textDecoration:"underline"}}>
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
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const ok=name.trim()&&grp.trim()&&gVal&&!saving;

  async function handleGo(){
    if(!ok)return;
    setSaving(true); setError("");
    const result=await onSave({name:name.trim()||"Writer",avatar,goalType:gType,goalValue:parseInt(gVal)||1000,groupId:grp.trim(),isAdmin:false,charity:"",charityName:null});
    // onSave returns an error message if the name is already taken in this group
    if(result?.error){setError(result.error);setSaving(false);}
  }

  return(
    <div className="leopard leopard-setup" style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",padding:"100px 24px 48px",fontFamily:"'Inter',sans-serif",color:"#14213D"}}>
      <style>{G}</style><BgCircles/>
      <div style={{maxWidth:420,width:"100%",display:"flex",flexDirection:"column",gap:16}}>
        <div style={{textAlign:"center",marginBottom:4}}>
          <div className="wordmark" style={{fontSize:"clamp(28px,8vw,36px)"}}><span className="wc">Wordcount</span><span className="ab">ability</span></div>
          <div style={{fontSize:14,color:"#5B6878",marginTop:8}}>Signed in as {user.email}</div>
        </div>

        <div className="card"><span className="lbl">Your Name</span>
          <input className="inp" value={name} onChange={e=>{setName(e.target.value);setError("");}} placeholder="e.g. Alex"/>
          {error&&<div style={{fontSize:14,color:LF.yellow,fontWeight:600,marginTop:8,lineHeight:1.5}}>{error}</div>}
        </div>

        <div className="card"><span className="lbl">Pick Your Player</span>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {AVATARS.map(a=><button key={a} onClick={()=>setAvatar(a)} style={{width:64,height:64,fontSize:30,border:`2px solid ${avatar===a?LF.pink:"#14213D26"}`,borderRadius:16,cursor:"pointer",background:avatar===a?"#8C62D122":"#14213D0d",transition:"all 0.2s",transform:avatar===a?"scale(1.1)":"scale(1)",boxShadow:avatar===a?"0 0 16px #8C62D166":"none"}}>{a}</button>)}
          </div>
        </div>

        <div className="card"><span className="lbl">Weekly Goal Type</span>
          <div className="pill" style={{marginBottom:12}}>
            <button onClick={()=>setGType("words")} style={{background:gType==="words"?"#8C62D1":"transparent",color:gType==="words"?"#fff":"#14213D"}}>✍️ Word Count</button>
            <button onClick={()=>setGType("time")}  style={{background:gType==="time"?"#8C62D1":"transparent",color:gType==="time"?"#fff":"#14213D"}}>⏱️ Time</button>
          </div>
          <input className="inp" type="number" value={gVal} onChange={e=>setGVal(e.target.value)} placeholder={gType==="words"?"e.g. 2000 words":"e.g. 120 minutes"}/>
          {gType==="time"&&<div style={{fontSize:13,color:"#5B6878",marginTop:6}}>Total minutes per week</div>}
        </div>

        <div className="card"><span className="lbl">Group ID</span>
          <input className="inp" value={grp} onChange={e=>setGrp(e.target.value.toLowerCase().replace(/\s/g,""))} placeholder="e.g. unicornwriters" onKeyDown={e=>e.key==="Enter"&&handleGo()}/>
          <div style={{fontSize:13,color:"#5B6878",marginTop:8}}>Everyone with the same Group ID shares a leaderboard &amp; chat. Create a new one or enter an existing one.</div>
        </div>

        <button className="btn btn-sm" onClick={handleGo} style={{fontSize:17,padding:16,opacity:ok?1:0.4}}>
          {saving?"Joining…":"Let's GO! 🚀"}
        </button>
        <button onClick={()=>signOut(auth)} style={{background:"none",border:"none",cursor:"pointer",color:"#5B6878",fontSize:13,fontFamily:"'Inter',sans-serif",textDecoration:"underline"}}>
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
    await apiPost("/api/notify",{toSelf:true,title,body,type});
  }catch{/* silent fail */}
}

// ── SettingsPanel ─────────────────────────────────────────────────
function SettingsPanel({me, uid, db, isAdmin, onClose, onAvatarChange, onSignOut, onOpenAdmin, onOpenPrivacy, onUpdateMe, onStartTour}){
  const [section,setSection]=useState("profile"); // profile | notifications | accolades | about
  const [notifPerms,setNotifPerms]=useState("default"); // default | granted | denied
  const [notifPrefs,setNotifPrefs]=useState(me.notifPrefs||DEFAULT_NOTIF_PREFS);
  const [selectedAvatar,setSelectedAvatar]=useState(me.avatar);
  const [savingAvatar,setSavingAvatar]=useState(false);
  const [enableStatus,setEnableStatus]=useState(null); // null | "enabling" | "success" | "denied"
  const [syncStatus,setSyncStatus]=useState(null); // null | "syncing" | "success" | "failed"
  // Whether THIS device is set up to receive pushes (checked when the panel opens)
  const [hasPlayerId,setHasPlayerId]=useState(true);
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
      // If permission is granted, make sure this device is in the user's device list
      if(s==="granted"){
        const id=await getOneSignalPlayerId();
        if(id)await addDevice(uid,id);
        setHasPlayerId(!!id);
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
      await addDevice(uid,result);
      await onUpdateMe({notifPrefs});
      setHasPlayerId(true);
      return;
    }
    // Permission prompt dismissed without granting
    setEnableStatus(null);
  }

  // Manual sync — re-fetches this device's push ID from OneSignal and adds it to the device list
  async function handleSyncPlayerId(){
    setSyncStatus("syncing");
    // Give OneSignal a moment to fully initialize before asking for the ID
    await new Promise(r=>setTimeout(r,1500));
    const id=await getOneSignalPlayerId();
    if(id){
      await addDevice(uid,id);
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
        <div style={{padding:"20px 20px 14px",borderBottom:"1px solid #14213D0d",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{fontSize:18,fontWeight:700,color:LF.white}}>Settings</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#5B6878",fontSize:22,cursor:"pointer",lineHeight:1,padding:4}}>✕</button>
        </div>

        {/* Section tabs */}
        <div style={{display:"flex",borderBottom:"1px solid #14213D0d",flexShrink:0,overflowX:"auto"}}>
          {[{id:"profile",icon:"👤"},{id:"notifications",icon:"🔔"},{id:"accolades",icon:"🏆"},{id:"about",icon:"ℹ️"}].map(s=>(
            <button key={s.id} onClick={()=>setSection(s.id)} style={{flex:1,background:"none",border:"none",borderBottom:`3px solid ${section===s.id?LF.pink:"transparent"}`,color:section===s.id?LF.pink:"#6B7685",fontFamily:"'Inter',sans-serif",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,padding:"10px 4px",cursor:"pointer",whiteSpace:"nowrap",transition:"color 0.2s"}}>
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
                <div style={{fontSize:18,fontWeight:700,color:LF.white}}>{me.name}</div>
                <div style={{fontSize:13,color:"#5B6878",fontWeight:500,marginTop:2}}>#{me.groupId}</div>
              </div>
              <div style={{marginBottom:16}}>
                <div className="settings-section-title">Change Avatar</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
                  {AVATARS.map(a=>(
                    <button key={a} onClick={()=>setSelectedAvatar(a)} style={{width:52,height:52,fontSize:26,border:`2px solid ${selectedAvatar===a?LF.pink:"#14213D26"}`,borderRadius:14,cursor:"pointer",background:selectedAvatar===a?"#8C62D122":"#14213D0d",transition:"all 0.2s",transform:selectedAvatar===a?"scale(1.1)":"scale(1)",boxShadow:selectedAvatar===a?"0 0 14px #8C62D166":"none"}}>{a}</button>
                  ))}
                </div>
                {selectedAvatar!==me.avatar&&(
                  <button className="btn btn-sm" onClick={handleAvatarSave} disabled={savingAvatar} style={{width:"100%",marginTop:12,fontSize:15}}>
                    {savingAvatar?"Saving…":"Save Avatar ✨"}
                  </button>
                )}
              </div>
              <div style={{borderTop:"1px solid #14213D0d",paddingTop:16,display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={onOpenPrivacy} style={{background:"#14213D0a",border:"1px solid #14213D1f",borderRadius:14,padding:"12px 16px",cursor:"pointer",textAlign:"left",fontFamily:"'Inter',sans-serif",color:"#14213D",fontSize:14,fontWeight:500}}>
                  🔒 Privacy Policy
                </button>
                {isAdmin&&(
                  <button onClick={()=>{onOpenAdmin();onClose();}} style={{background:`linear-gradient(135deg,${LF.yellow}33,${LF.orange}33)`,border:`1px solid ${LF.yellow}44`,borderRadius:14,padding:"12px 16px",cursor:"pointer",textAlign:"left",fontFamily:"'Inter',sans-serif",color:LF.yellow,fontSize:14,fontWeight:600}}>
                    ⚙️ Admin Settings
                  </button>
                )}
                <button onClick={onSignOut} style={{background:"#BF1E4111",border:"1px solid #BF1E4133",borderRadius:14,padding:"12px 16px",cursor:"pointer",textAlign:"left",fontFamily:"'Inter',sans-serif",color:"#BF1E41",fontSize:14,fontWeight:500}}>
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
                  <div style={{background:"#BF1E4111",border:"2px solid #BF1E4133",borderRadius:14,padding:"12px 14px",marginBottom:16}}>
                    <div style={{fontSize:14,fontWeight:600,color:"#BF1E41",marginBottom:4}}>🚫 Notifications blocked</div>
                    <div style={{fontSize:13,color:"#5B6878",fontWeight:500,lineHeight:1.6}}>
                      You've blocked notifications for this site. To re-enable, go to your browser or device Settings → Notifications → Wordcountability and allow notifications.
                    </div>
                  </div>
                ):notifPerms==="granted"?(
                  <div style={{background:"#82B63A11",border:"1px solid #82B63A33",borderRadius:14,padding:"10px 14px",marginBottom:16}}>
                    {hasPlayerId?(
                      <div style={{fontSize:13,color:LF.lime,fontWeight:500}}>✅ Push notifications are enabled</div>
                    ):(
                      <>
                        <div style={{fontSize:13,color:LF.yellow,fontWeight:500,marginBottom:10}}>⚠️ Notifications are allowed but not fully connected. Tap below to finish setup.</div>
                        {syncStatus==="success"&&<div style={{fontSize:13,color:LF.lime,fontWeight:500,marginBottom:8}}>✅ Connected! You're all set.</div>}
                        {syncStatus==="failed"&&<div style={{fontSize:13,color:"#BF1E41",fontWeight:500,marginBottom:8}}>Couldn't connect — try closing and reopening the app, then tap again.</div>}
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
                    <div style={{background:"#14213D08",border:"1px solid #14213D1f",borderRadius:14,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#5B6878",fontWeight:500}}>
                      🔔 Enable push notifications to get writing reminders and group updates on your device.
                    </div>
                    {enableStatus==="success"&&(
                      <div style={{background:"#82B63A11",border:"1px solid #82B63A33",borderRadius:14,padding:"10px 14px",marginBottom:12,fontSize:13,color:LF.lime,fontWeight:500}}>
                        ✅ Notifications enabled! You're all set.
                      </div>
                    )}
                    {enableStatus==="denied"&&(
                      <div style={{background:"#BF1E4111",border:"1px solid #BF1E4133",borderRadius:14,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#BF1E41",fontWeight:500}}>
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
                        <span style={{fontSize:14,color:LF.white,fontWeight:500}}>{label}</span>
                      </div>
                      <label className="toggle">
                        <input type="checkbox" checked={!!notifPrefs[key]} onChange={e=>handleNotifToggle(key,e.target.checked)}/>
                        <span className="toggle-slider"/>
                      </label>
                    </div>

                    {/* Nudge if toggles on but permission not yet granted */}
                    {notifPrefs[key]&&notifPerms==="default"&&(
                      <div style={{fontSize:12,color:LF.hotpink,fontWeight:500,padding:"4px 0 6px 28px"}}>
                        ↑ Tap "Enable Push Notifications" above to activate this.
                      </div>
                    )}

                    {/* Writing reminder sub-options */}
                    {key==="writingReminder"&&notifPrefs.writingReminder&&(
                      <div style={{background:"#14213D06",borderRadius:12,padding:"10px 12px",margin:"6px 0 4px",display:"flex",flexDirection:"column",gap:8}}>
                        {reminderSaved?(
                          <>
                            <div style={{fontSize:13,color:"#0062B1",fontWeight:600}}>
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
                              <div style={{fontSize:12,color:"#5B6878",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Frequency</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                {["Daily","Weekly","Monthly"].map(f=>(
                                  <button key={f} onClick={()=>setReminderFreqDraft(f)} style={{padding:"5px 12px",border:`2px solid ${reminderFreqDraft===f?"#8C62D1":"#14213D26"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:13,background:reminderFreqDraft===f?"#8C62D1":"#fff",color:reminderFreqDraft===f?"#fff":"#14213D",fontWeight:500}}>{f}</button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div style={{fontSize:12,color:"#5B6878",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Time</div>
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
                            <span style={{fontSize:14,color:LF.white,fontWeight:500}}>Progress Check-in</span>
                          </div>
                          <label className="toggle">
                            <input type="checkbox" checked={!!notifPrefs.progressNotif} onChange={e=>handlePrefChange("progressNotif",e.target.checked)}/>
                            <span className="toggle-slider"/>
                          </label>
                        </div>
                        {notifPrefs.progressNotif&&notifPerms==="default"&&(
                          <div style={{fontSize:12,color:LF.hotpink,fontWeight:500,padding:"4px 0 6px 28px"}}>
                            ↑ Tap "Enable Push Notifications" above to activate this.
                          </div>
                        )}
                        {notifPrefs.progressNotif&&(
                          <div style={{background:"#14213D06",borderRadius:12,padding:"10px 12px",margin:"6px 0 4px",display:"flex",flexDirection:"column",gap:8}}>
                            <div style={{fontSize:13,color:"#5B6878",fontWeight:500,lineHeight:1.5}}>
                              A personalised update on where you stand — on track, behind, or crushing it 🎉
                            </div>
                            <div className="notif-row" style={{padding:0}}>
                              <span style={{fontSize:13,color:LF.white,fontWeight:500}}>Combine with writing reminder</span>
                              <label className="toggle">
                                <input type="checkbox" checked={notifPrefs.progressNotifCombined!==false} onChange={e=>{handlePrefChange("progressNotifCombined",e.target.checked);setProgressSaved(false);}}/>
                                <span className="toggle-slider"/>
                              </label>
                            </div>
                            {notifPrefs.progressNotifCombined!==false?(
                              <div style={{fontSize:12,color:"#6B7685",fontWeight:500}}>
                                ✅ Will arrive with your writing reminder ({notifPrefs.reminderFrequency||"Daily"} at {(()=>{const t=notifPrefs.reminderTime||"09:00";const[h,m]=t.split(":");const hr=parseInt(h);return`${hr===0?12:hr>12?hr-12:hr}:${m} ${hr<12?"AM":"PM"}`;})()})
                              </div>
                            ):(
                              progressSaved?(
                                <>
                                  <div style={{fontSize:13,color:"#0062B1",fontWeight:600}}>
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
                                    <div style={{fontSize:12,color:"#5B6878",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Frequency</div>
                                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                      {["Daily","Weekly"].map(f=>(
                                        <button key={f} onClick={()=>setProgressFreqDraft(f)} style={{padding:"5px 12px",border:`2px solid ${progressFreqDraft===f?"#8C62D1":"#14213D26"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:13,background:progressFreqDraft===f?"#8C62D1":"#fff",color:progressFreqDraft===f?"#fff":"#14213D",fontWeight:500}}>{f}</button>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{fontSize:12,color:"#5B6878",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Time</div>
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
                      <div style={{background:"#14213D06",borderRadius:12,padding:"10px 12px",margin:"6px 0 4px"}}>
                        <div style={{fontSize:12,color:"#5B6878",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Frequency</div>
                        <div style={{display:"flex",gap:6}}>
                          {["Every message","Digest"].map(f=>(
                            <button key={f} onClick={()=>handlePrefChange("chatFrequency",f)} style={{padding:"5px 12px",border:`2px solid ${notifPrefs.chatFrequency===f?"#8C62D1":"#14213D26"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:13,background:notifPrefs.chatFrequency===f?"#8C62D1":"#fff",color:notifPrefs.chatFrequency===f?"#fff":"#14213D",fontWeight:500}}>{f}</button>
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
                <div style={{fontSize:18,fontWeight:700,color:LF.yellow,marginBottom:8}}>Accolades</div>
                <div style={{fontSize:14,color:"#5B6878",fontWeight:500,lineHeight:1.6}}>
                  Earn badges as you write, hit goals, and show up for your crew. Coming soon!
                </div>
              </div>
            </div>
          )}

          {/* ── ABOUT ── */}
          {section==="about"&&(
            <div className="settings-section" style={{paddingTop:20,display:"flex",flexDirection:"column",gap:12}}>
              <div className="card" style={{border:`2px solid ${LF.purple}44`}}>
                <div style={{fontSize:15,fontWeight:700,color:LF.hotpink,marginBottom:14}}>About Wordcountability</div>
                <div style={{fontSize:14,color:"#5B6878",fontWeight:500,lineHeight:1.8}}>
                  <p style={{margin:"0 0 12px"}}>Wordcountability is a space to help writers do the hardest part — put words on the page.</p>
                  <p style={{margin:"0 0 16px"}}>This app motivates writing groups to write, whether in short sprints or building consistent habits.</p>

                  <div style={{fontSize:13,color:LF.hotpink,fontWeight:700,textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>How it works</div>
                  <p style={{margin:"0 0 12px"}}>Users get a signup link from an admin or enter a group code. The admin in consultation with the group can set the challenge parameters, like how long it will last, how many there'll be, and how many you can miss before you don't meet your goal.</p>
                  <p style={{margin:"0 0 16px"}}>But it's not just fun and games, Wordcountability wants you to put your money where your words are.</p>

                  <p style={{margin:"0 0 8px"}}>Groups can have one of three options:</p>
                  <ul style={{margin:"0 0 12px",paddingLeft:18,display:"flex",flexDirection:"column",gap:6}}>
                    <li>Those who meet their goals get to split the money of those who didn't.</li>
                    <li>The admin can consult with those who made their goals to choose which charity to donate the money of those who didn't.</li>
                    <li>And if you don't want to put money on the line, you can play "To the Pain" where those who make their goals get to chide those who didn't.</li>
                  </ul>
                  <p style={{margin:"0 0 12px"}}>On top of that, groups can also set parameters for recognizing top performers.</p>
                  <p style={{margin:"0 0 16px"}}>The app has built-in notifications, a chat feature, and a dashboard to keep up to date with where you stand.</p>

                  <div style={{fontSize:13,color:LF.hotpink,fontWeight:700,textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>Understanding Goals</div>
                  <p style={{margin:"0 0 12px"}}>Users have two options — they can set their goal as a weekly word count, or as a weekly amount of time spent on their works in progress.</p>
                  <p style={{margin:"0 0 20px"}}>Let's say you have a challenge that lasts a month with weekly check-ins, and you pledge to write 5,000 words a week. That means you can log your progress each day, but if it doesn't add up to 5,000 by the end of the week — you did not meet your goal.</p>

                  <p style={{margin:"0 0 20px"}}>Your goal is always set as a weekly target — but your progress is tracked against your current check-in period. So if your group has a two-week check-in, your target for that period is double your weekly goal. If there's no active challenge, progress resets each week as usual.</p>

                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <button onClick={()=>{onStartTour();onClose();}} style={{background:"#6D47B5",border:"none",borderRadius:14,padding:"10px 20px",color:"#fff",fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:600,cursor:"pointer",textAlign:"center"}}>
                      🌈 Take a tour of the app
                    </button>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:13,color:"#6B7685",fontWeight:500}}>Check out our FAQs</span>
                      <span style={{fontSize:13,color:LF.purple,fontWeight:500}}> — Coming soon</span>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <a href="mailto:erica.kritt.author@gmail.com" style={{fontSize:13,color:LF.hotpink,fontWeight:600,textDecoration:"underline"}}>Reach out to Erica the developer</a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="card" style={{border:`2px solid ${LF.purple}44`}}>
                <div style={{fontSize:15,fontWeight:700,color:LF.hotpink,marginBottom:8}}>About the Developer</div>
                <div style={{fontSize:14,color:"#5B6878",fontWeight:500,lineHeight:1.7,fontStyle:"italic"}}>Content coming soon 🌈</div>
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
        <div style={{padding:"20px 20px 14px",borderBottom:"1px solid #14213D0d",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{fontSize:18,fontWeight:700,color:LF.white}}>Notifications{unread>0&&<span style={{background:"#8C62D1",color:"#fff",fontSize:12,fontWeight:600,padding:"2px 8px",borderRadius:20,marginLeft:8}}>{unread}</span>}</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {unread>0&&<button onClick={onMarkAllRead} style={{background:"none",border:"none",color:LF.hotpink,fontSize:12,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:600,textDecoration:"underline"}}>Mark all read</button>}
            <button onClick={onClose} style={{background:"none",border:"none",color:"#5B6878",fontSize:22,cursor:"pointer",lineHeight:1,padding:4}}>✕</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
          {notifications.length===0?(
            <div style={{textAlign:"center",padding:"48px 24px",color:"#5B6878",fontSize:14,fontWeight:500}}>
              <div style={{fontSize:40,marginBottom:12}}>🔔</div>
              No notifications yet
            </div>
          ):(
            notifications.map(n=>(
              <div key={n.id} style={{padding:"12px 20px",borderBottom:"1px solid #14213D08",background:n.read?"transparent":"#8C62D108",display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{fontSize:20,flexShrink:0,marginTop:2}}>
                  {n.type==="writingReminder"?"✍️":n.type==="checkInWarning"?"⏰":n.type==="missedCheckIn"?"💔":n.type==="challengeStarting"?"🚀":n.type==="memberHitGoal"?"🌟":n.type==="newPoll"?"📊":n.type==="pollClosingSoon"?"⏳":"💬"}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:n.read?700:900,color:n.read?"#5B6878":LF.white,marginBottom:2}}>{n.title}</div>
                  <div style={{fontSize:13,color:"#6B7685",fontWeight:500,lineHeight:1.5}}>{n.body}</div>
                  <div style={{fontSize:11,color:"#8A94A3",fontWeight:500,marginTop:4}}>{fmtDate(n.ts)}</div>
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
  const [noAccount,setNoAccount]=useState(false); // true only after confirming no user doc exists
  const [me,setMe]=useState(null);
  const [history,setHistory]=useState([]);
  const [members,setMembers]=useState([]);
  const [adminUids,setAdminUids]=useState([]); // account IDs of this group's admins
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
  const [showTour,setShowTour]=useState(false);
  const [tourStep,setTourStep]=useState(0);
  const pwaAfterTour=useRef(false); // true when the install prompt should follow the first-run tour
  const [inAppNotifs,setInAppNotifs]=useState([]);
  // timer
  const [timerRunning,setTimerRunning]=useState(false);
  const [timerSecs,setTimerSecs]=useState(0);
  const [timerSessions,setTimerSessions]=useState([]);
  const timerRef=useRef(null);
  // Wall-clock refs for sleep-safe timer — stores when Start/Resume was pressed and how many
  // seconds were already on the clock before the current run (for Resume support).
  const timerStartedAt=useRef(null);
  const timerBaseSecs=useRef(0);
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
  // group check-in history for Stats tab — loaded on demand when Stats tab is opened
  const [groupCheckIns,setGroupCheckIns]=useState(null); // null = not yet loaded
  // check-in results pop-up — set after a deadline passes, cleared on acknowledge
  const [checkInPopup,setCheckInPopup]=useState(null);
  // check-in payment recording (admin only, within 48h of a deadline)
  // charityRows: [{name, amount}] — one row per charity
  // payoutRows:  [{memberName, avatar, amount}] — one row per member, negative = paid out
  const [paymentRows,setPaymentRows]=useState([]); // charity or payout rows depending on mode
  const [paymentSaving,setPaymentSaving]=useState(false);
  const [paymentSaved,setPaymentSaved]=useState(false); // true briefly after a successful save

  useEffect(()=>{
    if(authUser===null){setReady(false);setNoAccount(false);setMe(null);setHistory([]);setMembers([]);setMessages([]);setPolls([]);}
    if(authUser?.uid){loadAll(authUser.uid);}
  },[authUser?.uid]);
  useEffect(()=>()=>clearInterval(timerRef.current),[]);
  // During the app tour, show the tab each step is describing
  useEffect(()=>{if(showTour)setTab(TOUR_STEPS[tourStep]?.tab||"Dashboard");},[showTour,tourStep]);

  // When the screen wakes up (visibilitychange → visible), immediately recalculate the timer
  // from the wall clock. This corrects for the browser throttling the interval while the
  // screen was off — without this, the timer can appear frozen or only advance a few seconds.
  useEffect(()=>{
    function handleVisibility(){
      if(document.visibilityState==="visible"&&timerStartedAt.current!==null){
        const elapsed=timerBaseSecs.current+Math.floor((Date.now()-timerStartedAt.current)/1000);
        setTimerSecs(elapsed);
      }
    }
    document.addEventListener("visibilitychange",handleVisibility);
    return()=>document.removeEventListener("visibilitychange",handleVisibility);
  },[]);
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

  // Load group check-in history the first time the user opens the Stats tab.
  // groupCheckIns===null means not yet loaded; only fetch once per session.
  // Does not gate on members.length — fetches members itself if the list isn't ready yet.
  useEffect(()=>{
    if(tab==="Stats"&&groupCheckIns===null&&uid&&me?.groupId){
      loadGroupCheckIns(members,uid,history,me.groupId);
    }
  },[tab,uid,me?.groupId]);

  async function loadAll(uid){
    try{
      const meVal=await fsGet(userDocRef(uid));
      if(!meVal){setNoAccount(true);setReady(true);return;}
      let d=JSON.parse(meVal);
      const wk=getWeekKey();
      // Register as a group member first: the database only lets members read group data
      if(d.groupId){await fsSet(memberUidDocRef(d.groupId,uid),JSON.stringify({uid,joinedAt:Date.now()}));}
      // Always load admin data first so we can check challenge state
      let adminData=null;
      if(d.groupId){
        try{const av=await fsGet(adminDocRef(d.groupId));if(av)adminData=JSON.parse(av);}catch{}
      }
      // ── Reset logic ──
      // When a challenge is active: reset on check-in deadlines only, never on Monday.
      // When no challenge: fall back to Monday-based weekly reset.
      //
      // lastResetWeek stores either:
      //   - a deadline timestamp (number) when a challenge has been active, or
      //   - a Monday date string "YYYY-MM-DD" for the legacy weekly reset
      // We detect which by checking typeof.

      // Snapshot progress BEFORE any reset — used by the check-in pop-up below
      const progressSnapshot=d.progressThisWeek||0;
      // Progress to show in the pop-up for the latest check-in (changes below if check-ins were skipped)
      let popupProgress=progressSnapshot;

      const cadDaysR=adminData?.frequency==="Daily"?1:adminData?.frequency==="Weekly"?7:adminData?.frequency==="Bi-Weekly"?14:30;
      const cadMsR=cadDaysR*86400000;
      const nowMsR=Date.now();

      // Build list of all past deadlines if challenge is configured
      function getPastDeadlines(ad){
        if(!ad?.firstCheckIn||!ad?.startDate)return[];
        const start=new Date(ad.startDate).getTime();
        const end=ad.endDate?new Date(ad.endDate).getTime():Infinity;
        if(nowMsR<start)return[]; // challenge hasn't started yet
        const cad=ad.frequency==="Daily"?1:ad.frequency==="Weekly"?7:ad.frequency==="Bi-Weekly"?14:30;
        const cadMs=cad*86400000;
        const firstCI=new Date(ad.firstCheckIn).getTime();
        const deadlines=[];
        let cur=firstCI;
        while(cur<=end&&cur<=nowMsR){deadlines.push(cur);cur+=cadMs;}
        return deadlines;
      }

      const pastDeadlines=getPastDeadlines(adminData);
      const challengeActive=pastDeadlines.length>0||
        (adminData?.startDate&&nowMsR>=new Date(adminData.startDate).getTime()&&
         adminData?.firstCheckIn&&nowMsR<new Date(adminData.firstCheckIn).getTime());

      // ── Fetch history and check-in acks in parallel — neither depends on the other ──
      // For the reset logic we need history, and for the pop-up we need acks.
      // Firing both at once saves one full round-trip to Firebase.
      const [histValParallel, acksValParallel] = await Promise.all([
        fsGet(historyDocRef(uid)),
        pastDeadlines.length>0 ? fsGet(checkInAcksDocRef(uid)) : Promise.resolve(null),
      ]);

      if(challengeActive&&pastDeadlines.length>0){
        // ── Challenge mode: deadline-based reset ──────────────────
        const latestDeadline=pastDeadlines[pastDeadlines.length-1];
        const lastReset=typeof d.lastResetWeek==="number"?d.lastResetWeek:0;
        if(latestDeadline>lastReset){
          // One or more deadlines have passed since the last reset — record each one and reset progress.
          // If the user already had a check-in recorded, every deadline since then gets its own entry:
          // the progress logged so far counts toward the earliest one, and any later ones they skipped
          // (didn't open the app) are recorded as missed with 0. For someone with no earlier check-in
          // (e.g. joined mid-challenge), only the latest deadline is recorded, so they aren't charged
          // for check-ins from before they joined.
          const hist=histValParallel?JSON.parse(histValParallel):[];
          const periodGoalR=periodGoalFor(d.goalValue,cadDaysR);
          const pending=typeof d.lastResetWeek==="number"
            ?pastDeadlines.filter(dl=>dl>lastReset)
            :[latestDeadline];
          const newEntries=pending.map((dl,i)=>{
            const progress=i===0?d.progressThisWeek:0;
            const periodNum=pastDeadlines.indexOf(dl)+1;
            const label=`Check-in ${periodNum} — ${new Date(dl).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`;
            return{week:label,progress,goal:periodGoalR,goalType:d.goalType,met:progress>=periodGoalR,isCheckIn:true,deadlineMs:dl};
          });
          popupProgress=newEntries[newEntries.length-1].progress;
          const upd=[...newEntries.reverse(),...hist].slice(0,40);
          await fsSet(historyDocRef(uid),JSON.stringify(upd));
          setHistory(upd);
          d={...d,progressThisWeek:0,dailyChecks:[false,false,false,false,false,false,false],lastResetWeek:latestDeadline};
          await fsSet(userDocRef(uid),JSON.stringify(d));
          await pub(d,uid);
        } else {
          // Already reset for this deadline — use pre-fetched history
          setHistory(histValParallel?JSON.parse(histValParallel):[]);
        }
      } else if(!challengeActive){
        // ── No active challenge: Monday-based weekly reset ────────
        // lastResetWeek may be a timestamp (number) or a date string — normalise to string for comparison
        const lastResetStr=typeof d.lastResetWeek==="number"
          ?new Date(d.lastResetWeek).toISOString().slice(0,10)
          :(d.lastResetWeek||"");
        if(normalizeWeekKey(lastResetStr)!==wk){
          const hist=histValParallel?JSON.parse(histValParallel):[];
          const met=d.progressThisWeek>=d.goalValue;
          const upd=[{week:d.lastResetWeek||wk,progress:d.progressThisWeek,goal:d.goalValue,goalType:d.goalType,met},...hist].slice(0,40);
          await fsSet(historyDocRef(uid),JSON.stringify(upd));
          setHistory(upd);
          d={...d,progressThisWeek:0,dailyChecks:[false,false,false,false,false,false,false],lastResetWeek:wk};
          await fsSet(userDocRef(uid),JSON.stringify(d));
          await pub(d,uid);
        } else {
          // Use pre-fetched history
          setHistory(histValParallel?JSON.parse(histValParallel):[]);
        }
      } else {
        // Challenge configured but no deadlines passed yet — use pre-fetched history
        setHistory(histValParallel?JSON.parse(histValParallel):[]);
      }
      // ── Check-in pop-up: show personalised result if a deadline passed since last ack ──
      // Uses pastDeadlines already computed above, and progressSnapshot taken before any reset.
      // Acknowledgements stored in Firebase survive reinstalls and sync across devices.
      try{
        if(pastDeadlines.length>0){
          const latestDeadline=pastDeadlines[pastDeadlines.length-1];
          const acks=acksValParallel?JSON.parse(acksValParallel):{acknowledgedDeadlines:[]};
          const alreadyAcked=(acks.acknowledgedDeadlines||[]).includes(latestDeadline);
          if(!alreadyAcked){
            const periodNum2=pastDeadlines.length;
            const totalPeriods2=adminData.endDate?Math.round((new Date(adminData.endDate).getTime()-new Date(adminData.startDate).getTime())/(cadDaysR*86400000)):null;
            const remainingCI=totalPeriods2?Math.max(0,totalPeriods2-periodNum2):null;
            const periodGoal2=periodGoalFor(d.goalValue,cadDaysR);
            setCheckInPopup({
              deadlineMs:latestDeadline,
              periodNum:periodNum2,
              totalPeriods:totalPeriods2,
              remainingCheckIns:remainingCI,
              progress:popupProgress, // progress for the latest check-in, taken before reset
              goal:periodGoal2,
              goalType:d.goalType,
            });
          }
        }
      }catch(e){console.warn("checkInPopup",e);}

      // ── Render the app immediately — remaining work runs in the background ──
      // setReady(true) is called here so the Dashboard appears as soon as the user's
      // own data is ready. Member docs, notifications, and group data load silently after.
      setMe(d); setGoalInput(String(d.goalValue)); setGoalTypeEdit(d.goalType);
      if(adminData){setAdmin(adminData);setAdminDraft(adminData);}
      setReady(true);

      // ── Background loads — run in parallel after the app is already visible ──
      initOneSignal();
      writeUserIndex(uid,d);
      // If this device already allows notifications, make sure it's in the device list
      getNotifPermissionState().then(s=>s==="granted"?getOneSignalPlayerId():null).then(id=>addDevice(uid,id)).catch(()=>{});

      // Fetch notifications and check member doc existence simultaneously
      const [notifVal] = await Promise.all([
        fsGet(notifDocRef(uid)),
        // Make sure this member's card exists under their account ID, and remove their
        // older card saved under their first name (only if that card is theirs)
        d.groupId&&d.name
          ? fsGet(memberDocRef(d.groupId,uid))
              .then(memberVal=>{ if(!memberVal) return pub(d,uid); })
              .then(()=>fsGet(legacyMemberDocRef(d.groupId,d.name)))
              .then(oldVal=>{ if(oldVal&&JSON.parse(oldVal).uid===uid) return fsDel(legacyMemberDocRef(d.groupId,d.name)); })
              .catch(()=>{})
          : Promise.resolve(),
      ]);
      if(notifVal)setInAppNotifs(JSON.parse(notifVal));

      // Kick off all group data loads in parallel — none depend on each other
      if(d.groupId){
        loadMembers(d.groupId);
        loadAdmins(d.groupId);
        loadChat(d.groupId);
        loadPolls(d.groupId);
        if(!adminData){loadAdminData(d.groupId);}
        loadLedger(d.groupId);
      }
    }catch(e){console.error("loadAll",e);setReady(true);}
  }

  async function pub(d,uidArg){
    if(!d?.groupId)return;
    try{
      await fsSet(memberDocRef(d.groupId,uidArg||uid),JSON.stringify({
        name:d.name,avatar:d.avatar,goalValue:d.goalValue,goalType:d.goalType,
        progressThisWeek:d.progressThisWeek,isAdmin:d.isAdmin,charity:d.charity,
        charityName:d.charityName||null,totalProgress:d.totalProgress||0,
        uid:uidArg||uid,updatedAt:Date.now()
      }));
      // Keep the reminder job's copy current so its progress messages use today's numbers
      writeUserIndex(uidArg||uid,d);
    }catch(e){console.warn("pub",e);}
  }

  async function loadMembers(gid){
    try{
      const snap=await getDocs(membersColRef(gid));
      const ms=[];
      snap.forEach(d=>{try{const m=JSON.parse(d.data().value);ms.push({...m,isYou:m.uid===uid});}catch{}});
      setMembers(dedupeMembers(ms));
    }catch{}
  }
  async function loadAdmins(gid){
    try{const snap=await getDocs(adminUidsColRef(gid));setAdminUids(snap.docs.map(d=>d.id));}catch{}
  }
  async function loadChat(gid){try{const v=await fsGet(chatDocRef(gid));setMessages(v?JSON.parse(v):[]);}catch{}}
  async function loadPolls(gid){try{const v=await fsGet(pollsDocRef(gid));setPolls(v?JSON.parse(v):[]);}catch{}}
  async function loadAdminData(gid){try{const v=await fsGet(adminDocRef(gid));if(v){const a=JSON.parse(v);setAdmin(a);setAdminDraft(a);}}catch{}}
  async function loadLedger(gid){try{const v=await fsGet(ledgerDocRef(gid));if(v)setLedger(JSON.parse(v));}catch{}}

  // Loads each member's personal history from Firebase and assembles group check-in cards.
  // Called once when the user first opens the Stats tab.
  // Groups entries by deadlineMs so all members' results for the same check-in appear together.
  async function loadGroupCheckIns(allMembers,myUid,myHistory,groupId){
    try{
      // If members haven't loaded into state yet, fetch them directly from Firestore
      let resolvedMembers=allMembers;
      if((!resolvedMembers||resolvedMembers.length===0)&&groupId){
        try{
          const snap=await getDocs(membersColRef(groupId));
          const ms=[];
          snap.forEach(d=>{try{ms.push(JSON.parse(d.data().value));}catch{}});
          // Mark current user by account ID
          resolvedMembers=dedupeMembers(ms).map(m=>({...m,isYou:m.uid===myUid}));
        }catch{}
      }

      // Build a uid→member map from loaded members (those whose uid was written by pub())
      // Include the current user using their known uid and already-loaded history
      const byDeadline={}; // deadlineMs → { label, periodNum, entries:[] }

      // Helper: fold one member's history into byDeadline
      function foldHistory(memberMeta,hist){
        (hist||[]).filter(h=>h.isCheckIn&&h.deadlineMs).forEach(h=>{
          if(!byDeadline[h.deadlineMs]){
            byDeadline[h.deadlineMs]={
              deadlineMs:h.deadlineMs,
              label:h.week||`Check-in`,
              entries:[]
            };
          }
          byDeadline[h.deadlineMs].entries.push({
            name:memberMeta.name,
            avatar:memberMeta.avatar,
            goalType:h.goalType,
            progress:h.progress,
            goal:h.goal,
            met:h.met,
            isYou:memberMeta.uid===myUid
          });
        });
      }

      // Add current user's history (already in memory — no fetch needed)
      const meInList=resolvedMembers.find(m=>m.isYou);
      if(meInList){foldHistory({...meInList,uid:myUid},myHistory);}

      // Other members' history is private, so the server checks we're in the group and
      // returns just their check-in results
      try{
        const res=await apiPost("/api/group-checkins",{groupId});
        if(res.ok){
          const {members:groupMembers}=await res.json();
          (groupMembers||[]).filter(m=>m.uid!==myUid).forEach(m=>foldHistory(m,m.checkIns));
        }
      }catch{}

      // Sort check-ins most recent first; sort members within each by name for consistency
      const sorted=Object.values(byDeadline)
        .sort((a,b)=>b.deadlineMs-a.deadlineMs)
        .map(ci=>({...ci,entries:[...ci.entries].sort((a,b)=>a.name.localeCompare(b.name))}));

      setGroupCheckIns(sorted);
    }catch{
      setGroupCheckIns([]); // fail gracefully — show empty rather than spinner forever
    }
  }

  async function handleSetup({name,avatar,goalType,goalValue,groupId,isAdmin,charity,charityName}){
    // Join the group first (the database only lets members see the member list), then make
    // sure nobody else in the group already uses this name. If they do, leave the group again
    // and ask for a different name.
    await fsSet(memberUidDocRef(groupId,uid),JSON.stringify({uid,joinedAt:Date.now()}));
    try{
      const snap=await getDocs(membersColRef(groupId));
      const taken=[];
      snap.forEach(docSnap=>{try{taken.push(JSON.parse(docSnap.data().value));}catch{}});
      const clash=taken.some(m=>m.uid!==uid&&(m.name||"").trim().toLowerCase()===name.trim().toLowerCase());
      if(clash){
        await fsDel(memberUidDocRef(groupId,uid));
        return{error:`Someone in this group already goes by "${name}". Please add a middle or last initial (like "${name} R.") or use a nickname.`};
      }
      // Brand-new group (nobody else in it): the creator becomes its admin. The database only
      // allows this for whoever creates the group record, so nobody can claim an existing group.
      if(!taken.some(m=>m.uid!==uid)){
        try{
          await setDoc(groupDocRef(groupId),{createdBy:uid,createdAt:Date.now()});
          await setDoc(adminUidDocRef(groupId,uid),{value:JSON.stringify({uid,addedBy:uid,at:Date.now()})});
        }catch(e){console.warn("group admin setup",e);}
      }
    }catch(e){console.warn("name check",e);}
    const d={name,avatar,goalType,goalValue,groupId,isAdmin:false,charity:"",charityName:null,
      progressThisWeek:0,totalProgress:0,dailyChecks:[false,false,false,false,false,false,false],lastResetWeek:getWeekKey()};
    setMe(d); setGoalInput(String(goalValue)); setGoalTypeEdit(goalType); setNoAccount(false); setReady(true);
    await fsSet(userDocRef(uid),JSON.stringify(d));
    writeUserIndex(uid,d).catch(()=>{});
    pub(d).catch(()=>{});
    loadMembers(groupId); loadAdmins(groupId); loadChat(groupId); loadPolls(groupId); loadAdminData(groupId); loadLedger(groupId);
    // First visit: show the app tour first, then the "Install the app" prompt once the tour ends
    // (they used to open at the same time, stacked on top of each other)
    const needPwa=!localStorage.getItem("pwaPromptShown"), needTour=!localStorage.getItem("appTourShown");
    if(needTour){setShowTour(true);setTourStep(0);localStorage.setItem("appTourShown","1");pwaAfterTour.current=needPwa;}
    else if(needPwa){setShowPwaPrompt(true);}
    if(needPwa)localStorage.setItem("pwaPromptShown","1");
  }

  async function saveProgress(n){
    if(!n||n<=0||!me)return;
    const checks=[...me.dailyChecks]; checks[todayIdx()]=true;
    const newTotal=(me.totalProgress||0)+n;
    const newWeekProgress=me.progressThisWeek+n;
    const upd={...me,progressThisWeek:newWeekProgress,totalProgress:newTotal,dailyChecks:checks};
    setMe(upd); triggerSpark();
    fsSet(userDocRef(uid),JSON.stringify(upd)); pub(upd);
    loadMembers(me.groupId); updateLedgerProgress(n);
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

  function startTimer(){
    if(timerRunning)return;
    // Record wall-clock start time and how many secs were already on the clock (for Resume)
    timerStartedAt.current=Date.now();
    timerBaseSecs.current=timerSecs;
    setTimerRunning(true);
    timerRef.current=setInterval(()=>{
      // Calculate true elapsed time from wall clock — survives phone sleep
      const elapsed=timerBaseSecs.current+Math.floor((Date.now()-timerStartedAt.current)/1000);
      setTimerSecs(elapsed);
    },1000);
  }
  // Seconds on the clock right now: worked out from the wall clock while running, so it's
  // exact even if the phone was asleep; when stopped or paused, it's whatever was locked in.
  function timerElapsedNow(){
    return timerStartedAt.current!==null
      ?timerBaseSecs.current+Math.floor((Date.now()-timerStartedAt.current)/1000)
      :timerSecs;
  }
  // Stops the clock. Clearing the start time matters: without it, coming back to the app
  // (which re-syncs the timer from the start time) made a paused timer jump ahead.
  function haltTimer(){
    const secs=timerElapsedNow();
    clearInterval(timerRef.current);
    timerStartedAt.current=null;
    timerBaseSecs.current=secs;
    setTimerRunning(false);
    return secs;
  }
  function pauseTimer(){
    setTimerSecs(haltTimer());
  }
  function resetTimer(){
    haltTimer();
    timerBaseSecs.current=0;
    setTimerSecs(0);
  }
  async function stopAndSave(){
    const secs=haltTimer();
    timerBaseSecs.current=0;
    setTimerSecs(0);
    if(secs<60)return;
    const mins=Math.round(secs/60);
    setTimerSessions(s=>[...s,{mins,ts:Date.now()}]);
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
    loadMembers(me.groupId);
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
    loadMembers(me.groupId);
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
      const res=await apiPost("/api/fetch-title",{url});
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
    const nowCharity=upd.payoutMode==="charity";
    setAdmin(upd); setAdminDraft(upd); setShowAdmin(false);
    const adminSaved=fsSet(adminDocRef(me.groupId),JSON.stringify(upd));
    // If switching to charity mode and admin hasn't picked yet, show picker
    if(nowCharity&&(!me.charityName)&&!isLocked){
      setShowCharityModal(true);
    }
    // Schedule push notifications for all group members based on the new challenge settings.
    // This cancels any previously scheduled notifications and schedules fresh ones.
    // Silent fail — notifications are a nice-to-have and should never block the admin save.
    // Waits for the settings to save first, since the server reads them from the database.
    adminSaved.then(()=>apiPost("/api/schedule-notifications",{groupId:me.groupId})).catch(()=>{});
  }

  // Admins can make another member an admin from the Group tab
  async function makeAdmin(member){
    if(!member?.uid||!window.confirm(`Make ${member.name} an admin? They'll be able to change challenge settings and record payments.`))return;
    try{
      await setDoc(adminUidDocRef(me.groupId,member.uid),{value:JSON.stringify({uid:member.uid,addedBy:uid,at:Date.now()})});
      loadAdmins(me.groupId);
    }catch(e){console.warn("makeAdmin",e);alert("Couldn't make them an admin. Please try again.");}
  }

  // Closes the app tour (finished or skipped), returns to Today, and shows the install
  // prompt next if this was a new member's first visit
  function endTour(){
    setShowTour(false); setTab("Dashboard");
    if(pwaAfterTour.current){pwaAfterTour.current=false;setShowPwaPrompt(true);}
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

  // Records check-in payments (charity or payout) within 48h of the most recent deadline.
  // Each row gets a checkInMs field so Stats can attach it to the right check-in card.
  async function recordCheckInPayments(checkInMs){
    if(!me?.groupId||paymentSaving)return;
    // Filter out blank/zero rows before saving
    const validRows=paymentRows.filter(r=>{
      const amt=parseFloat(r.amount);
      return !isNaN(amt)&&amt!==0&&(r.name||r.memberName||"").trim();
    });
    if(validRows.length===0)return;
    setPaymentSaving(true);
    try{
      const v=await fsGet(ledgerDocRef(me.groupId));
      const l=v?JSON.parse(v):{charityTotals:{},payoutTotals:{},prizeTotals:{},totalWords:0,totalMinutes:0,entries:[]};
      if(!l.prizeTotals)l.prizeTotals={};
      const now=Date.now();
      for(const row of validRows){
        const amt=parseFloat(row.amount);
        if(admin.payoutMode==="charity"){
          // Charity mode: row = { name: charityName, amount }
          const charityKey=row.name.trim();
          const entry={id:now+Math.random(),type:"charity",name:charityKey,charityName:charityKey,amount:amt,charity:"",recordedBy:me.name,ts:now,checkInMs};
          l.entries=[...(l.entries||[]),entry];
          l.charityTotals[charityKey]=(l.charityTotals[charityKey]||0)+amt;
        } else {
          // Payout mode: row = { memberName, avatar, amount } — positive=received, negative=paid
          const memberKey=row.memberName.trim();
          const entry={id:now+Math.random(),type:"payout",name:memberKey,amount:amt,charity:"",recordedBy:me.name,ts:now,checkInMs};
          l.entries=[...(l.entries||[]),entry];
          l.payoutTotals[memberKey]=(l.payoutTotals[memberKey]||0)+amt;
        }
      }
      await fsSet(ledgerDocRef(me.groupId),JSON.stringify(l));
      setLedger(l);
      setPaymentSaved(true);
      // Reload Stats check-in history so the new payments appear immediately
      setGroupCheckIns(null);
      setTimeout(()=>setPaymentSaved(false),3000);
    }catch(e){console.warn("recordCheckInPayments",e);}
    finally{setPaymentSaving(false);}
  }

  function sendMessage(){
    if(!chatInput.trim()||!me)return;
    const msg={id:Date.now(),author:me.name,avatar:me.avatar,text:chatInput.trim(),ts:Date.now(),reactions:{}};
    setMessages(prev=>[...prev,msg].slice(-200)); setChatInput("");
    fsUpdateList(chatDocRef(me.groupId),cur=>[...cur,msg].slice(-200))
      .then(latest=>{if(latest)setMessages(latest);});
  }

  function addReaction(msgId,emoji){
    const toggle=list=>list.map(m=>{
      if(m.id!==msgId)return m;
      const r={...m.reactions}; if(!r[emoji])r[emoji]=[];
      r[emoji]=r[emoji].includes(me.name)?r[emoji].filter(n=>n!==me.name):[...r[emoji],me.name];
      return {...m,reactions:r};
    });
    setMessages(toggle(messages));
    fsUpdateList(chatDocRef(me.groupId),toggle).then(latest=>{if(latest)setMessages(latest);});
  }

  function submitPoll(){
    if(!pollQ.trim()||pollOpts.filter(o=>o.trim()).length<2)return;
    const poll={id:Date.now(),question:pollQ.trim(),options:pollOpts.filter(o=>o.trim()).map(o=>({text:o.trim(),votes:[]})),author:me.name,ts:Date.now(),deadline:pollDeadline||null};
    setPolls(prev=>[...prev,poll]); setPollQ(""); setPollOpts(["",""]); setPollDeadline(""); setShowPollForm(false);
    savePolls(cur=>[...cur,poll]);
    notifyNewPoll(poll.question);
    // If a deadline was set, schedule a "poll closing soon" push 24h before it fires.
    // Silent fail — should never block the poll submission.
    if(poll.deadline&&me.groupId){
      const deadlineMs=new Date(poll.deadline).getTime();
      if(!isNaN(deadlineMs)&&deadlineMs>Date.now()){
        apiPost("/api/notify",{
            groupId:me.groupId,
            notifType:"pollClosingSoon",
            pollQuestion:poll.question,
            pollDeadlineMs:deadlineMs,
          }).catch(()=>{});
      }
    }
  }
  function deletePoll(pollId){
    if(!window.confirm("Delete this poll?"))return;
    const remove=list=>list.filter(p=>p.id!==pollId);
    setPolls(remove(polls)); savePolls(remove);
  }
  function votePoll(pollId,optIdx){
    const vote=list=>list.map(p=>{
      if(p.id!==pollId)return p;
      const opts=p.options.map((o,i)=>{const v=o.votes.filter(n=>n!==me.name);return i===optIdx?{...o,votes:[...v,me.name]}:{...o,votes:v};});
      return {...p,options:opts};
    });
    setPolls(vote(polls)); savePolls(vote);
  }
  function overridePollResult(pollId,winnerText){
    const override=list=>list.map(p=>p.id===pollId?{...p,adminOverride:winnerText,overriddenBy:me.name,overriddenAt:Date.now()}:p);
    setPolls(override(polls)); savePolls(override);
  }
  // Applies a poll change to the latest saved polls, then shows the up-to-date list
  function savePolls(change){
    fsUpdateList(pollsDocRef(me.groupId),change).then(latest=>{if(latest)setPolls(latest);});
  }

  async function handleReset(){
    if(!window.confirm("Reset ALL your data? This can't be undone. 😱"))return;
    // Deletes only this user's own data. Shared group data (chat, polls, admin settings,
    // ledger, other members' cards) is left alone so one member can't wipe the whole group.
    await fsDel(userDocRef(uid)); await fsDel(historyDocRef(uid));
    await fsDel(notifDocRef(uid)); await fsDel(checkInAcksDocRef(uid)); await fsDel(userIndexDocRef(uid));
    await fsDel(devicesDocRef(uid));
    if(me?.groupId){
      const gid=me.groupId;
      await fsDel(memberDocRef(gid,uid));
      await fsDel(legacyMemberDocRef(gid,me.name));
      await fsDel(adminUidDocRef(gid,uid)); // no-op for non-admins
      await fsDel(memberUidDocRef(gid,uid));
    }
    // Send the user straight to the Setup screen instead of an endless loading screen
    setMe(null); setNoAccount(true); setReady(true); setHistory([]); setMembers([]); setAdminUids([]);
    setMessages([]); setPolls([]); setLedger({charityTotals:{},payoutTotals:{},prizeTotals:{},totalWords:0,totalMinutes:0,entries:[]});
  }

  async function handleAvatarChange(newAvatar){
    const upd={...me,avatar:newAvatar};
    setMe(upd);
    await fsSet(userDocRef(uid),JSON.stringify(upd));
    await pub(upd,uid);
    loadMembers(me.groupId);
  }

  // Merges partial updates into the live me state and saves to Firestore + index
  // Used by SettingsPanel so it always writes against the latest me, never stale props
  async function handleUpdateMe(updates){
    const upd={...me,...updates};
    setMe(upd);
    await fsSet(userDocRef(uid),JSON.stringify(upd));
    writeUserIndex(uid,upd);
  }

  async function addInAppNotif(type,title,body){
    const notif={id:Date.now(),type,title,body,ts:Date.now(),read:false};
    setInAppNotifs(prev=>{
      const updated=[notif,...prev].slice(0,50);
      fsSet(notifDocRef(uid),JSON.stringify(updated));
      return updated;
    });
    // Also send a push to this user's saved device (silent fail)
    try{
      await apiPost("/api/notify",{toSelf:true,title,body,type});
    }catch{}
  }

  async function markAllNotifsRead(){
    const updated=inAppNotifs.map(n=>({...n,read:true}));
    setInAppNotifs(updated);
    await fsSet(notifDocRef(uid),JSON.stringify(updated));
  }

  // Dismisses the check-in pop-up and saves the deadline timestamp to Firebase
  // so it never shows again for this check-in, even after reinstall.
  async function acknowledgeCheckIn(deadlineMs){
    setCheckInPopup(null);
    try{
      const acksVal=await fsGet(checkInAcksDocRef(uid));
      const acks=acksVal?JSON.parse(acksVal):{acknowledgedDeadlines:[]};
      if(!(acks.acknowledgedDeadlines||[]).includes(deadlineMs)){
        acks.acknowledgedDeadlines=[...(acks.acknowledgedDeadlines||[]),deadlineMs];
        await fsSet(checkInAcksDocRef(uid),JSON.stringify(acks));
      }
    }catch(e){console.warn("acknowledgeCheckIn",e);}
  }

  // ── Notification event triggers ──
  // Called when the current user hits 100% — notifies themselves (group push handled server-side later)
  async function maybeNotifyGoalHit(newProgress){
    const curPeriodDays=getPeriodDays();
    const curPeriodGoal=periodGoalFor(me.goalValue,curPeriodDays);
    const wasUnder=me.progressThisWeek<curPeriodGoal;
    const nowOver=newProgress>=curPeriodGoal;
    if(wasUnder&&nowOver){
      const periodLabel=periodName(curPeriodDays);
      const goalText=fmtGoal({...me,goalValue:curPeriodGoal});
      await addInAppNotif("memberHitGoal","🌟 Goal crushed!",`You hit your ${goalText} ${periodLabel}. Amazing work!`);
      if(me?.groupId){
        apiPost("/api/notify",{
            groupId:me.groupId,
            notifType:"memberHitGoal",
            excludeUid:uid,
            title:`🌟 ${me.name} crushed their goal!`,
            body:`${me.avatar} ${me.name} just hit their ${goalText} ${periodLabel}. Get inspired!`,
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
      apiPost("/api/notify",{
          groupId:me.groupId,
          notifType:"newPoll",
          excludeUid:uid,
          title:"📊 New poll in "+me.groupId,
          body:"\""+question+"\" — cast your vote!",
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
    await addInAppNotif("missedCheckIn","💔 Missed check-in",`You missed this check-in. ${me.goalType==="words"?`Goal was ${fmtGoal({...me,goalValue:periodGoalFor(me.goalValue,getPeriodDays())})}.`:"Keep going — you've got this!"}`);
  }

  // Check-in deadline warning (24h before) — called when admin settings include a firstCheckIn
  async function maybeNotifyCheckInWarning(){
    if(!admin.firstCheckIn)return;
    const deadline=new Date(admin.firstCheckIn);
    const msLeft=deadline-new Date();
    if(msLeft>0&&msLeft<=86400000){
      const curPeriodGoal=periodGoalFor(me.goalValue,getPeriodDays());
      const goalLabel=me.goalType==="words"?`${curPeriodGoal.toLocaleString()} words`:(()=>{const h=Math.floor(curPeriodGoal/60),m=curPeriodGoal%60;return h>0?`${h}h`+(m>0?` ${m}m`:""):m+"m";})();
      await addInAppNotif("checkInWarning","⏰ Check-in tomorrow",`Your check-in deadline is in less than 24 hours. Period goal: ${goalLabel}.`);
    }
  }

  // ── Auth/loading states ──
  if(authUser===undefined)return(
    <div className="leopard" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{G}</style><BgCircles/><div style={{fontSize:32}}>🦄</div>
    </div>
  );
  if(!authUser)return(
    <>
      <SignIn onPrivacy={()=>setShowPrivacy(true)}/>
      {showPrivacy&&<PrivacyModal onClose={()=>setShowPrivacy(false)}/>}
    </>
  );
  if(!ready||(!me&&!noAccount))return(
    <div className="leopard" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{G}</style><BgCircles/><div style={{fontSize:32}}>✨</div>
    </div>
  );
  if(!me)return <Setup user={authUser} onSave={handleSetup}/>;

  // ── Period goal: the weekly goal scaled to the current check-in period's length ──
  // Falls back to a normal week (7 days) if no challenge is running.
  function getPeriodDays(){
    if(!admin.firstCheckIn||!admin.startDate)return 7;
    const now2=new Date();
    const startDate2=new Date(admin.startDate);
    const endDate2=admin.endDate?new Date(admin.endDate):null;
    if(now2<startDate2||(endDate2&&now2>endDate2))return 7;
    return cadenceDaysLocal(admin.frequency||"Weekly");
  }
  const periodDays=getPeriodDays();
  const periodGoal=periodGoalFor(me.goalValue,periodDays);
  const periodActive=periodDays!==7;
  const pct=Math.min(Math.round((me.progressThisWeek/periodGoal)*100),100);
  const left=Math.max(periodGoal-me.progressThisWeek,0);
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
  const amAdmin=adminUids.includes(uid);
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
      <style>{G}</style><BgCircles/>
      {showPrivacy&&<PrivacyModal onClose={()=>setShowPrivacy(false)}/>}
      {showPwaPrompt&&<PwaPrompt onClose={()=>setShowPwaPrompt(false)}/>}

      {/* ── Check-in Results Pop-up ── */}
      {checkInPopup&&(()=>{
        const {deadlineMs,periodNum,totalPeriods,remainingCheckIns,progress,goal,goalType}=checkInPopup;
        const ordinals=["1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th"];
        const ord=ordinals[periodNum-1]||`${periodNum}th`;
        const metGoal=progress>=goal;
        const pct=goal>0?Math.round((progress/goal)*100):0;
        const fmtProgress=goalType==="words"?`${progress.toLocaleString()} words`:(()=>{const h=Math.floor(progress/60),m=progress%60;return h>0?`${h}h${m>0?` ${m}m`:""}`:m+"m";})();
        const fmtGoal=goalType==="words"?`${goal.toLocaleString()} words`:(()=>{const h=Math.floor(goal/60),m=goal%60;return h>0?`${h}h${m>0?` ${m}m`:""}`:m+"m";})();

        let emoji,heading,message;
        if(metGoal){
          emoji="🏆";
          heading=`We reached the ${ord} check-in and you hit your goal! 🎉🥳✨`;
          message="You are a champion my friend. Go to the Group tab to see how your team did and your admin will message about the payout.";
        } else if(pct===0){
          emoji="✏️";
          heading=`We reached the ${ord} check-in.`;
          message=`You didn't get any writing in this period, or you didn't log — either way, it's not too late${remainingCheckIns!==null&&remainingCheckIns>0?`, there are still ${remainingCheckIns} more check-in${remainingCheckIns===1?"":"s"}`:""}.  Let's write!`;
        } else if(pct>75){
          emoji="💪";
          heading=`We reached the ${ord} check-in and you missed your goal.`;
          message="You were so close, I know you'll hit your goal for the next check-in. You can do it. Go to the Group tab to see how your team did and your admin will message about the next check-in.";
        } else {
          emoji="🌱";
          heading=`We reached the ${ord} check-in and you missed your goal.`;
          message="You still made progress and that's worth a round of applause. Take a beat, think about what you can do to meet your goal for the next check-in. You can do this! Go to the Group tab to see how your team did and your admin will message about the next check-in.";
        }

        return(
          <div className="modal-bg" style={{zIndex:300}}>
            <div className="card modal" style={{padding:28,textAlign:"center",maxWidth:380}}>
              <div style={{fontSize:52,marginBottom:12}}>{emoji}</div>
              {totalPeriods&&<div style={{fontSize:11,color:"#6B7685",fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Check-in {periodNum} of {totalPeriods}</div>}
              <div style={{fontSize:18,fontWeight:700,color:metGoal?LF.lime:LF.yellow,marginBottom:12,lineHeight:1.4}}>{heading}</div>
              <div style={{fontSize:15,color:"#5B6878",fontWeight:500,lineHeight:1.7,marginBottom:8}}>{message}</div>
              {!metGoal&&progress>0&&(
                <div style={{fontSize:13,color:"#6B7685",fontWeight:500,marginBottom:16}}>
                  You logged {fmtProgress} of your {fmtGoal} goal ({pct}%).
                </div>
              )}
              <button className="btn btn-sm" style={{width:"100%",fontSize:15,marginTop:8}} onClick={()=>acknowledgeCheckIn(deadlineMs)}>
                {metGoal?"Let's celebrate! 🎉":"Got it! 💪"}
              </button>
            </div>
          </div>
        );
      })()}

      {showTour&&(()=>{
        const step=TOUR_STEPS[tourStep];
        const isLast=tourStep===TOUR_STEPS.length-1;
        return(
          <div className="modal-bg" style={{zIndex:300,alignItems:"flex-end",paddingBottom:"calc(92px + env(safe-area-inset-bottom))",background:"#14213D2e"}}>
            <div className="card modal" style={{padding:"18px 20px",textAlign:"center",maxWidth:400,boxShadow:"0 10px 40px rgba(20,33,61,0.25)"}}>
              <div style={{fontSize:30,marginBottom:4}}>{step.emoji}</div>
              <div style={{fontSize:11,color:"#6B7685",fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Step {tourStep+1} of {TOUR_STEPS.length}</div>
              <div className="card-title" style={{fontSize:19,marginBottom:6,lineHeight:1.3}}>{step.title}</div>
              <div style={{fontSize:15,color:"#5B6878",fontWeight:500,lineHeight:1.55,marginBottom:16}}>{step.body}</div>
              <div style={{display:"flex",gap:8}}>
                {isLast?(
                  <button className="btn" style={{flex:1}} onClick={endTour}>Time to write! 🌈</button>
                ):(
                  <>
                    <button className="btn" style={{flex:1}} onClick={()=>setTourStep(s=>s+1)}>Next →</button>
                    <button className="ghost-btn" onClick={endTour} style={{flex:1,fontSize:16}}>Skip</button>
                  </>
                )}
              </div>
              <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:14}}>
                {TOUR_STEPS.map((_,i)=>(
                  <div key={i} onClick={()=>setTourStep(i)} style={{width:i===tourStep?20:8,height:8,borderRadius:4,background:i===tourStep?LF.pink:"#14213D26",cursor:"pointer",transition:"all 0.2s"}}/>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
      {showSettings&&<SettingsPanel me={me} uid={uid} db={db} isAdmin={amAdmin} onClose={()=>setShowSettings(false)} onAvatarChange={handleAvatarChange} onSignOut={()=>signOut(auth)} onOpenAdmin={()=>{setAdminDraft({...admin});setShowAdmin(true);}} onOpenPrivacy={()=>{setShowSettings(false);setShowPrivacy(true);}} onUpdateMe={handleUpdateMe} onStartTour={()=>{setTourStep(0);setShowTour(true);}}/>}
      {showNotifFeed&&<NotifFeed notifications={inAppNotifs} onClose={()=>setShowNotifFeed(false)} onMarkAllRead={markAllNotifsRead}/>}

      {/* ── Charity Picker Modal ── */}
      {showCharityModal&&(
        <div className="modal-bg">
          <div className="card modal" style={{padding:24}}>
            <div className="page-title" style={{fontSize:24,marginBottom:6}}>Pick your charity</div>
            <div style={{fontSize:14,color:"#5B6878",fontWeight:500,marginBottom:18,lineHeight:1.6}}>
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
                    style={{background:sel?"#8C62D1":"#fff",border:`2px solid ${sel?"#8C62D1":"#14213D26"}`,borderRadius:14,padding:"12px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.2s"}}>
                    <div style={{fontSize:15,fontWeight:600,color:sel?"#fff":"#14213D"}}>{sel?"✓ ":""}{c.name}</div>
                  </button>
                );
              })}

              {/* Custom option */}
              <div style={{border:`2px solid ${charityCustomStep==="confirm"?"#0062B1":"#14213D26"}`,borderRadius:14,padding:"12px 14px",background:"#fff"}}>
                <div style={{fontSize:15,fontWeight:600,color:"#14213D",marginBottom:charityCustomStep==="url"?10:0}}>Another charity</div>

                {charityCustomStep==="url"&&(<>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <input className="inp" placeholder="https://www.yourcharity.org" value={charityCustomUrl}
                      onChange={e=>{setCharityCustomUrl(e.target.value);setCharityFetchedName(null);setCharityCustomStep("url");}}
                      style={{flex:1,minWidth:0,fontSize:14,padding:"8px 12px"}}/>
                    <button className="btn btn-teal" style={{padding:"8px 14px",fontSize:14,flexShrink:0}}
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
                    <div style={{fontSize:13,color:"#BF1E41",marginTop:6}}>Please enter a valid web address</div>
                  )}
                </>)}

                {charityCustomStep==="confirm"&&(<>
                  <div style={{fontSize:13,color:"#5B6878",fontWeight:500,marginTop:6,marginBottom:8}}>
                    We found this name — edit if needed:
                  </div>
                  <input className="inp" value={charityEditName} onChange={e=>setCharityEditName(e.target.value)}
                    placeholder="Charity name" style={{marginBottom:10,fontSize:14}}/>
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn btn-sm" style={{flex:1,fontSize:13}}
                      disabled={!charityEditName.trim()}
                      onClick={()=>saveCharityFromModal(charityEditName.trim(),normalizeUrl(charityCustomUrl))}>
                      Save
                    </button>
                    <button onClick={()=>{setCharityCustomStep("url");setCharityFetchedName(null);}}
                      className="ghost-btn" style={{flex:1}}>
                      ← Back
                    </button>
                  </div>
                </>)}
              </div>
            </div>

            {/* Skip / close — only if they already have a charity */}
            {me.charityName&&(
              <button onClick={()=>setShowCharityModal(false)}
                style={{width:"100%",background:"none",border:"none",color:"#6B7685",fontSize:13,cursor:"pointer",fontFamily:"'Inter',sans-serif",textDecoration:"underline",marginTop:4}}>
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
              <div style={{fontSize:20,fontWeight:700,color:LF.pink,marginBottom:4}}>📅 Log a Previous Day</div>
              <div style={{fontSize:14,color:"#5B6878",fontWeight:500,marginBottom:16,lineHeight:1.6}}>
                Pick a day from this check-in period and add your {me.goalType==="words"?"words":"minutes"}.
              </div>
              {days.length===0?(
                <div style={{fontSize:14,color:"#5B6878",fontWeight:500,textAlign:"center",padding:"16px 0"}}>No previous days available in this period yet.</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16,maxHeight:220,overflowY:"auto"}}>
                  {[...days].reverse().map((d,i)=>{
                    const dow=(d.getDay()+6)%7;
                    const label=`${dayNames[dow]}, ${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;
                    const sel=pastDaySelected&&pastDaySelected.toDateString()===d.toDateString();
                    return(
                      <button key={i} onClick={()=>setPastDaySelected(d)}
                        style={{background:sel?`linear-gradient(135deg,${LF.pink}33,${LF.purple}33)`:"#14213D08",border:`2px solid ${sel?LF.pink:"#14213D1f"}`,borderRadius:14,padding:"10px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.2s"}}>
                        <div style={{fontSize:14,fontWeight:600,color:sel?LF.pink:LF.white}}>{sel?"✨ ":""}{label}</div>
                      </button>
                    );
                  })}
                </div>
              )}
              {pastDaySelected&&(
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:13,color:"#5B6878",fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>
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
                style={{width:"100%",background:"none",border:"none",color:"#6B7685",fontSize:13,cursor:"pointer",fontFamily:"'Inter',sans-serif",textDecoration:"underline"}}>
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Header ── */}
      <div className="app-header">
        <div className="wordmark"><span className="wc">Wordcount</span><span className="ab">ability</span></div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexShrink:0}}>
          <button className="icon-btn bell" onClick={()=>setShowNotifFeed(true)} aria-label="Notifications">
            🔔
            {inAppNotifs.filter(n=>!n.read).length>0&&<span className="dotbadge"/>}
          </button>
          <button className={`icon-btn me${showTour&&TOUR_STEPS[tourStep]?.highlight==="avatar"?" tour-glow":""}`} onClick={()=>setShowSettings(true)} aria-label="Profile and settings">{me.avatar}</button>
        </div>
      </div>

      {/* ── Admin Modal ── */}
      {showAdmin&&amAdmin&&(
        <div className="modal-bg">
          <div className="card modal" style={{overflowX:"hidden"}}>
            <div className="page-title" style={{fontSize:24,marginBottom:16}}>Admin settings</div>

            <span className="lbl">Challenge Duration</span>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
              {DURATIONS.map(d=><button key={d.label} onClick={()=>setAdminDraft(s=>({...s,duration:d.label}))} style={{padding:"7px 14px",border:`2px solid ${adminDraft.duration===d.label?"#8C62D1":"#14213D26"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:14,background:adminDraft.duration===d.label?"#8C62D1":"#fff",color:adminDraft.duration===d.label?"#fff":"#14213D"}}>{d.label}</button>)}
            </div>

            <span className="lbl">Check-in Frequency</span>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
              {FREQUENCIES.map(f=><button key={f} onClick={()=>setAdminDraft(s=>({...s,frequency:f}))} style={{padding:"7px 14px",border:`2px solid ${adminDraft.frequency===f?"#8C62D1":"#14213D26"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:14,background:adminDraft.frequency===f?"#8C62D1":"#fff",color:adminDraft.frequency===f?"#fff":"#14213D"}}>{f}</button>)}
            </div>

            <span className="lbl">First Check-in Date &amp; Time</span>
            <input className="inp" type="datetime-local" value={adminDraft.firstCheckIn||""} onChange={e=>setAdminDraft(s=>({...s,firstCheckIn:e.target.value}))} style={{marginBottom:6,width:"100%",maxWidth:"100%",boxSizing:"border-box"}}/>
            {adminDraft.firstCheckIn&&(()=>{
              const start=new Date(adminDraft.firstCheckIn);
              start.setDate(start.getDate()-(adminDraft.frequency==="Daily"?1:adminDraft.frequency==="Weekly"?7:adminDraft.frequency==="Bi-Weekly"?14:30));
              return <div style={{background:"#14213D0a",border:"2px solid #14213D1f",borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#0062B1",fontWeight:600}}>
                Challenge starts: {start.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})} at {start.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
              </div>;
            })()}
            {!adminDraft.firstCheckIn&&<div style={{fontSize:12,color:"#5B6878",fontWeight:500,marginBottom:14}}>Pick a date to see when the challenge will start.</div>}

            <span className="lbl">What happens when someone fails?</span>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
              {[
                {mode:"charity",icon:"💝",label:"To Charity",desc:"Stakes donated to each member's chosen charity.",grad:"#8C62D1",col:"#fff"},
                {mode:"winners",icon:"🏆",label:"Cash to Winners",desc:"Failed stakes split among members who hit their goals.",grad:"#FF7F11",col:"#14213D"},
                {mode:"pain",   icon:"😈",label:"To The Pain",desc:"No money — whoever fails gets mercilessly ridiculed.",grad:"#BF1E41",col:"#fff"},
              ].map(({mode,icon,label,desc,grad,col})=>(
                <button key={mode} onClick={()=>setAdminDraft(s=>({...s,payoutMode:mode}))} style={{background:adminDraft.payoutMode===mode?grad:"#fff",border:`2px solid ${adminDraft.payoutMode===mode?grad:"#14213D26"}`,borderRadius:14,padding:"10px 14px",cursor:"pointer",textAlign:"left"}}>
                  <div style={{fontSize:15,color:adminDraft.payoutMode===mode?col:"#14213D",fontWeight:600,marginBottom:2}}>{icon} {label}</div>
                  <div style={{fontSize:13,color:adminDraft.payoutMode===mode?col:"#5B6878",fontWeight:500,opacity:adminDraft.payoutMode===mode?0.9:1}}>{desc}</div>
                </button>
              ))}
            </div>

            <div style={{background:"#14213D0a",border:"1px solid #14213D1f",borderRadius:14,padding:12,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:adminDraft.prizeEnabled?10:0}}>
                <input type="checkbox" id="prizeToggle" checked={!!adminDraft.prizeEnabled} onChange={e=>setAdminDraft(s=>({...s,prizeEnabled:e.target.checked}))} style={{accentColor:LF.pink,width:18,height:18,flexShrink:0}}/>
                <label htmlFor="prizeToggle" style={{fontSize:14,color:"#14213D",fontWeight:500,cursor:"pointer"}}>🏅 Also offer a Prize for the top performer</label>
              </div>
              {adminDraft.prizeEnabled&&(<>
                <span className="lbl" style={{marginTop:6}}>Prize Metric</span>
                <div className="pill" style={{marginBottom:8}}>
                  <button onClick={()=>setAdminDraft(s=>({...s,prizeMetric:"absolute"}))} style={{background:adminDraft.prizeMetric==="absolute"?"#8C62D1":"transparent",color:adminDraft.prizeMetric==="absolute"?"#fff":"#14213D"}}>📈 Most Total</button>
                  <button onClick={()=>setAdminDraft(s=>({...s,prizeMetric:"pct"}))} style={{background:adminDraft.prizeMetric==="pct"?"#8C62D1":"transparent",color:adminDraft.prizeMetric==="pct"?"#fff":"#14213D"}}>🎯 Highest %</button>
                </div>
                <span className="lbl">What's the Prize?</span>
                <input className="inp" placeholder="e.g. Free developmental edit, gift card..." value={adminDraft.prizeDescription||""} onChange={e=>setAdminDraft(s=>({...s,prizeDescription:e.target.value}))} style={{marginBottom:6}}/>
              </>)}
            </div>

            <span className="lbl">Stake Amount per Person</span>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              {[0,10,25,50,100,250].map(n=><button key={n} onClick={()=>setAdminDraft(s=>({...s,stake:n}))} style={{padding:"7px 14px",border:`2px solid ${adminDraft.stake===n?"#8C62D1":"#14213D26"}`,borderRadius:50,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:14,background:adminDraft.stake===n?"#8C62D1":"#fff",color:adminDraft.stake===n?"#fff":"#14213D"}}>${n}</button>)}
            </div>

            <span className="lbl">Miss Threshold (triggers stake)</span>
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setAdminDraft(s=>({...s,threshold:n}))} style={{flex:1,padding:"10px 0",border:`2px solid ${adminDraft.threshold===n?"#8C62D1":"#14213D26"}`,borderRadius:12,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:15,background:adminDraft.threshold===n?"#8C62D1":"#fff",color:adminDraft.threshold===n?"#fff":"#14213D"}}>{n}</button>)}
            </div>

            <div style={{background:"#14213D06",border:"1px solid #14213D1f",borderRadius:14,padding:14,marginBottom:14}}>
              <span className="lbl">Goal lock</span>
              <div style={{fontSize:13,color:"#5B6878",fontWeight:500,marginBottom:10}}>When locked, members cannot lower their goals. Open a temporary change window to allow edits.</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:13,color:"#14213D",fontWeight:600}}>Change window (days):</span>
                <input className="inp" type="number" min="1" max="14" value={adminDraft.changeWindowDays||3} onChange={e=>setAdminDraft(s=>({...s,changeWindowDays:parseInt(e.target.value)||3}))} style={{width:70,padding:"6px 10px",fontSize:13}}/>
              </div>
            </div>

            {/* ── Check-in Payment Recording ── */}
            {(()=>{
              // Work out the most recent past deadline from admin settings
              if(!admin.firstCheckIn||!admin.startDate)return null;
              const now=Date.now();
              const cad=(admin.frequency==="Daily"?1:admin.frequency==="Weekly"?7:admin.frequency==="Bi-Weekly"?14:30)*86400000;
              const firstCI=new Date(admin.firstCheckIn).getTime();
              const start=new Date(admin.startDate).getTime();
              const end=admin.endDate?new Date(admin.endDate).getTime():Infinity;
              if(now<start)return null;
              let latestDeadline=null;
              let cur=firstCI;
              while(cur<=end&&cur<=now){latestDeadline=cur;cur+=cad;}
              if(!latestDeadline)return null;
              // Only show within 48 hours of that deadline
              const hoursAgo=(now-latestDeadline)/3600000;
              if(hoursAgo>48)return null;
              // Check if payments for this deadline are already recorded in the ledger
              const alreadyRecorded=(ledger.entries||[]).some(e=>e.checkInMs===latestDeadline);
              // Build the deadline label for display
              const dlLabel=new Date(latestDeadline).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
              // Initialise rows the first time the section appears (or reset when re-opened)
              // We use paymentRows.length===0 as a signal to seed defaults
              const isCharity=admin.payoutMode==="charity";
              const isPayout=admin.payoutMode==="winners";
              if(!isCharity&&!isPayout)return null; // "pain" mode has no money to record
              // Seed default rows if empty
              function seedRows(){
                if(isCharity){
                  // Pull unique charities from current members as starting rows
                  const seen=new Set();
                  const rows=members.filter(m=>m.charityName).reduce((acc,m)=>{
                    if(!seen.has(m.charityName)){seen.add(m.charityName);acc.push({name:m.charityName,amount:""});}
                    return acc;
                  },[]);
                  // Always have at least one blank row
                  setPaymentRows(rows.length>0?rows:[{name:"",amount:""}]);
                } else {
                  // Payout: one row per member
                  setPaymentRows(members.map(m=>({memberName:m.name,avatar:m.avatar,amount:""})));
                }
              }
              return(
                <div style={{background:"#B8540011",border:`2px solid ${LF.yellow}44`,borderRadius:14,padding:14,marginBottom:14}}>
                  <span className="lbl" style={{color:LF.yellow}}>💸 Record Check-in Payments</span>
                  <div style={{fontSize:12,color:"#5B6878",fontWeight:500,marginBottom:10}}>
                    Check-in: {dlLabel} · {Math.round(48-hoursAgo)}h remaining to attach payments
                  </div>
                  {alreadyRecorded?(
                    <div style={{fontSize:13,color:LF.lime,fontWeight:600,textAlign:"center",padding:"8px 0"}}>✅ Payments already recorded for this check-in.</div>
                  ):(
                    <>
                      {paymentRows.length===0&&(
                        <button className="btn btn-yellow" onClick={seedRows} style={{width:"100%",fontSize:13,marginBottom:8}}>
                          {isCharity?"💝 Add Charity Rows":"🏆 Add Member Rows"}
                        </button>
                      )}
                      {paymentRows.length>0&&(<>
                        {isCharity&&(
                          <>
                            <div style={{fontSize:12,color:"#5B6878",fontWeight:500,marginBottom:6}}>One row per charity. Enter the amount donated.</div>
                            {paymentRows.map((row,i)=>(
                              <div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                                <input className="inp" placeholder="Charity name" value={row.name} onChange={e=>{const r=[...paymentRows];r[i]={...r[i],name:e.target.value};setPaymentRows(r);}} style={{flex:2,padding:"8px 12px",fontSize:13}}/>
                                <div style={{position:"relative",flex:1}}>
                                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#5B6878",fontWeight:600,fontSize:13,pointerEvents:"none"}}>$</span>
                                  <input className="inp" type="number" min="0" placeholder="0.00" value={row.amount} onChange={e=>{const r=[...paymentRows];r[i]={...r[i],amount:e.target.value};setPaymentRows(r);}} style={{width:"100%",padding:"8px 12px 8px 22px",fontSize:13}}/>
                                </div>
                                <button onClick={()=>setPaymentRows(paymentRows.filter((_,j)=>j!==i))} style={{background:"#BF1E4122",border:"2px solid #BF1E4144",borderRadius:10,width:32,height:32,cursor:"pointer",color:"#BF1E41",fontSize:14,flexShrink:0}}>✕</button>
                              </div>
                            ))}
                            <button onClick={()=>setPaymentRows([...paymentRows,{name:"",amount:""}])} style={{background:"#14213D0a",border:"2px solid #14213D1f",borderRadius:10,padding:"6px 14px",color:"#14213D",fontFamily:"'Inter',sans-serif",fontSize:13,cursor:"pointer",marginBottom:10}}>+ Add Charity</button>
                          </>
                        )}
                        {isPayout&&(
                          <>
                            <div style={{fontSize:12,color:"#5B6878",fontWeight:500,marginBottom:6}}>Enter amount per member. Positive = received money. Negative = paid out.</div>
                            {paymentRows.map((row,i)=>(
                              <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                                <div style={{fontSize:18,flexShrink:0}}>{row.avatar||"🦄"}</div>
                                <div style={{flex:1,fontSize:13,fontWeight:500,color:LF.white}}>{row.memberName}</div>
                                <div style={{position:"relative",width:110}}>
                                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#5B6878",fontWeight:600,fontSize:13,pointerEvents:"none"}}>$</span>
                                  <input className="inp" type="number" placeholder="0.00" value={row.amount} onChange={e=>{const r=[...paymentRows];r[i]={...r[i],amount:e.target.value};setPaymentRows(r);}} style={{width:"100%",padding:"8px 12px 8px 22px",fontSize:13}}/>
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                        {paymentSaved?(
                          <div style={{fontSize:13,color:LF.lime,fontWeight:600,textAlign:"center",padding:"8px 0"}}>✅ Saved!</div>
                        ):(
                          <button className="btn btn-yellow" onClick={()=>recordCheckInPayments(latestDeadline)} disabled={paymentSaving} style={{width:"100%",fontSize:13,marginTop:4}}>
                            {paymentSaving?"Saving…":"Save Payments 💸"}
                          </button>
                        )}
                      </>)}
                    </>
                  )}
                </div>
              );
            })()}

            <div style={{display:"flex",gap:8,position:"sticky",bottom:-20,background:"#FFFFFF",paddingTop:12,marginLeft:-20,marginRight:-20,marginBottom:-20,paddingLeft:20,paddingRight:20,paddingBottom:20,borderTop:"1px solid #14213D14"}}>
              <button className="btn" onClick={saveAdminSettings} style={{flex:2}}>Save &amp; activate</button>
              <button className="ghost-btn" onClick={()=>setShowAdmin(false)} style={{flex:1,fontSize:16}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom tab bar ── */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {TABS.map(t=>(
            <button key={t} className={`nav-btn${tab===t?" on":""}`} onClick={()=>setTab(t)} aria-current={tab===t?"page":undefined}>
              <TabIcon name={t}/>{TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </nav>

      <div style={{width:"100%",maxWidth:500,padding:"18px 20px 0",display:"flex",flexDirection:"column",gap:14}}>

        {/* ── DASHBOARD ── */}
        {tab==="Dashboard"&&(()=>{
          const info=getCheckInPeriodInfo();
          const firstName=(me.name||"").split(" ")[0]||"writer";
          const streak=history.filter(h=>h.met).length;
          // Which check-in is coming up next (1 before the first deadline)
          const upcoming=info?Math.min(info.periodNumber+1,info.totalPeriods||info.periodNumber+1):null;
          const eyebrow=challengeNotStarted
            ?`Challenge starts ${challengeStartDate.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}`
            :info?.isActive
              ?`Check-in ${upcoming}${info.totalPeriods?` of ${info.totalPeriods}`:""} · due ${info.nextCheckIn.toLocaleDateString("en-US",{weekday:"short"})} ${info.nextCheckIn.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}`
              :"This week";
          const goalLabel=me.goalType==="words"?`${periodGoal.toLocaleString()} words`:(()=>{const h=Math.floor(periodGoal/60),m=periodGoal%60;return h>0?`${h}h`+(m>0?` ${m}m`:""):m+"m";})();
          return(<>
          <div style={{paddingTop:4}}>
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="headline">Hi {firstName}. {pct>=100?"Goal crushed! 🌟":`${fmtLeft()}.`}</h1>
            <div className="chips">
              <span className="chip">#{me.groupId}</span>
              {amAdmin&&<span className="chip" style={{color:"#6D47B5",borderColor:"#8C62D166"}}>Admin</span>}
              {endDate&&!challengeNotStarted&&<span className="chip">{daysLeft} days left · {admin.frequency}</span>}
              {isLocked&&<span className="chip" style={{color:"#BF1E41",borderColor:"#BF1E4166"}}>Goals locked</span>}
              {admin.changeWindowOpen&&<span className="chip" style={{color:"#0062B1",borderColor:"#0062B188"}}>Change window open</span>}
              {triggered&&<span className="chip" style={{background:"#BF1E41",color:"#fff",borderColor:"#BF1E41"}}>Pay up</span>}
              {!triggered&&atRisk&&<span className="chip" style={{color:"#B85400",borderColor:"#FF7F1188"}}>At risk</span>}
            </div>
          </div>

          {challengeNotStarted&&(
            <div className="card" style={{textAlign:"center"}}>
              <div className="card-title" style={{marginBottom:8}}>Challenge starts in</div>
              <div style={{fontFamily:"'Poppins',sans-serif",fontSize:34,fontWeight:700,color:"#14213D",marginBottom:6}}>
                {countdownDays>0&&<span>{countdownDays}<span style={{fontSize:15,color:"#5B6878",margin:"0 10px 0 2px"}}>d</span></span>}
                {countdownHours>0&&<span>{countdownHours}<span style={{fontSize:15,color:"#5B6878",margin:"0 10px 0 2px"}}>h</span></span>}
                <span>{countdownMins}<span style={{fontSize:15,color:"#5B6878",marginLeft:2}}>m</span></span>
              </div>
              <div style={{fontSize:14,color:"#5B6878"}}>
                {challengeStartDate.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})} at {challengeStartDate.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
              </div>
              <div style={{fontSize:13,color:"#5B6878",marginTop:4}}>First check-in: {admin.firstCheckIn?new Date(admin.firstCheckIn).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—"}</div>
            </div>
          )}

          <div className="card" style={{position:"relative"}}>
            {spark>0&&["✨","⭐","💫","🌟","✨","⭐"].map((em,i)=><span key={`${spark}-${i}`} style={{position:"absolute",left:`${sparkPositions.current[i]?.left||20}%`,top:`${sparkPositions.current[i]?.top||20}%`,fontSize:16,animation:"pop 0.5s ease forwards",pointerEvents:"none"}}>{em}</span>)}
            <div style={{display:"flex",alignItems:"center",gap:20}}>
              <div style={{position:"relative",flexShrink:0}}>
                <Ring pct={pct} size={112} stroke={9}/>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontFamily:"'Poppins',sans-serif",fontSize:26,fontWeight:700,color:pct>=100?"#4F7A1F":"#14213D"}}>{pct}%</span>
                </div>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Poppins',sans-serif",fontSize:27,fontWeight:700,lineHeight:1.1,color:"#14213D"}}>{me.goalType==="words"?me.progressThisWeek.toLocaleString():fmtProg(me)}</div>
                <div style={{fontSize:14,color:"#5B6878",marginTop:3}}>of {goalLabel} {periodActive?"this check-in":"this week"}</div>
                {info?.isActive&&(
                  <span style={{display:"inline-block",marginTop:10,fontSize:13,fontWeight:500,color:"#0062B1",border:"1.5px solid #0062B1",padding:"4px 12px",borderRadius:999}}>
                    {info.dLeft>0?`${info.dLeft} day${info.dLeft===1?"":"s"}, `:""}{info.hLeft} hour{info.hLeft===1?"":"s"} left
                  </span>
                )}
                {streak>0&&<div style={{fontSize:13,marginTop:8,color:"#B85400",fontWeight:500}}>🔥 {streak}-week streak</div>}
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:18}}>
              {WEEK_DAYS.map((d,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                  <div style={{width:"100%",height:6,borderRadius:4,background:me.dailyChecks[i]?"#00BFB2":"#14213D14"}}/>
                  <span style={{fontSize:12,color:i===todayIdx()?"#14213D":"#5B6878",fontWeight:i===todayIdx()?800:600}}>{d}</span>
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
                    <span className="card-title">Log words</span>
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
                    <div style={{fontSize:12,color:LF.yellow,fontWeight:600,marginBottom:8}}>
                      📅 Logging for {(()=>{const dow=(pastDaySelected.getDay()+6)%7;return`${dayNames[dow]}, ${pastDaySelected.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;})()}
                    </div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    <input className="inp" type="number" placeholder="Words written" value={logInput} onChange={e=>setLogInput(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"){isToday?logProgress():logPastDayInline();}}}
                      style={{flex:1,minWidth:0}}/>
                    <button className="btn" onClick={isToday?logProgress:logPastDayInline} disabled={saving||pastDaySaving} style={{padding:"11px 20px"}}>
                      {(saving||pastDaySaving)?"Saving…":"Save"}
                    </button>
                  </div>
                </>);
              })()}
            </div>
          ):(
            <div className="card">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <span className="card-title">Writing timer</span>
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
                  <div style={{fontSize:12,color:LF.yellow,fontWeight:600,marginBottom:8}}>
                    📅 Logging for {(()=>{const dayNames=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];const dow=(pastDaySelected.getDay()+6)%7;return`${dayNames[dow]}, ${pastDaySelected.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;})()}
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <input className="inp" type="number" placeholder="Minutes written" value={logInput} onChange={e=>setLogInput(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter")logPastDayInline();}}
                      style={{flex:1,minWidth:0}}/>
                    <button className="btn" onClick={logPastDayInline} disabled={pastDaySaving} style={{padding:"11px 20px"}}>
                      {pastDaySaving?"Saving…":"Save"}
                    </button>
                  </div>
                </div>
              ):(
                <>
                  <div style={{textAlign:"center",padding:"12px 0 16px"}}>
                    <div style={{fontFamily:"Poppins,sans-serif",fontSize:48,color:"#14213D",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{fmtTimer(timerSecs)}</div>
                    <div style={{fontSize:14,fontWeight:600,marginTop:4,color:timerRunning?"#6D47B5":"#5B6878"}}>{timerRunning?"● Writing in progress…":timerSecs>0?"Paused":"Tap Start when you begin"}</div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {!timerRunning
                      ?<button className="btn" onClick={startTimer} style={{flex:1}}>{timerSecs>0?"Resume":"Start"} writing</button>
                      :<button className="btn btn-teal" onClick={pauseTimer} style={{flex:1}}>Pause</button>}
                    {timerSecs>0&&<button className="btn btn-red" onClick={resetTimer} style={{flex:1}}>Stop</button>}
                    {timerSecs>=60&&<button className="btn btn-yellow" onClick={stopAndSave} style={{width:"100%",marginTop:4}}>Save {Math.round(timerSecs/60)} min</button>}
                  </div>
                  {timerSessions.length>0&&(
                    <div style={{marginTop:12,borderTop:`1px solid ${LF.purple}33`,paddingTop:10}}>
                      <div style={{fontSize:12,color:LF.lime,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Today's Sessions</div>
                      {timerSessions.map((s,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#14213D",fontWeight:600,padding:"2px 0"}}><span>Session {i+1}</span><span style={{color:LF.lime}}>{s.mins}m ✓</span></div>)}
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:600,marginTop:6,color:LF.yellow}}><span>Total today</span><span>{timerSessions.reduce((a,s)=>a+s.mins,0)}m 🔥</span></div>
                    </div>
                  )}
                  <div style={{fontSize:12,color:"#6B7685",fontWeight:500,marginTop:10,textAlign:"center"}}>Sessions under 1 minute aren't counted</div>
                </>
              )}
            </div>
          )}


          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div style={{minWidth:0}}>
                <div className="card-title" style={{marginBottom:4}}>{admin.payoutMode==="pain"?"To the Pain":admin.payoutMode==="prize"?"Prize":"Your stake"}</div>
                {admin.payoutMode==="pain"?(
                  <div style={{fontSize:14,color:"#5B6878",lineHeight:1.5}}>No money, just shame. Miss your goal and your group <b style={{color:"#BF1E41"}}>will</b> hear about it. 😈</div>
                ):(
                  <div style={{fontSize:14,color:"#5B6878",lineHeight:1.5}}>{fmtMoney(admin.stake)} to {admin.payoutMode==="winners"?"the winners":(me.charityName||me.charity||"your charity")} after {admin.threshold} missed check-in{admin.threshold===1?"":"s"}</div>
                )}
              </div>
              {admin.payoutMode!=="pain"&&(
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontFamily:"'Poppins',sans-serif",fontSize:22,fontWeight:700,color:triggered?"#BF1E41":atRisk?"#B85400":"#0062B1"}}>{missed} of {admin.threshold}</div>
                  <div style={{fontSize:12,color:"#5B6878"}}>missed</div>
                </div>
              )}
            </div>
            {triggered&&admin.payoutMode==="charity"&&<button className="btn btn-red" onClick={()=>recordPayment("charity",me.name,admin.stake,me.charity)} style={{marginTop:14,width:"100%"}}>Record donation</button>}
            {triggered&&admin.payoutMode==="winners"&&<button className="btn btn-yellow" onClick={()=>recordPayment("payout",me.name,admin.stake,"")} style={{marginTop:14,width:"100%"}}>Record payout of {fmtMoney(admin.stake)}</button>}
          </div>
          </>);
        })()}

        {/* ── GROUP ── */}
        {tab==="Group"&&(<>
          <div className="page-head">
            <div>
              <p className="eyebrow">#{me.groupId}</p>
              <h2 className="page-title">Group</h2>
            </div>
            <button className="ghost-btn" onClick={()=>loadMembers(me.groupId)}>↻ Refresh</button>
          </div>
          {challengeNotStarted&&(
            <div className="card" style={{textAlign:"center"}}>
              <div className="card-title" style={{marginBottom:8}}>Challenge starts in</div>
              <div style={{fontFamily:"'Poppins',sans-serif",fontSize:34,fontWeight:700,color:"#14213D",marginBottom:6}}>
                {countdownDays>0&&<span>{countdownDays}<span style={{fontSize:15,color:"#5B6878",margin:"0 10px 0 2px"}}>d</span></span>}
                {countdownHours>0&&<span>{countdownHours}<span style={{fontSize:15,color:"#5B6878",margin:"0 10px 0 2px"}}>h</span></span>}
                <span>{countdownMins}<span style={{fontSize:15,color:"#5B6878",marginLeft:2}}>m</span></span>
              </div>
              <div style={{fontSize:14,color:"#5B6878"}}>
                {challengeStartDate.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})} at {challengeStartDate.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
              </div>
              <div style={{fontSize:13,color:"#5B6878",marginTop:4}}>First check-in: {admin.firstCheckIn?new Date(admin.firstCheckIn).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—"}</div>
            </div>
          )}

          {/* Share invite card */}
          <div className="card">
            <div className="card-title" style={{marginBottom:6}}>Invite your crew</div>
            <div style={{fontSize:14,color:"#5B6878",lineHeight:1.5,marginBottom:12}}>Share this link. Anyone can join by signing in with Google and entering your Group ID.</div>
            <div style={{background:"#14213D08",border:"1px solid #14213D1f",borderRadius:12,padding:"10px 14px",marginBottom:10,fontFamily:"monospace",fontSize:13,color:"#0062B1",wordBreak:"break-all"}}>{APP_URL}</div>
            <div style={{fontSize:14,color:"#5B6878",marginBottom:14}}>Group ID: <b style={{color:"#14213D"}}>#{me.groupId}</b></div>
            <button className="btn" onClick={()=>shareGroup(me.groupId,setShareCopied)} style={{width:"100%"}}>
              {shareCopied?"Copied to clipboard ✓":"Share invite"}
            </button>
            <div style={{fontSize:12,color:"#5B6878",marginTop:8,textAlign:"center"}}>On a phone, this opens your share options (Messages, WhatsApp, email and more).</div>
          </div>

          {amAdmin&&(
            <div className="card">
              <div className="card-title" style={{marginBottom:6}}>Goal lock</div>
              <div style={{fontSize:14,color:"#5B6878",marginBottom:12}}>
                {isLocked?"Goals are locked. Members can raise their goal but not lower it.":admin.changeWindowOpen?`Change window is open. It closes in about ${changeHoursLeft||"?"} hours.`:"Goals are unlocked."}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button className={admin.goalsLocked?"btn btn-teal":"btn btn-red"} onClick={toggleGoalLock} style={{fontSize:15,padding:"9px 16px"}}>
                  {admin.goalsLocked?"Unlock goals":"Lock goals"}
                </button>
                {admin.goalsLocked&&!admin.changeWindowOpen&&(
                  <button className="btn btn-yellow" onClick={openChangeWindow} style={{fontSize:15,padding:"9px 16px"}}>
                    Open {admin.changeWindowDays||3}-day change window
                  </button>
                )}
                {admin.changeWindowOpen&&(
                  <button className="btn btn-red" onClick={async()=>{const upd={...admin,changeWindowOpen:false,changeWindowEnd:null};await fsSet(adminDocRef(me.groupId),JSON.stringify(upd));setAdmin(upd);setAdminDraft(upd);}} style={{fontSize:15,padding:"9px 16px"}}>
                    Close window early
                  </button>
                )}
              </div>
            </div>
          )}

          {!amAdmin&&admin.changeWindowOpen&&(
            <div className="card">
              <div className="card-title" style={{marginBottom:4,color:"#0062B1"}}>Goal change window is open</div>
              <div style={{fontSize:14,color:"#5B6878"}}>You can adjust your goal for about {changeHoursLeft} more hours.</div>
            </div>
          )}
          {!amAdmin&&isLocked&&(
            <div className="card">
              <div className="card-title" style={{marginBottom:4}}>Goals are locked</div>
              <div style={{fontSize:14,color:"#5B6878"}}>You can still raise your goal anytime.</div>
            </div>
          )}

          {sorted.length===0&&<div className="card" style={{textAlign:"center",padding:24}}><div style={{fontSize:32,marginBottom:8}}>🦄</div><div style={{fontSize:15,color:"#5B6878"}}>No crew yet. Share your invite link above.</div></div>}
          {sorted.map((w,i)=>{
            const wGoal=periodGoalFor(w.goalValue,periodDays);
            const p=Math.min(Math.round((w.progressThisWeek/wGoal)*100),100);
            const medals=["🥇","🥈","🥉"];
            const bar=p>=100?"#00BFB2":i===0?"#FF7F11":"#8C62D1";
            const isAdminMember=adminUids.includes(w.uid);
            return(
              <div key={w.uid||w.name} className="card" style={{background:w.isYou?"#FBF8FF":undefined}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                  <div style={{width:26,textAlign:"center",fontSize:medals[i]?20:15,fontWeight:500,color:"#5B6878"}}>{medals[i]||i+1}</div>
                  <div style={{fontSize:24}}>{w.avatar}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:16,fontWeight:700,color:"#14213D"}}>
                      {w.name}{w.isYou&&<span style={{fontSize:13,fontWeight:600,color:"#6D47B5"}}> (you)</span>}
                      {isAdminMember&&<span style={{fontSize:11,fontWeight:500,color:"#6D47B5",border:"1px solid #8C62D166",borderRadius:999,padding:"1px 7px",marginLeft:6,verticalAlign:"middle"}}>Admin</span>}
                    </div>
                    <div style={{fontSize:13,color:"#5B6878",marginTop:2}}>{w.goalType==="words"?`${(w.progressThisWeek||0).toLocaleString()} / ${wGoal.toLocaleString()} words`:`${w.progressThisWeek||0} / ${wGoal} min`}{(w.charityName||w.charity)?` · ${w.charityName||w.charity}`:""}</div>
                  </div>
                  <div style={{fontFamily:"'Poppins',sans-serif",fontSize:19,fontWeight:700,color:p>=100?"#00897F":"#14213D"}}>{p}%</div>
                </div>
                <div className="pbar-bg"><div className="pbar-fill" style={{width:`${p}%`,background:bar}}/></div>
                {amAdmin&&w.uid&&!isAdminMember&&(
                  <button className="ghost-btn" onClick={()=>makeAdmin(w)} style={{marginTop:12,fontSize:13,padding:"5px 12px"}}>Make admin</button>
                )}
              </div>
            );
          })}
        </>)}

        {/* ── CHAT ── */}
        {tab==="Chat"&&(<>
          <div className="page-head">
            <div>
              <p className="eyebrow">#{me.groupId}</p>
              <h2 className="page-title">Chat</h2>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="ghost-btn" onClick={()=>{loadChat(me.groupId);loadPolls(me.groupId);}}>↻ Refresh</button>
              <button className="ghost-btn" onClick={()=>setShowPollForm(s=>!s)} style={{color:"#6D47B5",borderColor:"#8C62D188"}}>{showPollForm?"Cancel":"New poll"}</button>
            </div>
          </div>

          {showPollForm&&(
            <div className="card">
              <div className="card-title" style={{marginBottom:12}}>Create a poll</div>
              <input className="inp" placeholder="Your question" value={pollQ} onChange={e=>setPollQ(e.target.value)} style={{marginBottom:10}}/>
              {pollOpts.map((o,i)=>(
                <div key={i} style={{display:"flex",gap:6,marginBottom:8}}>
                  <input className="inp" placeholder={`Option ${i+1}`} value={o} onChange={e=>{const opts=[...pollOpts];opts[i]=e.target.value;setPollOpts(opts);}} style={{flex:1}}/>
                  {pollOpts.length>2&&<button onClick={()=>setPollOpts(pollOpts.filter((_,j)=>j!==i))} style={{background:"none",border:`2px solid ${LF.pink}55`,borderRadius:10,padding:"0 12px",cursor:"pointer",color:LF.pink,fontSize:16}}>✕</button>}
                </div>
              ))}
              {pollOpts.length<6&&<button onClick={()=>setPollOpts([...pollOpts,""])} style={{background:"none",border:"2px dashed #14213D26",borderRadius:10,padding:8,width:"100%",cursor:"pointer",color:"#14213D",fontSize:14,marginBottom:10}}>+ Add Option</button>}
              <div style={{fontSize:13,fontWeight:600,color:"#5B6878",margin:"4px 0 6px"}}>Voting deadline (optional)</div>
              <input className="inp" type="datetime-local" value={pollDeadline} onChange={e=>setPollDeadline(e.target.value)} style={{marginBottom:12}}/>
              <div style={{display:"flex",gap:8}}>
                <button className="btn" onClick={submitPoll} style={{flex:1}}>Post poll</button>
                <button className="ghost-btn" onClick={()=>setShowPollForm(false)} style={{flex:1}}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{background:"rgba(255,255,255,0.92)",border:"2px solid #00BFB2",borderRadius:20,padding:12,display:"flex",flexDirection:"column",gap:12,minHeight:240,maxHeight:480,overflowY:"auto"}}>
            {(()=>{
              const items=[...messages.map(m=>({...m,_type:"msg"})),...polls.map(p=>({...p,_type:"poll"}))].sort((a,b)=>a.ts-b.ts);
              if(items.length===0)return <div style={{textAlign:"center",padding:36,color:"#5B6878",fontSize:15}}>Say hi to your crew! 👋</div>;
              return items.map(item=>{
                if(item._type==="msg"){
                  const msg=item; const isMe=msg.author===me.name;
                  return(
                    <div key={msg.id} className="msg-in" style={{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start",gap:3,position:"relative",zIndex:openPicker===msg.id?5:1}}>
                      {!isMe&&<div style={{fontSize:12,color:"#5B6878",fontWeight:600,paddingLeft:4}}>{msg.avatar} {msg.author}</div>}
                      <div style={{maxWidth:"80%",background:isMe?"#8C62D1":"#F3F1F6",borderRadius:isMe?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"9px 13px"}}>
                        <div style={{fontSize:15,fontWeight:500,color:isMe?"#fff":"#14213D",lineHeight:1.5}}>{msg.text}</div>
                        <div style={{fontSize:11,color:isMe?"#FFFFFFCC":"#5B6878",marginTop:3}}>{fmtDate(msg.ts)}</div>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:3,paddingLeft:isMe?0:4,paddingRight:isMe?4:0,justifyContent:isMe?"flex-end":"flex-start",alignItems:"center"}}>
                        {REACTIONS.filter(r=>(msg.reactions[r]||[]).length>0).map(r=>{
                          const cnt=(msg.reactions[r]||[]).length;
                          const reacted=(msg.reactions[r]||[]).includes(me.name);
                          return <button key={r} onClick={()=>addReaction(msg.id,r)} style={{background:reacted?"#8C62D11f":"#fff",border:`1px solid ${reacted?"#8C62D1":"#14213D26"}`,borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:3}}>
                            {r}<span style={{fontSize:12,color:reacted?"#6D47B5":"#5B6878",fontWeight:500}}>{cnt}</span>
                          </button>;
                        })}
                        <div style={{position:"relative"}}>
                          <button onClick={()=>setOpenPicker(openPicker===msg.id?null:msg.id)} style={{background:"#fff",border:"1px solid #14213D26",borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:12,color:"#14213D"}} aria-label="Add reaction">＋😊</button>
                          {openPicker===msg.id&&(
                            <div style={{position:"absolute",top:"110%",left:isMe?"auto":"0",right:isMe?"0":"auto",background:"#fff",border:"2px solid #8377D1",borderRadius:16,padding:8,display:"flex",flexWrap:"wrap",gap:4,width:196,zIndex:50,boxShadow:"0 8px 28px #14213D33"}}>
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
                  <div key={poll.id} className="msg-in" style={{background:"#fff",border:`2px solid ${resolved?"#00BFB2":expired?"#14213D26":"#8377D1"}`,borderRadius:16,padding:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{fontSize:11,color:"#0062B1",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:3}}>Poll · {poll.author}</div>
                        <div style={{fontFamily:"'Poppins',sans-serif",fontSize:16,fontWeight:600,color:"#14213D"}}>{poll.question}</div>
                        {deadlineDate&&<div style={{fontSize:11,color:expired?"#BF1E41":hoursLeft&&hoursLeft<24?LF.yellow:"#5B6878",fontWeight:500,marginTop:2}}>{expired?"Voting closed":`${hoursLeft} hours left to vote`}</div>}
                        {resolved&&<div style={{fontSize:13,color:"#00897F",fontWeight:500,marginTop:3}}>Result: {resolved}</div>}
                      </div>
                      {(amAdmin||poll.author===me.name)&&(
                        <button onClick={()=>deletePoll(poll.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:15,color:"#5B6878",padding:"0 4px"}}>🗑️</button>
                      )}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
                      {poll.options.map((o,i)=>{
                        const pct2=total>0?Math.round((o.votes.length/total)*100):0;
                        const voted=myVoteIdx===i;
                        const isLeading=o.votes.length>0&&o.votes.length===leading.votes.length;
                        return(
                          <div key={i}>
                            <button onClick={()=>canVote&&votePoll(poll.id,i)} style={{width:"100%",textAlign:"left",padding:"8px 12px",borderRadius:10,cursor:canVote?"pointer":"default",fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:voted?700:500,border:`2px solid ${voted?"#8C62D1":isLeading&&canVote?"#FF7F11":"#14213D26"}`,background:voted?"#8C62D114":isLeading&&canVote?"#FF7F1112":"#fff",color:voted?"#6D47B5":isLeading&&canVote?"#B85400":"#14213D",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <span>{voted?"✓ ":isLeading&&canVote?"🏆 ":""}{o.text}</span>
                              <span style={{fontSize:12,opacity:0.8,marginLeft:8,flexShrink:0}}>{pct2}%</span>
                            </button>
                            <div className="pbar-bg" style={{height:3,marginTop:2}}>
                              <div className="pbar-fill" style={{width:`${pct2}%`,background:voted?"#8C62D1":"#14213D26"}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                      <div style={{fontSize:12,color:"#5B6878",fontWeight:500}}>{myVoteIdx>=0?"✓ You voted":canVote?"Tap an option to vote":"Voting closed"}</div>
                      {amAdmin&&!resolved&&(
                        <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:12,color:"#5B6878",fontWeight:600}}>Set result:</span>
                          {poll.options.map((o,i)=>(
                            <button key={i} onClick={()=>overridePollResult(poll.id,o.text)} style={{background:"#14213D0a",border:"1px solid #14213D1f",borderRadius:8,padding:"2px 8px",cursor:"pointer",fontSize:11,color:"#5B6878",fontWeight:500}}>{o.text}</button>
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
            <input className="inp" placeholder="Say something…" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} style={{flex:1,minWidth:0}}/>
            <button className="btn" onClick={sendMessage} style={{padding:"11px 18px",flexShrink:0}}>Send</button>
          </div>
        </>)}

        {/* ── STATS (includes your own history) ── */}
        {tab==="Stats"&&(()=>{
          const fmtAmount=(v,type)=>type==="words"?`${(v||0).toLocaleString()} words`:(()=>{const h=Math.floor((v||0)/60),m=(v||0)%60;return h>0?`${h}h`+(m>0?` ${m}m`:""):`${m}m`;})();
          const statNum={fontFamily:"'Poppins',sans-serif",fontSize:24,fontWeight:700,color:"#14213D"};
          const statLbl={fontSize:13,color:"#5B6878",marginTop:2};
          const divider="1px solid #14213D14";
          const metCount=history.filter(h=>h.met).length;
          return(<>
          <div className="page-head">
            <div>
              <p className="eyebrow">#{me.groupId}</p>
              <h2 className="page-title">Stats</h2>
            </div>
          </div>

          {/* Your history */}
          <div className="card">
            <div className="card-title" style={{marginBottom:12}}>Your history</div>
            {history.length===0?(
              <div style={{fontSize:14,color:"#5B6878",textAlign:"center",padding:"8px 0"}}>Your history appears at the end of each week or check-in.</div>
            ):(<>
              <div style={{display:"flex",marginBottom:6}}>
                {[{l:"Periods",v:history.length,c:"#14213D"},{l:"Goal met",v:metCount,c:"#00897F"},{l:"Missed",v:history.length-metCount,c:"#6D47B5"}].map((st,i)=>(
                  <div key={i} style={{flex:1,textAlign:"center",borderRight:i<2?divider:"none"}}>
                    <div style={{...statNum,color:st.c}}>{st.v}</div>
                    <div style={statLbl}>{st.l}</div>
                  </div>
                ))}
              </div>
              {history.map((h,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderTop:divider}}>
                  <div style={{fontSize:20}}>{h.met?"🌟":"✏️"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:"#5B6878"}}>{h.week}</div>
                    <div style={{fontSize:15,fontWeight:600,color:"#14213D"}}>{fmtAmount(h.progress,h.goalType)} <span style={{fontWeight:500,color:"#5B6878"}}>of {fmtAmount(h.goal,h.goalType)}</span></div>
                  </div>
                  <span style={{fontSize:12,fontWeight:500,padding:"3px 10px",borderRadius:999,color:h.met?"#00897F":"#6D47B5",border:`1.5px solid ${h.met?"#00BFB2":"#8C62D1"}`}}>{h.met?"Goal met":"Missed"}</span>
                </div>
              ))}
            </>)}
          </div>

          {/* Group totals */}
          <div className="card">
            <div className="card-title" style={{marginBottom:12}}>Group output, all time</div>
            <div style={{display:"flex"}}>
              {totalGroupWords>0&&<div style={{flex:1,textAlign:"center",borderRight:totalGroupMinutes>0?divider:"none"}}>
                <div style={statNum}>{totalGroupWords.toLocaleString()}</div>
                <div style={statLbl}>words</div>
              </div>}
              {totalGroupMinutes>0&&<div style={{flex:1,textAlign:"center"}}>
                <div style={statNum}>{Math.floor(totalGroupMinutes/60)}h {totalGroupMinutes%60}m</div>
                <div style={statLbl}>writing time</div>
              </div>}
              {totalGroupWords===0&&totalGroupMinutes===0&&<div style={{flex:1,textAlign:"center",padding:12,color:"#5B6878",fontSize:14}}>No progress logged yet.</div>}
            </div>
          </div>

          {/* All-time leaderboard */}
          <div className="card">
            <div className="card-title" style={{marginBottom:4}}>All-time progress</div>
            {[...members].sort((a,b)=>(b.totalProgress||0)-(a.totalProgress||0)).map((w,i)=>(
              <div key={w.uid||w.name} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderTop:i>0?divider:"none"}}>
                <div style={{fontSize:22}}>{w.avatar}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:600,color:"#14213D"}}>{w.name}{w.isYou&&<span style={{color:"#6D47B5",fontWeight:600}}> (you)</span>}</div>
                  {(w.charityName||w.charity)&&<div style={{fontSize:13,color:"#5B6878"}}>{w.charityName||w.charity}</div>}
                </div>
                <div style={{fontFamily:"'Poppins',sans-serif",fontSize:16,fontWeight:700,color:"#14213D"}}>{fmtAmount(w.totalProgress,w.goalType)}</div>
              </div>
            ))}
          </div>

          {/* Group check-ins */}
          {groupCheckIns===null&&(
            <div className="card" style={{textAlign:"center",padding:20,color:"#5B6878",fontSize:14}}>Loading check-in results…</div>
          )}
          {groupCheckIns!==null&&groupCheckIns.length===0&&(
            <div className="card" style={{textAlign:"center",padding:20,color:"#5B6878",fontSize:14}}>Group check-in results appear after the first deadline.</div>
          )}
          {(groupCheckIns||[]).map(ci=>{
            const ciPayments=(ledger.entries||[]).filter(e=>e.checkInMs===ci.deadlineMs);
            return(
            <div key={ci.deadlineMs} className="card">
              <div className="card-title" style={{marginBottom:4}}>{ci.label}</div>
              {ci.entries.map((e,ei)=>(
                <div key={e.name} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderTop:ei>0?divider:"none"}}>
                  <div style={{fontSize:22}}>{e.avatar}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:600,color:"#14213D"}}>{e.name}{e.isYou&&<span style={{color:"#6D47B5"}}> (you)</span>}</div>
                    <div style={{fontSize:13,color:"#5B6878"}}>{fmtAmount(e.progress,e.goalType)} of {fmtAmount(e.goal,e.goalType)}</div>
                  </div>
                  <span style={{fontSize:12,fontWeight:500,padding:"3px 10px",borderRadius:999,color:e.met?"#00897F":"#6D47B5",border:`1.5px solid ${e.met?"#00BFB2":"#8C62D1"}`}}>{e.met?"Goal met":"Missed"}</span>
                </div>
              ))}
              {ci.entries.length===1&&(
                <div style={{fontSize:12,color:"#5B6878",marginTop:8,textAlign:"center"}}>Other members will appear after they next open the app.</div>
              )}
              {ciPayments.length>0&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:divider}}>
                  <div style={{fontSize:12,color:"#0062B1",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>Money allocated</div>
                  {ciPayments.map((pm,pi)=>(
                    <div key={pm.id||pi} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",fontSize:14}}>
                      <div style={{color:"#14213D"}}>{pm.type==="charity"?`To ${pm.name}`:pm.amount>=0?`Paid to ${pm.name}`:`Paid by ${pm.name}`}</div>
                      <div style={{fontWeight:500,color:pm.amount>=0?"#14213D":"#BF1E41"}}>{pm.amount>=0?"+":""}{fmtMoney(pm.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })}

          {/* Money */}
          <div className="card">
            <div className="card-title" style={{marginBottom:12}}>Money</div>
            <div style={{display:"flex"}}>
              {[{l:"donated",v:fmtMoney(totalCharity)},{l:"to winners",v:fmtMoney(totalPayouts)},{l:"prizes",v:totalPrizes}].map((st,i)=>(
                <div key={i} style={{flex:1,textAlign:"center",borderRight:i<2?divider:"none"}}>
                  <div style={{...statNum,fontSize:20}}>{st.v}</div>
                  <div style={statLbl}>{st.l}</div>
                </div>
              ))}
            </div>
            {(ledger.entries||[]).length>0&&(
              <div style={{marginTop:14}}>
                {[...(ledger.entries||[])].reverse().slice(0,20).map(e=>(
                  <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderTop:divider,gap:10}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:600,color:"#14213D"}}>{e.type==="charity"?`${e.name} → ${e.charityName||"charity"}`:`Payout to ${e.name}`}</div>
                      <div style={{fontSize:12,color:"#5B6878"}}>{fmtDate(e.ts)} · recorded by {e.recordedBy}</div>
                    </div>
                    <div style={{fontSize:14,fontWeight:500,color:"#14213D"}}>{fmtMoney(e.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </>);
        })()}

        {/* ── STAKES ── */}
        {tab==="Stakes"&&(<>
          <div className="page-head">
            <div>
              <p className="eyebrow">#{me.groupId}</p>
              <h2 className="page-title">Stakes</h2>
            </div>
          </div>
          <div className="card">
            <div className="card-title" style={{marginBottom:6}}>Your weekly goal</div>
            {isLocked&&<div style={{fontSize:14,color:"#B85400",marginBottom:12}}>Goals are locked. You can raise your goal but not lower it.</div>}
            {admin.changeWindowOpen&&<div style={{fontSize:14,color:"#0062B1",marginBottom:12}}>The change window is open for about {changeHoursLeft} more hours.</div>}
            <div className="pill" style={{marginBottom:12}}>
              <button onClick={()=>setGoalTypeEdit("words")} style={{background:goalTypeEdit==="words"?"#8C62D1":"transparent",color:goalTypeEdit==="words"?"#fff":"#14213D"}}>✍️ Words</button>
              <button onClick={()=>setGoalTypeEdit("time")}  style={{background:goalTypeEdit==="time"?"#8C62D1":"transparent",color:goalTypeEdit==="time"?"#fff":"#14213D"}}>⏱️ Time</button>
            </div>
            <div style={{display:"flex",gap:10}}>
              <input className="inp" type="number" value={goalInput} onChange={e=>setGoalInput(e.target.value)} style={{flex:1,minWidth:0}}/>
              <button className="btn" onClick={updateGoal} style={{padding:"11px 22px"}}>Set</button>
            </div>
            <div style={{fontSize:14,color:"#5B6878",marginTop:10}}>Current goal: <b style={{color:"#14213D"}}>{fmtGoal(me)} a week</b></div>
          </div>

          {admin.payoutMode==="charity"&&(
            <div className="card">
              <div className="card-title" style={{marginBottom:8}}>Your charity</div>
              {me.charityName?(
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                  <div>
                    <div style={{fontSize:17,fontWeight:700,color:"#14213D"}}>{me.charityName}</div>
                    <div style={{fontSize:13,color:"#5B6878",marginTop:2}}>Your stake goes here if you miss your goal.</div>
                  </div>
                  {!isLocked&&(
                    <button className="ghost-btn" onClick={()=>setShowCharityModal(true)}>Change</button>
                  )}
                </div>
              ):(
                <div>
                  <div style={{fontSize:14,color:"#5B6878",fontWeight:500,marginBottom:12}}>You haven't picked a charity yet!</div>
                  {!isLocked&&(
                    <button className="btn" onClick={()=>setShowCharityModal(true)} style={{width:"100%"}}>
                      Pick my charity
                    </button>
                  )}
                  {isLocked&&<div style={{fontSize:14,color:"#B85400"}}>Goals are locked, so your charity can't be changed right now.</div>}
                </div>
              )}
            </div>
          )}

          <div className="card" style={{textAlign:"center"}}>
            <div className="card-title" style={{marginBottom:6}}>The deal</div>
            <div style={{fontSize:15,color:"#14213D",lineHeight:1.7}}>
              Miss <b style={{color:"#0062B1"}}>{fmtGoal({...me,goalValue:periodGoal})}</b> for <b style={{color:"#0062B1"}}>{admin.threshold} check-in{admin.threshold===1?"":"s"}</b><br/>
              {admin.payoutMode==="pain"
                ?<span>and you'll be publicly roasted. 😈</span>
                :<><b style={{color:"#6D47B5"}}>{fmtMoney(admin.stake)}</b>{" "}
                  {admin.payoutMode==="winners"&&<span>is split among members who hit their goals.</span>}
                  {admin.payoutMode==="charity"&&<span>goes to {me.charityName||me.charity||"your charity"}.</span>}</>}
            </div>
          </div>

          <div style={{textAlign:"center",marginTop:4,display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
            <button onClick={()=>setShowPrivacy(true)} style={{background:"none",border:"none",color:"#5B6878",fontSize:12,cursor:"pointer",fontFamily:"'Inter',sans-serif",textDecoration:"underline"}}>Privacy Policy</button>
            <button onClick={handleReset} style={{background:"none",border:"none",color:"#6B7685",fontSize:12,cursor:"pointer",fontFamily:"'Inter',sans-serif",textDecoration:"underline"}}>Reset all data…</button>
          </div>
        </>)}

      </div>
    </div>
  );
}
