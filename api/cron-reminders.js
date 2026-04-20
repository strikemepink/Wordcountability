// api/cron-reminders.js
// Runs hourly via external cron (cron-job.org). Reads _index/users/members,
// finds users whose writing reminder is due in THEIR local timezone,
// and sends a push via /api/notify.

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${process.env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents`;

async function firestoreList(path) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.documents || [];
}

function getLocalHour(utcDate, timezone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(utcDate);
    return parseInt(parts.find(p => p.type === "hour")?.value || "0");
  } catch {
    return utcDate.getUTCHours();
  }
}

function getLocalWeekday(utcDate, timezone) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(utcDate);
  } catch {
    return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][utcDate.getUTCDay()];
  }
}

function getLocalDay(utcDate, timezone) {
  try {
    return parseInt(new Intl.DateTimeFormat("en-US", { timeZone: timezone, day: "numeric" }).format(utcDate));
  } catch {
    return utcDate.getUTCDate();
  }
}

function shouldSendReminder(user, nowUtc) {
  const prefs = user.notifPrefs || {};
  if (!prefs.writingReminder || !user.oneSignalPlayerId) return false;
  const timezone = user.timezone || "UTC";
  const localHour = getLocalHour(nowUtc, timezone);
  const [reminderHour] = (prefs.reminderTime || "09:00").split(":").map(Number);
  if (localHour !== reminderHour) return false;
  const freq = prefs.reminderFrequency || "Daily";
  if (freq === "Daily") return true;
  if (freq === "Weekly") return getLocalWeekday(nowUtc, timezone) === "Mon";
  if (freq === "Monthly") return getLocalDay(nowUtc, timezone) === 1;
  return false;
}

module.exports = async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers["x-cron-secret"] !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nowUtc = new Date();
  let sent = 0;
  let checked = 0;

  try {
    const docs = await firestoreList("_index/users/members");

    for (const doc of docs) {
      try {
        const valueField = doc?.fields?.value?.stringValue;
        if (!valueField) continue;
        const user = JSON.parse(valueField);
        checked++;
        if (!shouldSendReminder(user, nowUtc)) continue;

        const host = `https://${req.headers.host}`;
        await fetch(`${host}/api/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: user.oneSignalPlayerId,
            title: "✍️ Time to write!",
            body: "Your writing reminder — open the app and log your words.",
            type: "writingReminder",
          }),
        });
        sent++;
      } catch (e) {
        console.warn("cron: error processing user", e);
      }
    }

    return res.status(200).json({ ok: true, checked, sent, utcHour: nowUtc.getUTCHours() });
  } catch (e) {
    console.error("cron-reminders error", e);
    return res.status(500).json({ error: e.message });
  }
}
