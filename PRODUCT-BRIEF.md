# Product brief: Hands Up

**One line:** A Deaf person signs, the hearing person reads the words live, and speaks or types a reply that the signer gets back as pictures and simple text. It is one web app with two modes: **free on the Deaf person's own phone**, and **€49/month on a business's counter tablet**. Nothing to install, no video uploaded.

## Why

- About 80,000 deaf people in Germany use DGS. Staff at the counter don't sign.
- An interpreter costs €93 an hour and is booked weeks ahead, so at a pharmacy or Bürgeramt there is usually none.
- Today the conversation happens on paper notes or doesn't happen. Paper notes fail too: studies suggest most Deaf school leavers read written German at primary-school level, so a written reply is often not understood. (Numbers and sources: [NUMBERS.md](NUMBERS.md).)

## Two modes, one app

| | **Signer mode** (phone) | **Counter mode** (tablet) |
| --- | --- | --- |
| Device | The Deaf person's own phone, standing on the counter | The business's tablet, always on the counter |
| Who pays | Free, forever | The business: Counter €49/month, Service €299/month |
| Works where | At **any** counter, from day one | Where the business has set it up |
| Staff need | Nothing: no app, no training | A tablet and a 5-minute setup |
| Extras | The signer chooses how replies look (pictures + simple text, big text, later DGS) | Field vocabulary pack (pharmacy, Bürgeramt, clinic), the business's own quick replies, "Deaf-friendly counter" sticker, usage reports |

