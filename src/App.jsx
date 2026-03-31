import { useState, useEffect, useRef } from "react";

// ── Storage keys ─────────────────────────────────────────────────
const KEY_ME     = "wca:me";
const KEY_HISTORY= "wca:history";
const KEY_GRP    = g=>`wca:member:${g}:`;
const KEY_MEMBER = (g,n)=>`wca:member:${g}:${n}`;
const KEY_CHAT   = g=>`wca:chat:${g}`;
const KEY_POLLS  = g=>`wca:polls:${g}`;
const KEY_ADMIN  = g=>`wca:admin:${g}`;
const KEY_LEDGER = g=>`wca:ledger:${g}`;

// ── Constants ────────────────────────────────────────────────────
const TABS        = ["Dashboard","Group","Chat","Stats","Stakes","History"];
const WEEK_DAYS   = ["M","T","W","T","F","S","S"];
const AVATARS     = ["🦄","🐬","🦋","🐞","🌈","⭐","🌷","🐧"];
const REACTIONS   = ["👍","👎","🦄","🌈","💖","⭐","🔥","🐬","✨","💫"];
const DURATIONS   = [{label:"1 Month",days:30},{label:"1 Quarter",days:90},{label:"6 Months",days:180},{label:"1 Year",days:365}];
const FREQUENCIES = ["Daily","Weekly","Bi-Weekly","Monthly"];

const LF={pink:"#FF2D9B",hotpink:"#FF6EC7",teal:"#E040FB",yellow:"#FFE600",purple:"#BF5FFF",blue:"#C77DFF",orange:"#FF7A00",lime:"#AAFF00",white:"#FFFFFF",offwhite:"#FFF0FA",darkbg:"#C8A8E9"};

// ── Global CSS ───────────────────────────────────────────────────
const G=`
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&display=swap');
  *{box-sizing:border-box;} body{margin:0;}

  /* ── Leopard print pattern ── */
  .leopard{
    background: linear-gradient(135deg, #6B0AC9 0%, #9B30FF 20%, #FF2D9B 45%, #FF7A00 65%, #FFE600 85%, #E040FB 100%);
    background-attachment: fixed;
  }
  .leopard-dashboard{ background: linear-gradient(135deg, #6B0AC9 0%, #9B30FF 30%, #FF2D9B 70%, #FF6EC7 100%); background-attachment:fixed; }
  .leopard-group    { background: linear-gradient(135deg, #FF2D9B 0%, #BF5FFF 40%, #6B0AC9 100%); background-attachment:fixed; }
  .leopard-chat     { background: linear-gradient(135deg, #E040FB 0%, #C77DFF 35%, #6B0AC9 70%, #BF5FFF 100%); background-attachment:fixed; }
  .leopard-stats    { background: linear-gradient(135deg, #FFE600 0%, #FF7A00 30%, #FF2D9B 65%, #BF5FFF 100%); background-attachment:fixed; }
  .leopard-stakes   { background: linear-gradient(135deg, #FF2D9B 0%, #FF7A00 40%, #FFE600 100%); background-attachment:fixed; }
  .leopard-history  { background: linear-gradient(135deg, #BF5FFF 0%, #6B0AC9 35%, #C77DFF 70%, #E040FB 100%); background-attachment:fixed; }
  .leopard-setup    { background: linear-gradient(135deg, #6B0AC9 0%, #9B30FF 20%, #FF2D9B 45%, #FF7A00 65%, #FFE600 85%, #E040FB 100%); background-attachment:fixed; }

  .root{min-height:100vh;font-family:'Outfit',sans-serif;color:#ffffff;font-weight:600;display:flex;flex-direction:column;align-items:center;padding-bottom:80px;}
  .card{background:#1A004488;border:1.5px solid #ffffff22;border-radius:20px;padding:20px;position:relative;backdrop-filter:blur(4px);text-shadow:-1px -1px 0 rgba(0,0,0,0.7),1px -1px 0 rgba(0,0,0,0.7),-1px 1px 0 rgba(0,0,0,0.7),1px 1px 0 rgba(0,0,0,0.7);}
  .card::before{display:none;}
  .btn{background:linear-gradient(135deg,#FF2D9B,#BF5FFF);color:#fff;border:none;border-radius:50px;padding:11px 24px;font-family:'Outfit',sans-serif;font-size:17px;cursor:pointer;font-weight:700;box-shadow:0 4px 20px #FF2D9B44;transition:transform 0.15s,box-shadow 0.15s;text-shadow:0 1px 3px rgba(0,0,0,0.6);}
  .btn:hover{transform:translateY(-2px);box-shadow:0 6px 28px #FF2D9B66;}
  .btn-teal{background:linear-gradient(135deg,#E040FB,#C77DFF)!important;box-shadow:0 4px 20px #E040FB44!important;}
  .btn-yellow{background:linear-gradient(135deg,#FFE600,#FF7A00)!important;color:#1A0030!important;box-shadow:0 4px 20px #FFE60044!important;}
  .btn-red{background:linear-gradient(135deg,#FF4444,#FF2D9B)!important;box-shadow:0 4px 20px #FF444455!important;}
  .inp{background:#ffffff18;border:2px solid #ffffff44;border-radius:14px;padding:11px 16px;color:#ffffff;font-family:'Outfit',sans-serif;font-size:16px;font-weight:600;outline:none;transition:all 0.2s;width:100%;}
  .inp::placeholder{color:#ffffffaa;}
  .inp:focus{border-color:#FF2D9B;background:#ffffff22;}
  .tab{background:none;border:none;cursor:pointer;font-family:'Outfit',sans-serif;font-size:15px;font-weight:800;letter-spacing:0.5px;padding:10px 12px 14px;transition:color 0.2s;white-space:nowrap;text-transform:uppercase;color:#ffffff;text-shadow:0 1px 4px rgba(0,0,0,0.9);}
  .pill{display:flex;background:#ffffff18;border:2px solid #ffffff33;border-radius:50px;padding:4px;gap:4px;}
  .pill button{flex:1;border:none;border-radius:50px;padding:12px 16px;font-family:'Outfit',sans-serif;font-size:16px;font-weight:700;cursor:pointer;transition:all 0.2s;color:#ffffffaa;background:transparent;}
  .pbar-bg{background:#ffffff22;border-radius:50px;height:10px;overflow:hidden;border:1px solid #ffffff22;}
  .pbar-fill{height:100%;border-radius:50px;transition:width 0.6s ease;}
  @keyframes shimmer{0%{background-position:-200% center;}100%{background-position:200% center;}}
  .holo{font-weight:900;background:linear-gradient(90deg,#FF9EE0,#ffffff,#E0AAFF,#FF9EE0);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmer 3s linear infinite;}
  @keyframes pop{0%{transform:scale(0.5);opacity:0;}60%{transform:scale(1.2);}100%{transform:scale(1);opacity:1;}}
  @keyframes msgIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
  .msg-in{animation:msgIn 0.25s ease forwards;}
  /* Universal text shadow for readability on gradient backgrounds */
  .root *{text-shadow:-1px -1px 0 rgba(0,0,0,0.75),1px -1px 0 rgba(0,0,0,0.75),-1px 1px 0 rgba(0,0,0,0.75),1px 1px 0 rgba(0,0,0,0.75);}
  .root .holo{text-shadow:none;}
  /* Colored text classes with white outline */
  .c-pink{color:#FF2D9B;text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff;}
  .c-yellow{color:#FFE600;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;}
  .c-lime{color:#AAFF00;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;}
  .c-orange{color:#FF7A00;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;}
  .c-hotpink{color:#FF6EC7;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;}
  .c-purple{color:#BF5FFF;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;}
  .btn,.btn-yellow,.btn-teal,.btn-red{text-shadow:-1px -1px 0 rgba(0,0,0,0.8),1px -1px 0 rgba(0,0,0,0.8),-1px 1px 0 rgba(0,0,0,0.8),1px 1px 0 rgba(0,0,0,0.8)!important;}
  .tab{text-shadow:-1px -1px 0 rgba(0,0,0,0.9),1px -1px 0 rgba(0,0,0,0.9),-1px 1px 0 rgba(0,0,0,0.9),1px 1px 0 rgba(0,0,0,0.9)!important;}

  .lbl{font-size:13px;color:#ffffff;text-transform:uppercase;letter-spacing:2px;font-weight:900;display:block;margin-bottom:10px;text-shadow:-1px -1px 0 rgba(0,0,0,0.9),1px 1px 0 rgba(0,0,0,0.9);}
  .colored-text{-webkit-text-stroke:0.5px rgba(0,0,0,0.8);paint-order:stroke fill;}
  .outline-text{text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff,0 0 4px rgba(0,0,0,0.5);}
  .shadow-strong{text-shadow:-1px -1px 0 rgba(0,0,0,0.9),1px -1px 0 rgba(0,0,0,0.9),-1px 1px 0 rgba(0,0,0,0.9),1px 1px 0 rgba(0,0,0,0.9),0 2px 6px rgba(0,0,0,0.8);}
  .modal-bg{position:fixed;inset:0;background:#00000088;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;}
  .modal{max-width:440px;width:100%;max-height:92vh;overflow-y:auto!important;border:1.5px solid #ffffff33!important;background:#2D006Eee!important;backdrop-filter:blur(12px);}
  .modal.card::before{display:none;}
  .locked-badge{background:linear-gradient(135deg,#FF4444,#BF5FFF);color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;}
  .open-badge{background:linear-gradient(135deg,#AAFF00,#E040FB);color:#1A0030;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;}
`;

// ── Helpers ──────────────────────────────────────────────────────
function getWeekKey(){const now=new Date(),j=new Date(now.getFullYear(),0,1),w=Math.ceil(((now-j)/86400000+j.getDay()+1)/7);return`${now.getFullYear()}-W${w}`;}
function todayIdx(){return(new Date().getDay()+6)%7;}
function fmtGoal(m){if(m.goalType==="words")return`${m.goalValue.toLocaleString()} words`;const h=Math.floor(m.goalValue/60),mn=m.goalValue%60;return h>0?"${h}h"+(mn>0?" "+mn+"m":""):mn+"m";}
function fmtProg(m){if(m.goalType==="words")return`${m.progressThisWeek.toLocaleString()} words`;const h=Math.floor(m.progressThisWeek/60),mn=m.progressThisWeek%60;return h>0?"${h}h"+(mn>0?" "+mn+"m":""):mn+"m";}
function fmtDate(ts){return new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}
function fmtTimer(s){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;if(h>0)return`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;return`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;}
function fmtMoney(n){return`$${n.toFixed(2)}`;}

