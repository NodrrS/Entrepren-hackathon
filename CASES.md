# Founder cases: scoring and recommendation

**Decision (12:20): Hands Up (Karmel Salah).** Karmel delivers the sign-to-text model; we build integration, demo page and pitch. See README for the plan.

Entrepreneurship Festival Berlin, 17 Nov 2026, scored 10:00–10:45.

## Scores

The "Pain has a number" row held the case descriptions, so totals cover four criteria (max 8).

| Case | What it is | Users in room | Buildable in ~5 h | Founder reachable | Wow in 30 s | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Finish line | Claude for studying; chats get long. AI asks for examples from companies relevant to the user, so they stay engaged | 2 | 2 | 2 | 2 | 8 |
| Lebi.care | GTM: enter your practice name, it gets scraped and fed into a personalized demo for the client | 1 | 2 | 2 | 2 | 7 |
| Kredible | Student loans (like BAföG): how to score eligibility? | 2 | 1 | 2 | 1 | 6 |
| Fireside CRM | Founder needs GTM: how do we make the product show up in ChatGPT? | 1 | ? | 2 | 1 | 4 + ? |
| Anton Schaller | Can agents use something other than screenshots? Locally hosted, without big infrastructure | 2 | ? | 2 | ? | 4 + ? |
| Fonora | Calls people with dementia; finding abstract links is an LLM challenge | 0–2 | 2 | 2 | 0 | 4–6 |
| BIOXAR | Modular bio-block furniture for coworking spaces; build the space on the web before ordering | 0 | 2 | – | – | Out |

## Recommendation: Lebi.care, Kredible as backup

**Out**

- **BIOXAR:** 3D configurator, no testers in the room, 3D isn't buildable in Lovable in 5 h.
- **Anton Schaller:** infrastructure research, not a Lovable app, nothing visible for the jury.
- **Fonora:** open LLM research problem, no real testers, sensitive data.

**In the running**

| Case | What we'd build | Strength | Risk |
| --- | --- | --- | --- |
| Lebi.care | Practice name → scrape website → personalized demo | Strongest wow (jury types any name, sees their own demo); GTM pain easy to quantify; we've built Apify scrapers before | Clinics not in the room, but anyone can test with a real business name |
| Kredible | Eligibility check: questions → score → explanation | Close to AusHelp's entitlement check; ESCP students are real testers | Scoring logic without real data; weaker wow |
| Fireside CRM | "How visible is your startup in ChatGPT?" + tips | Every founder in the room has this pain | Obvious case, likely crowded |
| Finish line | Studying with Claude, examples from relevant companies | Testers everywhere | Vague: "keep the user engaged" isn't a feature yet |

**Why Finish line drops despite scoring 8:** buildability can't be judged before we know what to build. A fuzzy case is the biggest risk with two builders.

**Why Lebi.care:** clearest 3-step flow (name in → scrape → demo out), a live wow moment, a buyer with budget, and a technical core we already know. Oscar: scraper + AI step. Nodir: Lovable frontend.

**Question for the Lebi.care founder before committing:** "How many demos do you build per week today, and how long does each take?"