**Why both.** A counter-only app has a chicken-and-egg problem: Deaf people can't rely on it until most counters have it, and counters won't buy until Deaf customers ask. Signer mode gives coverage on day one and builds demand. Counter mode is what businesses pay for: being ready for customers who don't have the app, and being ready for the BGG reform's "reasonable accommodations" duty (still in parliament; don't claim it is law).

## Who

| User | Need |
| --- | --- |
| **Signer** (Deaf customer) | To be understood anywhere, without bringing an interpreter, and to understand the answer even if reading is hard |
| **Staff** at the counter | To understand the request and answer it in under 2 minutes, with nothing to install |
| **Buyer** (pharmacy owner, office head) | Be accessible for €49 a month, with no IT project |

## The scenario for today

**The pharmacy counter.** It is a small, deliberate vocabulary taken from Karmel's list of signs that work. The example dialogue (adjust it to the signs the model really knows):

1. Signer: *"HELLO, MEDICINE, HEAD, PAIN"* → the staff side shows "Hello. I need medicine for a headache."
2. Staff taps a quick reply: "Do you have a prescription?" It appears on the signer's side.
3. Signer: *"NO"* → "No."
4. Staff: "This one is €6.50. Take one tablet up to three times a day." The signer sees it as pictures: **1 tablet · max 3× a day · €6.50**.

Show it twice: once on a phone standing on the counter (signer mode), once on the tablet (counter mode).

The wow moment, visible in 30 seconds: signs go in and words appear in under half a second, on a phone.

## Scope

**1. Signer mode (phone, portrait)**
- **Set up:** "Stand your phone on the counter", 3 short steps, reply-style choice, a big Start button.
- **Signing:** a split screen.
  - The bottom half faces the signer: front camera, skeleton overlay, the recognised glosses.
  - The top half is rotated 180° toward the staff: the plain sentence in large type, latency badge, 3 quick replies and a "hold to speak your answer" mic button.
- **Reply:** the staff answer on the signer's half, as pictures + simple text (default) or big text. Buttons: Sign answer, Bigger, and a "Show in DGS (coming later)" placeholder.

**2. Counter mode (tablet, landscape)**
- **Staff view:** camera with optional skeleton; a caption strip with German gloss on top, plain sentence below and the latency badge; the conversation transcript; 4 quick replies (Prescription? / Price / How to take it / Please wait); a text box with mic; a "Show to customer" button. The header shows the business name and its vocabulary pack.
- **Shown to customer:** the last staff message as pictures + simple text in huge type, the "Deaf-friendly counter" badge and a "Sign your answer" button.

**Both modes**
- The transcript disappears when the session ends ("nothing stored").
- **Mock mode** toggle: plays the scripted dialogue above with fake captions. It is the backup if the model or camera fails, and it works without camera permission.

**3. How it works** (one panel or page)
- Camera → hand and body points (MediaPipe) → sign model → words, all on the device.
- Privacy: no video leaves the device, no cookies.
- Honest limit: today it is a research model on about 1,200 DGS signs. It is not for medical, legal or emergency use.

**4. For businesses**
- Plans: Free for signers / Counter €49 / Service €299 (from [SOFIA.md](SOFIA.md), slide B).
- One small line under the pricing cards: "Get ahead of Germany's planned accessibility duties for businesses." It is not the headline, and it never says "required by law" (the BGG reform is still in parliament; see [NUMBERS.md](NUMBERS.md)).
- "Become a pilot counter" form: name, place type, city, email. These are Sofia's leads.

**Out of scope today:** accounts, payments, more sign languages, the DGS avatar for replies, a native app, the "Deaf-friendly counter" map.

**Mockups:** [design/mockups/](design/mockups/README.md) has screenshots, browser-viewable pages and the source for all 5 screens (3 phone, 2 tablet). The editable canvas is [Hands Up two modes](https://claude.ai/artifact/QrJVepSAJUozuFeSWxMyhA), private until Nodir shares it.

## How the model gets in

| Option | Who | When |
| --- | --- | --- |
| A. Mock mode only (Lovable) | Nodir | ready by 13:20 |
| B. Embed live.handsupai.com in an iframe on the camera area | Nodir + Oscar | if A is done |
| C. Oscar wires MediaPipe and the model into the Lovable page (4-frame chunks, show latency) | Oscar + Karmel | target 14:30 |

The demo always works through A. B or C makes it real. Both modes use the same camera and caption component, so wiring the model once covers both.

## Success at 18:00

- Karmel signs 4 or more counter phrases live and the right words appear in under 1 second.
- 5 or more festival testers read the captions and say they understood.
- 3 or more Deaf testers say the picture replies are easier than plain text.
- 1 or more real pilot sign-ups through the form.

## Design

- Hands Up orange (#FF5A36) on white, with near-black text on orange (white on orange fails contrast at small sizes). Large type for captions (at least 38 px on a phone, 44 px on a tablet).
- High contrast. Signer mode is phone portrait; counter mode is tablet landscape.
- Picture replies use simple stroke icons with a number (1 tablet, max 3×, €6.50), never emoji.
- Copy style: short, plain, no jargon. Write "Deaf" with a capital D when referring to the community.

---

## Lovable prompt (paste as the first message)

Attach the 5 screenshots from [design/mockups/screenshots/](design/mockups/screenshots/) to the same message, in order (1 to 5). Lovable copies a layout much more closely from an image than from words.

> The 5 attached images are the mockups: 1–3 are signer mode on a phone, 4–5 are counter mode on a tablet. Match their layout, sizes and wording.
>
> Build a web app called **Hands Up**: live sign language to text for conversations at a service counter (a pharmacy, a public office). Use React, Tailwind and shadcn. It has two modes that share one camera + caption component, plus two info pages.
>
> **/ (Signer mode, phone portrait):** A start screen: the Hands Up logo (orange squiggle + "hands up"), the headline "Stand your phone on the counter", 3 numbered steps ("Front camera faces you", "Sign. Words appear for the staff", "Read the answer, your way"), a reply-style chip ("Pictures + big text" or "Big text"), a big orange Start button and the note "Nothing is recorded or uploaded." Start opens a split screen. The **bottom half** faces the signer: the front webcam via getUserMedia with an optional skeleton overlay, recognised German glosses as chips (e.g. HALLO · MEDIKAMENT · KOPF · SCHMERZ) and an End button. The **top half is rotated 180°** for the staff: the label "For staff · Für das Personal", the plain sentence in 38px bold ("Hello. I need medicine for a headache."), a latency badge ("0.32 s"), 3 quick-reply chips and a "Hold to speak your answer" mic button (Web Speech API, de-DE and en-US). When the staff answers, the screen changes. The staff half (still rotated, grey background) shows "You said · shown to customer", their words in quotes, and "Speak again" and "Type" buttons. The signer's half shows "Pharmacy says", a chip naming the reply style, and the reply: in picture style as 3 tiles, each with a stroke icon, a big number and a short label ("1" tablet / "3×" max a day / "€6.50" price), plus one simple sentence ("1 tablet. Up to 3 times a day. €6.50."); in text style as the full sentence in 40px bold. Keep the big numbers short so they never wrap. Buttons: Sign answer (orange), Bigger, and a disabled dashed "Show in DGS (coming later)".
>
> **/counter (Counter mode, tablet landscape):** A header with the logo, the business name ("Apotheke am Markt · Counter 1"), a "Pharmacy vocabulary" badge, a "How it works" link and "Nothing is recorded or uploaded." On the left is the webcam feed with a "Hide skeleton" toggle and a caption card: glosses in small caps and grey on top, the plain sentence in 44px bold below, and the latency badge. On the right are a chat-style transcript (signer bubbles orange #FF5A36 with near-black text, staff bubbles grey), 4 quick-reply buttons ("Do you have a prescription?", "This costs €6.50", "1 tablet, up to 3× a day", "One moment please"), a text input with a mic button, and an orange "Show to customer" button. That opens a full-screen customer view of the last staff message in picture style (the same 3 tiles, larger, + one sentence in 52px), a "Deaf-friendly counter" badge, an orange "Sign your answer" button that goes back to the staff view, a "Big text only" button and a disabled dashed "DGS (later)" button.
>
> **Mock mode** (both modes): a switch, on by default, plays a scripted dialogue: the signer's glosses appear word by word every 320 ms (HELLO → MEDICINE → HEAD → PAIN, then "NO" after the staff reply), with the latency badge updating. When the staff taps "1 tablet, up to 3× a day" or "This costs €6.50", the signer sees the picture reply. It must work without camera permission, so the whole dialogue can be shown on stage with no camera.
>
> **/how-it-works:** A 4-step horizontal diagram (Camera → Hand and body points → Sign model on your device → Words), a privacy card ("Video never leaves the device. No cookies. No account."), and an honest-limits card ("Research demo for German Sign Language, about 1,200 signs. Not a replacement for interpreters in medical, legal or emergency settings.").
>
> **/business:** Three pricing cards: Free (€0, the phone app for Deaf and hard of hearing people), Counter (€49/month, highlighted, "less than one interpreter hour", the tablet mode for one location), Service (€299/month, up to 10 counters). Under the cards, one small grey line: "Get ahead of Germany's planned accessibility duties for businesses." Below that, a "Become a pilot counter" form with name, place type (select: pharmacy, doctor's practice, public office, shop, school, other), city and email. Store submissions in Supabase in a table pilot_signups and show a thank-you state.
>
> Style: white background, orange #FF5A36 accent, near-black text, a large friendly sans-serif (Inter, Space Grotesk for headings), generous spacing, high contrast, and accessible (keyboard, aria labels, touch targets at least 44px).
