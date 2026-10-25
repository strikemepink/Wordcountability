# Wordcountability To-Do List

Goal: people can test the app during November 2026 (the old National Novel Writing Month).

Last updated: 10/25/2026

## Before November testing (suggested)

- [ ] **Test the 7 bug fixes** (merged into `main` and live as of 10/25/2026): group-wide reset, evening progress wipe, chat/poll overwrites, stale reminders, duplicate "challenge starts" alert, progress check-in timing, junk files. If anything breaks, roll back in Vercel (Deployments → previous deployment → Instant Rollback).
- [ ] **Database privacy.** The server code reads Firebase without logging in, which only works if the database is publicly readable. If so, names, goals and notification IDs are visible to anyone with the project ID, which contradicts the privacy policy. Check the Firebase rules, add a private Firebase key to Vercel, and lock the rules down.
- [ ] **Notification security.** Anyone on the internet can send push notifications to users through `/api/notify` because it has no password check.
- [ ] **Decide the daily-goal rule.** Daily check-ins currently require the full weekly goal every day, and monthly check-ins count as 4 weeks even though they're 30 days. Decide what each check-in's goal should be.
- [ ] **Launch November testing as the web app** (installs to the iPhone home screen today).

## Open bugs and loose ends

- [ ] `/api/fetch-title` (charity name lookup) will fetch any web page for anyone. Low risk, easy to tighten.
- [ ] Members are identified by first name, so two people named "Alex" in one group overwrite each other's leaderboard card.
- [ ] If someone doesn't open the app across two check-in deadlines, only one check-in is recorded.
- [ ] Tapping "Finish Notification Setup" on a computer can overwrite the phone's notification ID, sending pushes to the wrong device.
- [ ] There's no in-app way to make someone an admin. It has to be set by hand in Firebase. (Fine if intentional.)
- [ ] **Let preview versions connect to Firebase** so changes can be tested before they go live. In Vercel: Project Settings → Environment Variables, and turn on "Preview" for the Firebase and OneSignal settings. Catch: previews would then use the real database, so test with a throwaway account and group (or set up a separate test Firebase project later).

## Bigger projects (suggested for after November)

- [ ] **Proof of writing (research first).** How can people show they actually wrote? Research options before deciding.
- [ ] **Redesign.** The current look is too busy. Model it on the Perfect Pomodoro app's look.
- [ ] **Real payments (research first).** Make the money stakes actually work. Research money-transmitter rules and payment providers before building. For now, the admin records payments manually and money moves outside the app.
- [ ] **App Store.** Get the app into the Apple App Store (developer account already set up). Apple often rejects apps that are mostly a website in a wrapper (App Review Guideline 4.2) and has rules for real-money contests (Guideline 5.3), so plan for extra native features and review time.
