// api/cron-reminders.js
// Runs hourly via external cron (cron-job.org). Reads _index/users/members,
// finds users whose writing reminder or progress check-in is due in THEIR local timezone,
// and sends a push via /api/notify.

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${process.env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents`;

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

async function firestoreGet(path) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`);
  if (!res.ok) return null;
  return res.json();
}

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

function cadenceDays(freq) {
  if (freq === "Daily") return 1;
  if (freq === "Weekly") return 7;
  if (freq === "Bi-Weekly") return 14;
  return 30; // Monthly
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

function shouldSendProgressNotif(user, nowUtc) {
  const prefs = user.notifPrefs || {};
  if (!prefs.progressNotif || !user.oneSignalPlayerId) return false;
  // If combined, piggyback on the writing reminder — only fire when reminder fires
  if (prefs.progressNotifCombined !== false) {
    return shouldSendReminder(user, nowUtc);
  }
  // Standalone schedule
  const timezone = user.timezone || "UTC";
  const localHour = getLocalHour(nowUtc, timezone);
  const [progressHour] = (prefs.progressNotifTime || "09:00").split(":").map(Number);
  if (localHour !== progressHour) return false;
  const freq = prefs.progressNotifFrequency || "Daily";
  if (freq === "Daily") return true;
  if (freq === "Weekly") return getLocalWeekday(nowUtc, timezone) === "Mon";
  return false;
}

async function getAdminData(groupId) {
  try {
    const doc = await firestoreGet(`groups/${groupId}/data/admin`);
    if (!doc?.fields?.value?.stringValue) return null;
    return JSON.parse(doc.fields.value.stringValue);
  } catch {
    return null;
  }
}

function buildProgressMessage(user, admin, nowUtc) {
  if (!admin) return null;
  const { progressThisWeek = 0, goalValue: goal = 0, goalType = "words" } = user;
  const unit = goalType === "words" ? "words" : "minutes";

  // Find days left in current check-in period
  let daysLeft = 0;
  try {
    const firstCI = new Date(admin.firstCheckIn);
    const cad = cadenceDays(admin.frequency || "Weekly");
    let cursor = new Date(firstCI);
    while (cursor <= nowUtc) cursor.setDate(cursor.getDate() + cad);
    const msLeft = cursor - nowUtc;
    daysLeft = Math.max(0, Math.floor(msLeft / 86400000));
  } catch {
    daysLeft = 0;
  }

  const remaining = Math.max(0, goal - progressThisWeek);
  const pct = goal > 0 ? Math.round((progressThisWeek / goal) * 100) : 0;

  if (remaining === 0 || pct >= 100) {
    return {
      title: "🌟 Goal crushed!",
      body: `You've already hit your ${goalType} goal this period — incredible work! Keep the momentum going. 🎉`,
    };
  }

  if (daysLeft <= 1) {
    return {
      title: "⏰ Final push — you can do this!",
      body: `Just ${daysLeft === 0 ? "today" : "1 day"} left and ${remaining.toLocaleString()} ${unit} to go. Don't stop now! 💪`,
    };
  }

  if (pct >= 70) {
    return {
      title: "✨ So close — keep going!",
      body: `You're ${pct}% there with ${daysLeft} days left. Just ${remaining.toLocaleString()} ${unit} to cross the finish line. You've got this! 🚀`,
    };
  }

  if (pct >= 40) {
    return {
      title: "📊 On track — stay with it!",
      body: `You're ${pct}% of the way through your goal. ${remaining.toLocaleString()} ${unit} left and ${daysLeft} days to do it. Keep writing! ✍️`,
    };
  }

  // Behind
  return {
    title: "💜 Time to catch up!",
    body: `You're ${pct}% of the way to your goal with ${remaining.toLocaleString()} ${unit} left. ${daysLeft} days on the clock — you can still do this! 🔥`,
  };
}

module.exports = async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers["x-cron-secret"] !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nowUtc = new Date();
  let sent = 0;
  let checked = 0;

  // Cache admin data per group to avoid redundant Firestore reads
  const adminCache = {};

  try {
    const docs = await firestoreList("_index/users/members");

    for (const doc of docs) {
      try {
        const valueField = doc?.fields?.value?.stringValue;
        if (!valueField) continue;
        const user = JSON.parse(valueField);
        checked++;

        const host = `https://${req.headers.host}`;
        const sendingReminder = shouldSendReminder(user, nowUtc);
        const sendingProgress = shouldSendProgressNotif(user, nowUtc);

        if (!sendingReminder && !sendingProgress) continue;

        // Writing Reminder
        if (sendingReminder) {
          const msg = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
          await fetch(`${host}/api/notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              playerId: user.oneSignalPlayerId,
              title: "✍️ Time to write!",
              body: msg,
              type: "writingReminder",
            }),
          });
          sent++;
        }

        // Progress Check-in
        if (sendingProgress && user.groupId) {
          if (!adminCache[user.groupId]) {
            adminCache[user.groupId] = await getAdminData(user.groupId);
          }
          const admin = adminCache[user.groupId];
          const progressMsg = buildProgressMessage(user, admin, nowUtc);
          if (progressMsg) {
            await fetch(`${host}/api/notify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                playerId: user.oneSignalPlayerId,
                title: progressMsg.title,
                body: progressMsg.body,
                type: "progressCheckIn",
              }),
            });
            sent++;
          }
        }
      } catch (e) {
        console.warn("cron: error processing user", e);
      }
    }

    return res.status(200).json({ ok: true, checked, sent, utcHour: nowUtc.getUTCHours() });
  } catch (e) {
    console.error("cron-reminders error", e);
    return res.status(500).json({ error: e.message });
  }
};
