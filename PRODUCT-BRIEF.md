# Product brief: Hands Up Counter

**One line:** A Deaf person signs at a counter, the staff member reads the words live, and types or speaks a reply that the signer reads back. It runs in a browser on a tablet or phone, with nothing to install and no video uploaded.

## Why

- About 80,000 deaf people in Germany use DGS. Staff at the counter don't sign.
- An interpreter costs €93 an hour and is booked weeks ahead, so at a pharmacy or Bürgeramt there is usually none.
- Today the conversation happens on paper notes or doesn't happen. (Numbers and sources: [NUMBERS.md](NUMBERS.md).)

## Who

| User | Need |
| --- | --- |
| **Signer** (Deaf customer) | To be understood without bringing an interpreter |
| **Staff** at the counter | To understand the request and answer it in under 2 minutes |
| **Buyer** (pharmacy owner, office head) | Be accessible for €49 a month, with no IT project |

## The scenario for today

**The pharmacy counter.** It is a small, deliberate vocabulary taken from Karmel's list of signs that work. The example dialogue (adjust it to the signs the model really knows):

1. Signer: *"HELLO, MEDICINE, HEAD, PAIN"* → the screen shows "Hello. I need medicine for a headache."
2. Staff taps a quick reply: "Do you have a prescription?" It appears in large text on the signer's side.
3. Signer: *"NO"* → "No."
4. Staff: "This one is €6.50. Take one tablet up to three times a day."

The wow moment, visible in 30 seconds: signs go in and words appear in under half a second, on a phone.

## Scope: 3 screens

**1. Counter (the demo)**
- Camera view with an optional skeleton overlay.
- A live caption strip: German gloss on top, plain sentence below, latency badge ("0.32 s").
- Staff side: a text box, a mic button for speech-to-text through the browser, and 4 quick replies (Prescription? / Price / How to take it / Please wait).
- A transcript of the conversation, which disappears when the session ends ("nothing stored").
- **Mock mode** toggle: plays the scripted dialogue above with fake captions. It is the backup if the model or camera fails.
- A **flip** button that turns the reply text toward the signer (tablet on the counter).

**2. How it works** (one panel or page)
- Camera → hand and body points (MediaPipe) → sign model → words, all on the device.
- Privacy: no video leaves the device, no cookies.
- Honest limit: today it is a research model on about 1,200 DGS signs. It is not for medical, legal or emergency use.

**3. For businesses**
- Plans: Free for signers / Counter €49 / Service €299 (from [SOFIA.md](SOFIA.md), slide B).
- "Become a pilot counter" form: name, place type, city, email. These are Sofia's leads.

**Out of scope today:** accounts, payments, more sign languages, text → sign avatar, native app.

## How the model gets in

| Option | Who | When |
| --- | --- | --- |
| A. Mock mode only (Lovable) | Nodir | ready by 13:20 |
| B. Embed live.handsupai.com in an iframe on the Counter screen | Nodir + Oscar | if A is done |
| C. Oscar wires MediaPipe and the model into the Lovable page (4-frame chunks, show latency) | Oscar + Karmel | target 14:30 |

The demo always works through A. B or C makes it real.

## Success at 18:00

- Karmel signs 4 or more counter phrases live and the right words appear in under 1 second.
- 5 or more festival testers read the captions and say they understood.
- 1 or more real pilot sign-ups through the form.

## Design

- Hands Up orange (#FF5A36) on white; large type for captions (at least 48 px on a tablet).
- High contrast, works on a phone held in portrait and on a tablet in landscape.
- Copy style: short, plain, no jargon. Write "Deaf" with a capital D when referring to the community.

---

## Lovable prompt (paste as the first message)

> Build a web app called **Hands Up Counter**: live sign language to text for service counters (a pharmacy, a public office). Use React, Tailwind and shadcn. Three routes:
>
> **/ (Counter):** Full-height layout. On the left (top on mobile) is the webcam feed via getUserMedia with a "Start camera" button, a "Show skeleton" toggle and a camera flip button. Under the video is a large caption strip. The top line holds German sign glosses in small caps and grey (e.g. "HALLO MEDIKAMENT KOPF SCHMERZ"). The second line is a plain sentence in 48px bold (e.g. "Hello. I need medicine for a headache."). A small badge shows latency, e.g. "0.32 s". On the right (bottom on mobile) is the staff panel: a chat-style transcript (signer bubbles in orange #FF5A36, staff bubbles in grey), a text input with a mic button (Web Speech API, de-DE and en-US), and 4 quick-reply chips: "Do you have a prescription?", "This costs €6.50", "Take one tablet up to 3 times a day", "One moment please". A "Show to signer" button opens a full-screen view of the last staff message in huge text, rotated 180° for a tablet lying between two people. A **Mock mode** switch, on by default, plays a scripted dialogue: the signer's captions appear word by word every 320 ms (HELLO → MEDICINE → HEAD → PAIN, then "NO" after the staff reply), with the latency badge updating. Mock mode must work without camera permission. The header has the Hands Up logo (orange squiggle + "hands up"), the links "How it works" and "For businesses", and a small note: "Nothing is recorded or uploaded."
>
> **/how-it-works:** A 4-step horizontal diagram (Camera → Hand and body points → Sign model on your device → Words), a privacy card ("Video never leaves the device. No cookies. No account."), and an honest-limits card ("Research demo for German Sign Language, about 1,200 signs. Not a replacement for interpreters in medical, legal or emergency settings.").
>
> **/business:** Three pricing cards: Free (€0, for Deaf and hard of hearing people), Counter (€49/month, highlighted, "less than one interpreter hour"), Service (€299/month, up to 10 counters). Below them, a "Become a pilot counter" form with name, place type (select: pharmacy, doctor's practice, public office, shop, school, other), city and email. Store submissions in Supabase in a table pilot_signups and show a thank-you state.
>
> Style: white background, orange #FF5A36 accent, near-black text, a large friendly sans-serif, generous spacing, high contrast, fully responsive, and accessible (keyboard, aria labels).
