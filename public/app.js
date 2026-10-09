const $ = s => document.querySelector(s);
const COL = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#22C55E' };
const EMO = { HIGH: '⚠️', MEDIUM: '⚠️', LOW: '✅' };
let lastReport = '';
let lastResult = null;
let busy = false;
let ringTick = null;

// 1. styled toasts — never alert()
function toast(msg, kind) {
  let wrap = document.getElementById('toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3600);
}
function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

// final output label: FAKE URL / FAKE MESSAGE / FAKE COMPANY when risky, SAFE ... when clean
function fvOf(r) {
  if (r.finalVerdict) return r.finalVerdict;
  const kind = r.kind || (r.type === 'website' ? 'URL' : r.type === 'job' ? 'MESSAGE' : 'COMPANY');
  return (r.safe || r.verdict === 'LOW' ? 'SAFE ' : 'FAKE ') + kind;
}
const isSafe = r => r.safe || r.verdict === 'LOW';

// 2. Enter submits · 13. paste-detection pill
$('#query').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); investigate(); } });
let phTimer;
function showPasteHint() {
  const p = $('#pasteHint'); if (!p) return;
  p.classList.remove('hidden');
  clearTimeout(phTimer);
  phTimer = setTimeout(() => p.classList.add('hidden'), 5000);
}
$('#query').addEventListener('paste', () => setTimeout(() => {
  if (/^(https?:\/\/|www\.)\S+$/i.test($('#query').value.trim())) showPasteHint();
}, 60));

