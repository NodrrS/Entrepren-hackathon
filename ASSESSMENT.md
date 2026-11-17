# Case assessment against the README rubric

17 Nov 2026. Scores the 7 official cases with the rubric in README.md (0, 1 or 2 on five criteria, max 10; under 7 is cut; a 0 on "users in the room" or "buildable in ~5 h" kills a case).

## Verdict

Kredible is the strongest case at 8 out of 10. Lebi.care is the backup at 7, once its voice demo is scoped down. The other five score 6 or lower, and four of them hit a knockout.

## Scores

| Case | Pain has a number | Users in room | Buildable in ~5 h | Founder reachable | Wow in 30 s | Total | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kredible | 1 | 2 | 2 | 2 | 1 | 8 | Pick |
| Lebi.care | 1 | 1 | 1 | 2 | 2 | 7 | Backup |
| Hands Up | 1 | 2 | 0 | 1 | 2 | 6 | Out (build 0) |
| Anton Schaller | 1 | 2 | 0 | 2 | 1 | 6 | Out (build 0) |
| Decision Axis, partner agent | 1 | 1 | 1 | 1 | 1 | 5 | Out (under 7) |
| Fonora | 1 | 0 | 1 | 2 | 1 | 5 | Out (users 0) |
| Decision Axis, VestaCRM | 0 | 1 | 0 | 1 | 1 | 3 | Out (build 0) |

## Why each case scored this way

- **Kredible (8).** The brief asks for a clickable Lovable mock-up: a scorecard with weights adding to 100%, approve/reject/refer logic and 5 sample applicants. Seed data is enough, and ESCP students are real testers. Weak points: the wow moment, and no hard figure for the pain.
- **Lebi.care (7).** Typing a practice name and seeing its own site scraped is a strong 30-second demo. The instant voice assistant needs a hosted voice service, so build is a 1. Practices are not in the room, but anyone can test with a real business name.
- **Hands Up (6, out).** Live sign language recognition is a model and browser-tracking task, not a Lovable app.
- **Anton Schaller (6, out).** A screenshot-free desktop agent is infrastructure research with one live task as proof.
- **Decision Axis, partner agent (5, out).** Runs on a seeded shop, but no sellers are in the room and it is middling on every criterion.
- **Fonora (5, out).** Memory recall for dementia calls is an open LLM problem, and no real testers can be in the room.
- **Decision Axis, VestaCRM (3, out).** Needs many data sources (CRM, Reddit, LinkedIn); the brief names no deliverables or pain figure.

## Recommendation

Build Kredible and make the live decision the wow moment: a student enters a profile, gets approve, reject or refer with reasons, then the bank's view of the same applicant.

1. Fix the scorecard weights first (they total 100%) and write one line of reasoning per factor.
2. Seed 5 sample applicants, including one edge case that gets referred to a human.
3. Show ISA terms (amount, income share, term) inside the €40K threshold and 2.5× cap.
4. Keep the one-slide bank pitch for 16:00.

If Kredible draws too many teams, switch to Lebi.care. Cut the voice demo to browser text-to-speech or a short scripted clip, and keep the name-in, live-scrape flow.

## What is estimated

Scores come from the written briefs, not from talking to the founders. Almost every brief gives no hard figure for the pain, so most cases got a 1 there. "Founder reachable" is 2 only where CASES.md shows contact, and 1 for the three cases it never scored. Ask each founder what the problem costs today; a real number could lift Kredible or Lebi.care by a point.

Note: CASES.md lists Finish line, Fireside CRM and BIOXAR, which are not on the official case sheet, and omits Hands Up and both Decision Axis cases.
