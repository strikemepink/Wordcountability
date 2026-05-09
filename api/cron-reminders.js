// api/cron-reminders.js
// Runs hourly via external cron (cron-job.org). Reads _index/users/members,
// finds users whose writing reminder or progress check-in is due in THEIR local timezone,
// and sends a push via /api/notify.
// Also handles:
//   - Missed check-in: fires in the hour after a check-in deadline if the user missed their goal
//   - Challenge starting soon: fires when the challenge start is 23-25h away

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

// ── Missed check-in helpers ───────────────────────────────────────
// Returns the deadline timestamp (ms) if one passed within the last hour, or null.
function deadlinePassedThisHour(admin, nowMs) {
  if (!admin?.firstCheckIn) return null;
  const cad = cadenceDays(admin.frequency || "Weekly");
  const cadMs = cad * 86400000;
  const firstCI = new Date(admin.firstCheckIn).getTime();
  const endMs = admin.endDate ? new Date(admin.endDate).getTime() : Infinity;
  const hourAgo = nowMs - 3600000;
  let cursor = firstCI;
  while (cursor <= endMs && cursor <= nowMs + cadMs) {
    if (cursor > hourAgo && cursor <= nowMs) return cursor;
    cursor += cadMs;
  }
  return null;
}

function ordinal(n) {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

function checkInNumber(admin, deadlineMs) {
  if (!admin?.firstCheckIn) return 1;
  const cad = cadenceDays(admin.frequency || "Weekly");
  const cadMs = cad * 86400000;
  const firstCI = new Date(admin.firstCheckIn).getTime();
  return Math.round((deadlineMs - firstCI) / cadMs) + 1;
}

function remainingCheckIns(admin, deadlineMs) {
  if (!admin?.firstCheckIn || !admin?.endDate) return null;
  const cad = cadenceDays(admin.frequency || "Weekly");
  const cadMs = cad * 86400000;
  const endMs = new Date(admin.endDate).getTime();
  let count = 0;
  let cursor = deadlineMs + cadMs;
  while (cursor <= endMs) { count++; cursor += cadMs; }
  return count;
}

// ── Challenge starting soon helper ───────────────────────────────
// Returns true if challenge starts in 23-25h (handles ±1h cron jitter).
function challengeStartsIn24h(admin, nowMs) {
  if (!admin?.startDate) return false;
  const startMs = new Date(admin.startDate).getTime();
  const msUntil = startMs - nowMs;
  return msUntil > 23 * 3600000 && msUntil <= 25 * 3600000;
}

module.exports = async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers["x-cron-secret"] !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nowUtc = new Date();
  const nowMs = nowUtc.getTime();
  let sent = 0;
  let checked = 0;

  // Cache admin data per group to avoid redundant Firestore reads
  const adminCache = {};
  async function getAdminCached(groupId) {
    if (!groupId) return null;
    if (adminCache[groupId] !== undefined) return adminCache[groupId];
    adminCache[groupId] = await getAdminData(groupId);
    return adminCache[groupId];
  }

  try {
    const docs = await firestoreList("_index/users/members");
    const host = `https://${req.headers.host}`;

    for (const doc of docs) {
      try {
        const valueField = doc?.fields?.value?.stringValue;
        if (!valueField) continue;
        const user = JSON.parse(valueField);
        checked++;

        const prefs = user.notifPrefs || {};
        const sendingReminder = shouldSendReminder(user, nowUtc);
        const sendingProgress = shouldSendProgressNotif(user, nowUtc);
        const admin = user.groupId ? await getAdminCached(user.groupId) : null;

        // ── 1. Writing reminder ──────────────────────────────────
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

        // ── 2. Progress check-in ─────────────────────────────────
        if (sendingProgress && user.groupId) {
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

        // ── 3. Missed check-in ───────────────────────────────────
        // Fires in the hour immediately after a check-in deadline passes,
        // but only if the user actually missed their goal.
        if (prefs.missedCheckIn && user.oneSignalPlayerId && admin) {
          const deadline = deadlinePassedThisHour(admin, nowMs);
          if (deadline) {
            const cad = cadenceDays(admin.frequency || "Weekly");
            const periodWeeks = Math.max(1, Math.round(cad / 7));
            const periodGoal = (user.goalValue || 0) * periodWeeks;
            const progress = user.progressThisWeek || 0;
            const metGoal = progress >= periodGoal;

            if (!metGoal) {
              const num = checkInNumber(admin, deadline);
              const remaining = remainingCheckIns(admin, deadline);
              const pct = periodGoal > 0 ? Math.round((progress / periodGoal) * 100) : 0;

              let body;
              if (pct === 0) {
                body = remaining !== null && remaining > 0
                  ? `You didn't log any writing this period — it's not too late, there are still ${remaining} more check-ins. Let's write!`
                  : `You didn't log any writing this period. Open the app and keep going!`;
              } else if (pct > 75) {
                body = `You were so close on check-in ${ordinal(num)}! I know you'll hit your goal next time. You can do it.`;
              } else {
                body = `You still made progress this period and that's worth a round of applause. Think about what you can do to hit your goal next check-in. You can do this!`;
              }

              await fetch(`${host}/api/notify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  playerId: user.oneSignalPlayerId,
                  title: "💔 Check-in missed",
                  body,
                  type: "missedCheckIn",
                }),
              });
              sent++;
            }
          }
        }

        // ── 4. Challenge starting soon ───────────────────────────
        // Fires once when the challenge start is 23-25h away.
        if (prefs.challengeStarting && user.oneSignalPlayerId && admin) {
          if (challengeStartsIn24h(admin, nowMs)) {
            const goalLabel = user.goalType === "words"
              ? `${(user.goalValue || 0).toLocaleString()} words`
              : (() => {
                  const h = Math.floor((user.goalValue || 0) / 60);
                  const m = (user.goalValue || 0) % 60;
                  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
                })();

            await fetch(`${host}/api/notify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                playerId: user.oneSignalPlayerId,
                title: "🚀 Challenge starts tomorrow!",
                body: `Your writing challenge kicks off in 24 hours. Your goal: ${goalLabel} per check-in. Get ready!`,
                type: "challengeStarting",
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
