# Hands Up: Entrepreneurship Festival Berlin

17 November 2026 · The Delta, Donaustraße 44, Berlin · ESCP Blue Factory

## Links

- Demo video (1 min): https://youtu.be/tg3Vy7mtshg
- Link to the app: https://hands-up-demo.alpharelay.dev/
- Live sign-to-text demo (our own model, runs on your phone): https://live.handsupai.com
- Pharmacy demo: https://live.handsupai.com/pharmacy/
- Team test site: https://dev.handsupai.com
- GitHub repo: https://github.com/NodrrS/Entrepren-hackathon
- Company on LinkedIn: https://www.linkedin.com/company/handsupai/

More in this repo: [product brief](PRODUCT-BRIEF.md) · [numbers and sources](NUMBERS.md) · [business slides](SOFIA.md) · [mockups](design/mockups/README.md) · [live demo code](handsup-live/README.md)

## Chosen case: Hands Up (live sign language translation)

Case owner: Karmel Salah. A browser page that turns on the camera and shows subtitles while someone signs, with about 0.3 s delay. Karmel delivers the model for simple signs; we build integration, interface and story.

**Scope:** a small, focused vocabulary for one scenario (e.g. the first 10 signs for a government office or doctor's visit). Small and focused looks deliberate; small and generic looks unfinished.

**Demo:** live on stage (Karmel signs, subtitles appear). Plan B: a phone video recording the screen, showing the camera, the signer and the subtitles in one shot.

## Business idea

**The problem.** About 80,000 Deaf people in Germany use German Sign Language (DGS). Staff at a pharmacy, doctor's reception or Bürgeramt don't sign. An interpreter costs €93 an hour plus travel and has to be booked weeks ahead, so for a 5-minute question there is none. Paper notes don't fix it: written German is a second language for most Deaf signers.

**The product.** One web app with two modes. The Deaf person signs, the staff read the words live, and the reply comes back to the signer as pictures and simple text. Nothing to install, and no video leaves the device.

| | Signer mode | Counter mode |
| --- | --- | --- |
| Device | The Deaf person's own phone, standing on the counter | The business's tablet |
| Price | Free, forever | €49 a month per counter; €299 for up to 10 counters |
| Why | Works at any counter from day one and builds demand | Businesses are ready for Deaf customers who don't have the app |

**Our own model.** We built and trained our own sign language model. It is a streaming model trained on a German Sign Language dataset (RWTH-PHOENIX-Weather 2014: 1,233 DGS signs from TV weather forecasts). It runs entirely in the browser: MediaPipe tracks the hands and body, and every 0.32 s the model turns the movements into signs in about 2–10 ms on a laptop. Because the training data is weather forecasts and research-only, the next step is to record our own consented counter vocabulary with Deaf signers and retrain on it.

**Market.** About 135,000 counters in Germany serve the public: doctors' practices, pharmacies, public offices, insurers and hospital desks. At €49 a month that is about €80M a year in Germany (our estimate).

**Why now.** The European Accessibility Act (BFSG) has applied since June 2025, and the BGG reform now in parliament would ask private businesses for "reasonable accommodations". Hands Up costs less a month than one interpreter hour.

**The ask.** €305k for 12 months: a team of 4, consented DGS data from 50 Deaf signers, model training, marketing and 10 pilot counters. Break-even at about 550 paying counters. Details: [SOFIA.md](SOFIA.md) (slide C) and [NUMBERS.md](NUMBERS.md).

## Team and roles

| Role | Owner | Partner | Responsible for |
| --- | --- | --- | --- |
| Orchestrator + scope keeper | Nodir | Oscar | Timeline, decisions, cutting scope |
| Frontend (Lovable driver) | Nodir | Oscar | Demo page: camera view, live captions, "how it works" panel, mock mode |
| Model integration | Oscar | Karmel | In-browser tracking (hands, body, face), feeding the model 4 frames at a time, latency on screen |
| Model + signs | Karmel | Oscar | Model delivery, list of signs that work, signer in the demo |
| Pitch + numbers | Nodir | Sofia | Business slides, pain in numbers, pricing, who pays ([NUMBERS.md](NUMBERS.md), [SOFIA.md](SOFIA.md)) |

**Rules of the day**

- Disagreement: 5 minutes of discussion, then the orchestrator decides.
- Check-ins at 13:20, 14:30 and 16:00, 10 minutes each: done, next, blocked.
- One shared channel (Discord) plus this repo.
