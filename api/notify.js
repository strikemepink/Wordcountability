/**
 * /api/notify.js — Vercel serverless function
 *
 * Sends a push notification via OneSignal.
 * Supports two modes:
 *   1. Direct:  { playerId, title, body, type }
 *   2. Fan-out: { groupId, notifType, title, body, excludeUid }
 *      Reads all group members from Firestore, filters by their notifPrefs,
 *      and sends to each member who has that notification type enabled.
 *
 * POST /api/notify
 */

const ONESIGNAL_APP_ID  = process.env.VITE_ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const FIREBASE_PROJECT  = process.env.VITE_FIREBASE_PROJECT_ID;

// ── Firestore REST helper ─────────────────────────────────────────
// Uses the Firestore REST API so we don't need the Admin SDK.
// Reads a document by its full path (e.g. "groups/mygroup/members/Alex").
async function firestoreGet(docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${docPath}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  // Documents store our data as { fields: { value: { stringValue: "..." } } }
  const raw = data?.fields?.value?.stringValue;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Lists all documents in a Firestore collection via REST.
// Returns an array of parsed { id, data } objects.
async function firestoreList(collectionPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${collectionPath}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const docs = data?.documents || [];
  return docs.map(doc => {
    const raw = doc?.fields?.value?.stringValue;
    const id  = doc.name?.split("/").pop();
    try { return { id, data: JSON.parse(raw) }; } catch { return null; }
  }).filter(Boolean);
}

// ── OneSignal send ────────────────────────────────────────────────
async function sendPush(playerIds, title, body) {
  if (!playerIds || playerIds.length === 0) return { sent: 0 };
  const payload = {
    app_id:             ONESIGNAL_APP_ID,
    include_player_ids: playerIds,
    headings:           { en: title },
    contents:           { en: body  },
    web_url:            "https://wordcountability.vercel.app",
  };
  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Basic ${ONESIGNAL_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  return { sent: playerIds.length, onesignal: json };
}

// ── Fan-out: get player IDs for a group filtered by notifType ─────
async function getGroupPlayerIds(groupId, notifType, excludeUid) {
  // 1. Get all memberUid records for the group (these hold the uid)
  const memberUids = await firestoreList(`groups/${groupId}/memberUids`);
  if (!memberUids.length) return [];

  // 2. For each uid, read the user's index record (fast — small doc)
  //    The index lives at _index/users/members/{uid}
  const playerIds = [];
  await Promise.all(
    memberUids.map(async ({ id: uid }) => {
      if (uid === excludeUid) return; // don't notify the person who triggered the event
      try {
        const idx = await firestoreGet(`_index/users/members/${uid}`);
        if (!idx) return;
        if (!idx.oneSignalPlayerId) return;
        // Check the user's full record for their notifPrefs
        const user = await firestoreGet(`users/${uid}`);
        if (!user) return;
        const prefs = user.notifPrefs || {};
        if (prefs[notifType] === false) return; // explicitly disabled
        playerIds.push(idx.oneSignalPlayerId);
      } catch { /* skip this user */ }
    })
  );
  return playerIds;
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
    return res.status(500).json({ error: "OneSignal env vars not configured" });
  }

  const { playerId, title, body, type, groupId, notifType, excludeUid } = req.body || {};

  try {
    // Mode 1: direct send to a single player
    if (playerId) {
      const result = await sendPush([playerId], title, body);
      return res.status(200).json({ ok: true, ...result });
    }

    // Mode 2: fan-out to a group
    if (groupId && notifType) {
      if (!FIREBASE_PROJECT) {
        return res.status(500).json({ error: "VITE_FIREBASE_PROJECT_ID not configured" });
      }
      const playerIds = await getGroupPlayerIds(groupId, notifType, excludeUid);
      if (playerIds.length === 0) {
        return res.status(200).json({ ok: true, sent: 0, note: "No eligible recipients" });
      }
      const result = await sendPush(playerIds, title, body);
      return res.status(200).json({ ok: true, ...result });
    }

    return res.status(400).json({ error: "Provide either playerId or groupId+notifType" });

  } catch (e) {
    console.error("notify error:", e);
    return res.status(500).json({ error: e.message });
  }
}
