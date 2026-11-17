# Case assessment against the official case list

17 Nov 2026. Second opinion on [CASES.md](CASES.md), scored with the rubric in the [README](README.md) against the official case sheet from the organizers.

## Result

**Go with Lebi.care.** Kredible scores one point higher on the rubric, but the gap is within the margin of the estimates, and with two builders and no business owner Lebi.care fits the team better. Kredible is the fallback if the voice step fails its 30-minute test.

## What changed from CASES.md

- CASES.md scored Finish line, Fireside CRM and BIOXAR, which are not on the official sheet.
- It did not score the two Decision Axis cases or Hands Up.
- Lebi.care's official scope adds an instant voice demo of the practice's own assistant and sign-up data by segment and country.
- Kredible's official brief asks for a Lovable mock-up outright and lists its deliverables.

## Scores

Each criterion is 0, 1 or 2 (max 10). A 0 on "users in the room" or "buildable in ~5 h" knocks a case out.

| Case | Pain has a number | Users in room | Buildable in Lovable ~5 h | Founder reachable | Wow in 30 s | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Kredible | 1 | 2 | 2 | 2 | 1 | **8** |
| Lebi.care | 1 | 1 | 1 | 2 | 2 | **7** |
| Decision Axis (partner agent) | 1 | 1 | 1 | 1 | 1 | 5 |
| Hands Up | 1 | 2 | 0 | 1 | 2 | 6, out |
| Anton Schaller | 1 | 2 | 0 | 2 | 1 | 6, out |
| Fonora | 1 | 0 | 1 | 2 | 1 | 5, out |
| Decision Axis (VestaCRM) | 0 | 1 | 0 | 1 | 1 | 3, out |

Estimates, not facts:

- **Founder reachable:** 2 where CASES.md had already met the founder, 1 for the three new cases.
- **Pain has a number:** almost no brief gives a hard figure, so most cases get 1. Asking "what does this cost you today?" could add a point.
- **Lebi.care buildable:** 1 because of the voice step. If a hosted voice agent works in a 30-minute test, it becomes 2 and the case ties Kredible at 8.
- **Hands Up buildable:** 0 because it is not a Lovable build. Read as "buildable by us in 5 h", it would be 1 and the case would reach 7, but it depends on the provided model file working as described.

## Why each case lands where it does

| Case | Reason |
| --- | --- |
| Kredible | Clearest brief, real users in the room (international students), seed data is enough. The deliverables are mostly reasoning: a justification per weight, decision logic and a one-slide bank pitch. Likely the most crowded case. |
| Lebi.care | Strongest wow (type any practice name, hear its assistant). Scraping is work we have done before. The stated deliverable, real sign-up data, cannot exist by 18:00; we can show the funnel only. |
| Decision Axis (partner agent) | Workable with a seeded shop, but middling on every criterion. |
| Hands Up | Best wow after Lebi.care, but browser model integration, not a Lovable app. |
| Anton Schaller | Local agent on accessibility trees; not a Lovable app and fragile to demo. |
| Fonora | No testers in the room, open research problem. |
| Decision Axis (VestaCRM) | Many data sources, no deliverables defined. |

## Why Lebi.care over Kredible for this team

| If… | Pick | Why |
| --- | --- | --- |
| A third person owns the business side | Kredible | Surest to finish, deliverables already defined |
| Two builders, no business owner | Lebi.care | Plays to scraper and voice skills, strongest wow, fewer competing teams |

We are two builders, so Lebi.care.

## How to run Lebi.care

1. **Test the voice step first, for 30 minutes.** A hosted voice agent (ElevenLabs or Vapi) whose prompt takes a practice's opening hours, doctors and appointment types, reachable from a web page. If it fails, switch to Kredible.
2. **Ask the founder before committing:**
   - Is a working funnel with a sign-up form tagged by segment and country enough for today?
   - How many demos do you build per week today, and how long does each take?
3. **Three screens:** practice name in, live scrape showing what was found, "talk to your assistant" with a sign-up form at the end.
4. **Skip the side quests** (job-ad applications, reachability scorecard) unless the core flow is done by 14:30.
5. **Pre-scrape three practices** (one GP, one dentist, one psychologist) so the demo survives a slow or blocked website.

Split: Oscar on scraper and voice agent, Nodir on the Lovable frontend.
