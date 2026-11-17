# Case assessment against the README rubric

17 Nov 2026. Scores the 7 official cases with the rubric in README.md (0, 1 or 2 on five criteria, max 10; under 7 is cut; a 0 on "users in the room" or "buildable in ~5 h" kills a case). Buildability is judged against each brief's "What teams should build" column, with nothing cut.

## Verdict

Kredible is the strongest case at 8 out of 10. Lebi.care is the backup at 7, scored on its full brief with the voice demo included, and it already has a team of four on it. The other five cases score 6 or lower.

## Scores

| Case | Pain has a number | Users in room | Buildable in ~5 h | Founder reachable | Wow in 30 s | Total | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kredible | 1 | 2 | 2 | 2 | 1 | 8 | Pick |
| Lebi.care | 1 | 1 | 1 | 2 | 2 | 7 | Backup |
| Hands Up | 1 | 1 | 1 | 1 | 2 | 6 | Out (under 7) |
| Fonora | 1 | 1 | 1 | 2 | 1 | 6 | Out (under 7) |
| Anton Schaller | 1 | 2 | 0 | 2 | 1 | 6 | Out (not a Lovable build) |
| Decision Axis, partner agent | 1 | 1 | 1 | 1 | 1 | 5 | Out (under 7) |
| Decision Axis, VestaCRM | 0 | 1 | 1 | 1 | 1 | 4 | Out (under 7) |

## Why each case scored this way

- **Kredible (8).** The build is the scorecard itself: chosen factors, weights adding to 100% with a reason for each, and approve/reject/refer logic with ISA terms. The brief also asks for a clickable Lovable mock-up and 5 sample applicants, so seed data is enough. ESCP students are real testers. Weak points: the wow moment, and no hard figure for the pain.
- **Lebi.care (7).** The build has three required parts: name in, live scrape of the practice's site, and a spoken demo of its own assistant, plus sign-up data by segment and country. The voice step needs a hosted voice agent fed by the scrape, so build is a 1. Practices are not in the room, but anyone can test with a real business name.
- **Hands Up (6).** The build is narrower than it sounds: load the founder's existing model file in the browser, feed it tracked points 4 frames at a time, and show live captions on a demo page. That is a 1, and it depends on getting the file early. Testers can only try signs the model knows.
- **Fonora (6).** The build is a memory system: topic cards prepared after a call, with live search as a fallback. A tester can play the caller in a simulated call, so users score 1. Hitting "no pause in the same turn" is the hard part.
- **Anton Schaller (6, out).** The build is a local agent that drives a PC through accessibility trees and the DOM. One live task is the whole deliverable, but it cannot be built in Lovable, so build scores 0 on this rubric. Coded outside Lovable it would be a 1 and a total of 7.
- **Decision Axis, partner agent (5).** The act, ask and advise loop runs on a seeded shop, but no sellers are in the room and it is middling on every criterion.
- **Decision Axis, VestaCRM (4).** The listen, understand, nudge loop works on seeded signals, but the brief names five data sources, no deliverables and no pain figure.

## Recommendation

Build Kredible and make the live decision the wow moment: a student enters a profile, gets approve, reject or refer with reasons, then the bank's view of the same applicant.

1. Fix the scorecard weights first (they total 100%) and write one line of reasoning per factor.
2. Seed 5 sample applicants, including one edge case that gets referred to a human.
3. Show ISA terms (amount, income share, term) inside the €40K threshold and 2.5× cap.
4. Keep the one-slide bank pitch for 16:00.

If Kredible draws too many teams, switch to Lebi.care. Its brief requires all three steps, so plan the voice demo from the start: a hosted voice agent whose prompt is filled from the scrape. The organisers' Teams sheet already shows a team of four on Lebi.care and none yet on Kredible.

## What is estimated

Scores come from the written briefs, not from talking to the founders. Almost every brief gives no hard figure for the pain, so most cases got a 1 there. "Founder reachable" is 2 only where CASES.md shows contact, and 1 for the three cases it never scored. Ask each founder what the problem costs today; a real number could lift Kredible or Lebi.care by a point.

Note: CASES.md lists Finish line, Fireside CRM and BIOXAR, which are not on the official case sheet, and omits Hands Up and both Decision Axis cases.
