# Hackathon Strategy: Entrepreneurship Festival Berlin

17 November 2026 · The Delta, Donaustraße 44, Berlin · ESCP Blue Factory

Word version (morning plan, before the case choice): [Hackathon-Plan-17-Nov.docx](Hackathon-Plan-17-Nov.docx) · Case scoring and recommendation: [CASES.md](CASES.md)

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

## Chosen case: Hands Up (live sign language translation)

Case owner: Karmel Salah. A browser page that turns on the camera and shows subtitles while someone signs, with about 0.3 s delay. Karmel delivers the model for simple signs; we build integration, interface and story.

**Scope:** a small, focused vocabulary for one scenario (e.g. the first 10 signs for a government office or doctor's visit). Small and focused looks deliberate; small and generic looks unfinished.

**Demo:** live on stage (Karmel signs, subtitles appear). Plan B: a phone video recording the screen, showing the camera, the signer and the subtitles in one shot.

## Team and roles

| Role | Owner | Partner | Responsible for |
| --- | --- | --- | --- |
| Orchestrator + scope keeper | Nodir | Oscar | Timeline, decisions, cutting scope |
| Frontend (Lovable driver) | Nodir | Oscar | Demo page: camera view, live captions, "how it works" panel, mock mode |
| Model integration | Oscar | Karmel | In-browser tracking (hands, body, face), feeding the model 4 frames at a time, latency on screen |
| Model + signs | Karmel | Oscar | Model delivery, list of signs that work, signer in the demo |
| Pitch + numbers | Sofia | Nodir | Business slides, pain in numbers, pricing, who pays ([NUMBERS.md](NUMBERS.md), [SOFIA.md](SOFIA.md)) |
| Buyer validation | Sofia | – | 8+ counter-owner conversations, price check, pilot leads |
| User testing | Nodir | Sofia | Tests at 17:00 |

**Rules of the day**

- Disagreement: 5 minutes of discussion, then the orchestrator decides.
- Check-ins at 13:20, 14:30 and 16:00, 10 minutes each: done, next, blocked.
- One shared channel (WhatsApp) plus this repo.

## Implementation plan

The page must work in mock mode by 13:20, and the real model must run in the page by 14:30. Feature freeze is at 16:00.

| Time | Nodir | Oscar | Karmel |
| --- | --- | --- | --- |
| 12:20–13:20 | Lovable page: camera view, captions, "how it works", mock mode (button plays fake subtitles) | Prepare in-browser tracking (hands/body/face) | Deliver the model + list of signs that work |
| 13:20 | **Check-in 1:** model delivered? Runs in the browser? If not, mock mode stays the demo base | | |
| 13:20–14:30 | Pick the scenario, ask Karmel for the numbers, write the pitch | Connect the model to the page | Test with Oscar |
| 14:30 | **Check-in 2:** real subtitles on screen? Freeze the sign list | | |
| 14:30–16:00 | Polish only what's in the demo; deck (max 5 slides) | Stability, show latency on screen | Practice the demo signs |
| 16:00 | Record the phone video (Plan B) | Feature freeze, bug fixes only | Signer in the video |
| 16:00–17:00 | Pitch run-through 1 | Stabilize | Rehearse the live demo |
| 17:00–17:40 | **User tests:** Karmel signs, others read the subtitles; non-signers learn 3 signs and try them; count results | | |
| 17:40–18:00 | Add test results to the deck; run-through 2 | Demo setup: laptop, camera, hotspot, video ready | |
| 18:00 | **Live demo to the jury**, video as backup | | |

**Numbers to get from Karmel (don't guess them):**

- How many deaf people / sign-language users are there in Germany?
- What does a sign-language interpreter cost per hour?
- Who would pay: hospitals, government offices, schools?

## Open questions

- Judging criteria and pitch length (ask at kick-off)
- Can code be prepared beforehand? (ask at kick-off)
- Which scenario for the sign vocabulary: government office, doctor's visit, or other?
