# Sofia: tasks for today

Welcome! You own the **business side of the pitch**: the numbers, who pays, and proof that they would pay. Nodir builds the Lovable demo, so check in with him at the team check-ins (13:20, 14:30, 16:00).

Start here: [NUMBERS.md](NUMBERS.md) has the research on pain, market, competitors, costs, pricing, margin and the funding ask, with sources. Your job is to turn it into something the jury believes, and to back it with real conversations from the festival.

## Your tasks, in order

### 1. Read and challenge the numbers (30 min)
- Read [NUMBERS.md](NUMBERS.md) and Karmel's deck.
- Anything marked ⚠️ (one source only or conflicting sources) is either checked or cut from the slides. Decide which.
- Ask Karmel the three questions at the end of NUMBERS.md (a euro figure in the ask, whether €93/h and the 3-month lead time match reality, and which Deaf organisations they've contacted).

### 2. Validate the price with real buyers (main task, until 16:00)
Talk to **at least 8 people** at the festival who run, or work at, a place with a counter: a shop, clinic, pharmacy, university office, coworking reception, public office. Founders and staff count.

Script (2–3 minutes each):
1. "When a Deaf customer comes to your counter today, what happens?"
2. "Has it happened? How often?"
3. Show the demo on your phone: live.handsupai.com (demo clip button).
4. "Would you pay **€49 a month** for this at your counter? What about €29 or €99?"
5. "Could we run a free pilot with you?" If yes, get a name and email.

Write each answer into a shared sheet: name, type of place, happened before (y/n), price reaction, pilot (y/n).

**Goal:** a slide line like *"6 of 8 counter owners we spoke to today would pilot it; 4 would pay €49/month."* Real numbers from today beat any market report.

### 3. Pilot leads / letters of intent
- Any "yes" to a pilot: ask for a one-line written confirmation (email or WhatsApp is enough). "We'd like to pilot Hands Up at our counter."
- Even **one** named pilot partner is strong on the "Ask" slide.

### 4. Own the business slides (14:30–16:00)
Draft these for the deck. Keep them to one message per slide.
- **Pain in numbers:** €93/hour interpreter, ~3 months to book, 64% of deaf patients miss key information.
- **Who pays and how much:** free for signers, €49/month per counter, €299 for public offices and clinics.
- **Market:** ~135k counters in Germany, the €80M figure, the EU figure. Label them as our estimate.
- **Competition:** "Big tech starts with American Sign Language on its own phones. We start with German Sign Language, in any browser, at the counter."
- **Ask:** €305k for 12 months (lean salaries; €600k at market salaries over 18 months). Only use a euro figure if Karmel agrees. Add pilots and data partners, and put today's results here.

The full drafts of the Cost to run, Plans and Ask slides are in section 4b below.

Hand the slide text to Nodir by **16:00** so it can go into the Lovable/deck build.

### 4b. Your three slides: Cost to run, Plans, The Ask

Build them in the same style as Nodir's example deck: one big claim as the title, one or two tables, three big numbers along the bottom, and a footnote that says what is assumed. The draft content is below. The numbers add up, so if you change one, recheck the others.

---

#### Slide A: COST TO RUN

**Title:** One conversation costs €0 in AI. It runs on the phone, not in our cloud.

**Left table: cost per conversation**

| Step | Where it runs | Cost |
| --- | --- | --- |
| Hand and body tracking (MediaPipe) | visitor's browser | €0 |
| Sign model (6M weights) | visitor's browser | €0 |
| Model download, ~30 MB, cached after first load | Cloudflare R2, free egress | €0 |
| **Total per conversation** | | **€0.00** |

**Right table: fixed services per year**

| Service | Plan | Per year |
| --- | --- | --- |
| Vercel | Pro, one seat | $240 |
| Supabase (counter accounts, billing) | Pro | $300 |
| Cloudflare R2 (model files) | free tier | $0 |
| Domain (handsupai.com) | Cloudflare | $10 |
| Model retraining | ~10 runs × 50 GPU-hours × $2 | $1,000 |
| **Total fixed** | | **~$1,550** |

**Three big numbers:**
- **€0**: AI cost for a counter that runs Hands Up all day
- **$1,550**: everything we need to keep the product running for a year
- **€55k**: the one real cost, recording 500 signs with 50 Deaf signers, done once per language

**Footnote:** Inference is on the device, so cost doesn't grow with use. The model size (~30 MB) and the GPU-hours are estimates; confirm with Karmel. Data cost: 1,400 signer-hours at €35 plus 15% QA.

---

#### Slide B: PLANS

**Title:** Free for signers. €49 a month for the counter.

| Free | Counter | Service |
| --- | --- | --- |
| **€0** forever | **€49** a month, €490 a year | **€299** a month, up to 10 counters |
| For Deaf and hard of hearing people | Pharmacy, practice, shop | Bürgeramt, clinic, Jobcenter, university |
| Works in any browser | Tablet mode at the counter | Vocabulary pack for the domain |
| Nothing is stored or uploaded | Counter vocabulary | Usage reports for accessibility reporting |
| | "We understand sign language" door sticker | Onboarding for staff |

(Highlight **Counter** the way Pro is highlighted in the example.)

**Anchor line (yellow):** One year of Counter costs **less than 6 interpreter hours.** (€490 vs 6 × €93 = €558)

**Footnote:** Interpreter rate under §9 JVEG since June 2025, travel time not included. Service price is a hypothesis we test with the pilots. Today's results: X of Y counter owners would pay €49 (fill in from your conversations).

---

#### Slide C: THE ASK

**Big number:** **€305k**, for the first 12 months, team of 4

**Under it:** Break-even at about **550 paying counters**. This round buys our own consented data, a model trained on it, and the proof that counters pay.

**Use of funds (bar chart):**

| Item | € | What it pays for |
| --- | --- | --- |
| Team of 4: founder, mobile engineer, Deaf co-founder, sales | 144k | 4 people for 12 months at €2,500 a month each, plus 20% employer costs (4 × €2,500 × 12 × 1.2). The sales hire is our main channel to pharmacies and public offices. |
| Consented DGS data: 500 signs, 50 Deaf signers | 55k | Our own recordings of the counter vocabulary, 5 takes per sign: about 1,400 signer-hours at €35, plus 15% for quality checks. It replaces today's research-only training data. |
| Contingency, ~9% | 23k | A buffer for overruns. It was €38k (15%); €15k moved to marketing. |
| Setup, legal, GDPR, tools | 20k | Founding the company, a privacy and GDPR review, contracts with pilot partners, software tools. |
| Marketing and launch | 17.5k | "Deaf-friendly counter" stickers, pharmacy association events, Deaf community channels, launch material. €15k from contingency plus €2.5k that was planned for pilot tablets. |
| Model training | 15k | Today the model only knows the weather-forecast vocabulary it was trained on (research data). This pays for GPU time and experiments to retrain it on our own counter-sign recordings. Same figure as the training-compute line in NUMBERS.md. |
| Deaf community partners and co-design | 15k | Fees to Deaf associations and Deaf testers who shape and test the product with us. |
| Pilots: onboarding, travel | 12.5k | Setting up and visiting the 10 pilot counters. No hardware: pilots use the counter's own tablet or phone. |
| Hosting | 3k | Servers and services for a year (about $1,550 fixed; see slide A) plus margin. AI runs on the user's device, so this doesn't grow with use. |
| **Total** | **305k** | |

**Timeline strip:**

| Mar 2027 | Jun 2027 | Sep 2027 | 2028 |
| --- | --- | --- | --- |
| 500 signs recorded with Deaf signers | 10 pilot counters: pharmacy, Bürgeramt, clinic | Paid launch | 550 counters; Austria (ÖGS) |

**Footnote:** Founder salaries €2,500 a month, plus 20% employer costs. Break-even: about €24k a month in costs ÷ about €44 gross profit per counter ≈ 550 counters. At Berlin market salaries over 18 months the plan needs about €600k (see NUMBERS.md).

---

### 5. Prepare jury Q&A (16:00–17:00)
Write short answers (2 sentences each) for:
- "Google already does this. Why you?"
- "Why would a pharmacy pay if the law doesn't require sign language?"
- "Isn't the training data research-only?" (Yes. That's what the money is for: consented data with Deaf signers.)
- "How accurate is it?"
- "Who is your first customer?"

### 6. User tests (17:00–17:40)
Run the tests together with Nodir. Count the results (how many testers understood the subtitles, and how many would use it) and add them to the deck before 18:00.

## Definition of done
- [ ] 8+ buyer conversations logged
- [ ] At least 1 pilot lead with a name
- [ ] Business slide text handed to Nodir by 16:00
- [ ] Q&A answers ready by 17:00
- [ ] Test results in the deck by 17:50
