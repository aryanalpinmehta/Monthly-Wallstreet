/* ============================================================
   Monthly Wallstreet — app.js
   ============================================================ */

const OUTCOME_LABELS = {
  exceeded:      'Target Exceeded',
  'on-track':    'On Track',
  partial:       'Partially Correct',
  mixed:         'Mixed Result',
  correct:       'Correct Call',
  'in-progress': 'In Progress',
};

const CLASS_MAP = {
  'Equity':         'ac-equity',
  'Commodity':      'ac-commodity',
  'Fixed Income':   'ac-fixed-income',
  'Real Estate':    'ac-real-estate',
  'Cryptocurrency': 'ac-cryptocurrency',
  'Equity / FX':    'ac-equity',
};

/* Sections that can appear in the in-report table of contents.
   Each lists the fields it needs, so empty sections drop out. */
const REPORT_SECTIONS = [
  { id: 'sec-macro',     label: 'Macro',     has: r => !!r.macroContext },
  { id: 'sec-thesis',    label: 'Thesis',    has: r => !!r.thesis },
  { id: 'sec-analysis',  label: 'Analysis',  has: r => !!r.body },
  { id: 'sec-metrics',   label: 'Metrics',   has: r => r.keyMetrics && r.keyMetrics.length },
  { id: 'sec-technical', label: 'Technical', has: r => !!r.technicalAnalysis },
  { id: 'sec-quarterly', label: 'Quarters',  has: r => r.quarterlyData && r.quarterlyData.length },
  { id: 'sec-wsw',       label: 'Watching',  has: r => r.wallStreetWatching && r.wallStreetWatching.length },
  { id: 'sec-segments',  label: 'Segments',  has: r => r.segmentRevenue && r.segmentRevenue.length },
  { id: 'sec-play',      label: 'Play',      has: r => !!r.recommendedPlay },
  { id: 'sec-retro',     label: 'Verdict',   has: r => !!r.outcomeNote },
];

/* A tasteful placeholder for the issue that has not shipped yet.
   Copy only, no fabricated data, price target, or recommendation. */
const NEXT_ISSUE = {
  label: 'Next Issue',
  title: 'The August 2026 report is in research.',
  note: 'New theses publish on the first of the month. This slot fills when the issue ships.',
};

/* ── State ───────────────────────────────────────────────── */
let activeFilter = 'All';
let searchQuery  = '';
let lastFocused  = null;

/* ── DOM refs ────────────────────────────────────────────── */
const grid    = document.getElementById('reports-grid');
const overlay = document.getElementById('modal-overlay');
const modal   = document.getElementById('modal');
const progressBar = document.getElementById('read-progress');

