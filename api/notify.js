/**
 * /api/notify.js — Vercel serverless function
 *
 * Sends a push notification via OneSignal. Only signed-in users can call it: the app sends
 * the user's Firebase login token in the Authorization header.
 * Supports three modes:
 *   1. To self:  { toSelf: true, title, body, type }
 *      Sends to every device the caller has saved (phone, computer, etc.).
 *   2. Fan-out:  { groupId, notifType, title, body }
 *      Caller must be a member of the group. Sends to every other member who has that
 *      notification type enabled.
 *   3. Poll closing soon: { groupId, notifType: "pollClosingSoon", pollQuestion, pollDeadlineMs }
 *      Caller must be a member. Schedules a push 24h before the poll deadline for all group
 *      members with pollClosingSoon pref on. Uses OneSignal send_after field.
 *
 * POST /api/notify
 */

const { getValue, setValue, listValues, getCallerUid, isGroupMember, getPlayerIds, sendPush } = require("./_lib/server");

const FAN_OUT_TYPES = ["memberHitGoal", "newPoll", "newChatMessage"];

// Keeps notification text to a sensible length so the endpoint can't be used to send essays
function clip(s, max) { return String(s || "").slice(0, max); }

// ── Fan-out: get player IDs for a group filtered by notifType ─────
async function getGroupPlayerIds(groupId, notifType, excludeUid) {
  const memberUids = await listValues(`groups/${groupId}/memberUids`);
  const playerIds = [];
  await Promise.all(
    memberUids.map(async ({ id: uid }) => {
      if (uid === excludeUid) return;
      try {
        const ids = await getPlayerIds(uid);
        if (!ids.length) return;
        const user = await getValue(`users/${uid}`);
        if (!user) return;
        const prefs = user.notifPrefs || {};
        if (prefs[notifType] === false) return;
        playerIds.push(...ids);
      } catch { /* skip this user */ }
    })
  );
  return playerIds;
}

// ── Handler ───────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.VITE_ONESIGNAL_APP_ID || !process.env.ONESIGNAL_REST_API_KEY) {
    return res.status(500).json({ error: "OneSignal env vars not configured" });
  }

  const { toSelf, playerId, type, groupId, notifType, pollQuestion, pollDeadlineMs } = req.body || {};
  const title = clip(req.body?.title, 120);
  const body  = clip(req.body?.body, 300);

  try {
    const callerUid = await getCallerUid(req);
    if (!callerUid) return res.status(401).json({ error: "Sign-in required" });

    // Mode 1: send to all of the caller's saved devices ("playerId" kept for older app versions)
    if (toSelf || playerId) {
      const ids = await getPlayerIds(callerUid);
      if (!ids.length) return res.status(200).json({ ok: true, sent: 0, note: "No device saved" });
      const result = await sendPush(ids, title, body);
      return res.status(200).json({ ok: true, type, ...result });
    }

    if (!groupId || !(await isGroupMember(groupId, callerUid))) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    // Mode 2: fan-out to the rest of the group
    if (FAN_OUT_TYPES.includes(notifType)) {
      const playerIds = await getGroupPlayerIds(groupId, notifType, callerUid);
      if (playerIds.length === 0) {
        return res.status(200).json({ ok: true, sent: 0, note: "No eligible recipients" });
      }
      const result = await sendPush(playerIds, title, body);
      return res.status(200).json({ ok: true, ...result });
    }

    // Mode 3: schedule "poll closing soon" push 24h before poll deadline
    if (notifType === "pollClosingSoon" && pollQuestion && pollDeadlineMs) {
      const question = clip(pollQuestion, 150);
      const warnMs = Number(pollDeadlineMs) - 86400000; // 24h before deadline
      const now = Date.now();
      const memberUids = await listValues(`groups/${groupId}/memberUids`);
      const scheduledIds = [];

      await Promise.all(
        memberUids.map(async ({ id: uid }) => {
          try {
            const ids = await getPlayerIds(uid);
            if (!ids.length) return;
            const user = await getValue(`users/${uid}`);
            if (!user) return;
            const prefs = user.notifPrefs || {};
            if (prefs.pollClosingSoon === false) return;

            if (warnMs <= now) {
              // Less than 24h away — send immediately
              const result = await sendPush(
                ids,
                "⏳ Poll closing soon",
                `"${question}" closes in less than 24 hours — vote if you haven't!`
              );
              if (result.notifId) scheduledIds.push(result.notifId);
            } else {
              // Schedule for 24h before deadline
              const result = await sendPush(
                ids,
                "⏳ Poll closing soon",
                `"${question}" closes tomorrow — vote if you haven't!`,
                new Date(warnMs).toISOString()
              );
              if (result.notifId) scheduledIds.push(result.notifId);
            }
          } catch { /* skip */ }
        })
      );

      // Save scheduled IDs to Firebase keyed by poll deadline so they can be cancelled later if needed
      const pollKey = `poll_${pollDeadlineMs}`;
      const existing = await getValue(`groups/${groupId}/data/pollNotifs`) || {};
      existing[pollKey] = scheduledIds;
      await setValue(`groups/${groupId}/data/pollNotifs`, existing);

      return res.status(200).json({ ok: true, mode: "pollClosingSoon", scheduled: scheduledIds.length });
    }

    return res.status(400).json({ error: "Provide toSelf, or groupId+notifType" });

  } catch (e) {
    console.error("notify error:", e);
    return res.status(500).json({ error: e.message });
  }
};
