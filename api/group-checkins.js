// api/group-checkins.js
// Returns the check-in results of every member of a group, for the Stats tab.
// Each member's history is private in the database, so the app can't read other people's
// directly. This function checks the caller is signed in and belongs to the group, then
// returns only the check-in fields Stats needs.
//
// POST { groupId }  →  { members: [{ uid, name, avatar, checkIns: [...] }] }

const { getValue, listValues, getCallerUid, isGroupMember } = require("./_lib/server");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { groupId } = req.body || {};
  if (!groupId) return res.status(400).json({ error: "Missing groupId" });

  try {
    const callerUid = await getCallerUid(req);
    if (!callerUid) return res.status(401).json({ error: "Sign-in required" });
    if (!(await isGroupMember(groupId, callerUid))) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    // A member can briefly have two cards (old name-based and new account-based), so keep one per person
    const byUid = {};
    (await listValues(`groups/${groupId}/members`)).map(d => d.data).filter(m => m?.uid).forEach(m => {
      if (!byUid[m.uid] || (m.updatedAt || 0) > (byUid[m.uid].updatedAt || 0)) byUid[m.uid] = m;
    });
    const memberCards = Object.values(byUid);

    const members = await Promise.all(memberCards.map(async m => {
      const hist = (await getValue(`users/${m.uid}/data/history`)) || [];
      const checkIns = hist
        .filter(h => h.isCheckIn && h.deadlineMs)
        .map(h => ({ week: h.week, deadlineMs: h.deadlineMs, goalType: h.goalType, progress: h.progress, goal: h.goal, met: h.met }));
      return { uid: m.uid, name: m.name, avatar: m.avatar, checkIns };
    }));

    return res.status(200).json({ members });
  } catch (e) {
    console.error("group-checkins error:", e);
    return res.status(500).json({ error: e.message });
  }
};