/* ── Helpers ─────────────────────────────────────────────── */
function ratingDots(score) {
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="card-rating-dot ${i < score ? 'filled' : ''}"></span>`
  ).join('');
}

function chronological() {
  // reports.js is authored oldest-first; newest issues read best on top.
  return REPORTS.slice().reverse();
}

/* ── Render Cards ────────────────────────────────────────── */
function renderCard(r) {
  const acClass  = CLASS_MAP[r.assetClass] || 'ac-equity';
  const outClass = `outcome-${r.outcome}`;
  const outLabel = OUTCOME_LABELS[r.outcome] || r.outcome;

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'report-card';
  card.setAttribute('data-id', r.id);
  card.setAttribute('aria-label', `${r.title}. ${r.month}. ${outLabel}. Open report.`);

  card.innerHTML = `
    <div class="card-header">
      <span class="card-month">${r.month}</span>
      <span class="card-rating" aria-label="Conviction ${r.ratingScore} of 5">${ratingDots(r.ratingScore)}</span>
    </div>
    <span class="card-asset-class ${acClass}">${r.assetClass}</span>
    <div class="card-title">${r.title}</div>
    <div class="card-subtitle">${r.subtitle}</div>
    <div class="card-ticker">
      <span class="ticker-badge">${r.ticker}</span>
      <span class="ticker-price">${r.priceAtTime}</span>
    </div>
    <div class="card-footer">
      <span class="outcome-badge ${outClass}">${outLabel}</span>
      <span class="card-read-more">Read &rsaquo;</span>
    </div>
  `;
  card.addEventListener('click', () => openModal(r));
  return card;
}

function nextIssueCard() {
  const el = document.createElement('div');
  el.className = 'report-card next-issue';
  el.innerHTML = `
    <span class="next-issue-label">${NEXT_ISSUE.label}</span>
    <div class="next-issue-title">${NEXT_ISSUE.title}</div>
    <div class="next-issue-note">${NEXT_ISSUE.note}</div>
  `;
  return el;
}

function renderGrid() {
  const q = searchQuery.toLowerCase();
  const filtered = chronological().filter(r => {
    const classMatch = activeFilter === 'All' || r.assetClass === activeFilter || r.tags.includes(activeFilter);
    const searchMatch = !q ||
      r.title.toLowerCase().includes(q) ||
      r.asset.toLowerCase().includes(q) ||
      r.ticker.toLowerCase().includes(q) ||
      r.month.toLowerCase().includes(q) ||
      r.tags.some(t => t.toLowerCase().includes(q));
    return classMatch && searchMatch;
  });

  const frag = document.createDocumentFragment();
  if (!filtered.length) {
    grid.innerHTML = '<div class="no-results"><p class="no-results-msg">No reports match that search.</p></div>';
    return;
  }
  // The next-issue placeholder only belongs on the unfiltered, unsearched view.
  if (activeFilter === 'All' && !q) frag.appendChild(nextIssueCard());
  filtered.forEach(r => frag.appendChild(renderCard(r)));
  grid.innerHTML = '';
  grid.appendChild(frag);
}

/* ── Track Record table (computed from published data) ───── */
function renderTrackRecord() {
  const body = document.getElementById('track-body');
  if (!body) return;

  const resolvedStates = ['exceeded', 'correct', 'on-track', 'partial', 'mixed'];
  const resolved = REPORTS.filter(r => resolvedStates.includes(r.outcome));
  const onTargetOrBetter = REPORTS.filter(r => ['exceeded', 'correct', 'on-track'].includes(r.outcome));
  const open = REPORTS.filter(r => r.outcome === 'in-progress');

  const lede = document.getElementById('track-lede');
  if (lede) {
    const pct = resolved.length ? Math.round((onTargetOrBetter.length / resolved.length) * 100) : 0;
    lede.textContent = `Of ${resolved.length} resolved calls, ${onTargetOrBetter.length} landed on target or better, ${pct} percent. ${open.length} theses are still open.`;
  }

  const frag = document.createDocumentFragment();
  chronological().forEach(r => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', r.id);
    tr.setAttribute('tabindex', '0');
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', `${r.title}. Open report.`);
    const vClass = `v-${r.outcome}`;
    const vLabel = OUTCOME_LABELS[r.outcome] || r.outcome;
    tr.innerHTML = `
      <td class="t-month">${r.month}</td>
      <td class="t-title">${r.title}</td>
      <td class="t-ticker">${r.ticker}</td>
      <td class="num">${r.priceAtTime}</td>
      <td class="num">${r.targetPrice}</td>
      <td><span class="t-verdict ${vClass}">${vLabel}</span></td>
    `;
    tr.addEventListener('click', () => openModal(r));
    tr.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(r); }
    });
    frag.appendChild(tr);
  });
  body.appendChild(frag);
}

/* ── Modal: table of contents ────────────────────────────── */
let tocLinks = [];
function buildToc(r) {
  const toc = document.getElementById('modal-toc');
  const active = REPORT_SECTIONS.filter(s => s.has(r));
  toc.innerHTML = active.map(s => `<a href="#${s.id}" data-target="${s.id}">${s.label}</a>`).join('');
  tocLinks = Array.from(toc.querySelectorAll('a'));

  // Show a section only if this report populates it.
  REPORT_SECTIONS.forEach(s => {
    const el = document.getElementById(s.id);
    if (el) el.hidden = !s.has(r);
  });

  tocLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(link.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ── Modal: reading progress + scroll-spy ────────────────── */
function onModalScroll() {
  const scrollTop = overlay.scrollTop;
  const scrollable = overlay.scrollHeight - overlay.clientHeight;
  const pct = scrollable > 0 ? (scrollTop / scrollable) * 100 : 0;
  progressBar.style.width = `${Math.min(pct, 100)}%`;

  // Highlight the current section in the TOC.
  const marker = overlay.scrollTop + overlay.clientHeight * 0.28;
  let currentId = null;
  tocLinks.forEach(link => {
    const sec = document.getElementById(link.dataset.target);
    if (sec && !sec.hidden && sec.offsetTop <= marker) currentId = link.dataset.target;
  });
  tocLinks.forEach(link => link.classList.toggle('current', link.dataset.target === currentId));
}

/* ── Modal ───────────────────────────────────────────────── */
function openModal(r) {
  lastFocused = document.activeElement;
  const acClass  = CLASS_MAP[r.assetClass] || 'ac-equity';
  const outLabel = OUTCOME_LABELS[r.outcome] || r.outcome;

  document.getElementById('modal-month-badge').textContent = r.month;
  const classBadge = document.getElementById('modal-class-badge');
  classBadge.className = `card-asset-class ${acClass}`;
  classBadge.textContent = r.assetClass;
  document.getElementById('modal-title').textContent = r.title;
  document.getElementById('modal-subtitle').textContent = r.subtitle;

  const metaFields = [
    { label: 'Asset',         value: r.asset,       cls: '' },
    { label: 'Ticker',        value: r.ticker,      cls: 'highlight' },
    { label: 'Price (Entry)', value: r.priceAtTime, cls: '' },
    { label: 'Target',        value: r.targetPrice, cls: 'up' },
    { label: 'Horizon',       value: r.timeHorizon, cls: '' },
    { label: 'Rating',        value: r.rating,      cls: 'highlight' },
  ];
  document.getElementById('modal-meta').innerHTML = metaFields.map(f => `
    <div class="meta-item">
      <div class="meta-label">${f.label}</div>
      <div class="meta-value ${f.cls}">${f.value}</div>
    </div>`).join('');

  document.getElementById('modal-macro').textContent = r.macroContext;
  document.getElementById('modal-thesis').textContent = r.thesis;
  document.getElementById('modal-body-content').innerHTML = r.body;

  document.getElementById('modal-metrics').innerHTML = (r.keyMetrics || []).map(m => `
    <div class="metric-card">
      <div class="metric-label">${m.label}</div>
      <div class="metric-value">${m.value}</div>
    </div>`).join('');

  renderTechnical(r);
  renderQuarterly(r);

  document.getElementById('modal-wsw').innerHTML = (r.wallStreetWatching || []).map(w => `
    <div class="wsw-card">
      <div class="wsw-metric">${w.metric}</div>
      <div class="wsw-value">${w.currentValue}</div>
      <div class="wsw-why">${w.why}</div>
    </div>`).join('');

  document.getElementById('modal-segments').innerHTML = (r.segmentRevenue || []).map(s => `
    <div class="segment-card">
      <div class="segment-header">
        <span class="segment-name">${s.segment}</span>
        <span class="segment-revenue">${s.revenue}</span>
        <span class="segment-growth ${s.revenueGrowth && s.revenueGrowth.startsWith('+') ? 'positive' : 'negative'}">${s.revenueGrowth}</span>
      </div>
      ${s.operatingMargin ? `<div class="segment-margin">Margin: ${s.operatingMargin}</div>` : ''}
      <div class="segment-guidance">${s.guidance}</div>
      ${s.analystView ? `<div class="segment-analyst">${s.analystView}</div>` : ''}
    </div>`).join('');

  renderPlay(r);

  const retro = document.getElementById('modal-retro');
  retro.className = `retro-block ${r.outcome}`;
  document.getElementById('modal-retro-verdict').textContent = outLabel;
  document.getElementById('modal-retro-note').textContent = r.outcomeNote;

  buildToc(r);

  overlay.hidden = false;
  // Force reflow so the transition runs, then open.
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.body.style.overflow = 'hidden';
  overlay.scrollTop = 0;
  progressBar.style.width = '0';
  progressBar.classList.add('visible');
  overlay.addEventListener('scroll', onModalScroll);
  document.getElementById('modal-close-btn').focus();
}

function renderTechnical(r) {
  const ta = r.technicalAnalysis;
  const el = document.getElementById('modal-technical');
  if (!ta) { el.innerHTML = ''; return; }
  const rows = [
    ['Candlestick Pattern', ta.candlestick],
    ['RSI (14)', ta.rsi14],
    ['MACD', ta.macd],
    ['Moving Averages', ta.movingAverages],
    ['Support / Resistance', ta.levels],
    ['Volume Profile', ta.volume],
    ['Positioning / Options', ta.positioning],
  ];
  el.innerHTML = rows.map(([label, value]) => `
    <div class="ta-row">
      <div class="ta-label">${label}</div>
      <div class="ta-value">${value}</div>
    </div>`).join('');
}

function renderQuarterly(r) {
  const el = document.getElementById('modal-quarterly');
  const data = r.quarterlyData;
  if (!data || !data.length) { el.innerHTML = ''; return; }
  const first = data[0];

  if (first.epsActual !== undefined) {
    el.innerHTML = `
      <table class="earnings-table">
        <thead><tr><th>Period</th><th>EPS Est</th><th>EPS Actual</th><th>Rev Est</th><th>Rev Actual</th><th>Result</th></tr></thead>
        <tbody>
          ${data.map(q => `
            <tr>
              <td class="period-cell">${q.period}</td>
              <td>${q.epsEstimate}</td>
              <td class="${q.epsBeat ? 'beat' : 'miss'}">${q.epsActual}</td>
              <td>${q.revenueEstimate}</td>
              <td class="${q.revenueBeat ? 'beat' : 'miss'}">${q.revenueActual}</td>
              <td><span class="beat-badge ${q.epsBeat ? 'beat' : 'miss'}">${q.epsBeat ? 'Beat' : 'Miss'}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${first.note ? `<p class="earnings-note">${first.note}</p>` : ''}`;
  } else if (first.startPrice !== undefined) {
    el.innerHTML = `
      <table class="earnings-table">
        <thead><tr><th>Period</th><th>Start</th><th>End</th><th>Return</th><th>Key Driver</th></tr></thead>
        <tbody>
          ${data.map(q => `
            <tr>
              <td class="period-cell">${q.period}</td>
              <td>${q.startPrice}</td>
              <td>${q.endPrice}</td>
              <td class="${q.quarterReturn && q.quarterReturn.startsWith('+') ? 'beat' : 'miss'}">${q.quarterReturn}</td>
              <td>${q.keyDriver}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } else if (first.returnVsSPY !== undefined) {
    el.innerHTML = `
      <table class="earnings-table">
        <thead><tr><th>Period</th><th>vs SPY</th><th>Constituents Beating</th><th>Key Driver</th></tr></thead>
        <tbody>
          ${data.map(q => `
            <tr>
              <td class="period-cell">${q.period}</td>
              <td class="${q.returnVsSPY && q.returnVsSPY.startsWith('+') ? 'beat' : 'miss'}">${q.returnVsSPY}</td>
              <td>${q.constituentsBeating || 'N/A'}</td>
              <td>${q.keyDriver}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } else {
    el.innerHTML = `
      <div class="fi-quarters">
        ${data.map(q => `
          <div class="fi-quarter-card">
            <div class="fi-quarter-label">${q.period}</div>
            <div class="fi-quarter-main">${q.yieldOrNII || q.fundsFromOperations || 'N/A'}</div>
            <div class="fi-quarter-return ${q.totalReturn && q.totalReturn.startsWith('+') ? 'beat' : 'miss'}">${q.totalReturn || ''}</div>
            <div class="fi-quarter-note">${q.note || ''}</div>
          </div>`).join('')}
      </div>`;
  }
}

function renderPlay(r) {
  const rp = r.recommendedPlay;
  const el = document.getElementById('modal-play');
  if (!rp) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="play-header">
      <span class="play-action">${rp.action}</span>
      <span class="play-timeframe">${rp.timeframe}</span>
    </div>
    <div class="play-levels">
      <div class="play-level"><div class="play-level-label">Entry</div><div class="play-level-value">${rp.entry}</div></div>
      <div class="play-level"><div class="play-level-label">Target</div><div class="play-level-value target">${rp.target}</div></div>
      <div class="play-level"><div class="play-level-label">Stop</div><div class="play-level-value stop">${rp.stopLoss}</div></div>
      <div class="play-level"><div class="play-level-label">Size</div><div class="play-level-value">${rp.positionSize}</div></div>
    </div>
    <p class="play-justification">${rp.justification}</p>
    <div class="play-risk"><span class="play-risk-label">Key Risk</span> ${rp.keyRisk}</div>
    ${rp.catalysts ? `<div class="play-catalysts"><span class="play-catalysts-label">Catalysts</span> ${rp.catalysts.join(' · ')}</div>` : ''}`;
}

function closeModal() {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  progressBar.classList.remove('visible');
  progressBar.style.width = '0';
  overlay.removeEventListener('scroll', onModalScroll);
  setTimeout(() => { overlay.hidden = true; }, 200);
  if (lastFocused) lastFocused.focus();
}

/* ── Focus trap ──────────────────────────────────────────── */
function trapFocus(e) {
  if (overlay.hidden || e.key !== 'Tab') return;
  const focusable = modal.querySelectorAll('a[href], button, input, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ── Filters ─────────────────────────────────────────────── */
function setupFilters() {
  const container = document.getElementById('filter-btns');
  const filters = ['All', 'Equity', 'Commodity', 'Fixed Income', 'Real Estate', 'Cryptocurrency'];
  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `filter-btn${f === 'All' ? ' active' : ''}`;
    btn.textContent = f;
    if (f === 'All') btn.setAttribute('aria-pressed', 'true');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      activeFilter = f;
      renderGrid();
    });
    container.appendChild(btn);
  });
}

/* ── Search ──────────────────────────────────────────────── */
function setupSearch() {
  const input = document.getElementById('search-input');
  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      searchQuery = input.value.trim();
      renderGrid();
    }, 150);
  });
}

/* ── Global events ───────────────────────────────────────── */
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.getElementById('modal-close-btn').addEventListener('click', closeModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !overlay.hidden) closeModal();
  trapFocus(e);
});

/* ── Hero stats counter ──────────────────────────────────── */
function animateCount(el, target, suffix = '', duration = 1000) {
  const start = performance.now();
  const step = ts => {
    const progress = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(ease * target) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function monthsOfCoverage() {
  // Span from first to last report date, inclusive.
  const dates = REPORTS.map(r => r.date).filter(Boolean).sort();
  if (!dates.length) return REPORTS.length;
  const a = new Date(dates[0]);
  const b = new Date(dates[dates.length - 1]);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
}

function initStats() {
  const total = REPORTS.length;
  const resolvedStates = ['exceeded', 'correct', 'on-track', 'partial', 'mixed'];
  const resolved = REPORTS.filter(r => resolvedStates.includes(r.outcome)).length;
  const onTarget = REPORTS.filter(r => ['exceeded', 'correct', 'on-track'].includes(r.outcome)).length;
  const accuracy = resolved ? Math.round((onTarget / resolved) * 100) : 0;
  const months = monthsOfCoverage();

  const run = () => {
    animateCount(document.getElementById('stat-reports'), total);
    animateCount(document.getElementById('stat-accuracy'), accuracy, '%', 1200);
    animateCount(document.getElementById('stat-months'), months);
  };

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.getElementById('stat-reports').textContent = total;
    document.getElementById('stat-accuracy').textContent = accuracy + '%';
    document.getElementById('stat-months').textContent = months;
    return;
  }

  const statsEl = document.querySelector('.hero-stats');
  if (!statsEl || !('IntersectionObserver' in window)) { run(); return; }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { run(); obs.disconnect(); } });
  }, { threshold: 0.3 });
  obs.observe(statsEl);
}

/* ── Deep link: #report=<id> opens that report ───────────── */
function openFromHash() {
  const m = location.hash.match(/report=([\w-]+)/);
  if (!m) return;
  const r = REPORTS.find(x => x.id === m[1]);
  if (r) openModal(r);
}

/* ── Init ────────────────────────────────────────────────── */
function init() {
  setupFilters();
  setupSearch();
  renderGrid();
  renderTrackRecord();
  initStats();
  openFromHash();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