// ── Ring ─────────────────────────────────────────────────────────
function Ring({pct,size=100,stroke=8}){
  const r=(size-stroke*2)/2,c=2*Math.PI*r,off=c-(Math.min(pct,100)/100)*c;
  return(<svg width={size} height={size} style={{transform:"rotate(-90deg)",filter:"drop-shadow(0 0 8px "+pct>=100?LF.lime:LF.pink+"88)"}}>
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

function normalizeUrl(s){
  s=s.trim();
  if(!s) return s;
  if(!/^https?:\/\//i.test(s)) s="https://"+s;
  return s;
}
function isValidUrl(s){
  s=normalizeUrl(s);
  try{const u=new URL(s);return(u.protocol==="https:"||u.protocol==="http:")&&u.hostname.includes(".");}catch{return false;}
}

// ── Setup ────────────────────────────────────────────────────────
function Setup({onSave}){
  const [name,setName]=useState(""), [avatar,setAvatar]=useState("🦄");
  const [gType,setGType]=useState("words"), [gVal,setGVal]=useState("");
  const [grp,setGrp]=useState(""), [isAdmin,setIsAdmin]=useState(false);
  const [groupPassword,setGroupPassword]=useState("");
  const [joinPassword,setJoinPassword]=useState("");
  const [pwError,setPwError]=useState("");
  const [checkingPw,setCheckingPw]=useState(false);

  const ok=name.trim()&&grp.trim()&&gVal&&(isAdmin?groupPassword.trim():joinPassword.trim());

  async function handleGo(){
    if(!ok) return;
    if(!isAdmin){
      setCheckingPw(true); setPwError("");
      try{
        const r=await window.storage.get("wca:admin:"+grp.trim(),true);
        if(!r){setPwError("Group not found. Check your Group ID.");setCheckingPw(false);return;}
        const a=JSON.parse(r.value);
        if(a.groupPassword&&a.groupPassword!==joinPassword.trim()){
          setPwError("Wrong password. Ask your admin.");setCheckingPw(false);return;
        }
      }catch{setPwError("Couldn't verify. Try again.");setCheckingPw(false);return;}
      setCheckingPw(false);
    }
    onSave({name:name.trim()||"Writer",avatar,goalType:gType,goalValue:parseInt(gVal)||1000,groupId:grp.trim()||"mygroup",isAdmin,charity:"",charityName:null,groupPassword:isAdmin?groupPassword.trim():""});
  }

  return(
    <div className="leopard leopard-setup" style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",padding:"32px 24px 48px",fontFamily:"'Outfit',sans-serif",color:"#fff"}}>
      <style>{G}</style>
      <div style={{maxWidth:420,width:"100%",display:"flex",flexDirection:"column",gap:16}}>
        <div style={{textAlign:"center",marginBottom:4}}>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:38,fontWeight:900,lineHeight:1.1,color:"#ffffff"}}>Wordcountability</div>
        </div>

        <div className="card"><span className="lbl">Your Name</span>
          <input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Alex"/>
        </div>

        <div className="card"><span className="lbl">Pick Your Player</span>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {AVATARS.map(a=><button key={a} onClick={()=>setAvatar(a)} style={{width:68,height:68,fontSize:32,border:"2px solid "+(avatar===a?LF.pink:"#ffffff33"),borderRadius:16,cursor:"pointer",background:avatar===a?"#FF2D9B22":"#ffffff18",transition:"all 0.2s",transform:avatar===a?"scale(1.1)":"scale(1)",boxShadow:avatar===a?"0 0 16px #FF2D9B66":"none"}}>{a}</button>)}
          </div>
        </div>

        <div className="card"><span className="lbl">Weekly Goal Type</span>
          <div className="pill" style={{marginBottom:12}}>
            <button onClick={()=>setGType("words")} style={{background:gType==="words"?"linear-gradient(135deg,#FF2D9B,#BF5FFF)":"transparent",color:"#ffffff"}}>✍️ Word Count</button>
            <button onClick={()=>setGType("time")} style={{background:gType==="time"?"linear-gradient(135deg,#E040FB,#C77DFF)":"transparent",color:"#ffffff"}}>⏱️ Time</button>
          </div>
          <input className="inp" type="number" value={gVal} onChange={e=>setGVal(e.target.value)} placeholder={gType==="words"?"e.g. 2000 words":"e.g. 120 minutes"}/>
          {gType==="time"&&<div style={{fontSize:14,color:"#ffffff",marginTop:6,fontWeight:800}}>Total minutes per week</div>}
        </div>

        <div className="card"><span className="lbl">Group ID</span>
          <input className="inp" value={grp} onChange={e=>setGrp(e.target.value.toLowerCase().replace(/\s/g,""))} placeholder="e.g. unicornwriters" style={{marginBottom:12}}/>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <input type="checkbox" id="adm" checked={isAdmin} onChange={e=>setIsAdmin(e.target.checked)} style={{accentColor:LF.pink,width:20,height:20,flexShrink:0}}/>
            <label htmlFor="adm" style={{fontSize:16,color:"#ffffff",fontWeight:700,cursor:"pointer"}}>I'm creating / administering this group ⭐</label>
          </div>
          {isAdmin?(
            <>
              <span className="lbl">Set a Group Password</span>
              <input className="inp" type="password" value={groupPassword} onChange={e=>setGroupPassword(e.target.value)} placeholder="Members will need this to join"/>
              <div style={{fontSize:14,color:"#ffffff",marginTop:6,fontWeight:700}}>Share this password with your group members.</div>
            </>
          ):(
            <>
              <span className="lbl">Group Password</span>
              <input className="inp" type="password" value={joinPassword} onChange={e=>setJoinPassword(e.target.value)} placeholder="Enter the group password" onKeyDown={e=>e.key==="Enter"&&handleGo()}/>
              {pwError&&<div style={{fontSize:14,color:LF.pink,fontWeight:800,marginTop:6}}>⚠️ {pwError}</div>}
              <div style={{fontSize:14,color:"#ffffff",marginTop:6,fontWeight:700}}>Ask your group admin for the password.</div>
            </>
          )}
          <div style={{fontSize:14,color:"#ffffff",marginTop:8,fontWeight:700}}>Everyone with the same Group ID shares a leaderboard &amp; chat.</div>
        </div>

        <button className="btn" onClick={handleGo} style={{fontSize:17,padding:16,opacity:ok?1:0.4}}>
          {checkingPw?"Checking...":"Let's GO! 🚀"}
        </button>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
export default function App(){
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
  const DEFAULT_ADMIN={duration:"1 Month",frequency:"Weekly",startDate:null,endDate:null,
    payoutMode:"charity",
    prizeMetric:"absolute",
    prizeDescription:"",
    goalsLocked:false,
    changeWindowOpen:false,changeWindowEnd:null,changeWindowDays:3,
    stake:25,threshold:3,
    groupPassword:""};
  const [admin,setAdmin]=useState(DEFAULT_ADMIN);
  const [showAdmin,setShowAdmin]=useState(false);
  const [adminDraft,setAdminDraft]=useState(DEFAULT_ADMIN);
  // ledger (shared, group-level)
  const [ledger,setLedger]=useState({charityTotals:{},payoutTotals:{},totalWords:0,totalMinutes:0,entries:[]});

  useEffect(()=>{loadAll();},[]);
  useEffect(()=>{return()=>clearInterval(timerRef.current);},[]);
  useEffect(()=>{if(chatEndRef.current)chatEndRef.current.scrollIntoView({behavior:"smooth"});},[messages]);

  // ── Check if change window has expired ──
  useEffect(()=>{
    if(!admin.changeWindowOpen||!admin.changeWindowEnd) return;
    const now=new Date();
    if(new Date(admin.changeWindowEnd)<now){
      // window expired, auto-close
      const upd={...admin,changeWindowOpen:false,changeWindowEnd:null};
      setAdmin(upd);
      if(me?.groupId) window.storage.set(KEY_ADMIN(me.groupId),JSON.stringify(upd),true).catch(()=>{});
    }
  },[admin,me]);

  async function safeGet(key, shared=false){
    try{ return await window.storage.get(key, shared); }catch{ return null; }
  }

  async function loadAll(){
    // Safety timeout — never hang on loading screen
    const timeout=setTimeout(()=>{},4000);
    try{
      const meRes=await safeGet(KEY_ME);
      if(!meRes){clearTimeout(timeout);return;}
      let d=JSON.parse(meRes.value);
      const wk=getWeekKey();
      if(d.lastResetWeek!==wk){
        const hRes=await safeGet(KEY_HISTORY);
        const hist=hRes?JSON.parse(hRes.value):[];
        const met=d.progressThisWeek>=d.goalValue;
        const entry={week:d.lastResetWeek,progress:d.progressThisWeek,goal:d.goalValue,goalType:d.goalType,met};
        const upd=[entry,...hist].slice(0,40);
        try{await window.storage.set(KEY_HISTORY,JSON.stringify(upd));}catch{}
        d={...d,progressThisWeek:0,dailyChecks:[false,false,false,false,false,false,false],lastResetWeek:wk};
        try{await window.storage.set(KEY_ME,JSON.stringify(d));}catch{}
        try{await pub(d);}catch{}
        setHistory(upd);
      } else {
        const hRes=await safeGet(KEY_HISTORY);
        setHistory(hRes?JSON.parse(hRes.value):[]);
      }
      setMe(d); setGoalInput(String(d.goalValue)); setGoalTypeEdit(d.goalType);
      clearTimeout(timeout);
      setReady(true); 
      if(d.groupId){
        loadMembers(d.groupId,d.name);
        loadChat(d.groupId);
        loadPolls(d.groupId);
        loadAdminData(d.groupId);
        loadLedger(d.groupId);
      }
    }catch(e){
      clearTimeout(timeout);
      
    }
  }

  async function pub(d){
    if(!d.groupId) return;
    try{
      await window.storage.set(KEY_MEMBER(d.groupId,d.name),JSON.stringify({
        name:d.name,avatar:d.avatar,goalValue:d.goalValue,goalType:d.goalType,
        progressThisWeek:d.progressThisWeek,isAdmin:d.isAdmin,charity:d.charity,charityName:d.charityName||null,
        totalProgress:d.totalProgress||0,updatedAt:Date.now()
      }),true);
    }catch(e){console.warn("pub failed",e);}
  }

  async function loadMembers(gid,myName){
    try{
      const ks=await window.storage.list(KEY_GRP(gid),true);
      if(!ks) return;
      const ms=[];
      for(const k of ks.keys){try{const r=await window.storage.get(k,true);if(r){const m=JSON.parse(r.value);ms.push({...m,isYou:m.name===myName});}}catch{}}
      setMembers(ms);
    }catch{}
  }

  async function loadChat(gid){try{const r=await safeGet(KEY_CHAT(gid),true);setMessages(r?JSON.parse(r.value):[]);}catch{}}
  async function loadPolls(gid){try{const r=await safeGet(KEY_POLLS(gid),true);setPolls(r?JSON.parse(r.value):[]);}catch{}}
  async function loadAdminData(gid){try{const r=await safeGet(KEY_ADMIN(gid),true);if(r){const a=JSON.parse(r.value);setAdmin(a);setAdminDraft(a);}}catch{}}
  async function loadLedger(gid){try{const r=await safeGet(KEY_LEDGER(gid),true);if(r)setLedger(JSON.parse(r.value));}catch{}}

  async function handleSetup({name,avatar,goalType,goalValue,groupId,isAdmin,charity,groupPassword}){
    const d={name,avatar,goalType,goalValue,groupId,isAdmin,charity,charityName:null,progressThisWeek:0,totalProgress:0,dailyChecks:[false,false,false,false,false,false,false],lastResetWeek:getWeekKey()};
    setMe(d); setGoalInput(String(goalValue)); setGoalTypeEdit(goalType); setReady(true);
    window.storage.set(KEY_ME,JSON.stringify(d)).catch(()=>{});
    pub(d).catch(()=>{});
    if(isAdmin&&groupPassword){
      const adminUpd={...DEFAULT_ADMIN,groupPassword};
      window.storage.set(KEY_ADMIN(groupId),JSON.stringify(adminUpd),true).catch(()=>{});
      setAdmin(adminUpd); setAdminDraft(adminUpd);
    }
    loadMembers(groupId,name); loadChat(groupId); loadPolls(groupId); loadAdminData(groupId); loadLedger(groupId);
    // Fetch charity name in background
    if(charity&&isValidUrl(charity)){
      fetchCharityName(normalizeUrl(charity)).then(charityName=>{
        if(charityName){
          const d2={...d,charityName};
          setMe(d2);
          window.storage.set(KEY_ME,JSON.stringify(d2)).catch(()=>{});
          pub(d2).catch(()=>{});
        }
      }).catch(()=>{});
    }
  }

  async function saveProgress(n){
    if(!n||n<=0||!me) return;
    const checks=[...me.dailyChecks]; checks[todayIdx()]=true;
    const newTotal=(me.totalProgress||0)+n;
    const upd={...me,progressThisWeek:me.progressThisWeek+n,totalProgress:newTotal,dailyChecks:checks};
    setMe(upd); setSpark(s=>s+1);
    window.storage.set(KEY_ME,JSON.stringify(upd)).catch(()=>{});
    pub(upd).catch(()=>{});
    loadMembers(me.groupId,me.name);
    updateLedgerProgress(n);
  }

  async function updateLedgerProgress(n){
    try{
      const r=await window.storage.get(KEY_LEDGER(me.groupId),true);
      const l=r?JSON.parse(r.value):{charityTotals:{},payoutTotals:{},prizeTotals:{},totalWords:0,totalMinutes:0,entries:[]};
      if(!l.prizeTotals) l.prizeTotals={};
      if(me.goalType==="words") l.totalWords=(l.totalWords||0)+n;
      else l.totalMinutes=(l.totalMinutes||0)+n;
      await window.storage.set(KEY_LEDGER(me.groupId),JSON.stringify(l),true);
      setLedger(l);
    }catch{}
  }

  async function logProgress(){
    const n=parseInt(logInput); if(!n||n<=0) return;
    setSaving(true); await saveProgress(n); setLogInput(""); setSaving(false);
  }

  // ── Timer ──
  function startTimer(){if(timerRunning)return;setTimerRunning(true);timerRef.current=setInterval(()=>setTimerSecs(s=>s+1),1000);}
  function pauseTimer(){clearInterval(timerRef.current);setTimerRunning(false);}
  async function stopAndSave(){
    clearInterval(timerRef.current); setTimerRunning(false);
    if(timerSecs<60){setTimerSecs(0);return;}
    const mins=Math.round(timerSecs/60);
    setTimerSessions(s=>[...s,{mins,ts:Date.now()}]);
    setTimerSecs(0);
    await saveProgress(mins);
  }

  // ── Goal update (with lock check) ──
  async function updateGoal(){
    const n=parseInt(goalInput); if(!n||n<=0||!me) return;
    const isLocked=admin.goalsLocked&&!admin.changeWindowOpen;
    if(isLocked&&n<me.goalValue){alert("🔒 Goals are locked! You can't lower your goal right now.");return;}
    const upd={...me,goalValue:n,goalType:goalTypeEdit};
    setMe(upd);
    window.storage.set(KEY_ME,JSON.stringify(upd)).catch(()=>{});
    pub(upd).catch(()=>{});
  }

  // ── Fetch charity name from URL ──
  async function fetchCharityName(url){
    try{
      const normalized=url.startsWith("http")?url:"https://"+url;
      // Try the base domain first for better results (e.g. baltimoreheritage.org not the full CiviCRM path)
      const base=new URL(normalized).origin;
      const res=await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(base)}`);
      const data=await res.json();
      const html=data.contents||"";
      const ogSite=html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"'<]+)["']/i);
      if(ogSite) return ogSite[1].trim();
      const ogTitle=html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"'<]+)["']/i);
      if(ogTitle) return ogTitle[1].trim().split(/[|\-–]/)[0].trim();
      const title=html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if(title) return title[1].trim().split(/[|\-–]/)[0].trim();
      // Fallback: clean up the domain name itself
      const host=new URL(normalized).hostname.replace(/^www\./,"").split(".")[0];
      return host.charAt(0).toUpperCase()+host.slice(1);
    }catch(e){
      // Last resort: extract readable name from domain
      try{
        const host=new URL(url.startsWith("http")?url:"https://"+url).hostname.replace(/^www\./,"").split(".")[0];
        return host.charAt(0).toUpperCase()+host.slice(1);
      }catch{ return null; }
    }
  }

  // ── Stakes / charity update ──
  async function updateMyCharity(url){
    const upd={...me,charity:url,charityName:null};
    setMe(upd);
    window.storage.set(KEY_ME,JSON.stringify(upd)).catch(()=>{});
    pub(upd).catch(()=>{});
    // Try to fetch the name in the background
    if(url&&isValidUrl(url)){
      const name=await fetchCharityName(normalizeUrl(url));
      if(name){
        const upd2={...upd,charityName:name};
        setMe(upd2);
        window.storage.set(KEY_ME,JSON.stringify(upd2)).catch(()=>{});
        pub(upd2).catch(()=>{});
      }
    }
  }

  // ── Admin save ──
  function saveAdminSettings(){
    const dur=DURATIONS.find(d=>d.label===adminDraft.duration);
    const start=new Date(), end=new Date(); end.setDate(end.getDate()+(dur?dur.days:30));
    const upd={...adminDraft,startDate:start.toISOString(),endDate:end.toISOString()};
    setAdmin(upd); setAdminDraft(upd); setShowAdmin(false);
    window.storage.set(KEY_ADMIN(me.groupId),JSON.stringify(upd),true).catch(()=>{});
  }

  // ── Toggle goal lock ──
  function toggleGoalLock(){
    const upd={...admin,goalsLocked:!admin.goalsLocked,changeWindowOpen:false,changeWindowEnd:null};
    setAdmin(upd); setAdminDraft(upd);
    window.storage.set(KEY_ADMIN(me.groupId),JSON.stringify(upd),true).catch(()=>{});
  }

  // ── Open change window ──
  function openChangeWindow(){
    const days=admin.changeWindowDays||3;
    const end=new Date(); end.setDate(end.getDate()+days);
    const upd={...admin,changeWindowOpen:true,changeWindowEnd:end.toISOString()};
    setAdmin(upd); setAdminDraft(upd);
    window.storage.set(KEY_ADMIN(me.groupId),JSON.stringify(upd),true).catch(()=>{});
  }

  // ── Record a payout/donation in ledger ──
  async function recordPayment(type,name,amount,charity){
    try{
      const r=await window.storage.get(KEY_LEDGER(me.groupId),true);
      const l=r?JSON.parse(r.value):{charityTotals:{},payoutTotals:{},prizeTotals:{},totalWords:0,totalMinutes:0,entries:[]};
      if(!l.prizeTotals) l.prizeTotals={};
      const entry={id:Date.now(),type,name,amount,charity,recordedBy:me.name,ts:Date.now()};
      l.entries=[...(l.entries||[]),entry];
      if(type==="charity"){l.charityTotals[charity]=(l.charityTotals[charity]||0)+amount;}
      else if(type==="payout"){l.payoutTotals[name]=(l.payoutTotals[name]||0)+amount;}
      else if(type==="prize"){l.prizeTotals[name]=amount;} // amount is description string for prizes
      await window.storage.set(KEY_LEDGER(me.groupId),JSON.stringify(l),true);
      setLedger(l);
    }catch{}
  }

  // ── Chat ──
  function sendMessage(){
    if(!chatInput.trim()||!me) return;
    const msg={id:Date.now(),author:me.name,avatar:me.avatar,text:chatInput.trim(),ts:Date.now(),reactions:{}};
    const upd=[...messages,msg].slice(-200);
    setMessages(upd); setChatInput("");
    window.storage.set(KEY_CHAT(me.groupId),JSON.stringify(upd),true).catch(()=>{});
  }
  function addReaction(msgId,emoji){
    const upd=messages.map(m=>{
      if(m.id!==msgId) return m;
      const r={...m.reactions};
      if(!r[emoji]) r[emoji]=[];
      r[emoji]=r[emoji].includes(me.name)?r[emoji].filter(n=>n!==me.name):[...r[emoji],me.name];
      return {...m,reactions:r};
    });
    setMessages(upd);
    window.storage.set(KEY_CHAT(me.groupId),JSON.stringify(upd),true).catch(()=>{});
  }

  // ── Polls ──
  function submitPoll(){
    if(!pollQ.trim()||pollOpts.filter(o=>o.trim()).length<2) return;
    const poll={id:Date.now(),question:pollQ.trim(),options:pollOpts.filter(o=>o.trim()).map(o=>({text:o.trim(),votes:[]})),author:me.name,ts:Date.now(),deadline:pollDeadline||null};
    const upd=[...polls,poll];
    setPolls(upd); setPollQ(""); setPollOpts(["",""]); setPollDeadline(""); setShowPollForm(false);
    window.storage.set(KEY_POLLS(me.groupId),JSON.stringify(upd),true).catch(()=>{});
  }
  function deletePoll(pollId){
    if(!window.confirm("Delete this poll?")) return;
    const upd=polls.filter(p=>p.id!==pollId);
    setPolls(upd);
    window.storage.set(KEY_POLLS(me.groupId),JSON.stringify(upd),true).catch(()=>{});
  }
  function votePoll(pollId,optIdx){
    const upd=polls.map(p=>{
      if(p.id!==pollId) return p;
      const opts=p.options.map((o,i)=>{const v=o.votes.filter(n=>n!==me.name);return i===optIdx?{...o,votes:[...v,me.name]}:{...o,votes:v};});
      return {...p,options:opts};
    });
    setPolls(upd);
    window.storage.set(KEY_POLLS(me.groupId),JSON.stringify(upd),true).catch(()=>{});
  }
  function overridePollResult(pollId,winnerText){
    const upd=polls.map(p=>p.id===pollId?{...p,adminOverride:winnerText,overriddenBy:me.name,overriddenAt:Date.now()}:p);
    setPolls(upd);
    window.storage.set(KEY_POLLS(me.groupId),JSON.stringify(upd),true).catch(()=>{});
  }

  async function handleReset(){
    if(!window.confirm("Reset ALL data — personal and group? This can't be undone. 😱")) return;
    // Personal keys
    for(const k of[KEY_ME,KEY_HISTORY])try{await window.storage.delete(k);}catch{}
    // Shared group keys
    if(me?.groupId){
      const gid=me.groupId;
      for(const k of[KEY_CHAT(gid),KEY_POLLS(gid),KEY_ADMIN(gid),KEY_LEDGER(gid)])try{await window.storage.delete(k,true);}catch{}
      // Delete all member entries
      try{
        const ks=await window.storage.list(KEY_GRP(gid),true);
        if(ks) for(const k of ks.keys)try{await window.storage.delete(k,true);}catch{}
      }catch{}
    }
    setMe(null); setReady(false); setHistory([]); setMembers([]);
    setMessages([]); setPolls([]); setLedger({charityTotals:{},payoutTotals:{},prizeTotals:{},totalWords:0,totalMinutes:0,entries:[]});
  }

  if(!ready) return <Setup onSave={handleSetup}/>;

  const pct=Math.min(Math.round((me.progressThisWeek/me.goalValue)*100),100);
  const left=Math.max(me.goalValue-me.progressThisWeek,0);
  const missed=history.filter(h=>!h.met).length;
  const atRisk=missed>=admin.threshold-1;
  const triggered=missed>=admin.threshold;
  const sorted=[...members].sort((a,b)=>(b.progressThisWeek/b.goalValue)-(a.progressThisWeek/a.goalValue));
  const now=new Date();
  const endDate=admin.endDate?new Date(admin.endDate):null;
  const daysLeft=endDate?Math.max(0,Math.ceil((endDate-now)/86400000)):null;
  const isLocked=admin.goalsLocked&&!admin.changeWindowOpen;
  const changeWindowEnds=admin.changeWindowEnd?new Date(admin.changeWindowEnd):null;
  const changeHoursLeft=changeWindowEnds?Math.max(0,Math.ceil((changeWindowEnds-now)/3600000)):null;

  const fmtLeft=()=>{if(me.goalType==="words")return`${left.toLocaleString()} words to go`;const h=Math.floor(left/60),m=left%60;return`${h>0?h+"h ":""}${m>0?m+"m":""} to go`;};

  // group stats
  const totalGroupWords=members.filter(m=>m.goalType==="words").reduce((s,m)=>s+(m.totalProgress||0),0)+(me.goalType==="words"?(me.totalProgress||0):0);
  const totalGroupMinutes=members.filter(m=>m.goalType==="time").reduce((s,m)=>s+(m.totalProgress||0),0)+(me.goalType==="time"?(me.totalProgress||0):0);
  const totalCharity=Object.values(ledger.charityTotals||{}).reduce((s,v)=>s+v,0);
  const totalPayouts=Object.values(ledger.payoutTotals||{}).reduce((s,v)=>s+v,0);
  const totalPrizes=Object.keys(ledger.prizeTotals||{}).length;

  return(
    <div className={`root leopard leopard-${tab.toLowerCase()}`}>
      <style>{G}</style>

      {/* ── Header ── */}
      <div style={{width:"100%",maxWidth:500,padding:"22px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:28,fontWeight:900,lineHeight:1,marginBottom:4,color:"#ffffff"}}>Wordcountability</div>
          <div style={{fontSize:15,color:LF.hotpink,fontWeight:800,display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"}}>
            {me.avatar} {me.name} · <span style={{color:"#ffffff"}}>#{me.groupId}</span>
            {me.isAdmin&&<span style={{background:"linear-gradient(135deg,"+LF.yellow+","+LF.orange+")",color:"#ffffff",fontSize:15,fontWeight:800,padding:"2px 8px",borderRadius:20}}>⭐ ADMIN</span>}
            {triggered&&<span style={{background:"linear-gradient(135deg,"+LF.orange+","+LF.pink+")",color:"#fff",fontSize:15,fontWeight:800,padding:"2px 8px",borderRadius:20}}>💸 PAY UP!</span>}
            {!triggered&&atRisk&&<span style={{background:"linear-gradient(135deg,"+LF.yellow+","+LF.orange+")",color:"#ffffff",fontSize:15,fontWeight:800,padding:"2px 8px",borderRadius:20}}>⚠️ AT RISK</span>}
            {isLocked&&<span className="locked-badge">🔒 Goals Locked</span>}
            {admin.changeWindowOpen&&<span className="open-badge">🔓 Change Window Open</span>}
          </div>
          {endDate&&(()=>{const modeLabel=admin.payoutMode==="winners"?"🏆 Payout to winners":admin.payoutMode==="pain"?"😈 To The Pain":admin.prizeEnabled?"🎁 Prize for top "+(admin.prizeMetric==="pct"?"% achiever":"performer"):"💝 Donate to charity";return <div style={{fontSize:16,color:LF.teal,fontWeight:800,marginTop:3}}>🏁 {daysLeft}d left · {admin.frequency} check-ins · {modeLabel}</div>;})()}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          {me.isAdmin&&<button className="btn btn-yellow" onClick={()=>{setAdminDraft({...admin});setShowAdmin(true);}} style={{fontSize:16,padding:"6px 10px"}}>⚙️ Admin</button>}
{endDate&&(()=>{const modeLabel=admin.payoutMode==="winners"?"🏆 Payout to winners":admin.payoutMode==="pain"?"😈 To The Pain":admin.prizeEnabled?"🎁 Prize for top "+(admin.prizeMetric==="pct"?"% achiever":"performer"):"💝 Donate to charity";return <div style={{fontSize:16,color:LF.teal,fontWeight:800,marginTop:3}}>🏁 {daysLeft}d left · {admin.frequency} check-ins · {modeLabel}</div>;})()}        </div>
      </div>

      {/* ── Admin Modal ── */}
      {showAdmin&&me.isAdmin&&(
        <div className="modal-bg">
          <div className="card modal">
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:20,color:LF.yellow,marginBottom:16}}>⚙️ Admin Settings</div>

            <span className="lbl">Challenge Duration</span>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
              {DURATIONS.map(d=><button key={d.label} onClick={()=>setAdminDraft(s=>({...s,duration:d.label}))} style={{padding:"7px 14px",border:"2px solid "+adminDraft.duration===d.label?LF.yellow:LF.purple+"44"+"",borderRadius:50,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:15,background:adminDraft.duration===d.label?"linear-gradient(135deg,"+LF.yellow+","+LF.orange+")":"#ffffff18",color:adminDraft.duration===d.label?"#1A0030":"#ffffff"}}>{d.label}</button>)}
            </div>

            <span className="lbl">Check-in Frequency</span>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
              {FREQUENCIES.map(f=><button key={f} onClick={()=>setAdminDraft(s=>({...s,frequency:f}))} style={{padding:"7px 14px",border:"2px solid "+adminDraft.frequency===f?LF.teal:LF.teal+"44"+"",borderRadius:50,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:15,background:adminDraft.frequency===f?"linear-gradient(135deg,"+LF.teal+","+LF.blue+")":"#ffffff18",color:adminDraft.frequency===f?LF.white:LF.teal}}>{f}</button>)}
            </div>

            <span className="lbl">What happens when someone fails?</span>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
              {[
                {mode:"charity", icon:"💝", label:"To Charity", desc:"Winners' stakes donated to each winner's chosen charity.", grad:"linear-gradient(135deg,${LF.pink},"+(LF.purple)+")", col:LF.white},
                {mode:"winners", icon:"🏆", label:"Cash to Winners", desc:"Failed stakes split equally among members who hit their goals.", grad:"linear-gradient(135deg,${LF.yellow},"+(LF.orange)+")", col:"#1A0030"},
                {mode:"pain",    icon:"😈", label:"To The Pain", desc:"Not ready for money stakes? Whoever fails gets mercilessly ridiculed by those who made their goals.", grad:`linear-gradient(135deg,#FF4444,#FF7A00)`, col:"#ffffff"},
              ].map(({mode,icon,label,desc,grad,col})=>(
                <button key={mode} onClick={()=>setAdminDraft(s=>({...s,payoutMode:mode}))} style={{background:adminDraft.payoutMode===mode?grad:"#ffffff18",border:"2px solid "+adminDraft.payoutMode===mode?"transparent":LF.purple+"44"+"",borderRadius:14,padding:"10px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.2s"}}>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,color:adminDraft.payoutMode===mode?col:LF.purple,marginBottom:2}}>{icon} {label}</div>
                  <div style={{fontSize:16,color:adminDraft.payoutMode===mode?col+"cc":LF.purple+"88",fontWeight:800}}>{desc}</div>
                </button>
              ))}
            </div>

            {/* Admin prize toggle - available for all modes */}
            <div style={{background:"#ffffff11",border:"1px solid #ffffff22",borderRadius:14,padding:12,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:adminDraft.prizeEnabled?10:0}}>
                <input type="checkbox" id="prizeToggle" checked={!!adminDraft.prizeEnabled} onChange={e=>setAdminDraft(s=>({...s,prizeEnabled:e.target.checked}))} style={{accentColor:LF.pink,width:18,height:18,flexShrink:0}}/>
                <label htmlFor="prizeToggle" style={{fontSize:15,color:"#ffffff",fontWeight:700,cursor:"pointer"}}>🏅 Also offer a Prize for the top performer</label>
              </div>
              {adminDraft.prizeEnabled&&(<>
                <span className="lbl" style={{marginTop:6}}>Prize Metric</span>
                <div className="pill" style={{marginBottom:8}}>
                  <button onClick={()=>setAdminDraft(s=>({...s,prizeMetric:"absolute"}))} style={{background:adminDraft.prizeMetric==="absolute"?"linear-gradient(135deg,#E040FB,#C77DFF)":"transparent",color:"#ffffff"}}>📈 Most Total</button>
                  <button onClick={()=>setAdminDraft(s=>({...s,prizeMetric:"pct"}))} style={{background:adminDraft.prizeMetric==="pct"?"linear-gradient(135deg,#FF2D9B,#BF5FFF)":"transparent",color:"#ffffff"}}>🎯 Highest %</button>
                </div>
                <span className="lbl">What's the Prize?</span>
                <input className="inp" placeholder="e.g. Free developmental edit, gift card..." value={adminDraft.prizeDescription||""} onChange={e=>setAdminDraft(s=>({...s,prizeDescription:e.target.value}))} style={{marginBottom:6}}/>
              </>)}
            </div>

            

            <span className="lbl">Stake Amount per Person</span>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              {[0,10,25,50,100,250].map(n=><button key={n} onClick={()=>setAdminDraft(s=>({...s,stake:n}))} style={{padding:"7px 14px",border:"2px solid "+adminDraft.stake===n?LF.pink:LF.purple+"44"+"",borderRadius:50,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:15,background:adminDraft.stake===n?"linear-gradient(135deg,"+LF.pink+","+LF.purple+")":"#ffffff18",color:adminDraft.stake===n?LF.white:LF.purple}}>${n}</button>)}
            </div>

            <span className="lbl">Miss Threshold (triggers stake)</span>
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setAdminDraft(s=>({...s,threshold:n}))} style={{flex:1,padding:"10px 0",border:"2px solid "+adminDraft.threshold===n?LF.pink:LF.purple+"44"+"",borderRadius:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:16,background:adminDraft.threshold===n?"linear-gradient(135deg,"+LF.pink+","+LF.purple+")":"#ffffff18",color:adminDraft.threshold===n?LF.white:LF.purple}}>{n}</button>)}
            </div>

            {/* Group Password */}
            <div style={{background:"#ffffff11",border:"1px solid #ffffff33",borderRadius:14,padding:14,marginBottom:14}}>
              <span className="lbl">🔑 Group Password</span>
              <input className="inp" type="password" placeholder="Set or change group password" value={adminDraft.groupPassword||""} onChange={e=>setAdminDraft(s=>({...s,groupPassword:e.target.value}))} style={{marginBottom:6}}/>
              <div style={{fontSize:14,color:"#ffffff",fontWeight:700}}>Members need this to join the group.</div>
            </div>

            {/* Goal Lock */}
            <div style={{background:"#FF444422",border:`2px solid #FF444444`,borderRadius:14,padding:14,marginBottom:14}}>
              <span className="lbl" style={{color:LF.orange}}>🔒 Goal Lock</span>
              <div style={{fontSize:15,color:"#ffffff",fontWeight:800,marginBottom:10}}>When locked, members cannot lower their goals. You can open a temporary change window.</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
                <span style={{fontSize:15,color:"#ffffff",fontWeight:800}}>Change window (days):</span>
                <input className="inp" type="number" min="1" max="14" value={adminDraft.changeWindowDays||3} onChange={e=>setAdminDraft(s=>({...s,changeWindowDays:parseInt(e.target.value)||3}))} style={{width:70,padding:"6px 10px",fontSize:13}}/>
              </div>
            </div>

            <div style={{display:"flex",gap:8,marginBottom:8,position:"sticky",bottom:0,background:"#2D006Eee",paddingTop:12,marginLeft:-20,marginRight:-20,paddingLeft:20,paddingRight:20,paddingBottom:4}}>
              <button className="btn" onClick={saveAdminSettings} style={{flex:1,fontSize:13}}>Save &amp; Activate 🌈</button>
              <button onClick={()=>setShowAdmin(false)} style={{flex:1,background:"#ffffff18",border:"2px solid "+LF.purple+"44",borderRadius:50,padding:11,fontFamily:"'Outfit',sans-serif",fontSize:15,color:"#ffffff",cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <div style={{width:"100%",maxWidth:500,display:"flex",padding:"14px 20px 0",borderBottom:"2px solid "+LF.pink+"33",overflowX:"auto"}}>
        {TABS.map(t=><button key={t} className="tab" onClick={()=>setTab(t)} style={{color:tab===t?LF.pink:"#ffffff",borderBottom:tab===t?"4px solid "+LF.pink+"":"4px solid transparent",textShadow:tab===t?"0 0 16px "+LF.pink+"":"none"}}>{t}</button>)}
      </div>

      <div style={{width:"100%",maxWidth:500,padding:"18px 20px 0",display:"flex",flexDirection:"column",gap:14}}>

        {/* ── DASHBOARD ── */}
        {tab==="Dashboard"&&(<>
          <div className="card" style={{border:"2px solid "+pct>=100?LF.lime:LF.pink+"66",position:"relative"}}>
            {spark>0&&Array.from({length:6},(_,i)=><span key={""+spark+"-"+i+""} style={{position:"absolute",left:""+15+Math.random()*70+"%",top:""+10+Math.random()*80+"%",fontSize:16,animation:"pop 0.5s ease forwards",pointerEvents:"none"}}>{"✨⭐💫🌟"[i%4]}</span>)}
            <div style={{display:"flex",alignItems:"center",gap:18}}>
              <div style={{position:"relative",flexShrink:0}}>
                <Ring pct={pct}/>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontFamily:"'Outfit',sans-serif",fontSize:22,fontWeight:900,color:pct>=100?LF.lime:LF.yellow}}>{pct}%</span>
                </div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:22,color:LF.white,marginBottom:2}}>{fmtProg(me)}</div>
                <div style={{fontSize:15,color:LF.hotpink,fontWeight:800,marginBottom:2}}>of {fmtGoal(me)}</div>
                <div style={{fontSize:15,color:pct>=100?LF.lime:LF.teal,fontWeight:800}}>{pct>=100?"🌟 GOAL CRUSHED! 🌟":fmtLeft()}</div>
                {history.filter(h=>h.met).length>0&&<div style={{fontSize:15,marginTop:4,color:LF.yellow,fontWeight:800}}>{"🔥".repeat(Math.min(history.filter(h=>h.met).length,3))} {history.filter(h=>h.met).length}wk streak!</div>}
              </div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:16}}>
              {WEEK_DAYS.map((d,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <div style={{width:"100%",height:8,borderRadius:4,background:me.dailyChecks[i]?"linear-gradient(90deg,"+LF.pink+","+LF.purple+")":i===todayIdx()?LF.pink+"33":"#ffffff18",boxShadow:me.dailyChecks[i]?"0 0 8px "+LF.pink+"66":"none"}}/>
                  <span style={{fontSize:15,color:i===todayIdx()?LF.pink:LF.purple+"88",fontWeight:800}}>{d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Log or Timer */}
          {me.goalType==="words"?(
            <div className="card">
              <span className="lbl">📝 Log Today's Words</span>
              <div style={{display:"flex",gap:10}}>
                <input className="inp" type="number" placeholder="words written today" value={logInput} onChange={e=>setLogInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&logProgress()} style={{flex:1}}/>
                <button className="btn" onClick={logProgress} disabled={saving} style={{padding:"11px 20px"}}>{saving?"✨":"+ Log"}</button>
              </div>
            </div>
          ):(
            <div className="card" style={{border:"2px solid "+timerRunning?LF.teal:LF.pink+"55"}}>
              <span className="lbl">⏱️ Writing Timer</span>
              <div style={{textAlign:"center",padding:"12px 0 16px"}}>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:52,color:timerRunning?LF.pink:LF.yellow,letterSpacing:2}}>{fmtTimer(timerSecs)}</div>
                <div style={{fontSize:16,fontWeight:800,marginTop:4,color:timerRunning?LF.pink:timerSecs>0?LF.yellow:"#ffffff"}}>{timerRunning?"● WRITING IN PROGRESS...":timerSecs>0?"⏸ Paused":"Hit Start when you begin ✨"}</div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {!timerRunning
                  ?<button className="btn" onClick={startTimer} style={{flex:1,fontSize:15,background:"linear-gradient(135deg,"+LF.pink+","+LF.purple+")"}}>{timerSecs>0?"▶ Resume":"▶ Start"} Writing</button>
                  :<button className="btn" onClick={pauseTimer} style={{flex:1,fontSize:15,background:"linear-gradient(135deg,"+LF.purple+","+LF.blue+")"}}>⏸ Pause</button>}
                {timerSecs>0&&<button className="btn btn-red" onClick={()=>{clearInterval(timerRef.current);setTimerRunning(false);setTimerSecs(0);}} style={{flex:1,fontSize:15}}>⏹ Stop</button>}
                {timerSecs>=60&&<button className="btn btn-yellow" onClick={stopAndSave} style={{width:"100%",fontSize:15,marginTop:4}}>✅ Save {Math.round(timerSecs/60)}m</button>}
              </div>
              {timerSessions.length>0&&(
                <div style={{marginTop:12,borderTop:"1px solid "+LF.purple+"33",paddingTop:10}}>
                  <div style={{fontSize:16,color:LF.teal,fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Today's Sessions</div>
                  {timerSessions.map((s,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:15,color:"#ffffff",fontWeight:800,padding:"2px 0"}}><span>Session {i+1}</span><span style={{color:LF.teal}}>{s.mins}m ✓</span></div>)}
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:800,marginTop:6,color:LF.yellow}}><span>Total today</span><span>{timerSessions.reduce((a,s)=>a+s.mins,0)}m 🔥</span></div>
                </div>
              )}
              <div style={{fontSize:16,color:"#ffffff",fontWeight:800,marginTop:10,textAlign:"center"}}>Sessions under 1 min aren't counted 🦄</div>
            </div>
          )}

          {/* Stake card */}
          <div className="card" style={{border:"2px solid "+triggered?LF.orange:atRisk?LF.yellow:admin.payoutMode==="pain"?"#FF444488":admin.payoutMode==="prize"?LF.teal:LF.pink+"44",background:triggered?"#2D000888":""}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <span className="lbl">{admin.payoutMode==="pain"?"😈 To The Pain":admin.payoutMode==="prize"?"🎁 Prize":"Your Stake 🔒"}</span>
                {admin.payoutMode==="pain"?(
                  <>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:18,color:"#FF4444"}}>😈 No money — just shame.</div>
                    <div style={{fontSize:14,color:"#ffffff",fontWeight:700,marginTop:3}}>Miss your goal and your group WILL hear about it.</div>
                  </>
                ):admin.payoutMode==="prize"?(
                  <>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:18,color:LF.teal}}>{admin.prizeDescription||"Prize TBA"}</div>
                    <div style={{fontSize:15,color:LF.hotpink,fontWeight:800,marginTop:3}}>{admin.prizeMetric==="pct"?"Highest % of goal wins":"Most "+(me.goalType==="words"?"words":"time")+" wins"} · no stake required 🎁</div>
                    {/* Show current leader */}
                    {sorted.length>0&&(()=>{
                      const leader=admin.prizeMetric==="pct"
                        ?[...sorted].sort((a,b)=>(b.progressThisWeek/b.goalValue)-(a.progressThisWeek/a.goalValue))[0]
                        :[...sorted].sort((a,b)=>(b.progressThisWeek||0)-(a.progressThisWeek||0))[0];
                      return <div style={{fontSize:15,color:LF.yellow,fontWeight:800,marginTop:4}}>🏅 Current leader: {leader.avatar} {leader.name}</div>;
                    })()}
                  </>
                ):(
                  <>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:18,color:triggered?LF.orange:atRisk?LF.yellow:LF.white}}>{fmtMoney(admin.stake)} → {admin.payoutMode==="winners"?"🏆 Winners":(me.charityName||me.charity)}</div>
                    <div style={{fontSize:15,color:LF.hotpink,fontWeight:800,marginTop:3}}>{missed}/{admin.threshold} missed · {admin.payoutMode==="winners"?"payout to winners":"your charity"}</div>
                  </>
                )}
              </div>
              <div style={{fontSize:32}}>{admin.payoutMode==="pain"?"😈":admin.payoutMode==="prize"?"🎁":triggered?"💸":atRisk?"⚠️":"🔒"}</div>
            </div>
            {triggered&&admin.payoutMode==="charity"&&<button className="btn btn-red" onClick={()=>recordPayment("charity",me.name,admin.stake,me.charity)} style={{marginTop:12,width:"100%",fontSize:13}}>Record Donation to {(me.charityName||me.charity)} →</button>}
            {triggered&&admin.payoutMode==="winners"&&<button className="btn btn-yellow" onClick={()=>recordPayment("payout",me.name,admin.stake,"")} style={{marginTop:12,width:"100%",fontSize:13}}>Record Payout of {fmtMoney(admin.stake)} →</button>}
            {admin.payoutMode==="prize"&&me.isAdmin&&endDate&&new Date()>endDate&&(()=>{
              const winner=admin.prizeMetric==="pct"
                ?[...members,...(me?[{...me,isYou:true}]:[])].sort((a,b)=>(b.progressThisWeek/b.goalValue)-(a.progressThisWeek/a.goalValue))[0]
                :[...members,...(me?[{...me,isYou:true}]:[])].sort((a,b)=>(b.progressThisWeek||0)-(a.progressThisWeek||0))[0];
              return winner?<button className="btn btn-teal" onClick={()=>recordPayment("prize",winner.name,admin.prizeDescription||"Prize","")} style={{marginTop:12,width:"100%",fontSize:13}}>🎁 Record Prize to {winner.avatar} {winner.name}</button>:null;
            })()}
          </div>
        </>)}

        {/* ── GROUP ── */}
        {tab==="Group"&&(<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:15,color:LF.teal}}>#{me.groupId} · This Period 🏆</div>
            <button className="btn btn-teal" onClick={()=>loadMembers(me.groupId,me.name)} style={{fontSize:16,padding:"6px 12px"}}>↻ Refresh</button>
          </div>
          {me.isAdmin&&(
            <div className="card" style={{border:"2px solid "+LF.orange+"55",background:"#FF440011"}}>
              <span className="lbl" style={{color:LF.orange}}>🔒 Goal Lock Controls</span>
              <div style={{fontSize:15,color:"#ffffff",fontWeight:800,marginBottom:10}}>
                {isLocked?"Goals are currently locked. Members cannot lower their goals.":admin.changeWindowOpen?"🔓 Change window open — closes in ~"+(changeHoursLeft||"?")+"h":"Goals are unlocked. Members can change freely."}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button className={admin.goalsLocked?"btn btn-teal":"btn btn-red"} onClick={toggleGoalLock} style={{fontSize:15,padding:"8px 16px"}}>
                  {admin.goalsLocked?"🔓 Unlock Goals":"🔒 Lock Goals"}
                </button>
                {admin.goalsLocked&&!admin.changeWindowOpen&&(
                  <button className="btn btn-yellow" onClick={openChangeWindow} style={{fontSize:15,padding:"8px 16px"}}>
                    🪟 Open {admin.changeWindowDays||3}-Day Change Window
                  </button>
                )}
                {admin.changeWindowOpen&&(
                  <button className="btn btn-red" onClick={async()=>{const upd={...admin,changeWindowOpen:false,changeWindowEnd:null};await window.storage.set(KEY_ADMIN(me.groupId),JSON.stringify(upd),true);setAdmin(upd);setAdminDraft(upd);}} style={{fontSize:15,padding:"8px 16px"}}>
                    Close Window Early
                  </button>
                )}
              </div>
            </div>
          )}
          {!me.isAdmin&&admin.changeWindowOpen&&(
            <div className="card" style={{border:"2px solid "+LF.lime+"55",background:"#AAFF0011"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,color:LF.lime,marginBottom:4}}>🔓 Goal Change Window is Open!</div>
              <div style={{fontSize:15,color:"#ffffff",fontWeight:800}}>You can adjust your goal until this window closes (~{changeHoursLeft}h left). Head to Stakes to update.</div>
            </div>
          )}
          {!me.isAdmin&&isLocked&&(
            <div className="card" style={{border:"2px solid "+LF.orange+"44"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,color:LF.orange,marginBottom:4}}>🔒 Goals Are Locked</div>
              <div style={{fontSize:15,color:"#ffffff",fontWeight:800}}>The admin has locked goals. You can't lower your goal, but raising it is always allowed!</div>
            </div>
          )}
          {sorted.length===0&&<div className="card" style={{textAlign:"center",padding:24}}><div style={{fontSize:32,marginBottom:8}}>🦄</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:15,color:LF.pink}}>No crew yet! Share <span style={{color:LF.yellow}}>#{me.groupId}</span></div></div>}
          {(()=>{
            const prizeLeader=admin.payoutMode==="prize"
              ?(admin.prizeMetric==="pct"
                ?[...sorted].sort((a,b)=>(b.progressThisWeek/b.goalValue)-(a.progressThisWeek/a.goalValue))[0]
                :[...sorted].sort((a,b)=>(b.progressThisWeek||0)-(a.progressThisWeek||0))[0])
              :null;
            return sorted.map((w,i)=>{
              const p=Math.min(Math.round((w.progressThisWeek/w.goalValue)*100),100);
              const medals=["🥇","🥈","🥉"];
              const isPrizeLeader=prizeLeader&&w.name===prizeLeader.name;
              const bar=p>=100?"linear-gradient(90deg,${LF.lime},"+(LF.teal)+")":i===0?"linear-gradient(90deg,${LF.yellow},"+(LF.orange)+")":"linear-gradient(90deg,${LF.pink},"+(LF.purple)+")";
              return(
                <div key={w.name} className="card" style={{border:"2px solid "+isPrizeLeader?LF.teal:w.isYou?LF.pink:LF.purple+"44",background:isPrizeLeader?"#E040FB11":w.isYou?"#FF2D9B11":""}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{fontSize:20}}>{medals[i]||""+i+1+""}</div>
                    <div style={{fontSize:20}}>{w.avatar}</div>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"'Outfit',sans-serif",fontSize:15,color:w.isYou?LF.yellow:LF.white}}>
                        {w.name}{w.isYou&&<span style={{fontSize:15,color:LF.hotpink}}> ← you!</span>}{w.isAdmin&&<span style={{fontSize:15,color:LF.yellow}}> ⭐</span>}
                        {isPrizeLeader&&<span style={{fontSize:15,background:"linear-gradient(135deg,"+LF.teal+","+LF.blue+")",color:LF.white,padding:"1px 7px",borderRadius:20,marginLeft:4}}>🎁 Leading</span>}
                      </div>
                      <div style={{fontSize:15,color:"#ffffff",fontWeight:800}}>{w.goalType==="words"?""+w.progressThisWeek?.toLocaleString()||0+"/"+w.goalValue?.toLocaleString()||0+"w":""+w.progressThisWeek||0+"/"+w.goalValue||0+"m"} · 💝 {(w.charityName||w.charity)||"—"}</div>
                    </div>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:18,color:p>=100?LF.lime:LF.yellow}}>{p}%</div>
                  </div>
                  <div className="pbar-bg"><div className="pbar-fill" style={{width:""+p+"%",background:bar}}/></div>
                </div>
              );
            });
          })()}
          <div className="card" style={{textAlign:"center"}}><div style={{fontSize:15,color:"#ffffff",fontWeight:800}}>🌈 Invite with Group ID: <span style={{color:LF.yellow,fontFamily:"'Outfit',sans-serif",fontSize:15}}>#{me.groupId}</span></div></div>
        </>)}

        {/* ── CHAT ── */}
        {tab==="Chat"&&(<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:800,color:"#ffffff"}}>💬 Group Chat</div>
            <div style={{display:"flex",gap:6}}>
              <button className="btn" style={{fontSize:13,padding:"6px 10px",background:"#ffffff22",boxShadow:"none"}} onClick={()=>{loadChat(me.groupId);loadPolls(me.groupId);}}>↻ Refresh</button>
              <button className="btn" onClick={()=>setShowPollForm(s=>!s)} style={{fontSize:13,padding:"6px 12px"}}>📊 {showPollForm?"Cancel":"Poll"}</button>
            </div>
          </div>

          {/* Poll creation form */}
          {showPollForm&&(
            <div className="card" style={{border:"2px solid "+LF.yellow+"55"}}>
              <span className="lbl">📊 Create a Poll</span>
              <input className="inp" placeholder="Your question..." value={pollQ} onChange={e=>setPollQ(e.target.value)} style={{marginBottom:10}}/>
              {pollOpts.map((o,i)=>(
                <div key={i} style={{display:"flex",gap:6,marginBottom:8}}>
                  <input className="inp" placeholder={"Option "+i+1+""} value={o} onChange={e=>{const opts=[...pollOpts];opts[i]=e.target.value;setPollOpts(opts);}} style={{flex:1}}/>
                  {pollOpts.length>2&&<button onClick={()=>setPollOpts(pollOpts.filter((_,j)=>j!==i))} style={{background:"none",border:"2px solid "+LF.pink+"55",borderRadius:10,padding:"0 12px",cursor:"pointer",color:LF.pink}}>✕</button>}
                </div>
              ))}
              {pollOpts.length<6&&<button onClick={()=>setPollOpts([...pollOpts,""])} style={{background:"none",border:"2px dashed #ffffff33",borderRadius:10,padding:8,width:"100%",cursor:"pointer",color:"#ffffff",fontSize:15,marginBottom:10}}>+ Add Option</button>}
              <span className="lbl" style={{marginTop:4}}>Voting Deadline (optional)</span>
              <input className="inp" type="datetime-local" value={pollDeadline} onChange={e=>setPollDeadline(e.target.value)} style={{marginBottom:12}}/>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-yellow" onClick={submitPoll} style={{flex:1,fontSize:15}}>Post Poll 📊</button>
                <button onClick={()=>setShowPollForm(false)} style={{flex:1,background:"#ffffff18",border:"2px solid #ffffff33",borderRadius:50,cursor:"pointer",fontSize:15,color:"#ffffff"}}>Cancel</button>
              </div>
            </div>
          )}

          {/* Combined chat + polls stream */}
          <div style={{background:"#ffffff11",border:"2px solid #ffffff22",borderRadius:20,padding:12,display:"flex",flexDirection:"column",gap:10,minHeight:240,maxHeight:480,overflowY:"auto"}}>
            {(()=>{
              // Merge messages and polls into one sorted stream
              const items=[
                ...messages.map(m=>({...m,_type:"msg"})),
                ...polls.map(p=>({...p,_type:"poll"}))
              ].sort((a,b)=>a.ts-b.ts);

              if(items.length===0) return <div style={{textAlign:"center",padding:36,color:"#ffffff99",fontSize:16}}>Say hi to your crew! 🌈</div>;

              return items.map(item=>{
                if(item._type==="msg"){
                  const msg=item;
                  const isMe=msg.author===me.name;
                  return(
                    <div key={msg.id} className="msg-in" style={{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start",gap:3}}>
                      {!isMe&&<div style={{fontSize:14,color:"#ffffff99",fontWeight:800,paddingLeft:4}}>{msg.avatar} {msg.author}</div>}
                      <div style={{maxWidth:"80%",background:isMe?"linear-gradient(135deg,"+LF.pink+"cc,"+LF.purple+"cc)":"#ffffff18",border:"1px solid "+isMe?LF.pink:"#ffffff33"+"",borderRadius:isMe?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"9px 13px"}}>
                        <div style={{fontSize:16,fontWeight:700,color:"#ffffff",lineHeight:1.5}}>{msg.text}</div>
                        <div style={{fontSize:11,color:"#ffffff66",marginTop:3}}>{fmtDate(msg.ts)}</div>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:3,paddingLeft:isMe?0:4,paddingRight:isMe?4:0,justifyContent:isMe?"flex-end":"flex-start",alignItems:"center"}}>
                        {REACTIONS.filter(r=>(msg.reactions[r]||[]).length>0).map(r=>{
                          const cnt=(msg.reactions[r]||[]).length;
                          const reacted=(msg.reactions[r]||[]).includes(me.name);
                          return <button key={r} onClick={()=>addReaction(msg.id,r)} style={{background:reacted?""+LF.pink+"33":"#ffffff18",border:"1px solid "+reacted?LF.pink:"#ffffff33"+"",borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",gap:3}}>
                            {r}<span style={{fontSize:12,color:reacted?LF.pink:"#ffffff",fontWeight:800}}>{cnt}</span>
                          </button>;
                        })}
                        <div style={{position:"relative"}}>
                          <button onClick={()=>setOpenPicker(openPicker===msg.id?null:msg.id)} style={{background:"#ffffff18",border:"1px solid #ffffff33",borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:13,color:"#ffffff"}}>＋😊</button>
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

                // Poll item
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
                  <div key={poll.id} className="msg-in" style={{background:"#2D006E99",border:"2px solid "+resolved?"#AAFF00":expired?"#ffffff33":LF.pink+"55",borderRadius:16,padding:12}}>
                    {/* Poll header */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{fontSize:12,color:"#ffffff77",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>📊 {poll.author} · poll</div>
                        <div style={{fontSize:16,fontWeight:900,color:"#ffffff"}}>{poll.question}</div>
                        {deadlineDate&&<div style={{fontSize:12,color:expired?"#ff8888":hoursLeft&&hoursLeft<24?LF.yellow:"#ffffff99",fontWeight:700,marginTop:2}}>{expired?"⏰ Voting closed":"⏰ "+hoursLeft+"h left to vote"}</div>}
                        {resolved&&<div style={{fontSize:13,color:"#AAFF00",fontWeight:800,marginTop:2}}>✅ Result: {resolved}</div>}
                      </div>
                      {(me.isAdmin||poll.author===me.name)&&(
                        <button onClick={()=>deletePoll(poll.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#ffffff55",padding:"0 4px"}} title="Delete poll">🗑️</button>
                      )}
                    </div>

                    {/* Options */}
                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
                      {poll.options.map((o,i)=>{
                        const pct2=total>0?Math.round((o.votes.length/total)*100):0;
                        const voted=myVoteIdx===i;
                        const isLeading=o.votes.length>0&&o.votes.length===leading.votes.length;
                        return(
                          <div key={i}>
                            <button onClick={()=>canVote&&votePoll(poll.id,i)} style={{width:"100%",textAlign:"left",padding:"8px 12px",borderRadius:10,cursor:canVote?"pointer":"default",fontFamily:"'Outfit',sans-serif",fontSize:15,fontWeight:voted?900:700,border:"2px solid "+voted?LF.pink:isLeading&&canVote?"#FFE600":"#ffffff33"+"",background:voted?""+LF.pink+"33":isLeading&&canVote?"#FFE60011":"#ffffff11",color:voted?LF.pink:isLeading&&canVote?LF.yellow:"#ffffff",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.15s"}}>
                              <span>{voted?"✓ ":isLeading&&canVote?"🏆 ":""}{o.text}</span>
                              <span style={{fontSize:13,opacity:0.8,marginLeft:8,flexShrink:0}}>{pct2}%</span>
                            </button>
                            <div className="pbar-bg" style={{height:3,marginTop:2}}>
                              <div className="pbar-fill" style={{width:""+pct2+"%",background:voted?"linear-gradient(90deg,"+LF.pink+","+LF.purple+")":"#ffffff33"}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                      <div style={{fontSize:13,color:"#ffffff77",fontWeight:700}}>{myVoteIdx>=0?"✓ You voted":canVote?"Tap an option to vote":"Voting closed"}</div>
                      {me.isAdmin&&!resolved&&(
                        <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:11,color:"#ffffff44",fontWeight:700}}>override:</span>
                          {poll.options.map((o,i)=>(
                            <button key={i} onClick={()=>overridePollResult(poll.id,o.text)} style={{background:"#ffffff11",border:"1px solid #ffffff22",borderRadius:8,padding:"2px 8px",cursor:"pointer",fontSize:11,color:"#ffffff66",fontWeight:700}}>{o.text}</button>
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
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,color:LF.teal}}>📊 Group Stats &amp; Ledger</div>

          {/* Group totals */}
          <div className="card" style={{background:`linear-gradient(135deg,#FF2D9B11,#BF5FFF11)`}}>
            <span className="lbl">🌍 Total Group Output — All Time</span>
            <div style={{display:"flex",gap:0}}>
              {totalGroupWords>0&&<div style={{flex:1,textAlign:"center",borderRight:totalGroupMinutes>0?"1px solid "+LF.purple+"33":"none"}}>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:26,color:LF.pink}}>{totalGroupWords.toLocaleString()}</div>
                <div style={{fontSize:16,color:"#ffffff",fontWeight:800,marginTop:2}}>Total Words ✍️</div>
              </div>}
              {totalGroupMinutes>0&&<div style={{flex:1,textAlign:"center"}}>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:26,color:LF.teal}}>{Math.round(totalGroupMinutes/60)}h {totalGroupMinutes%60}m</div>
                <div style={{fontSize:16,color:"#ffffff",fontWeight:800,marginTop:2}}>Total Writing Time ⏱️</div>
              </div>}
              {totalGroupWords===0&&totalGroupMinutes===0&&<div style={{flex:1,textAlign:"center",padding:16,color:"#ffffff",fontWeight:700,fontSize:13}}>No progress logged yet 🌈</div>}
            </div>
          </div>

          {/* Money ledger */}
          <div className="card">
            <span className="lbl">💸 Money Ledger</span>
            <div style={{display:"flex",gap:0,marginBottom:14}}>
              <div style={{flex:1,textAlign:"center",borderRight:"1px solid "+LF.purple+"33"}}>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:20,color:LF.lime}}>{fmtMoney(totalCharity)}</div>
                <div style={{fontSize:15,color:"#ffffff",fontWeight:800,marginTop:2}}>Donated 💝</div>
              </div>
              <div style={{flex:1,textAlign:"center",borderRight:"1px solid "+LF.purple+"33"}}>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:20,color:LF.yellow}}>{fmtMoney(totalPayouts)}</div>
                <div style={{fontSize:15,color:"#ffffff",fontWeight:800,marginTop:2}}>To Winners 🏆</div>
              </div>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:20,color:LF.teal}}>{totalPrizes}</div>
                <div style={{fontSize:15,color:"#ffffff",fontWeight:800,marginTop:2}}>Prizes Awarded 🎁</div>
              </div>
            </div>

            {Object.entries(ledger.charityTotals||{}).length>0&&(<>
              <div style={{fontSize:16,color:LF.teal,fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Charity Breakdown</div>
              {Object.entries(ledger.charityTotals).map(([c,amt])=>(
                <div key={c} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid "+LF.purple+"22",fontSize:15,fontWeight:800}}>
                  <span style={{color:"#ffffff"}}>💝 {c}</span><span style={{color:LF.lime}}>{fmtMoney(amt)}</span>
                </div>
              ))}
            </>)}

            {Object.entries(ledger.payoutTotals||{}).length>0&&(<>
              <div style={{fontSize:16,color:LF.yellow,fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginTop:10,marginBottom:6}}>Winner Payouts</div>
              {Object.entries(ledger.payoutTotals).map(([name,amt])=>(
                <div key={name} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid "+LF.purple+"22",fontSize:15,fontWeight:800}}>
                  <span style={{color:"#ffffff"}}>🏆 {name}</span><span style={{color:LF.yellow}}>{fmtMoney(amt)}</span>
                </div>
              ))}
            </>)}

            {Object.entries(ledger.prizeTotals||{}).length>0&&(<>
              <div style={{fontSize:16,color:LF.teal,fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginTop:10,marginBottom:6}}>Admin Prizes Awarded</div>
              {Object.entries(ledger.prizeTotals).map(([name,desc])=>(
                <div key={name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid "+LF.purple+"22",fontSize:15,fontWeight:800,gap:8}}>
                  <span style={{color:"#ffffff"}}>🎁 {name}</span><span style={{color:LF.teal,textAlign:"right",flex:1}}>{desc}</span>
                </div>
              ))}
            </>)}

            {totalCharity===0&&totalPayouts===0&&totalPrizes===0&&<div style={{textAlign:"center",padding:14,color:"#ffffff",fontWeight:700,fontSize:13}}>No payments recorded yet. Keep writing! 🦄</div>}
          </div>

          {/* Individual all-time stats */}
          <div className="card">
            <span className="lbl">🏅 Individual All-Time Progress</span>
            {[...members].sort((a,b)=>(b.totalProgress||0)-(a.totalProgress||0)).map((w,i)=>(
              <div key={w.name} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid "+LF.purple+"22"}}>
                <div style={{fontSize:18}}>{w.avatar}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,color:w.isYou?LF.yellow:LF.offwhite}}>{w.name}{w.isYou?" (you)":""}</div>
                  <div style={{fontSize:16,color:"#ffffff",fontWeight:800}}>💝 {(w.charityName||w.charity)||"—"}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,color:LF.teal}}>{w.goalType==="words"?""+(w.totalProgress||0).toLocaleString()+"w":""+Math.round((w.totalProgress||0)/60)+"h"}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Payment history */}
          {(ledger.entries||[]).length>0&&(
            <div className="card">
              <span className="lbl">📋 Payment History</span>
              {[...(ledger.entries||[])].reverse().slice(0,20).map(e=>(
                <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid "+LF.purple+"22"}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:800,color:e.type==="charity"?LF.lime:LF.yellow}}>{e.type==="charity"?"💝 "+e.name+" → "+e.charity+"":"🏆 Payout to "+e.name+""}</div>
                    <div style={{fontSize:15,color:"#ffffff"}}>{fmtDate(e.ts)} · recorded by {e.recordedBy}</div>
                  </div>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:15,color:e.type==="charity"?LF.lime:LF.yellow}}>{fmtMoney(e.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </>)}

        {/* ── STAKES ── */}
        {tab==="Stakes"&&(<>
          <div className="card">
            <span className="lbl">Goal Type &amp; Target</span>
            {isLocked&&<div style={{fontSize:15,color:LF.orange,fontWeight:800,marginBottom:10}}>🔒 Goals locked — you can raise your goal but not lower it{admin.changeWindowOpen?" (change window open for ~"+changeHoursLeft+"h)":"."}.</div>}
            <div className="pill" style={{marginBottom:12}}>
              <button onClick={()=>setGoalTypeEdit("words")} style={{background:goalTypeEdit==="words"?"linear-gradient(135deg,"+LF.pink+","+LF.purple+")":"transparent",color:goalTypeEdit==="words"?LF.white:LF.purple}}>✍️ Words</button>
              <button onClick={()=>setGoalTypeEdit("time")} style={{background:goalTypeEdit==="time"?"linear-gradient(135deg,"+LF.teal+","+LF.blue+")":"transparent",color:goalTypeEdit==="time"?LF.white:LF.teal}}>⏱️ Time</button>
            </div>
            <div style={{display:"flex",gap:10}}>
              <input className="inp" type="number" value={goalInput} onChange={e=>setGoalInput(e.target.value)} style={{flex:1}}/>
              <button className="btn" onClick={updateGoal} style={{padding:"11px 18px"}}>Set ✨</button>
            </div>
            <div style={{fontSize:15,color:LF.hotpink,marginTop:8,fontWeight:800}}>Current: {fmtGoal(me)}/week</div>
          </div>

          {admin.payoutMode==="charity"&&(
          <div className="card">
            <span className="lbl">Your Personal Charity 💝</span>
            <div style={{fontSize:15,color:"#ffffff",fontWeight:800,marginBottom:10}}>If you hit your goal, your stake goes to your charity. Winners' contributions are split among their chosen charities.</div>
            <input
              className="inp"
              value={me.charity||""}
              onChange={e=>updateMyCharity(e.target.value)}
              placeholder="https://www.redcross.org"
              style={{marginBottom:8,borderColor:me.charity&&!isValidUrl(me.charity)?LF.pink:me.charity&&isValidUrl(me.charity)?"#E040FB":undefined}}
            />
            {me.charity&&!isValidUrl(me.charity)&&<div style={{fontSize:15,color:LF.pink,fontWeight:800,marginBottom:8}}>Please enter a valid URL</div>}
            {me.charity&&isValidUrl(me.charity)&&<div style={{fontSize:15,color:"#E040FB",fontWeight:800,marginBottom:8}}>✓ {me.charityName||me.charity}</div>}
            <div style={{fontSize:15,color:"#ffffff",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Quick picks</div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {CHARITY_SUGGESTIONS.map(c=>{
                const sel=me.charity===c.url;
                return <button key={c.url} onClick={()=>updateMyCharity(c.url)} style={{background:sel?"#FF2D9B22":"transparent",border:"2px solid "+sel?LF.pink:"#ffffff33"+"",borderRadius:10,padding:"8px 12px",cursor:"pointer",textAlign:"left",transition:"all 0.15s"}}>
                  <div style={{fontSize:15,fontWeight:800,color:sel?LF.pink:"#ffffff"}}>{sel?"✨ ":""}{c.name}</div>
                  <div style={{fontSize:13,color:"#ffffffcc"}}>{c.url}</div>
                </button>;
              })}
            </div>
          </div>
          )}

          <div className="card" style={{background:"#ffffff11",border:`2px solid #ffffff33`,textAlign:"center"}}>
            <div style={{fontSize:16,color:"#ffffff",fontWeight:700,lineHeight:2}}>
              Miss <span style={{color:LF.yellow}}>{fmtGoal(me)}</span> for <span style={{color:LF.yellow}}>{admin.threshold} check-ins</span><br/>
              → <span style={{color:LF.pink}}>{fmtMoney(admin.stake)}</span>{" "}
              {admin.payoutMode==="winners"&&<span>split among 🏆 members who hit their goals</span>}
              {admin.payoutMode==="pain"&&<span style={{color:"#FF4444"}}>😈 you'll be publicly roasted by the winners</span>}
              {admin.payoutMode==="charity"&&<span>goes to 💝 {me.charityName||me.charity||"your charity"}</span>}
              {admin.payoutMode==="prize"&&<span>— plus 🎁 admin prize for top performer</span>}
              {admin.prizeEnabled&&admin.payoutMode!=="prize"&&<><br/><span style={{fontSize:14,color:LF.yellow}}>🎁 + Admin prize: {admin.prizeDescription||"TBA"}</span></>}
            </div>
          </div>
        </>)}

        {/* ── HISTORY ── */}
        {tab==="History"&&(<>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:15,color:LF.teal}}>📅 Your Writing History</div>
          {history.length===0&&<div className="card" style={{textAlign:"center",padding:24}}><div style={{fontSize:28,marginBottom:8}}>🌈</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,color:LF.pink}}>History appears at end of each period.</div></div>}
          {history.map((h,i)=>(
            <div key={i} className="card" style={{border:"2px solid "+h.met?LF.lime:LF.pink+"44"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:26}}>{h.met?"🌟":"💔"}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,color:"#ffffff",fontWeight:800,marginBottom:2}}>{h.week}</div>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:17,color:h.met?LF.lime:LF.pink}}>
                    {h.goalType==="words"?(h.progress?.toLocaleString()||0)+" words":(h.progress||0)+" min"}
                    <span style={{fontSize:15,color:"#ffffff",fontFamily:"'Outfit',sans-serif",fontWeight:800}}> / {h.goalType==="words"?""+h.goal?.toLocaleString()||0+"w":""+h.goal||0+"m"}</span>
                  </div>
                </div>
                <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,color:LF.white,background:h.met?"linear-gradient(135deg,"+LF.lime+","+LF.teal+")":"linear-gradient(135deg,"+LF.pink+","+LF.purple+")",padding:"4px 10px",borderRadius:20}}>{h.met?"NAILED IT":"missed"}</div>
              </div>
            </div>
          ))}
          {history.length>0&&(
            <div className="card">
              <div style={{display:"flex"}}>
                {[{l:"Periods",v:history.length,c:LF.teal},{l:"Nailed it",v:history.filter(h=>h.met).length,c:LF.lime},{l:"Missed",v:history.filter(h=>!h.met).length,c:LF.pink}].map((s,i)=>(
                  <div key={i} style={{flex:1,textAlign:"center",borderRight:i<2?"1px solid "+LF.purple+"33":"none"}}>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:24,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:16,color:"#ffffff",fontWeight:800,marginTop:2}}>{s.l}</div>
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
