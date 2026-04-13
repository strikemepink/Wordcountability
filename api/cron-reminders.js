/**
 * /api/cron-reminders.js — Vercel cron function
 *
 * Runs every hour (configured in vercel.json).
 * Reads all user index records from _index/users/members/,
 * finds users whose writingReminder is on and whose reminderTime
 * matches the current UTC hour, and sends them a writing reminder push.
 *
 * Frequency logic:
 *   Daily   — send every day
 *   Weekly  — send on Mondays (UTC)
 *   Monthly — send on the 1st of each month (UTC)
 *
 * Reminder messages are chosen randomly from the confirmed list.
 */

const FIREBASE_PROJECT = process.env.VITE_FIREBASE_PROJECT_ID;
const CRON_SECRET      = process.env.CRON_SECRET; // optional — set in Vercel to secure the endpoint

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

function randomMessage() {
  return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
}

// ── Firestore REST list ───────────────────────────────────────────
async function firestoreList(collectionPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${collectionPath}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const docs = data?.documents || [];
  return docs.map(doc => {
    const raw = doc?.fields?.value?.stringValue;
    try { return JSON.parse(raw); } catch { return null; }
  }).filter(Boolean);
}

// ── Should this user get a reminder today? ────────────────────────
function shouldSendToday(frequency, now) {
  if (frequency === "Daily")   return true;
  if (frequency === "Weekly")  return now.getUTCDay() === 1; // Monday
  if (frequency === "Monthly") return now.getUTCDate() === 1;
  return false;
}

// ── Internal call to /api/notify ─────────────────────────────────
async function callNotify(playerId, title, body) {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://wordcountability.vercel.app";

  await fetch(`${baseUrl}/api/notify`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ playerId, title, body, type: "writingReminder" }),
  });
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Optional: protect the endpoint with a secret header
  if (CRON_SECRET && req.headers["x-cron-secret"] !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!FIREBASE_PROJECT) {
    return res.status(500).json({ error: "VITE_FIREBASE_PROJECT_ID not configured" });
  }

  const now        = new Date();
  const currentHour = now.getUTCHours(); // e.g. 9 for 09:xx UTC

  try {
    // Read all user index records
    const users = await firestoreList("_index/users/members");
    if (!users.length) return res.status(200).json({ ok: true, sent: 0, note: "No indexed users" });

    let sent = 0;
    const results = [];

    await Promise.all(
      users.map(async (user) => {
        if (!user) return;
        if (!user.writingReminder) return;         // reminders turned off
        if (!user.oneSignalPlayerId) return;       // no push subscription
        if (!user.reminderTime) return;

        // Parse the user's chosen time (stored as "HH:MM" local — we treat as UTC for simplicity;
        // a future improvement would store timezone offset)
        const [hStr] = user.reminderTime.split(":");
        const reminderHour = parseInt(hStr, 10);
        if (isNaN(reminderHour) || reminderHour !== currentHour) return;

        if (!shouldSendToday(user.reminderFrequency || "Daily", now)) return;

        const message = randomMessage();
        await callNotify(
          user.oneSignalPlayerId,
          "✍️ Time to write!",
          message
        );
        sent++;
        results.push(user.uid);
      })
    );

    return res.status(200).json({ ok: true, sent, uids: results });

  } catch (e) {
    console.error("cron-reminders error:", e);
    return res.status(500).json({ error: e.message });
  }
}