// quick cards only focus an empty box — the user must write or paste the input themselves
document.querySelectorAll('.qcard').forEach(b => b.onclick = () => {
  $('#query').value = '';
  if (b.dataset.ph) $('#query').placeholder = b.dataset.ph;
  $('#query').focus();
  document.querySelector('#home').scrollIntoView({ behavior: 'smooth' });
});
$('#go').onclick = investigate;
$('#cmpBtn').onclick = compare;
$('#cmpInput').addEventListener('keydown', e => { if (e.key === 'Enter') compare(); });
$('#srcBtn').onclick = () => {
  const el = $('#srcList');
  el.classList.toggle('hidden');
  $('#srcBtn').textContent = el.classList.contains('hidden') ? 'View Sources ▾' : 'Hide Sources ▴';
};
$('#copyBtn').onclick = () => { navigator.clipboard.writeText(lastReport); $('#copyBtn').textContent = '✓ Copied!'; setTimeout(() => $('#copyBtn').textContent = '📋 Copy report', 1800); };
$('#dlBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lastReport], { type: 'text/plain' }));
  a.download = 'scamshield-report.txt'; a.click();
};
$('#pngBtn').onclick = () => { if (lastResult) downloadReportCard(lastResult); };
// 12. share (Web Share API → WhatsApp fallback)
$('#shareBtn').onclick = async () => {
  if (!lastReport) return toast('Run an investigation first, then share it.', 'warn');
  if (navigator.share) {
    try { await navigator.share({ title: 'ScamShield AI report', text: lastReport }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  window.open('https://wa.me/?text=' + encodeURIComponent(lastReport), '_blank', 'noopener');
};

async function runCheck(input) {
  const r = await fetch('/api/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }) });
  if (!r.ok) throw new Error('check failed');
  return r.json();
}

// ---------- feature 1: scan animation ----------
const STEPS = ['Scanning website…', 'Checking company records…', 'Analyzing public reports…', 'Calculating risk score…'];
function runScanAnim() {
  $('#scan').classList.remove('hidden');
  $('#scanSteps').innerHTML = '';
  $('#scanFill').style.width = '4%';
  let i = 0;
  $('#scanTxt').textContent = STEPS[0];
  const t = setInterval(() => {
    i++;
    if (i < STEPS.length) {
      $('#scanTxt').textContent = STEPS[i];
      $('#scanFill').style.width = (8 + i * 28) + '%';
      $('#scanSteps').innerHTML += `<div class="done">✓ ${STEPS[i - 1]}</div>`;
    } else clearInterval(t);
  }, 750);
  return t;
}

async function investigate() {
  if (busy) return;
  const input = $('#query').value.trim();
  if (!input) return toast('Paste a website, company or job offer first.', 'warn');
  busy = true;
  $('#pasteHint') && $('#pasteHint').classList.add('hidden');
  $('#research').classList.add('hidden');
  const timer = runScanAnim();
  $('#go').textContent = 'Investigating…'; $('#go').disabled = true;
  const minWait = new Promise(r => setTimeout(r, 3000));
  try {
    const [r] = await Promise.all([runCheck(input), minWait]);
    clearInterval(timer);
    $('#scan').classList.add('hidden');
    render(r);
    saveHist(input, r);
  } catch (e) {
    clearInterval(timer);
    $('#scan').classList.add('hidden');
    toast('Backend is napping — run: npm install; npm start', 'err');
  }
  $('#go').textContent = '🔎 Investigate'; $('#go').disabled = false;
  busy = false;
}

function render(r) {
  lastResult = r;
  const c = COL[r.verdict] || '#A855F7';
  $('#research').classList.remove('hidden');
  $('#resEntity').textContent = r.entity || r.input.slice(0, 60);
  const v = $('#resVerdict');
  v.textContent = (isSafe(r) ? '✅ ' : '⚠️ ') + fvOf(r);
  v.className = 'verdict ' + r.verdict;
  // 15. confidence mini-bar
  $('#confBadge').textContent = `${r.confidence}% confidence • ${r.engine}`;
  const cf = $('#confFill');
  cf.style.width = '0%';
  setTimeout(() => { cf.style.width = r.confidence + '%'; }, 150);
  // feature 3: AI verdict summary
  $('#aiSum').innerHTML = `<span class="who">🧠 VERDICT SUMMARY • ${r.aiEngine || 'rule-based'}</span>${r.aiSummary || templateClient(r)}`;
  // 3+14. animated ring: glow trail + ambient verdict glow
  // SAFE → no score number shown, just a full green ring with the word SAFE (user rule)
  const fg = $('#ringFg'), trail = $('#ringTrail'), sw = document.querySelector('.score-wrap');
  fg.style.stroke = c;
  trail.style.stroke = c;
  const CIRC = 415;
  const targetOffset = isSafe(r) ? 0 : CIRC - (CIRC * r.score / 100);
  fg.style.strokeDashoffset = CIRC;
  trail.style.strokeDashoffset = CIRC;
  sw.style.setProperty('--glow', c);
  sw.classList.remove('lit');
  requestAnimationFrame(() => setTimeout(() => {
    sw.classList.add('lit');
    fg.style.strokeDashoffset = targetOffset;
    trail.style.strokeDashoffset = targetOffset;
  }, 60));
  const numEl = $('#scoreNum');
  numEl.style.color = c;
  numEl.classList.toggle('word', isSafe(r));
  clearInterval(ringTick);
  if (isSafe(r)) {
    numEl.textContent = 'SAFE';
  } else {
    let n = 0;
    ringTick = setInterval(() => { n += 2; if (n >= r.score) { n = r.score; clearInterval(ringTick); } numEl.textContent = n; }, 22);
  }
  const sl = $('#scoreLbl');
  sl.textContent = isSafe(r) ? '✓ no risk found' : r.verdict + ' RISK'; sl.style.color = c;
  // 8. verdict reaction: burst on LOW/MEDIUM, shake + 3D shield pulse on HIGH
  if (r.verdict === 'HIGH') {
    const ring = document.querySelector('.ring');
    ring.classList.remove('shake'); ring.getBoundingClientRect();
    ring.classList.add('shake');
    setTimeout(() => ring.classList.remove('shake'), 700);
    if (window.ssShieldPulse) window.ssShieldPulse();
  }
  sw.querySelectorAll('.burst').forEach(b => b.remove());
  if (r.verdict !== 'HIGH') {
    const burst = document.createElement('div');
    burst.className = 'burst';
    const count = r.verdict === 'LOW' ? 14 : 10;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const d = 72 + Math.random() * 52;
      p.style.setProperty('--x', (Math.cos(a) * d).toFixed(1) + 'px');
      p.style.setProperty('--y', (Math.sin(a) * d).toFixed(1) + 'px');
      p.style.background = c;
      p.style.animationDelay = (i * 0.02) + 's';
      burst.appendChild(p);
    }
    sw.appendChild(burst);
    setTimeout(() => burst.remove(), 1500);
  }
  // safe result → print SAFE only, hide risk panels (user rule: if real, why show risk)
  $('#reasons').classList.toggle('hidden', isSafe(r));
  $('#reasons').innerHTML = r.reasons.map(x => `<li>${EMO[r.verdict]} ${x}</li>`).join('');
  if (!isSafe(r) && r.trapLabels && r.trapLabels.length) {
    $('#trapBox').classList.remove('hidden');
    $('#traps').innerHTML = r.trapLabels.map(x => `<li>🔻 ${x}</li>`).join('');
  } else $('#trapBox').classList.add('hidden');
  // feature 1: staggered evidence reveal · 10. icon micro-wiggle follows each card
  $('#evidence').innerHTML = r.evidence.map((e, i) => {
    const d = i * 0.22 + 0.1;
    return `<div class="ev" style="animation-delay:${d}s;--wd:${(d + 0.4).toFixed(2)}s"><b>${e.icon} ${e.title}</b><p>${e.text}</p></div>`;
  }).join('');
  $('#checked').innerHTML = r.sourcesChecked.map(s => `<li>${s.label}</li>`).join('');
  $('#srcList').innerHTML = r.sources.length
    ? r.sources.map((s, i) => `<a target="_blank" href="${s.link}" style="animation-delay:${i * 0.18}s">🔗 ${s.label}</a>`).join('')
    : '<span class="muted">No external links for this one — add a SerpApi key for live sources.</span>';
  $('#srcList').classList.add('hidden');
  $('#srcBtn').textContent = 'View Sources ▾';
  const rec = $('#rec');
  rec.className = 'panel rec ' + r.verdict;
  rec.innerHTML = `<div class="p-title">RECOMMENDATION</div><div class="rec-title">${r.verdict === 'HIGH' ? '🚨 ' : r.verdict === 'MEDIUM' ? '⚠️ ' : '✅ '}${r.recommendation.title}</div><ul>${r.recommendation.lines.map(l => `<li>${l}</li>`).join('')}</ul>`;
  lastReport = r.report;
  document.querySelector('#research').scrollIntoView({ behavior: 'smooth' });
  renderHist();
}

function templateClient(r) {
  if (r.verdict === 'HIGH') return `${fvOf(r)} — multiple red flags for "${r.entity}" (${r.score}/100): do not pay, share OTPs, or send documents.`;
  if (r.verdict === 'MEDIUM') return `${fvOf(r)} — mixed signals for "${r.entity}" (${r.score}/100): verify independently first.`;
  return `${fvOf(r)} — no warning signs for "${r.entity}" in public results.`;
}

// ---------- feature 5: compare mode ----------
async function compare() {
  if (busy) return;
  const a = $('#query').value.trim();
  const b = $('#cmpInput').value.trim();
  if (!a || !b) return toast('Fill BOTH the main search box and the compare box.', 'warn');
  busy = true;
  $('#cmpBtn').textContent = 'Checking both…'; $('#cmpBtn').disabled = true;
  const timer = runScanAnim();
  try {
    const [ra, rb] = await Promise.all([runCheck(a), runCheck(b)]);
    clearInterval(timer); $('#scan').classList.add('hidden');
    const cells = [ra, rb].map(r => `
      <div class="cmp-col">
        <b>${r.entity}</b>
        <div class="cmp-score" style="color:${COL[r.verdict]};${isSafe(r) ? 'font-size:28px;letter-spacing:1px' : ''}">${isSafe(r) ? 'SAFE' : r.score}</div>
        <div class="cmp-verd" style="color:${COL[r.verdict]}">${isSafe(r) ? '✅ ' : '⚠️ '}${fvOf(r)}</div>
        ${isSafe(r) ? '' : `<ul class="cmp-reasons">${r.reasons.slice(0, 2).map(x => `<li>${x}</li>`).join('')}</ul>`}
      </div>`).join('<div class="cmp-vs">VS</div>');
    $('#cmpGrid').innerHTML = cells;
    const diff = Math.abs(ra.score - rb.score);
    const riskier = ra.score >= rb.score ? ra : rb;
    const safer = ra.score >= rb.score ? rb : ra;
    if (isSafe(ra) && isSafe(rb)) {
      $('#cmpVerdictLine').innerHTML = `Both check out as <span style="color:${COL.LOW}">SAFE</span> — still verify officially before any big decision.`;
    } else if (isSafe(ra) || isSafe(rb)) {
      const bad = isSafe(ra) ? rb : ra;
      const good = isSafe(ra) ? ra : rb;
      $('#cmpVerdictLine').innerHTML = `<span style="color:${COL[bad.verdict]}">${bad.entity}</span> is <span style="color:${COL[bad.verdict]}">fake/risky</span>, while <span style="color:${COL.LOW}">${good.entity}</span> is <span style="color:${COL.LOW}">SAFE</span> — avoid the risky one.`;
    } else {
      $('#cmpVerdictLine').innerHTML = diff < 10
        ? `Both look similar (only ${diff} points apart) — verify both manually before trusting either.`
        : `<span style="color:${COL[riskier.verdict]}">${riskier.entity}</span> is riskier than <span style="color:${COL[safer.verdict]}">${safer.entity}</span> by ${diff} points.`;
    }
    $('#compare').classList.remove('hidden');
    document.querySelector('#compare').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    clearInterval(timer); $('#scan').classList.add('hidden');
    toast('One of the checks failed — try again.', 'err');
  }
  $('#cmpBtn').textContent = '⚖️ Compare'; $('#cmpBtn').disabled = false;
  busy = false;
}

// ---------- feature 2: WhatsApp-ready PNG report card ----------
function downloadReportCard(r) {
  const W = 900, H = 1180;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const col = COL[r.verdict];
  // background
  x.fillStyle = '#06040B'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#A855F718'; x.lineWidth = 1;
  for (let i = 0; i < W; i += 44) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let i = 0; i < H; i += 44) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
  // panel
  roundRect(x, 40, 40, W - 80, H - 80, 22, '#130C22', '#271B40', 2);
  // header
  x.fillStyle = '#F5F3FF'; x.font = '800 34px Inter, Arial'; x.fillText('🛡️ ScamShield AI', 80, 110);
  x.fillStyle = '#9F93BE'; x.font = '500 17px Inter, Arial'; x.fillText('Investigate. Verify. Stay Safe.', 80, 140);
  x.fillStyle = '#A855F7'; x.font = '700 14px Inter, Arial'; x.fillText('I N V E S T I G A T I O N   R E P O R T', 80, 180);
  // entity
  x.fillStyle = '#F5F3FF'; x.font = '800 30px Inter, Arial';
  x.fillText(trunc(x, r.entity, W - 160), 80, 240);
  // score circle
  const cx = W / 2, cy = 380, R = 105;
  x.strokeStyle = '#271B40'; x.lineWidth = 22;
  x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = col;
  x.beginPath(); x.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * r.score / 100)); x.stroke();
  x.fillStyle = col; x.textAlign = 'center';
  if (isSafe(r)) {
    // SAFE → no score number, just the word
    x.font = '800 54px Inter, Arial'; x.fillText('SAFE', cx, cy + 16);
    x.font = '700 17px Inter, Arial'; x.fillText('✓ no risk found', cx, cy + 52);
  } else {
    x.font = '800 76px Inter, Arial'; x.fillText(r.score, cx, cy + 14);
    x.font = '800 19px Inter, Arial'; x.fillText(fvOf(r), cx, cy + 52);
  }
  x.textAlign = 'left';
  // verdict pill
  const pill = (isSafe(r) ? '✅ ' : '⚠️ ') + fvOf(r);
  x.font = '800 24px Inter, Arial';
  const pw = x.measureText(pill).width + 56;
  roundRect(x, 90, 530, pw, 56, 14, col + '33', col, 2);
  x.fillStyle = col; x.fillText(pill, 118, 567);
  // AI summary
  x.fillStyle = '#F5F3FF'; x.font = '500 19px Inter, Arial';
  const lines = wrap(x, r.aiSummary || '', W - 200);
  let y = 630;
  lines.slice(0, 4).forEach(l => { x.fillText(l, 100, y); y += 30; });
  // reasons
  y += 16;
  x.fillStyle = '#9F93BE'; x.font = '700 16px Inter, Arial'; x.fillText('KEY SIGNALS', 100, y); y += 34;
  x.fillStyle = '#F5F3FF'; x.font = '500 18px Inter, Arial';
  r.reasons.slice(0, 4).forEach(rr => {
    const mk = isSafe(r) ? '✓ ' : '⚠ ';
    wrap(x, mk + rr, W - 220).slice(0, 2).forEach(l => { x.fillText(l, 100, y); y += 27; });
    y += 8;
  });
  // do-not box for HIGH
  if (r.verdict === 'HIGH') {
    const top = Math.max(y + 20, 900);
    roundRect(x, 80, top, W - 160, 132, 14, '#EF444422', '#EF4444', 2);
    x.fillStyle = '#EF4444'; x.font = '800 21px Inter, Arial'; x.fillText('DO NOT:', 108, top + 40);
    x.fillStyle = '#F5F3FF'; x.font = '600 18px Inter, Arial';
    x.fillText('❌ Send money   ❌ Share OTPs   ❌ Share bank details', 108, top + 78);
    x.fillText('❌ Upload ID documents   ❌ Stay in touch with the sender', 108, top + 110);
  }
  // footer
  x.fillStyle = '#9F93BE'; x.font = '500 15px Inter, Arial';
  x.fillText('Research aid from public info — not a legal verdict. Fraud? cybercrime.gov.in | 1930', 80, H - 75);
  x.fillText(`Confidence ${r.confidence}% • ${r.engine} • SerpApi India Hackathon 2026`, 80, H - 50);
  cv.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scamshield-' + (r.entity || 'report').replace(/[^\w.-]+/g, '_').slice(0, 40) + '.png';
    a.click();
  });
}
function roundRect(x, px, py, w, h, rad, fill, stroke, lw) {
  x.beginPath();
  x.moveTo(px + rad, py);
  x.arcTo(px + w, py, px + w, py + h, rad);
  x.arcTo(px + w, py + h, px, py + h, rad);
  x.arcTo(px, py + h, px, py, rad);
  x.arcTo(px, py, px + w, py, rad);
  x.closePath();
  if (fill) { x.fillStyle = fill; x.fill(); }
  if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw || 1; x.stroke(); }
}
function wrap(ctx, text, maxW) {
  const words = (text || '').split(' ');
  const lines = []; let cur = '';
  words.forEach(w => {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  });
  if (cur) lines.push(cur);
  return lines;
}
function trunc(ctx, text, maxW) {
  let t = String(text || '');
  while (t.length > 4 && ctx.measureText(t).width > maxW) t = t.slice(0, -2);
  return t === text ? t : t + '…';
}

