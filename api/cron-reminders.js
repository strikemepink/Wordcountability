// api/cron-reminders.js
// Runs hourly via Vercel cron. Reads _index/users/members, finds users whose
// writing reminder is due in THEIR local timezone, and sends a push via /api/notify.

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${process.env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents`;

async function firestoreGet(path) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  // Value is stored in a "value" string field
  const valueField = data?.fields?.value?.stringValue;
  return valueField ? JSON.parse(valueField) : null;
}

async function firestoreList(path) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.documents || [];
}

function getLocalHourMinute(utcDate, timezone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(utcDate);
    const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
    const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0");
    return { hour, minute };
  } catch {
    // Fallback to UTC if timezone is invalid
    return { hour: utcDate.getUTCHours(), minute: utcDate.getUTCMinutes() };
  }
}

function shouldSendReminder(user, nowUtc) {
  if (!user.writingReminder || !user.oneSignalPlayerId) return false;

  const timezone = user.timezone || "UTC";
  const { hour: localHour } = getLocalHourMinute(nowUtc, timezone);

  const [reminderHour] = (user.reminderTime || "09:00").split(":").map(Number);

  if (localHour !== reminderHour) return false;

  const freq = user.reminderFrequency || "Daily";

  if (freq === "Daily") return true;

  // For Weekly: send on Mondays in user's local timezone
  if (freq === "Weekly") {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    const weekday = formatter.format(nowUtc);
    return weekday === "Mon";
  }

  // For Monthly: send on the 1st in user's local timezone
  if (freq === "Monthly") {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      day: "numeric",
    });
    const day = parseInt(formatter.format(nowUtc));
    return day === 1;
  }

  return false;
}

export default async function handler(req, res) {
  // Optional cron secret check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers["x-cron-secret"] !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nowUtc = new Date();
  let sent = 0;
  let checked = 0;

  try {
    // List all user index documents
    const docs = await firestoreList("_index/users/members");

    for (const doc of docs) {
      try {
        const valueField = doc?.fields?.value?.stringValue;
        if (!valueField) continue;
        const user = JSON.parse(valueField);
        checked++;

        if (!shouldSendReminder(user, nowUtc)) continue;

        // Send push via /api/notify
        const host = req.headers.host ? `https://${req.headers.host}` : `https://${process.env.VERCEL_URL}`;
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
    return res.status(500).json({ error: String(e) });
  }
}
