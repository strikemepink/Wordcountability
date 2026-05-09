// api/schedule-notifications.js
// Called by App.jsx when the admin saves challenge settings.
// Calculates all future notification times for every group member and schedules
// them via the OneSignal REST API using the send_after field.
// Cancels any previously scheduled notifications before scheduling new ones,
// so rescheduling when the admin edits settings is safe.

const ONESIGNAL_APP_ID  = process.env.VITE_ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const FIREBASE_PROJECT  = process.env.VITE_FIREBASE_PROJECT_ID;
const FIRESTORE_BASE    = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

// ── Firestore REST helpers ────────────────────────────────────────

async function firestoreGet(path) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`);
  if (!res.ok) return null;
  const doc = await res.json();
  if (!doc.fields?.value?.stringValue) return null;
  try { return JSON.parse(doc.fields.value.stringValue); } catch { return null; }
}

async function firestoreSet(path, value) {
  await fetch(`${FIRESTORE_BASE}/${path}?updateMask.fieldPaths=value`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { value: { stringValue: JSON.stringify(value) } } }),
  });
}

async function firestoreList(collectionPath) {
  const res = await fetch(`${FIRESTORE_BASE}/${collectionPath}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents || []).map(doc => {
    try { return JSON.parse(doc.fields?.value?.stringValue || "null"); } catch { return null; }
  }).filter(Boolean);
}

// ── OneSignal helpers ─────────────────────────────────────────────

// Schedules a single push to one player at a specific UTC time.
// Returns the OneSignal notification ID (used for cancellation later).
async function scheduleOneSignalNotif(playerId, title, body, sendAtUtcMs) {
  if (!playerId) return null;
  try {
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: [playerId],
        headings: { en: title },
        contents: { en: body },
        web_url: "https://wordcountability.vercel.app",
        send_after: new Date(sendAtUtcMs).toISOString(),
      }),
    });
    const data = await res.json();
    return data.id || null;
  } catch (e) {
    console.warn("scheduleOneSignalNotif failed", e);
    return null;
  }
}

// Cancels a previously scheduled OneSignal notification by ID.
async function cancelOneSignalNotif(notifId) {
  if (!notifId) return;
  try {
    await fetch(`https://onesignal.com/api/v1/notifications/${notifId}?app_id=${ONESIGNAL_APP_ID}`, {
      method: "DELETE",
      headers: { "Authorization": `Basic ${ONESIGNAL_API_KEY}` },
    });
  } catch (e) {
    console.warn("cancelOneSignalNotif failed", notifId, e);
  }
}

// ── Schedule calculation ──────────────────────────────────────────

function cadenceDays(freq) {
  if (freq === "Daily") return 1;
  if (freq === "Weekly") return 7;
  if (freq === "Bi-Weekly") return 14;
  return 30;
}

// Builds the list of { type, sendAtMs, title, body } for one user
// based on the challenge admin settings.
function buildSchedule(admin, user) {
  const schedule = [];
  const now = Date.now();
  if (!admin.firstCheckIn || !admin.startDate) return schedule;

  const cad = cadenceDays(admin.frequency || "Weekly");
  const cadMs = cad * 86400000;
  const firstCheckInMs = new Date(admin.firstCheckIn).getTime();
  const startMs = new Date(admin.startDate).getTime();
  const endMs = admin.endDate ? new Date(admin.endDate).getTime() : Infinity;
  const prefs = user.notifPrefs || {};

  const goalLabel = user.goalType === "words"
    ? `${(user.goalValue || 0).toLocaleString()} words`
    : (() => {
        const h = Math.floor((user.goalValue || 0) / 60);
        const m = (user.goalValue || 0) % 60;
        return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
      })();

  // Build list of all future check-in deadlines
  const deadlines = [];
  let cursor = firstCheckInMs;
  while (cursor <= endMs) {
    deadlines.push(cursor);
    cursor += cadMs;
  }

  deadlines.forEach((deadlineMs, i) => {
    const periodNum = i + 1;
    const ord = periodNum === 1 ? "1st" : periodNum === 2 ? "2nd" : periodNum === 3 ? "3rd" : `${periodNum}th`;

    // ⏰ Check-in warning — 24h before each deadline
    if (prefs.checkInWarning) {
      const sendAt = deadlineMs - 86400000;
      if (sendAt > now) {
        schedule.push({
          type: "checkInWarning",
          sendAtMs: sendAt,
          title: "⏰ Check-in tomorrow",
          body: `Your ${ord} check-in deadline is in 24 hours. Period goal: ${goalLabel}. Make it count!`,
        });
      }
    }
  });

  // 🚀 Challenge starting soon — 24h before challenge start
  // The cron also checks this, but scheduling via OneSignal is more reliable for exact timing.
  if (prefs.challengeStarting) {
    const sendAt = startMs - 86400000;
    if (sendAt > now) {
      schedule.push({
        type: "challengeStarting",
        sendAtMs: sendAt,
        title: "🚀 Challenge starts tomorrow!",
        body: `Your writing challenge kicks off in 24 hours. Your goal: ${goalLabel} per check-in. Get ready!`,
      });
    }
  }

  return schedule;
}

// ── Main handler ─────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { groupId, admin } = req.body || {};
  if (!groupId || !admin) return res.status(400).json({ error: "Missing groupId or admin" });

  console.log(`[schedule-notifications] groupId=${groupId}`);

  try {
    // 1. Load all group members from the user index
    const allUsers = await firestoreList("_index/users/members");
    const groupMembers = allUsers.filter(u => u && u.groupId === groupId && u.oneSignalPlayerId);

    if (groupMembers.length === 0) {
      return res.status(200).json({ ok: true, scheduled: 0, cancelled: 0, message: "No members with push enabled" });
    }

    // 2. Load and cancel any previously scheduled notification IDs
    const existing = await firestoreGet(`groups/${groupId}/data/scheduledNotifs`) || {};
    let cancelCount = 0;
    for (const notifIds of Object.values(existing)) {
      for (const notifId of (notifIds || [])) {
        await cancelOneSignalNotif(notifId);
        cancelCount++;
      }
    }
    console.log(`[schedule-notifications] Cancelled ${cancelCount} old notifications`);

    // 3. Schedule new notifications for each member
    const newSchedule = {}; // uid -> [notifId, ...]
    let scheduleCount = 0;

    for (const user of groupMembers) {
      if (!user.uid || !user.oneSignalPlayerId) continue;
      const notifList = buildSchedule(admin, user);
      const ids = [];

      for (const notif of notifList) {
        const id = await scheduleOneSignalNotif(
          user.oneSignalPlayerId,
          notif.title,
          notif.body,
          notif.sendAtMs
        );
        if (id) { ids.push(id); scheduleCount++; }
      }

      if (ids.length > 0) newSchedule[user.uid] = ids;
    }

    // 4. Save new scheduled notification IDs to Firebase for future cancellation
    await firestoreSet(`groups/${groupId}/data/scheduledNotifs`, newSchedule);

    console.log(`[schedule-notifications] Scheduled ${scheduleCount} notifications for ${groupMembers.length} members`);
    return res.status(200).json({ ok: true, scheduled: scheduleCount, cancelled: cancelCount, members: groupMembers.length });

  } catch (e) {
    console.error("[schedule-notifications] Error:", e);
    return res.status(500).json({ error: e.message });
  }
};