// ---------- history ----------
function saveHist(input, r) {
  try {
    const h = JSON.parse(localStorage.getItem('scamshield_hist') || '[]');
    h.unshift({ input: input.slice(0, 60), score: r.score, verdict: r.verdict, fv: fvOf(r), t: Date.now() });
    localStorage.setItem('scamshield_hist', JSON.stringify(h.slice(0, 8)));
  } catch (e) {}
}
function ago(t) {
  const s = Math.max(0, (Date.now() - (t || 0)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return Math.floor(s / 86400) + ' d ago';
}
function renderHist() {
  let h = [];
  try { h = JSON.parse(localStorage.getItem('scamshield_hist') || '[]'); } catch (e) {}
  const sec = $('#historySec');
  if (!h.length) { sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden');
  $('#history').innerHTML = h.map((x, i) => {
    const word = !!(x.fv && x.fv.indexOf('SAFE') === 0);
    return `
    <button class="hcard" data-i="${i}">
      <span class="hchip ${esc(x.verdict)}${word ? ' word' : ''}">${word ? 'SAFE' : Number(x.score) || 0}</span>
      <span class="htxt"><b>${esc(x.input)}</b><small>${esc(x.fv || x.verdict)} · ${ago(x.t)}</small></span>
    </button>`;
  }).join('');
  document.querySelectorAll('#history .hcard').forEach(b => b.onclick = () => {
    const item = JSON.parse(localStorage.getItem('scamshield_hist') || '[]')[+b.dataset.i];
    if (item) { $('#query').value = item.input; investigate(); }
  });
}

fetch('/api/health').then(r => r.json()).then(h => {
  $('#engineBadge').innerHTML = h.serpapi
    ? '<i class="dot live"></i>live engine: SerpApi Search + News'
    : '<i class="dot demo"></i>demo-mode: add SERPAPI_KEY in .env for live SerpApi evidence';
}).catch(() => { $('#engineBadge').innerHTML = '<i class="dot demo"></i>backend offline — run npm start'; });
renderHist();
