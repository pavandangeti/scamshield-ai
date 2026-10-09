# 🛡️ ScamShield AI — AI Scam/Phishing Website Research Assistant
**SerpApi India Hackathon 2026** | "Investigate. Verify. Stay Safe."

**🚀 Live demo: [scanshield1.netlify.app](https://scanshield1.netlify.app)** (live SerpApi evidence mode)

Paste a suspicious website, company name, or job offer → live public-info research → **final verdict (SAFE / FAKE URL · MESSAGE · COMPANY)** with a 0–100 risk score, reasons, evidence, sources, and a family-shareable report.

## Why it wins
- **SerpApi is the engine, not decoration:** every check fans out to SerpApi Google Search (`"X" scam/fraud/complaint`, `"X" review`, official-site lookup) + Google News. Without the key it runs honest demo-mode (3 canned cases) so the stage demo never dies.
- **Explainable risk:** RiskScore = scam-report hits 30 + trap phrases 25 + domain risk 20 + missing trust info 15 + claim-vs-reality 10, plus a whole-web existence gate (opens the URL, checks Google's index — nonexistent name = HIGH). Every point links to evidence.
- **Built for India:** Telegram job-fraud patterns, ₹/day bait detection, cybercrime.gov.in + 1930 in every HIGH report, shareable PNG report card for WhatsApp forwards.

## Killer features
1. **Staggered evidence reveal** — evidence cards + sources pop in one-by-one, the AI visibly "shows its receipts"
2. **WhatsApp-ready PNG report card** — one click → branded dark card (score ring, verdict, key signals, DO-NOT list) downloaded, ready to forward to family
3. **🧠 Verdict summary** — one plain-English sentence (Gemini 1.5 Flash if `GEMINI_API_KEY` set, rule-based fallback) above the score
4. **⚖️ Compare mode** — paste a 2nd URL/offer → side-by-side scores + "X is riskier than Y by N points"
5. **Violet + black premium landing** — opens on a full-screen splash (name only) over a full-site 3D scene (glowing wireframe shield, orbit rings, particle field, cyber floor grid) that reacts to cursor AND scroll — shield recedes/spins, camera descends through the grid as you scroll to the search. Staggered entrance, scroll-reveal panels, 3D-tilt cards.

## Run (2 min)
```powershell
npm install
Copy-Item .env.example .env   # paste SERPAPI_KEY from https://serpapi.com
npm start
# open http://localhost:3000
```
No key? Demo these three: the prefilled Telegram job scam (HIGH 82), `infosys.com careers` (LOW), `GrowFast Traders double your money` (MEDIUM-ish).

## API
- `POST /api/check` `{input}` → `{type, kind, safe, finalVerdict, entity, score, verdict, confidence, reasons[], evidence[], sourcesChecked[], sources[], trapLabels[], recommendation, report, engine}`
  - `finalVerdict` is the headline output: **FAKE URL / FAKE MESSAGE / FAKE COMPANY** when risky, **SAFE URL / SAFE MESSAGE / SAFE COMPANY** when clean (safe results hide the risk panels)
- `GET /api/health`

## Scoring
| Signal | Max |
|---|---|
| Scam/fraud report hits in public results | 30 |
| Trap phrases ("no interview", "registration fee", OTP/Aadhaar asks) | 25 |
| Domain risk (free TLD, typosquat, shorteners, http) | 20 |
| Missing trust info (no official site, asks money/docs) | 15 |
| Claim-vs-reality (₹ lakhs/day, "govt approved" w/o proof) | 10 |
| **Whole-web existence gate** — engine opens the URL directly + checks the Google index for the exact name | *floor* |
Verdict: 0–30 LOW 🟢 · 31–60 MEDIUM 🟡 · 61–100 HIGH 🔴. Final output is binary: LOW → `SAFE <kind>` (risk sections hidden), MEDIUM/HIGH → `FAKE <kind>` (full risk report). Always framed as a research aid, never a legal verdict.

**Existence rules:** 0 Google results for the exact name → **HIGH 72** (it doesn't exist online). Domain DNS doesn't resolve → **HIGH 68**. Exists + official match + zero scam hits → −8 trust bonus. Scam "hits" only count when the accusation sits within ~25 chars of the name (so `example.com` used as a placeholder in security articles doesn't get flagged).

## Demo script (90s)
1. "My mother got this Telegram offer…" → paste → Investigate → HIGH, traps highlighted, sources shown.
2. `www.darkweb.com` → HIGH: "domain does not resolve — no live website exists" (existence gate).
3. `www.example.com` → LOW 12 — opens the site (HTTP 200, title "Example Domain") and confirms official presence (proves no fear-mongering).
4. Copy report → "forward on WhatsApp before anyone pays a rupee."

## Run locally
```bash
npm install
cp .env.example .env   # add SERPAPI_KEY (without it → honest demo-mode)
npm start              # http://localhost:3000
```

## Deploy
Preconfigured for both platforms (import the GitHub repo — build settings auto-fill):
- **Netlify** (`netlify.toml`) — static site from `public/`, `/api/*` wrapped by `netlify/functions/api.js` (serverless-http). Set env `SERPAPI_KEY`.

Local uses `npm start`; ~4–6 SerpApi credits per live check.
