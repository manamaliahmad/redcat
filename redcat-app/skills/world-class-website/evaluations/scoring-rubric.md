# Website quality evaluation — scoring rubric (0–100)

Internal benchmark hai, universal industry standard nahi. Har test (T1–T8) ko inspect karne ke baad har category ko score do. Functional gates alag se pass/fail hain — aik bhi gate fail ho to test FAIL hai, total score chahe kuch bhi ho.

## Weights

| Category | Max | Kya dekho |
|---|---|---|
| Visual quality | 25 | Layout, spacing, typography, hierarchy, colour harmony, polish |
| Design originality | 15 | Template jaisa ya original? Reference copy to nahi? Apni pehchan hai? |
| Content accuracy | 15 | Facts sahi hain? Koi invented fact nahi? Koi missing content nahi? |
| Responsive behaviour | 15 | Mobile, tablet, desktop — koi overflow, cut text, horizontal scroll nahi |
| Interactions and functionality | 10 | 3D moment, animations, buttons, forms — sab kaam karte hain? |
| Performance | 10 | Load tez hai? 3D heavy nahi? Mobile par usable hai? |
| Accessibility | 5 | Contrast, readable text, keyboard/tab usable, alt text |
| Code quality | 5 | Clean structure, no dead code, no secrets in code, responsive CSS |
| **Total** | **100** | |

## Har category mein kya matlab hai

- **Full marks:** category mein koi visible kami nahi.
- **Aadhe marks:** kaam karta hai lekin weak hai — masalan spacing theek hai lekin typography plain hai, ya mobile theek hai lekin tablet par aik jagah overflow hai.
- **Zero:** category tooti hui hai — masalan content mein invented facts hain (content accuracy 0), ya mobile par site use nahi ho sakti (responsive 0), ya 3D moment kaam hi nahi karta (interactions 0).

## Total bands

- **90–100 — World-class.** Launch-ready. Yehi bar hai.
- **75–89 — Strong.** Chhoti fixes ke saath usable.
- **60–74 — Usable lekin weak.** Dobara cycle chahiye — design ya execution mein kami hai.
- **0–59 — Fail.** Dobara banao, ya root cause dhoondo.

## Functional gates (pass/fail — score se alag)

Har test ke gates `test-cases.json` mein likhe hain. Aam gates:

- Koi console error nahi
- Koi broken link nahi
- Navigation / buttons kaam karte hain
- Forms (agar hon) submit hote hain
- Koi missing content nahi
- Mobile par horizontal scroll nahi
- Reference ki images/text/logo/brand copy nahi hui (T6 — copy milna = FAIL)
- Demo label maujood hai jahan fictional business ho (fake client nahi)

**Aik bhi gate fail = test FAIL.** Score phir bhi record karo (diagnosis ke liye), lekin test pass nahi hoga.

## Ali ka verdict (taste — score se upar)

Rubric number deta hai, taste faisla deta hai. Har test par ali ka verdict lazmi hai:

- **Verdict:** PASS / FAIL
- **Aik line:** kyun — kya acha laga, kya kharab laga

Agar rubric 85 de aur ali FAIL kahe, to test FAIL hai. Agar rubric 70 de aur ali PASS kahe, to test PASS hai lekin score batata hai ke improvement kahan chahiye. Yehi tumhara taste data banta hai — `~/workspace/data/website-design/` mein brief + skeleton + final + verdict.

## Root-cause table (fail ho to kahan fix karo)

| Problem | Kahan improvement chahiye? |
|---|---|
| PDF/input se information miss hui | Document intelligence skill |
| Design boring / template jaisa tha | Design intelligence skill |
| 3D animation broken ya decorative thi | 3D implementation skill |
| Mobile layout kharab tha | Responsive skill |
| Website visually weak thi | Design QA skill |
| Code execute nahi hua | Execution engine / harness |
| Model ne instructions ignore ki | Model adapter / prompt / routing |
| Content mein invented facts | Input inspection / verification loop |
| Reference copy ho gayi | Reference-url guardrail |

## Regression rule

Kisi bhi website skill mein change ke baad purane 8 tests dobara chalao.

- Naya total purane total se kam ho → change adopt mat karo. Pehle root cause dhoondo.
- Naya total barabar ya zyada ho, aur koi gate fail na ho → change adopt kar sakte ho.
- Har run ka total `results/` mein record karo taake trend dikhe.

## Score sheet (har test ke liye)

```
Test: T_ — naam
Run: YYYY-MM-DD run N
Model/key: (jo use hui)
Visual quality: __ / 25
Design originality: __ / 15
Content accuracy: __ / 15
Responsive behaviour: __ / 15
Interactions and functionality: __ / 10
Performance: __ / 10
Accessibility: __ / 5
Code quality: __ / 5
Total: __ / 100
Gates: PASS / FAIL (kaunsa gate fail hua, agar hua)
Ali verdict: PASS / FAIL — kyun: ________
Root cause (agar fail): ________
```

## Honest limits

- Visual scoring ke liye vision input chahiye — harness abhi text-only hai. Jab tak vision wiring nahi, visual scores Playwright screenshots + ali ki aankh se aate hain.
- Rubric internal benchmark hai. Is ko industry standard mat kaho.
- Pehla full run capable key ke baad hoga.
