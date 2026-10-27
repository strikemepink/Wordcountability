# Wordcountability To-Do List

Goal: people can test the app during November 2026 (the old National Novel Writing Month).

Last updated: 10/27/2026

## Before November testing (suggested)

- [ ] **Launch November testing as the web app** (installs to the iPhone home screen today).

## Open bugs and loose ends

- [ ] **First-run pop-ups overlap.** After Setup, the app tour and the "Install the app" prompt open at the same time, stacked. Show the install prompt after the tour ends.
- [ ] **Protect the payment ledger.** Any group member's app can still change the ledger, because members' apps write group word totals and "Record Donation" entries to it. Locking it to admins needs the ledger restructured (e.g. each member's entries saved separately).
- [ ] `/api/fetch-title` (charity name lookup) will fetch any web page for anyone. Low risk, easy to tighten.
- [ ] **Let preview versions connect to Firebase** so changes can be tested before they go live. In Vercel: Settings → Environments → Preview, then add the same Firebase and OneSignal variables that Production has (including FIREBASE_SERVICE_ACCOUNT). Catch: previews would then use the real database, so test with a throwaway account and group (or set up a separate test Firebase project later).

## Bigger projects (suggested for after November)

- [ ] **Pace-based nudges (idea).** Instead of just "you're 30% there," tell writers if they're behind where they should be by today (e.g. "1,400 words behind pace for Thursday").
- [ ] **Proof of writing (research first).** How can people show they actually wrote? Research options before deciding.
- [ ] **Real payments (research first).** Make the money stakes actually work. Research money-transmitter rules and payment providers before building. For now, the admin records payments manually and money moves outside the app.
- [ ] **App Store.** Get the app into the Apple App Store (developer account already set up). Apple often rejects apps that are mostly a website in a wrapper (App Review Guideline 4.2) and has rules for real-money contests (Guideline 5.3), so plan for extra native features and review time.

## Done

- [x] **Writing timer pause** (10/27/2026): Pause and Stop now really stop the clock, even if you lock the phone or switch apps.
- [x] **App tour** (10/27/2026): each step switches to the tab it describes; the avatar glows on the notifications step.
- [x] **Redesign** (10/26/2026): light cream background with bordered palette circles, orange/purple title, bottom tab bar (Today, Group, Chat, Stats, Stakes; History now inside Stats), colored card outlines, purple buttons. Design rules: never pair green with red/pink; small text uses deeper shades so it stays readable.
- [x] **Duplicate first names** (10/25/2026): cards saved by account; joining with a name already used in the group asks for an initial or nickname.
- [x] **Skipped check-ins recorded** (10/25/2026): each missed deadline gets its own entry (missed with 0 after the first).
- [x] **Notifications on every device** (10/25/2026): each person's devices are kept in a list and every push goes to all of them.
- [x] **Making someone an admin** (10/25/2026): group creators become admin automatically; admins have a "Make admin" button in the Group tab; only admins can change challenge settings.
- [x] **Daily-goal rule** (10/25/2026): each check-in's goal is the weekly goal scaled to the check-in's length. For 5,000 words/week: Daily = 714, Weekly = 5,000, Bi-Weekly = 10,000, Monthly (30 days) = 21,429.
- [x] **Test the 7 bug fixes** (10/25/2026): group-wide reset, evening progress wipe, chat/poll overwrites, stale reminders, duplicate "challenge starts" alert, progress check-in timing, junk files.
- [x] **Database privacy** (10/25/2026). Server functions now use a private Firebase key stored in Vercel. New database rules (`firestore.rules`): each user's data is owner-only, group data is members-only, nothing is public. Bonus: group push notifications now get delivered, and the Stats tab shows the whole group's check-ins.
- [x] **Notification security** (10/25/2026). Only signed-in users can send notifications, group alerts only from group members, rescheduling only by the group admin, and the hourly reminder job requires its password.
