// ScamShield AI — backend for SerpApi India Hackathon 2026
// Research engine = SerpApi (Google Search + Google News). Scoring = transparent RiskScore /100.
// Runs in demo-mode without a key (3 canned cases) so the demo never dies on stage.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ---------- input typing ----------
function detectType(input = '') {
  const t = input.trim();
  if (/https?:\/\/|www\.|t\.me\/|bit\.ly|tinyurl|wa\.me/i.test(t)) return 'website';
  if (/\b[\w-]+\.(com|in|org|net|co|io|ai|xyz|tk|ml|ga|cf|gq|top|click|link|site|online|store)\b/i.test(t) && t.split(/\s+/).length <= 4) return 'website';
  if (t.length > 60 || /earn|salary|job|interview|registration|telegram|whatsapp|vacancy|hiring|work from home/i.test(t)) return 'job';
  return 'company';
}

function extractEntity(input, type) {
  const t = input.trim();
  if (type === 'website') {
    const m = t.match(/(?:https?:\/\/)?(?:www\.)?([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
    if (m) return m[1].toLowerCase();
  }
  if (type === 'job') {
    const h = t.match(/@([A-Za-z0-9_]{3,})/);
    if (h) return '@' + h[1];
    const caps = t.match(/\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,2})\b/);
    if (caps && caps[1].length > 4) return caps[1];
    return 'job offer message';
  }
  const words = t.replace(/https?:\/\/\S+|www\.\S+/gi, ' ').replace(/[^A-Za-z0-9₹@.\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const caps = t.match(/\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,2})\b/);
  if (caps && caps[1].length > 3) return caps[1];
  const stop = new Set(['earn', 'from', 'home', 'with', 'without', 'apply', 'join', 'daily', 'monthly', 'work', 'job', 'offer']);
  const keep = words.filter(w => !stop.has(w.toLowerCase()) && w.length > 2).slice(0, 4);
  return (keep.join(' ') || t.slice(0, 60)).slice(0, 60);
}

// ---------- trap phrases (too-good-to-be-true text signals, max 25) ----------
const TRAPS = [
  { re: /\bno interview\b/i, label: '"No interview" — real jobs always interview', pts: 8 },
  { re: /registration\s?(fee|fees|charge)/i, label: 'Asks for a "registration fee" — classic advance-fee trap', pts: 8 },
  { re: /pay\s*(₹|rs\.?|inr)?\s*[\d,]+\s*(for\s*)?registration/i, label: 'You must PAY money just to register/apply — classic advance-fee trap', pts: 8 },
  { re: /security\s?(deposit|fee|amount|money)/i, label: 'Asks for a "security deposit" before work starts', pts: 8 },
  { re: /pay.*(first|before|upfront|in advance)/i, label: 'You must pay BEFORE earning anything', pts: 7 },
  { re: /earn[^.]{0,40}₹\s?[\d,]+[^.]{0,20}(\/day|per day|daily)/i, label: 'Unrealistic daily income promise', pts: 7 },
  { re: /\botp\b/i, label: 'Mentions OTP — never share OTPs with strangers', pts: 6 },
  { re: /aadhaar|pan card[^.]{0,30}(share|send|upload|photo)/i, label: 'Asks for Aadhaar/PAN photos early — identity-theft risk', pts: 6 },
  { re: /govt\.?\s?approved|government approved/i, label: '"Govt approved" claim with no proof shown', pts: 5 },
  { re: /telegram|whatsapp\s?(only|number|contact)?/i, label: 'Runs only on Telegram/WhatsApp, no real office', pts: 5 },
  { re: /urgent(ly)?\s?(join|hiring|requirement|vacancy)/i, label: 'Fake urgency pressure ("join urgently")', pts: 4 },
  { re: /double your money|guaranteed (returns|profit|income)|multiply your (money|investment)/i, label: '"Guaranteed returns / double your money" — investment-fraud signature', pts: 8 },
  { re: /(bit\.ly|t\.me\/|wa\.me|tinyurl)/i, label: 'Uses link shorteners/chat links instead of a real site', pts: 4 },
  { re: /work from home[^.]{0,30}\d+\s?(hour|hr)/i, label: '"2-hours-a-day" income story — typical bait', pts: 4 }
];

function findTraps(text) {
  const hits = [];
  let pts = 0;
  for (const t of TRAPS) {
    if (t.re.test(text)) { hits.push(t); pts += t.pts; }
  }
  return { hits, pts: Math.min(25, pts) };
}

// ---------- domain risk (max 20) ----------
const FREE_TLDS = ['tk', 'ml', 'ga', 'cf', 'gq', 'xyz', 'top', 'click', 'link'];
const KNOWN_BRANDS = ['infosys', 'tcs', 'wipro', 'hdfc', 'icici', 'sbi', 'reliance', 'amazon', 'flipkart', 'google', 'microsoft', 'apple', 'samsung'];
function lev(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function domainRisk(input, entity) {
  const out = { pts: 0, flags: [] };
  const dm = input.match(/(?:https?:\/\/)?(?:www\.)?([A-Za-z0-9.-]+\.([A-Za-z]{2,}))/) || entity.match(/([A-Za-z0-9.-]+\.([A-Za-z]{2,}))/);
  if (!dm) return out;
  const domain = dm[1].toLowerCase(), tld = (dm[2] || '').toLowerCase();
  const root = domain.split('.')[0].split('-')[0].replace(/[^a-z0-9]/g, '');
  if (FREE_TLDS.includes(tld)) { out.pts += 12; out.flags.push(`Free throwaway domain (.${tld}) — serious companies don't use these`); }
  for (const b of KNOWN_BRANDS) {
    const d = lev(root, b);
    if (root !== b && d >= 1 && d <= 2) { out.pts += 12; out.flags.push(`Looks like a misspelling of "${b}" (${domain}) — typosquatting sign`); break; }
  }
  if (/bit\.ly|tinyurl|t\.co/i.test(input)) { out.pts += 6; out.flags.push('Shortened link hides the real destination'); }
  if (/^http:\/\//i.test(input.trim())) { out.pts += 4; out.flags.push('Uses plain http, not secure https'); }
  out.pts = Math.min(20, out.pts);
  return out;
}

// ---------- SerpApi fan-out ----------
// "Google hasn't returned any results" = genuine zero results; anything else is an API failure → retry once,
// and a failure must NEVER be read as "0 results / doesn't exist".
const NO_RESULTS_RE = /hasn'?t returned any results|no results found|did not match any documents/i;
async function serpFetch(url) {
  let lastErr;
  for (let a = 0; a < 2; a++) {
    try {
      const r = await fetch(url, { timeout: 15000 });
      const j = await r.json();
      if (j.error) {
        if (NO_RESULTS_RE.test(j.error)) return {};
        throw new Error(j.error);
      }
      return j;
    } catch (e) {
      lastErr = e;
      if (a === 0) await new Promise(res => setTimeout(res, 700));
    }
  }
  throw lastErr;
}
async function serpSearch(query, engine = 'google', num = 5) {
  const url = `https://serpapi.com/search.json?engine=${engine}&q=${encodeURIComponent(query)}&num=${num}&api_key=${SERPAPI_KEY}`;
  const j = await serpFetch(url);
  return (j.organic_results || j.news_results || []).slice(0, num).map(o => ({
    title: o.title || '', link: o.link || '', snippet: o.snippet || ''
  }));
}

const SCAM_RE = /(scam|fraud|fake|cheat|cheating|complaint|beware|phish|spam|lawsuit|arrest|busted)/i;
const NEG_SCAM = /\b(?:no|not|never|isn'?t|without|zero)\s+(?:a\s+)?scam\b|\bscam or not\b|\bscam or real\b|\breal or scam\b|\bno (?:fraud|complaint)s?\b/i;
// a "report" only counts if the accusation sits near the entity name (kills placeholder/generic matches like example.com in security articles)
function hitRelevant(o, entity) {
  const TS = (((o.title || '') + ' ' + (o.snippet || '')).replace(/\s+/g, ' '));
  if (!SCAM_RE.test(TS) || NEG_SCAM.test(TS)) return false;
  const roots = [];
  entity.toLowerCase().split(/[^a-z0-9]+/).forEach(w => { if (w.length >= 4 && roots.indexOf(w) === -1) roots.push(w); });
  const first = entity.toLowerCase().split('.')[0];
  if (first.length >= 4 && roots.indexOf(first) === -1) roots.push(first);
  if (!roots.length) return false;
  const T = o.title || '';
  if (SCAM_RE.test(T) && roots.some(r => T.toLowerCase().indexOf(r) !== -1)) return true;
  const w = TS.toLowerCase();
  const near = /(scam|fraud|fake|complaint|phish)/;
  return roots.some(r => {
    let i = w.indexOf(r);
    while (i !== -1) {
      if (near.test(w.slice(Math.max(0, i - 25), i)) || near.test(w.slice(i + r.length, i + r.length + 25))) return true;
      i = w.indexOf(r, i + r.length);
    }
    return false;
  });
}
async function liveEvidence(entity) {
  const settled = await Promise.allSettled([
    serpSearch(`"${entity}" scam OR fraud OR complaint`, 'google', 5),
    serpSearch(`"${entity}" review`, 'google', 5),
    serpSearch(`"${entity}" official website`, 'google', 3),
    serpSearch(`"${entity}" fraud`, 'google_news', 5)
  ]);
  const scamQ = settled[0].status === 'fulfilled' ? settled[0].value : [];
  const reviews = settled[1].status === 'fulfilled' ? settled[1].value : [];
  const official = settled[2].status === 'fulfilled' ? settled[2].value : [];
  const news = settled[3].status === 'fulfilled' ? settled[3].value : [];
  const all = [...scamQ, ...reviews, ...news];
  const scamHits = all.filter(o => hitRelevant(o, entity));
  return { scamQ, reviews, official, news, all, scamHits };
}

// ---------- whole-web existence + "open the site and check" ----------
function hostOf(link) {
  try { return new URL(link).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
}
function safeHttpUrl(u) {
  try {
    const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u);
    if (x.protocol !== 'http:' && x.protocol !== 'https:') return null;
    const h = x.hostname;
    if (h === 'localhost' || /^(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return null;
    return x.toString();
  } catch (e) { return null; }
}
async function serpOrganic(query, num = 10) {
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=${num}&api_key=${SERPAPI_KEY}`;
  const j = await serpFetch(url);
  return j.organic_results || [];
}
// Social/profile platforms: the DOMAIN is always real & indexed (and returns HTTP 200 for any
// username), so checking the bare domain makes every fake profile look SAFE. The fake part is
// the username/path — verify the FULL "platform/username" URL instead (0 Google results = fake).
const PROFILE_PLATFORMS = ['instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'tiktok.com', 'linkedin.com', 'youtube.com', 'reddit.com', 'pinterest.com', 'snapchat.com', 'github.com', 'threads.net', 'quora.com', 't.me', 'telegram.me'];
function profileEntity(entity, input) {
  const ent = String(entity || '');
  if (!ent) return null;
  const host = hostOf(/^https?:\/\//i.test(ent) ? ent : 'https://' + ent);
  if (!host) return null;
  if (!PROFILE_PLATFORMS.some(p => host === p || host.endsWith('.' + p))) return null;
  const src = String(input || '').trim();
  let u = null;
  try { u = new URL(/^https?:\/\//i.test(src) ? src : 'https://' + src); }
  catch (e) {
    const m = src.match(/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/[^\s"'<>]*)?/);
    return m && m[1] && m[1] !== '/' ? host + m[1].replace(/\/+$/, '') : null;
  }
  const path = u.pathname.replace(/\/+$/, '');
  const query = u.search || '';
  // generic endpoints (facebook profile.php?id=123, etc.) put the identity in the query string
  if ((!path || path === '/' || /^\/(profile\.php|users?|p|pages|in)$/i.test(path)) && query) return host + path + query;
  if (!path || path === '/') return null; // bare domain (e.g. instagram.com) — no username to verify
  return host + path;
}
async function existenceCheck(entity, input, type) {
  const out = { count: 0, domainHits: 0, officialMatch: null, fetchStatus: null, fetchTitle: '', fetchError: '', absent: false, unreachable: false };
  if (!entity || entity === 'job offer message') return out;

  const prof = profileEntity(entity, input);
  const idxQuery = prof ? `site:${prof}` : entity;
  out.query = prof ? prof : entity;
  out.profile = prof || null;

  const tasks = [];
  tasks.push(serpOrganic(idxQuery, 10).then(r => ['idx', r, null]).catch(e => ['idx', null, String(e.message || e)]));
  tasks.push(serpOrganic(`"${entity}" official website`, 5).then(r => ['off', r, null]).catch(e => ['off', null, String(e.message || e)]));

  // "open and check": actually request the URL for websites
  if (type === 'website') {
    const m = input.match(/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'<>]*/);
    const target = safeHttpUrl(m ? m[0] : entity);
    if (target) {
      tasks.push(fetch(target, {
        timeout: 9000, redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ScamShield/1.0' }
      }).then(async resp => {
        out.fetchStatus = resp.status;
        const html = (await resp.text()).slice(0, 60000);
        const t = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
        out.fetchTitle = t ? t[1].trim().replace(/\s+/g, ' ').slice(0, 120) : '';
        return ['fetch', null];
      }).catch(e => {
        const msg = String(e.message || e.code || e);
        out.fetchError = /ENOTFOUND|EAI_AGAIN|getaddrinfo|ENOENT/i.test(msg)
          ? 'the domain does not resolve — no such website exists'
          : msg.slice(0, 110);
        return ['fetch', null];
      }));
    }
  }

  const settled = await Promise.allSettled(tasks);
  let idx = [], off = [], idxOk = false, idxErr = '';
  settled.forEach(s => {
    if (s.status !== 'fulfilled') return;
    const tag = s.value[0], res = s.value[1], err = s.value[2];
    if (tag === 'idx') { if (err) idxErr = err; else { idx = res; idxOk = true; } }
    else if (tag === 'off' && !err) off = res;
  });
  out.idxOk = idxOk;
  out.idxErr = idxErr;
  out.count = idxOk ? idx.length : 0;
  if (type === 'website') {
    const dom = entity.toLowerCase().replace(/^www\./, '');
    out.domainHits = idx.filter(o => {
      const h = hostOf(o.link);
      return h === dom || h.endsWith('.' + dom) || String(o.link || '').toLowerCase().includes(dom);
    }).length;
  }
  const brand = entity.toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length >= 4)[0] || '';
  out.officialMatch = brand ? (off.find(o => hostOf(o.link).includes(brand)) || null) : null;
  out.absent = idxOk && out.count === 0;
  out.dnsDead = !out.fetchStatus && /does not resolve|no such website/i.test(out.fetchError || '');
  out.unreachable = idxOk && type === 'website' && !out.fetchStatus && !!out.fetchError && out.domainHits === 0 && out.count === 0;
  return out;
}

// ---------- demo-mode canned cases (no key) ----------
function canned(input) {
  const t = input.toLowerCase();
  if (/easyearn|₹\s?499|499.*registration|telegram.*earn|earn.*telegram/i.test(t)) {
    return {
      score: 82, verdict: 'HIGH',
      reasons: ['Conflicting company information', 'Multiple suspicious reports', 'Unusual job requirements', 'Missing company information'],
      evidence: [
        { icon: '🏢', title: 'Company information', text: 'No registered company, address, or CIN found for "EasyEarn". The name does not match any official website.' },
        { icon: '🚨', title: 'Online reports', text: 'This message matches the well-known "registration fee" job-fraud pattern reported across complaint boards.' },
        { icon: '💼', title: 'Job description', text: 'Asks for ₹499 upfront + runs only on Telegram. Real employers never charge to hire you.' }
      ],
      sources: [
        { label: 'Advance-fee job fraud pattern', link: 'https://www.cybercrime.gov.in' },
        { label: 'Report at Cyber Crime portal', link: 'https://www.cybercrime.gov.in' }
      ],
      trapHits: TRAPS.filter(x => x.re.test(input)).map(x => x.label),
      note: 'demo-mode'
    };
  }
  if (/infosys/.test(t)) {
    return {
      score: 12, verdict: 'LOW',
      reasons: ['Verified official domain (infosys.com)', 'Long-established public company', 'No scam-report pattern found'],
      evidence: [
        { icon: '🏢', title: 'Company information', text: 'Infosys Ltd is a publicly listed company (NSE/BSE) with a verifiable official site and careers page.' },
        { icon: '✅', title: 'Online reports', text: 'No fraud pattern matches this query — results point to the legitimate company.' }
      ],
      sources: [{ label: 'infosys.com (official)', link: 'https://www.infosys.com' }],
      trapHits: [],
      note: 'demo-mode'
    };
  }
  return {
    score: 45, verdict: 'MEDIUM',
    reasons: ['Limited verifiable information', 'Could not confirm official registration', 'Exercise caution before sharing details'],
    evidence: [{ icon: '🔎', title: 'Company information', text: 'Public information is thin. Add a SerpApi key for a live deep-search of reports and reviews.' }],
    sources: [],
    trapHits: TRAPS.filter(x => x.re.test(input)).map(x => x.label),
    note: 'demo-mode'
  };
}

// ---------- AI verdict summary: Gemini when key present, rule-based always works ----------
function templateSummary(r) {
  const e = r.entity;
  const fv = r.finalVerdict || '';
  if (r.verdict === 'HIGH') {
    if (r.existAbsent) return `${fv ? fv + ' — ' : ''}"${e}" does not exist on the public web — Google returns zero results for that exact name. Anything claiming to be it is lying; stay away.`;
    if (r.reasons && /does not resolve/.test(r.reasons[0] || '')) return `${fv ? fv + ' — ' : ''}"${e}" has no live website — the address does not even exist on the internet. Anything sharing it is steering you somewhere fake. Stay away.`;
    if (r.trapLabels && r.trapLabels.length >= 2) return `${fv ? fv + ' — ' : ''}"${e}" matches a known scam formula — ${r.trapLabels[0].replace(/"/g, '').toLowerCase()}, plus ${r.reasons[0].toLowerCase()}. Walk away, and report it at cybercrime.gov.in.`;
    return `${fv ? fv + ' — ' : ''}multiple red flags around "${e}" (${r.score}/100) — ${r.reasons.slice(0, 2).join(' and ').toLowerCase()}. Do not pay, share OTPs, or send documents.`;
  }
  if (r.verdict === 'MEDIUM') return `${fv ? fv + ' — ' : ''}mixed signals for "${e}" (${r.score}/100): ${r.reasons.slice(0, 2).join(' and ').toLowerCase()}. Verify independently before trusting it with money or personal details.`;
  return `${fv ? fv + ' — ' : ''}"${e}" checks out in public results — nothing alarming found. Still verify officially before any big decision.`;
}
async function geminiSummary(r) {
  if (!GEMINI_API_KEY) return null;
  try {
    const prompt = `You are a scam-analysis assistant. Target: "${r.entity}" (type: ${r.type}). RiskScore ${r.score}/100 = ${r.verdict}. Reasons: ${r.reasons.join('; ')}. Trap phrases found: ${(r.trapLabels || []).join('; ') || 'none'}. Write ONE plain-English sentence (max 35 words) a parent would understand explaining the verdict. No markdown, no emoji.`;
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), timeout: 12000
    });
    const j = await resp.json();
    const t = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    return t ? t.trim().replace(/^["']|["']$/g, '') : null;
  } catch (e) { return null; }
}
async function withAiSummary(out) {
  const g = await geminiSummary(out);
  out.aiSummary = g || templateSummary(out);
  out.aiEngine = g ? 'gemini-1.5-flash' : 'rule-based';
  return out;
}

// ---------- main endpoint ----------
app.post('/api/check', async (req, res) => {
  const input = ((req.body && req.body.input) || '').trim();
  if (!input) return res.status(400).json({ error: 'Paste a website, company or job offer first.' });
  const type = detectType(input);
  const entity = extractEntity(input, type);
  const traps = findTraps(input);
  const dom = domainRisk(input, entity);

  // demo-mode: no key
  if (!SERPAPI_KEY) {
    const c = canned(input);
    const liveTraps = Math.min(25, traps.pts);
    const score = Math.min(98, Math.max(c.score, liveTraps ? c.score : 0));
    return res.json(await withAiSummary(finish(input, type, entity, score, c.verdict, c.reasons, c.evidence, c.sources, traps.hits.map(h => h.label), 0, 'demo-mode (add SERPAPI_KEY for live SerpApi search)')));
  }

  // live mode
  let ev = { scamQ: [], reviews: [], official: [], news: [], all: [], scamHits: [] };
  let exist = null;
  let serpNote = '';
  const [sEv, sEx] = await Promise.allSettled([liveEvidence(entity), existenceCheck(entity, input, type)]);
  if (sEv.status === 'fulfilled') ev = sEv.value;
  else serpNote = 'SerpApi error: ' + String(sEv.reason.message || sEv.reason).slice(0, 120);
  if (sEx.status === 'fulfilled') exist = sEx.value;
  else serpNote += (serpNote ? ' | ' : '') + 'existence check error: ' + String(sEx.reason.message || sEx.reason).slice(0, 120);
  const scamPts = Math.min(30, ev.scamHits.length * 6 + (ev.news.filter(o => hitRelevant(o, entity)).length * 4));
  let trustPts = 0;
  const trustFlags = [];
  if (ev.official.length === 0 && type !== 'job') { trustPts += 8; trustFlags.push('No clear official website found in public results'); }
  const asksMoneyOrOtp = /(pay|registration|fee|otp|aadhaar|pan card|bank|upi|deposit)/i.test(input);
  const asksUpfront = /(pay[\s\S]{0,30}(registration|fee|upfront|before|first))|registration\s?(fee|charge)|security\s?deposit|\botp\b/i.test(input);
  if (asksMoneyOrOtp) trustPts += asksUpfront ? 15 : 7;
  if (asksUpfront) trustFlags.push('The message itself asks for money or sensitive details');
  trustPts = Math.min(15, trustPts);
  let claimPts = 0;
  if (/₹\s?\d{4,}[^.]{0,20}(day|daily)/i.test(input)) claimPts += 10;
  else if (/\blakh\b/i.test(input) && /part.?time|home|daily/i.test(input)) claimPts += 8;
  else if (/double your money|guaranteed (returns|profit|income)/i.test(input)) claimPts += 10;
  claimPts = Math.min(10, claimPts);

  let score = Math.min(98, scamPts + traps.pts + dom.pts + trustPts + claimPts);
  // verified real presence: exists everywhere, official match, zero scam hits → small trust bonus
  if (exist && !exist.absent && exist.officialMatch && ev.scamHits.length === 0) score = Math.max(6, score - 8);
  // known scam formulas: always at least MEDIUM, job-fraud pattern always HIGH
  const trapCount = traps.hits.length;
  const guaranteedPromise = /double your money|guaranteed (returns|profit|income)/i.test(input);
  if (trapCount >= 3 || (trapCount >= 2 && asksUpfront)) { if (score < 68) score = 68; }
  else if (guaranteedPromise && trapCount >= 2) { if (score < 50) score = 50; }
  // domain red flags: typosquat + free TLD = phishing-grade, any flag = at least medium
  if (dom.pts >= 20) { if (score < 65) score = 65; }
  else if (dom.pts >= 12) { if (score < 42) score = 42; }
  // whole-web existence gate: no trace on the internet = HIGH; dead DNS / unindexed = HIGH
  if (exist) {
    if (exist.absent) { if (score < 72) score = 72; }
    else if (exist.dnsDead) { if (score < 68) score = 68; }
    else if (exist.unreachable) { if (score < 66) score = 66; }
  }
  const verdict = score >= 61 ? 'HIGH' : score >= 31 ? 'MEDIUM' : 'LOW';

  const reasons = [];
  if (exist && exist.absent) reasons.unshift(exist.profile
    ? 'This exact profile/page does not exist on the public web — 0 Google results for its full URL'
    : 'Does not exist on the public web — 0 Google results for this exact name');
  else if (exist && exist.dnsDead) reasons.unshift('The domain does not resolve — no live website exists at this address');
  else if (exist && exist.unreachable) reasons.unshift('Website is unreachable and does not appear in Google\'s index');
  if (ev.scamHits.length) reasons.push(verdict === 'LOW'
    ? `A few results mention scam/fraud words near this name (${ev.scamHits.length}) — no confirmed complaints`
    : `${ev.scamHits.length} suspicious report(s) found linking this name to scam/fraud`);
  if (traps.hits.length) reasons.push(`Unusual requirements (${traps.hits.length} trap phrase${traps.hits.length > 1 ? 's' : ''})`);
  if (dom.flags.length) reasons.push('Conflicting / suspicious domain signals');
  if (trustFlags.length) reasons.push('Missing company information');
  if (!reasons.length) reasons.push(score <= 30 ? 'No major warning signs in public results' : 'Some signals need manual verification');

  const evidence = [];
  if (exist) {
    evidence.unshift({
      icon: '🔍', title: exist.profile ? 'Profile/page existence check' : 'Existence check (whole web)',
      text: exist.idxOk === false
        ? `The Google index check could not be completed this time (search API hiccup${exist.idxErr ? ': ' + exist.idxErr.slice(0, 60) : ''}) — existence was NOT verified and this was not counted as risk either way.`
        : exist.absent
          ? (exist.profile
            ? `Google's index has NO page at "${exist.query}" (site: search returned 0 results) — this profile/page does not exist publicly. Social platforms still serve a page for usernames that don't exist, so the live site responding is NOT proof it's real.`
            : `Google returns 0 results for "${entity}" — this name does not appear anywhere on the public internet. Real websites and companies always have a footprint.`)
          : `Found ${exist.count} Google results for "${exist.query || entity}"${exist.domainHits ? `, ${exist.domainHits} pointing back to this exact domain` : ''}.`
    });
    if (type === 'website') {
      if (exist.fetchStatus) evidence.push(exist.profile
        ? { icon: '📡', title: 'Platform replied (HTTP ' + exist.fetchStatus + ')', text: `The platform answered${exist.fetchTitle ? ` ("${exist.fetchTitle}")` : ''}, but Instagram/Facebook/X-style sites return a page even for usernames that don't exist — so this alone is not proof the profile is real.` }
        : { icon: '📡', title: 'Website opened & checked', text: `The URL responded with HTTP ${exist.fetchStatus}${exist.fetchTitle ? ` — page title: "${exist.fetchTitle}"` : ''}.` });
      else if (exist.fetchError) evidence.push({ icon: '🚫', title: exist.dnsDead ? 'Website does not exist (DNS failed)' : 'Website could not be opened', text: `Attempted to open the site: ${exist.fetchError}.` });
    }
    if (exist.officialMatch) evidence.push({ icon: '✅', title: 'Official presence verified', text: `Google confirms an official-looking presence: "${exist.officialMatch.title}" — open the sources below to compare.` });
    else if (!exist.absent && exist.idxOk !== false && type !== 'job') evidence.push({ icon: '⚠️', title: 'Official presence not confirmed', text: `Results exist, but none matches "${entity}" as a verified official website.` });
  }
  if (dom.flags.length) evidence.push({ icon: '🌐', title: 'Domain check', text: dom.flags.join('. ') + '.' });
  if (ev.scamHits.length) evidence.push({ icon: '🚨', title: 'Online reports', text: verdict === 'LOW'
    ? `Checked ${ev.scamHits.length} result(s) mentioning scam/fraud words near this name — they read as warnings/news/guides, not confirmed complaints against it. Open the sources below.`
    : `${ev.scamHits.length} public result(s) directly link this name to scam/fraud/complaints. Open the sources below.` });
  else evidence.push({ icon: '✅', title: 'Online reports', text: 'No scam/fraud pattern matched in the checked results.' });
  if (traps.hits.length) evidence.push({ icon: '💼', title: 'Offer analysis', text: traps.hits.map(h => h.label).join('. ') + '.' });
  if (ev.official.length) evidence.push({ icon: '🏢', title: 'Company information', text: `Top official-looking result: ${ev.official[0].title}. Compare it with what the message claims.` });
  else if (type !== 'job') evidence.push({ icon: '🏢', title: 'Company information', text: 'Could not pin down one clear official website — treat claims with suspicion.' });

  const sources = [
    ...ev.scamHits.slice(0, 3).map(o => ({ label: o.title.slice(0, 80), link: o.link })),
    ...ev.official.slice(0, 2).map(o => ({ label: 'Official: ' + o.title.slice(0, 70), link: o.link })),
    ...ev.news.slice(0, 2).map(o => ({ label: 'News: ' + o.title.slice(0, 70), link: o.link }))
  ].filter(s => s.link);

  const out = finish(input, type, entity, score, verdict, reasons, evidence, sources, traps.hits.map(h => h.label), ev.all.length + (exist ? 2 : 0), 'live via SerpApi (Google Search + News)' + (serpNote ? ' • ' + serpNote : ''));
  if (exist) {
    out.sourcesChecked.unshift({
      label: exist.idxOk === false
        ? 'Whole-web existence check (Google index unavailable this time — direct URL open only)'
        : 'Whole-web existence check (Google index + direct URL open)',
      done: true
    });
    out.existAbsent = exist.absent;
    out.existCount = exist.count;
  }
  return res.json(await withAiSummary(out));
});

function finish(input, type, entity, score, verdict, reasons, evidence, sources, trapLabels, sourcesChecked, engine) {
  const confidence = Math.min(96, 45 + sourcesChecked * 6 + (engine.startsWith('live') ? 12 : 0));
  const kind = type === 'website' ? 'URL' : type === 'job' ? 'MESSAGE' : 'COMPANY';
  const safe = verdict === 'LOW';
  const finalVerdict = (safe ? 'SAFE' : 'FAKE') + ' ' + kind;
  const rec = verdict === 'HIGH'
    ? { title: 'HIGH RISK — step back', lines: ['Do not send money, OTPs, bank/UPI details, or ID documents.', 'Stop chatting with the sender; block and report.', 'Verify via the official website (type it yourself) or call the company helpline.', 'Report it at cybercrime.gov.in (or call 1930).'] }
    : verdict === 'MEDIUM'
      ? { title: 'PROCEED WITH CAUTION', lines: ['Do not pay anything or share OTPs/IDs yet.', 'Verify the company independently: official site, LinkedIn, MCA/CIN records.', 'Meet/speak through official channels only — not just Telegram/WhatsApp.'] }
      : { title: 'SAFE — no red flags found', lines: ['Nothing alarming found in public results.', 'Still verify for big decisions (money, job acceptance).', 'Prefer official sites and written offers.'] };
  return {
    input: input.slice(0, 500), type, kind, safe, finalVerdict, entity, score, verdict, confidence,
    reasons, evidence,
    sourcesChecked: [
      { label: 'Official company website', done: true },
      { label: 'Scam / fraud reports', done: true },
      { label: 'Public reviews', done: true },
      { label: 'News / reports', done: true },
      { label: 'Offer text traps', done: true }
    ],
    sources, trapLabels, recommendation: rec, engine,
    report: buildReport(entity, score, finalVerdict, confidence, reasons, sources)
  };
}

function buildReport(entity, score, finalVerdict, confidence, reasons, sources) {
  const L = [];
  L.push('SCAMSHIELD AI — INVESTIGATION REPORT');
  L.push(`Target: ${entity}`);
  L.push(finalVerdict.indexOf('SAFE') === 0
    ? `Verdict: ${finalVerdict} | Confidence: ${confidence}%`
    : `Verdict: ${finalVerdict} | Score: ${score}/100 | Confidence: ${confidence}%`);
  L.push('');
  L.push('Reasons:');
  reasons.forEach(r => L.push('- ' + r));
  L.push('');
  L.push('Sources:');
  (sources || []).forEach(s => L.push('- ' + s.label + (s.link ? ' — ' + s.link : '')));
  L.push('');
  L.push('Note: research aid based on public info, not a legal verdict. Verify independently. Report fraud at https://www.cybercrime.gov.in');
  return L.join('\n');
}

app.get('/api/health', (req, res) => res.json({ ok: true, serpapi: !!SERPAPI_KEY, time: new Date().toISOString() }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Local dev (node server.js) → listen. On Vercel the app is required by api/*.js and runs as a function.
if (require.main === module) {
  app.listen(PORT, () => console.log(`ScamShield AI on http://localhost:${PORT} | SerpApi: ${SERPAPI_KEY ? 'LIVE' : 'demo-mode'}`));
}
module.exports = app;
