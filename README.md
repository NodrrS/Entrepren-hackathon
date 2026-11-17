# Hackathon Strategy: Entrepreneurship Festival Berlin

17 November 2026 · The Delta, Donaustraße 44, Berlin · ESCP Blue Factory

Word version: [Hackathon-Plan-17-Nov.docx](Hackathon-Plan-17-Nov.docx)

## Picking the case (10:00–10:40)

Each of us scores every case on five criteria while the founders present, then we compare and decide by 10:40 at the latest. Take the case with the highest score at 7 or more out of 10, not the one that sounds most exciting.

| Criterion | 0 points | 2 points |
| --- | --- | --- |
| Pain has a number | "It's annoying" | Hours, euros or lost customers per week |
| Testable in the room at 17:00 | Users aren't here | Festival guests, founders or students can try it |
| Buildable in Lovable in ~5 h | Needs integrations, hardware or real data | 3 screens, 1 AI call, seed data is enough |
| Founder reachable during the day | Leaves after the pitch | Available for 2 short check-ins |
| Demo has one wow moment | Only works with explanation | Visible in 30 seconds |

**Bonus:** our own domain knowledge (events/contacts → Syncy, bureaucracy/public sector → AusHelp and consulting).

**Avoid the crowd:** with 12 teams, the most obvious case will draw 3–4 teams. A slightly less glamorous case with a clear pain is easier to win.

**Three questions for the founder before we commit:**

1. What do you do today instead, and what does it cost you?
2. Who pays for a solution, and why would they switch?
3. What would you need to see at 18:00 to say "I would use this tomorrow"?

The answer to question 3 becomes our definition of done.

### Scoring sheet

Each of us scores alone, 0, 1 or 2 per criterion, then we compare. Cut anything under 7. A 0 on "users in the room" or "buildable in 5 h" kills a case whatever its total.

| Criterion | Case 1: | Case 2: | Case 3: | Case 4: |
| --- | --- | --- | --- | --- |
| Pain has a number | | | | |
| Users in the room at 17:00 | | | | |
| Buildable in Lovable in ~5 h | | | | |
| Founder reachable | | | | |
| Wow in 30 seconds | | | | |
| **Total (max 10)** | | | | |

### Worked example

| Criterion | A: Coworking event check-in | B: Rider FAQ bot | C: B2B invoice platform for dentists |
| --- | --- | --- | --- |
| Pain has a number | 2 (3 h per event, half the leads lost) | 2 (40 questions a day, 2 h) | 1 ("billing is slow", no figure) |
| Users in the room at 17:00 | 2 (everyone at the festival) | 1 (people can play riders) | 0 (no dentists at the festival) |
| Buildable in Lovable in ~5 h | 2 (QR, 1 AI step, 1 list) | 2 (chat page + 1 AI call) | 0 (needs bank and tax integrations) |
| Founder reachable | 1 (only from 14:00) | 2 (at the festival all day) | 2 |
| Wow in 30 seconds | 2 (jury scans, name appears) | 1 (answer appears, but chatbots are common) | 1 |
| **Total** | **9** | **8** | **4** |

C is out. A and B go to the 5-minute founder chat, where the 1s become the questions: "Can you be there before 14:00?" and "Can real riders test it?"

## Team and roles

Everyone holds two roles and every critical task has a partner, so nobody is a single point of failure.

| Role | Owner | Partner | Responsible for |
| --- | --- | --- | --- |
| Orchestrator + scope keeper | Nodir | [New member] | Timeline, decisions, cutting scope, the one-page brief |
| Frontend (Lovable driver) | Nodir | Oscar | The only person prompting Lovable at a time, to avoid conflicting edits |
| Backend + AI logic | Oscar | Nodir | AI prompt, data model, Supabase or seed data, API keys |
| Business + numbers | [New member] | Nodir | Founder interview, pain in numbers, who pays, pricing slide |
| User testing | [New member] | Oscar | Recruiting 5 testers from midday, running tests at 17:00 |
| Pitch | Nodir | [New member] | Story, deck, live demo; [New member] is backup presenter |

**Rules of the day**

- Disagreement: 5 minutes of discussion, then the orchestrator decides.
- Check-ins at 12:30, 14:30 and 16:00, 10 minutes each: done, next, blocked.
- One shared channel (WhatsApp) plus this doc.
- Nodir stops building at 16:30 to own the pitch; Oscar takes over Lovable for bug fixes.

## Implementation plan

The core flow must be clickable end to end by 12:30 and the feature freeze is at 16:00; everything else is negotiable. Build a rough version of the whole flow first, then make it real, then make it pretty.

| Time | Phase | Goal / output | Who |
| --- | --- | --- | --- |
| 08:45 | Arrive | Laptops charged, Lovable accounts logged in, availability confirmed | All |
| 09:00 | Kick-off | Roles confirmed; ask organizers for judging criteria and pitch length | Nodir |
| 09:30 | Crash course | Note Lovable tips and limits (credits per team) | All |
| 10:00 | Cases | Score each case with the rubric; ask the founder the 3 questions | All |
| 10:40 | Decide + brief | One-page brief: user, pain with number, 3-step core flow, definition of done, out of scope | Nodir |
| 11:00–12:30 | Sprint 1: skeleton | Whole flow clickable with seed data; app published to a live URL | Nodir + Oscar |
| 11:00–12:30 | Business track | Founder interview for numbers and who pays; start recruiting 5 testers | [New member] |
| 12:30 | Check-in 1 | Flow not clickable? Cut a step now | All |
| 12:30–13:00 | Lunch | Eat while working, no long break | All |
| 13:00–14:30 | Sprint 2: make it real | Real AI call and real data on the main step; founder sees it for 10 minutes | Nodir + Oscar |
| 14:30 | Check-in 2 | Apply founder feedback, freeze the scope list | All |
| 14:30–16:00 | Sprint 3: demo path | Polish only what is shown in the demo; deck draft in parallel | Nodir + Oscar / [New member] |
| 16:00 | Feature freeze | Record a 60-second backup video of the demo | Oscar |
| 16:00–17:00 | Stabilize + pitch | Bug fixes only; deck done; pitch run-through 1 | Oscar / Nodir + [New member] |
| 17:00–17:40 | User tests | 5 tests, 5 minutes each, results counted | [New member] + Oscar |
| 17:40–18:00 | Final pitch | Add test results to the deck; run-through 2 | Nodir |
| 18:00 | Demo | Live demo to the jury | Nodir |

## Open questions

- Judging criteria and pitch length (ask at kick-off)
- Can code be prepared beforehand? (ask at kick-off)
- Who exactly is on the team today?
