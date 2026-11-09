# RedCat Website Evaluation Lab

World-class website engine ko aik jaisi conditions par test karne, score karne, aur har change ke baad regression check karne ka lab.

Tayyar: 9 Nov 2026. Version 1.0.0.

## Kya hai is mein

- `test-cases.json` — 8 tests (T1–T8), har aik mein exact prompt, input, skills, functional gates.
- `scoring-rubric.md` — 0–100 rubric (weights + bands), pass/fail gates, ali ka verdict, root-cause table, regression rule.
- `results/` — har run ki score sheet yahan. Template: `results/_TEMPLATE.md`.

## 8 tests — aik nazar mein

| Test | Kya | Site type | Kya test hoga |
|---|---|---|---|
| T1 | Developer portfolio | Portfolio | Basic design intelligence |
| T2 | PDF se portfolio | Portfolio | PDF understanding, no invented facts |
| T3 | Premium 3D portfolio | Portfolio | 3D implementation, playable moment |
| T4 | Salon business website | Business (salon) | Profession adaptation — asal cash use case |
| T5 | SaaS landing page | Business (SaaS) | Conversion structure, pricing, CTA |
| T6 | Redesign existing website | Redesign | Reference-url flow, copy = FAIL |
| T7 | Mobile-first portfolio | Portfolio | Responsive, mobile pehle |
| T8 | Personal preferences | Portfolio | Memory adaptation, ali ki taste |

ChatGPT ke 8 tests portfolio-only thay — ye flaw fix kiya gaya hai. T4 salon aur T5 SaaS RedCat ke asal kaam hain (20-demo list aur services track), is liye wo andar hain.

## Kaise chalao (aik run)

1. Aik run mein 8 tests, aik hi session mein, aik hi model/key se.
2. Har test ke liye RedCat ko `test-cases.json` mein likha exact `user_prompt` do. Prompt badlo mat, warna scores compare nahi honge.
3. T2 mein wahi sample CV PDF use karo har run mein. T6 mein wahi reference URL use karo har run mein. Input badla to test badal gaya.
4. Har test ke baad: Playwright checks (console errors, links, responsive screenshots desktop + tablet + mobile) + score sheet bharo.
5. Score sheet: `results/YYYY-MM-DD-run-N.md` — aik file per run, 8 tests andar. Template copy karo.
6. Ali ka verdict har test par lazmi: PASS / FAIL + aik line kyun.

## Kaise score karo

- Rubric `scoring-rubric.md` mein hai. Total 0–100.
- Functional gates pass/fail hain — aik bhi gate fail ho to test FAIL hai, score chahe kuch bhi ho.
- 90–100 world-class, 75–89 strong, 60–74 usable lekin weak, 0–59 fail.
- Rubric score aur ali ka verdict dono record karo. Agar dono mein farq ho to verdict jeetta hai — wahi taste data hai.

## Regression testing (har change ke baad)

Kisi bhi website skill mein change ke baad purane 8 tests dobara chalao.

- Naya total purane se kam ho → change adopt mat karo. Root cause dhoondo (rubric mein table hai).
- Naya total barabar ya zyada ho, aur koi gate fail na ho → adopt kar sakte ho.
- Trend dekhne ke liye har run ka total record karo.

## Results kahan jate hain

- Score sheets: `results/` mein, aik file per run.
- Taste data: har test ka brief + skeleton + final code + verdict `~/workspace/data/website-design/` pattern par — brief.md, skeleton.md, verdict.md. Yehi data baad mein training ka kaam aayega (50 pairs = pehla chhota experiment, 500 pairs = real 7B experiment).
- Failed runs kabhi delete mat karo — wo sab se zyada qeemti hain.

## Honest limits

- Visual scoring ke liye vision input chahiye — harness abhi text-only hai, image-input slice post-testing build hai. Jab tak vision wiring nahi, visual scores Playwright screenshots + ali ki aankh se aate hain.
- Pehla full run capable key ke baad hoga (OpenRouter $5 top-up pending).
- Rubric internal benchmark hai, universal industry standard nahi.
- T6 ka reference URL har run mein wahi hona chahiye — pehle run se pehle aik stable public demo site choose kar ke `test-cases.json` mein note karo.

## Location

Ye lab RedCat ke skill system mein install hai: `skills/world-class-web-engine/evaluations/` (ali ke PC par, master skill consolidation 9 Nov 2026 — pehle `skills/world-class-website/evaluations/` mein tha). Is file ki VM copy (`~/workspace/redcat-eval-lab/`) source of truth hai — move ke baad hashes match kiye gaye hain.
