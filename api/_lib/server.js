// api/_lib/server.js
// Shared helpers for the serverless functions. Files in folders starting with "_" are not
// turned into public endpoints by Vercel, so this is only usable from the other api files.
//
// Logs in to Firebase with the private service account key stored in the Vercel setting
// FIREBASE_SERVICE_ACCOUNT (the full JSON key file pasted in). The key never lives in the code.

const admin = require("firebase-admin");

const ONESIGNAL_APP_ID  = process.env.VITE_ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

function getApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured in Vercel");
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

function db() { return getApp().firestore(); }

// ── Firestore helpers ─────────────────────────────────────────────
// Every app document stores its data as a JSON string in a field called "value".

async function getValue(docPath) {
  const snap = await db().doc(docPath).get();
  const raw = snap.exists ? snap.get("value") : null;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function setValue(docPath, value) {
  await db().doc(docPath).set({ value: JSON.stringify(value) });
}

// Returns [{ id, data }] for every readable document in a collection
async function listValues(collectionPath) {
  const snap = await db().collection(collectionPath).get();
  return snap.docs.map(doc => {
    try { return { id: doc.id, data: JSON.parse(doc.get("value")) }; } catch { return { id: doc.id, data: null }; }
  });
}

async function docExists(docPath) {
  return (await db().doc(docPath).get()).exists;
}

// ── Caller checks ─────────────────────────────────────────────────

// Returns the signed-in user's uid from the "Authorization: Bearer <token>" header, or null.
async function getCallerUid(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try { return (await getApp().auth().verifyIdToken(token)).uid; } catch { return null; }
}

async function isGroupMember(groupId, uid) {
  if (!groupId || !uid || groupId.includes("/")) return false;
  return docExists(`groups/${groupId}/memberUids/${uid}`);
}

// ── OneSignal ─────────────────────────────────────────────────────

// Sends a push to the given player IDs. sendAfterIso (optional) schedules it for later.
async function sendPush(playerIds, title, body, sendAfterIso = null) {
  if (!playerIds || playerIds.length === 0) return { sent: 0 };
  const payload = {
    app_id:             ONESIGNAL_APP_ID,
    include_player_ids: playerIds,
    headings:           { en: title },
    contents:           { en: body  },
    web_url:            "https://wordcountability.vercel.app",
  };
  if (sendAfterIso) payload.send_after = sendAfterIso;
  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Basic ${ONESIGNAL_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  return { sent: playerIds.length, notifId: json.id || null, onesignal: json };
}

module.exports = { getValue, setValue, listValues, getCallerUid, isGroupMember, sendPush };
