# Wordcountability To-Do List

Goal: people can test the app during November 2026 (the old National Novel Writing Month).

Last updated: 10/25/2026

## Before November testing (suggested)

- [ ] **Decide the daily-goal rule.** Daily check-ins currently require the full weekly goal every day, and monthly check-ins count as 4 weeks even though they're 30 days. Decide what each check-in's goal should be.
- [ ] **Launch November testing as the web app** (installs to the iPhone home screen today).

## Open bugs and loose ends

- [ ] `/api/fetch-title` (charity name lookup) will fetch any web page for anyone. Low risk, easy to tighten.
- [ ] Members are identified by first name, so two people named "Alex" in one group overwrite each other's leaderboard card.
- [ ] If someone doesn't open the app across two check-in deadlines, only one check-in is recorded.
- [ ] Tapping "Finish Notification Setup" on a computer can overwrite the phone's notification ID, sending pushes to the wrong device.
- [ ] There's no in-app way to make someone an admin. It has to be set by hand in Firebase. (Fine if intentional.)
- [ ] **Let preview versions connect to Firebase** so changes can be tested before they go live. In Vercel: Settings → Environments → Preview, then add the same Firebase and OneSignal variables that Production has (including FIREBASE_SERVICE_ACCOUNT). Catch: previews would then use the real database, so test with a throwaway account and group (or set up a separate test Firebase project later).

## Bigger projects (suggested for after November)

- [ ] **Proof of writing (research first).** How can people show they actually wrote? Research options before deciding.
- [ ] **Redesign.** The current look is too busy. Model it on the Perfect Pomodoro app's look.
- [ ] **Real payments (research first).** Make the money stakes actually work. Research money-transmitter rules and payment providers before building. For now, the admin records payments manually and money moves outside the app.
- [ ] **App Store.** Get the app into the Apple App Store (developer account already set up). Apple often rejects apps that are mostly a website in a wrapper (App Review Guideline 4.2) and has rules for real-money contests (Guideline 5.3), so plan for extra native features and review time.

## Done

- [x] **Test the 7 bug fixes** (10/25/2026): group-wide reset, evening progress wipe, chat/poll overwrites, stale reminders, duplicate "challenge starts" alert, progress check-in timing, junk files.
- [x] **Database privacy** (10/25/2026). Server functions now use a private Firebase key stored in Vercel. New database rules (`firestore.rules`): each user's data is owner-only, group data is members-only, nothing is public. Bonus: group push notifications now get delivered, and the Stats tab shows the whole group's check-ins.
- [x] **Notification security** (10/25/2026). Only signed-in users can send notifications, group alerts only from group members, rescheduling only by the group admin, and the hourly reminder job requires its password.
