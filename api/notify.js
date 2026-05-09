/**
 * /api/notify.js — Vercel serverless function
 *
 * Sends a push notification via OneSignal.
 * Supports three modes:
 *   1. Direct:  { playerId, title, body, type }
 *   2. Fan-out: { groupId, notifType, title, body, excludeUid }
 *      Reads all group members from Firestore, filters by their notifPrefs,
 *      and sends to each member who has that notification type enabled.
 *   3. Poll closing soon: { groupId, notifType: "pollClosingSoon", pollQuestion, pollDeadlineMs }
 *      Schedules a push 24h before the poll deadline for all group members
 *      with pollClosingSoon pref on. Uses OneSignal send_after field.
 *
 * POST /api/notify
 */

const ONESIGNAL_APP_ID  = process.env.VITE_ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const FIREBASE_PROJECT  = process.env.VITE_FIREBASE_PROJECT_ID;

// ── Firestore REST helpers ────────────────────────────────────────
async function firestoreGet(docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${docPath}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const raw = data?.fields?.value?.stringValue;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

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

async function firestoreSet(docPath, value) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${docPath}?updateMask.fieldPaths=value`;
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { value: { stringValue: JSON.stringify(value) } } }),
  });
}

// ── OneSignal send ────────────────────────────────────────────────
// sendAfterIso is optional — pass an ISO 8601 UTC string to schedule for the future.
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

// ── Fan-out: get player IDs for a group filtered by notifType ─────
async function getGroupPlayerIds(groupId, notifType, excludeUid) {
  const memberUids = await firestoreList(`groups/${groupId}/memberUids`);
  if (!memberUids.length) return [];

  const playerIds = [];
  await Promise.all(
    memberUids.map(async ({ id: uid }) => {
      if (uid === excludeUid) return;
      try {
        const idx = await firestoreGet(`_index/users/members/${uid}`);
        if (!idx) return;
        if (!idx.oneSignalPlayerId) return;
        const user = await firestoreGet(`users/${uid}`);
        if (!user) return;
        const prefs = user.notifPrefs || {};
        if (prefs[notifType] === false) return;
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

  const { playerId, title, body, type, groupId, notifType, excludeUid, pollQuestion, pollDeadlineMs } = req.body || {};

  try {
    // Mode 1: direct send to a single player
    if (playerId) {
      const result = await sendPush([playerId], title, body);
      return res.status(200).json({ ok: true, ...result });
    }

    // Mode 2: fan-out to a group (excludes pollClosingSoon — handled in Mode 3)
    if (groupId && notifType && notifType !== "pollClosingSoon") {
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

    // Mode 3: schedule "poll closing soon" push 24h before poll deadline
    if (groupId && notifType === "pollClosingSoon" && pollQuestion && pollDeadlineMs) {
      if (!FIREBASE_PROJECT) {
        return res.status(500).json({ error: "VITE_FIREBASE_PROJECT_ID not configured" });
      }
      const warnMs = pollDeadlineMs - 86400000; // 24h before deadline
      const now = Date.now();
      const memberUids = await firestoreList(`groups/${groupId}/memberUids`);
      const scheduledIds = [];

      await Promise.all(
        memberUids.map(async ({ id: uid }) => {
          try {
            const idx = await firestoreGet(`_index/users/members/${uid}`);
            if (!idx?.oneSignalPlayerId) return;
            const user = await firestoreGet(`users/${uid}`);
            if (!user) return;
            const prefs = user.notifPrefs || {};
            if (prefs.pollClosingSoon === false) return;

            if (warnMs <= now) {
              // Less than 24h away — send immediately
              const result = await sendPush(
                [idx.oneSignalPlayerId],
                "⏳ Poll closing soon",
                `"${pollQuestion}" closes in less than 24 hours — vote if you haven't!`
              );
              if (result.notifId) scheduledIds.push(result.notifId);
            } else {
              // Schedule for 24h before deadline
              const result = await sendPush(
                [idx.oneSignalPlayerId],
                "⏳ Poll closing soon",
                `"${pollQuestion}" closes tomorrow — vote if you haven't!`,
                new Date(warnMs).toISOString()
              );
              if (result.notifId) scheduledIds.push(result.notifId);
            }
          } catch { /* skip */ }
        })
      );

      // Save scheduled IDs to Firebase keyed by poll deadline so they can be cancelled later if needed
      const pollKey = `poll_${pollDeadlineMs}`;
      const existing = await firestoreGet(`groups/${groupId}/data/pollNotifs`) || {};
      existing[pollKey] = scheduledIds;
      await firestoreSet(`groups/${groupId}/data/pollNotifs`, existing);

      return res.status(200).json({ ok: true, mode: "pollClosingSoon", scheduled: scheduledIds.length });
    }

    return res.status(400).json({ error: "Provide either playerId or groupId+notifType" });

  } catch (e) {
    console.error("notify error:", e);
    return res.status(500).json({ error: e.message });
  }
}
