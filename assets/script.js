// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let rawText = '', words = [], vocab = [], wordIndex = {}, wordCounts = {};
let freqMatrix = null, normMatrix = null, matrixBuilt = false;

// ═══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
function notify(msg, icon = '✅', duration = 3000) {
  const el = document.getElementById('notif');
  document.getElementById('notifText').textContent = msg;
  document.getElementById('notifIcon').textContent = icon;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// ═══════════════════════════════════════════════════════════════
// DRAG & DROP
// ═══════════════════════════════════════════════════════════════
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

function setStatus(msg, type = '') {
  document.getElementById('fileStatus').style.display = 'flex';
  document.getElementById('statusText').textContent = msg;
  document.getElementById('statusDot').className = 'status-dot ' + type;
}
function setProgress(pct) { document.getElementById('progressFill').style.width = pct + '%'; }

async function handleFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['txt', 'pdf', 'docx', 'pptx', 'csv', 'xlsx'].includes(ext)) { notify('Format non supporté', '❌', 4000); return; }
  setStatus('Lecture du fichier…', 'processing'); setProgress(10);
  try {
    if      (ext === 'txt')  rawText = await readTxt(file);
    else if (ext === 'pdf')  rawText = await readPdf(file);
    else if (ext === 'docx') rawText = await readDocx(file);
    else if (ext === 'pptx') rawText = await readPptx(file);
    else if (ext === 'csv')  rawText = await readCsv(file);
    else if (ext === 'xlsx') rawText = await readXlsx(file);
    setProgress(60); setStatus('Extraction des mots…', 'processing');
    processText(); setProgress(100);
    setStatus('✓ ' + file.name + ' · ' + words.length + ' mots · ' + vocab.length + ' mots uniques', '');
    document.getElementById('statusDot').style.background = 'var(--accent3)';
    showStats();
    document.getElementById('sectionAnalyse').classList.add('visible');
    setStep(2); matrixBuilt = false;
    notify('Document chargé : ' + vocab.length + ' mots uniques', '📄');
  } catch (err) {
    setStatus('Erreur : ' + err.message, 'error');
    notify('Erreur : ' + err.message, '❌', 6000);
    console.error(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// PARSEURS (bibliothèques externes uniquement)
// ═══════════════════════════════════════════════════════════════

function readTxt(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsText(file, 'UTF-8');
  });
}

async function readPdf(file) {
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js non chargé (connexion internet requise)');
  const ab = await file.arrayBuffer();
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(s => s.str).join(' ') + ' ';
    setProgress(10 + (i / pdf.numPages) * 45);
  }
  return text;
}

async function readDocx(file) {
  if (typeof mammoth === 'undefined') throw new Error('Mammoth.js non chargé (connexion internet requise)');
  const ab = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: ab });
  return result.value;
}

async function readPptx(file) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip non chargé (connexion internet requise)');
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);
  let text = '';
  const slideFiles = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  if (slideFiles.length === 0) throw new Error('Aucune slide trouvée dans ce fichier PPTX');
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('string');
    const matches = xml.match(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g) || [];
    text += matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ') + ' ';
    setProgress(10 + (i / slideFiles.length) * 45);
  }
  if (!text.trim()) throw new Error('Aucun texte trouvé dans ce PPTX');
  return text;
}

async function readCsv(file) {
  if (typeof XLSX === 'undefined') throw new Error('SheetJS non chargé (connexion internet requise)');
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  return data.flat().filter(v => typeof v === 'string' && v.trim()).join(' ');
}

async function readXlsx(file) {
  if (typeof XLSX === 'undefined') throw new Error('SheetJS non chargé (connexion internet requise)');
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  let text = '';
  wb.SheetNames.forEach(name => {
    const ws = wb.Sheets[name];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    text += data.flat().filter(v => typeof v === 'string' && v.trim()).join(' ') + ' ';
  });
  return text;
}

// ═══════════════════════════════════════════════════════════════
// TEXT PROCESSING
// ═══════════════════════════════════════════════════════════════
function processText() {
  const cleaned = rawText.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  words = cleaned.split(' ').filter(w => w.length > 1);
  wordCounts = {};
  words.forEach(w => wordCounts[w] = (wordCounts[w] || 0) + 1);
  vocab = Object.keys(wordCounts).sort();
  wordIndex = {};
  vocab.forEach((w, i) => wordIndex[w] = i);
  freqMatrix = null; normMatrix = null; matrixBuilt = false;
  ['btnShowMatrix', 'btnShowWords', 'btnShowTopWords', 'btnShowPareto'].forEach(id => document.getElementById(id).disabled = true);
  ['matrixSection', 'wordsSection', 'topWordsSection', 'paretoSection'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('sectionGenerate').classList.remove('visible');
}

// ═══════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════
function showStats() {
  const sentences = rawText.split(/[.!?]+/).filter(s => s.trim().length > 3).length;
  const avgLen = words.length ? (words.map(w => w.length).reduce((a, b) => a + b, 0) / words.length).toFixed(1) : 0;
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat"><div class="stat-value">${words.length.toLocaleString()}</div><div class="stat-label">Mots totaux</div></div>
    <div class="stat"><div class="stat-value">${vocab.length.toLocaleString()}</div><div class="stat-label">Mots uniques</div></div>
    <div class="stat"><div class="stat-value">${sentences.toLocaleString()}</div><div class="stat-label">Phrases ~</div></div>
    <div class="stat"><div class="stat-value">${avgLen}</div><div class="stat-label">Long. moy.</div></div>`;
}

// ═══════════════════════════════════════════════════════════════
// MATRIX CONSTRUCTION
// ═══════════════════════════════════════════════════════════════
document.getElementById('btnBuildMatrix').addEventListener('click', buildMatrix);

function buildMatrix() {
  const btn = document.getElementById('btnBuildMatrix');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Construction…';
  setTimeout(() => {
    const n = vocab.length;
    freqMatrix = Array.from({ length: n }, () => ({}));
    for (let k = 0; k < words.length - 1; k++) {
      const i = wordIndex[words[k]], j = wordIndex[words[k + 1]];
      if (i !== undefined && j !== undefined) freqMatrix[i][j] = (freqMatrix[i][j] || 0) + 1;
    }
    vocab.forEach((w, i) => { freqMatrix[i][i] = wordCounts[w]; });
    normMatrix = Array.from({ length: n }, () => ({}));
    for (let i = 0; i < n; i++) {
      let total = 0;
      for (const j in freqMatrix[i]) { if (parseInt(j) !== i) total += freqMatrix[i][j]; }
      for (const j in freqMatrix[i]) {
        const ji = parseInt(j);
        normMatrix[i][ji] = ji === i ? wordCounts[vocab[i]] : (total > 0 ? freqMatrix[i][j] / total : 0);
      }
    }
    matrixBuilt = true; btn.disabled = false; btn.innerHTML = 'Reconstruire la matrice';
    ['btnShowMatrix', 'btnShowWords', 'btnShowTopWords', 'btnShowPareto'].forEach(id => document.getElementById(id).disabled = false);
    document.getElementById('sectionGenerate').classList.add('visible');
    setStep(3);
    notify('Matrice construite ! Génération disponible.', '🎉', 4000);
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
// SECTION TOGGLES
// ═══════════════════════════════════════════════════════════════
function toggleSection(activeId) {
  const ids = ['matrixSection', 'wordsSection', 'topWordsSection', 'paretoSection'];
  const btns = { matrixSection: 'btnShowMatrix', wordsSection: 'btnShowWords', topWordsSection: 'btnShowTopWords', paretoSection: 'btnShowPareto' };
  ids.forEach(id => {
    const el = document.getElementById(id);
    const showing = el.style.display !== 'none';
    if (id === activeId) {
      el.style.display = showing ? 'none' : 'block';
      document.getElementById(btns[id]).className = showing ? 'btn btn-ghost' : 'btn btn-active';
    } else {
      el.style.display = 'none';
      document.getElementById(btns[id]).className = 'btn btn-ghost';
    }
  });
}

document.getElementById('btnShowMatrix').addEventListener('click', () => {
  toggleSection('matrixSection');
  if (document.getElementById('matrixSection').style.display !== 'none') renderMatrix();
});
document.getElementById('btnShowWords').addEventListener('click', () => {
  toggleSection('wordsSection');
  if (document.getElementById('wordsSection').style.display !== 'none') renderWordList(vocab);
});
document.getElementById('btnShowTopWords').addEventListener('click', () => {
  toggleSection('topWordsSection');
  if (document.getElementById('topWordsSection').style.display !== 'none') renderTopWords();
});
document.getElementById('btnShowPareto').addEventListener('click', () => {
  toggleSection('paretoSection');
  if (document.getElementById('paretoSection').style.display !== 'none') renderPareto();
});

// ═══════════════════════════════════════════════════════════════
// MATRIX RENDER
// ═══════════════════════════════════════════════════════════════
function getFilteredVocab() {
  const minLen = Math.max(1, parseInt(document.getElementById('fMinLen').value) || 1);
  const maxLen = Math.min(30, parseInt(document.getElementById('fMaxLen').value) || 20);
  const dim    = Math.min(30, Math.max(2, parseInt(document.getElementById('fDim').value) || 20));
  const sort   = document.getElementById('fSort').value;
  let filtered = vocab.filter(w => w.length >= minLen && w.length <= maxLen);
  if      (sort === 'freq')     filtered.sort((a, b) => wordCounts[b] - wordCounts[a]);
  else if (sort === 'alpha')    filtered.sort();
  else if (sort === 'len_asc')  filtered.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  else if (sort === 'len_desc') filtered.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  return { words: filtered.slice(0, dim), total: filtered.length, dim };
}

function renderMatrix() {
  const { words: display, total, dim } = getFilteredVocab();
  const showValues = document.getElementById('fValues').value;
  document.getElementById('matrixInfo').textContent =
    `Affichage : ${display.length} × ${display.length} mots sur ${total} correspondant aux filtres (dimension limitée à ${dim}).`;
  let html = '<table class="matrix-table"><thead><tr><th>↓ mot \\ suivant →</th>';
  display.forEach(w => html += `<th title="${w} (×${wordCounts[w]})">${w}</th>`);
  html += '</tr></thead><tbody>';
  display.forEach(rw => {
    const i = wordIndex[rw];
    html += `<tr><td title="${rw} (×${wordCounts[rw]})">${rw}</td>`;
    display.forEach(cw => {
      const j    = wordIndex[cw];
      const prob = normMatrix[i][j] || 0;
      const raw  = freqMatrix[i][j] || 0;
      let cls = '', disp = '·';
      if (i === j) { cls = 'cell-diag'; disp = wordCounts[rw]; }
      else if (prob > 0) {
        cls  = prob > 0.3 ? 'cell-high' : prob > 0.1 ? 'cell-med' : 'cell-low';
        disp = showValues === 'prob' ? prob.toFixed(3) : raw;
      }
      html += `<td class="${cls}" title="P(${cw}|${rw})=${prob.toFixed(4)}, n=${raw}">${disp}</td>`;
    });
    html += '</tr>';
  });
  document.getElementById('matrixContainer').innerHTML = html + '</tbody></table>';
}

// ═══════════════════════════════════════════════════════════════
// WORD LIST
// ═══════════════════════════════════════════════════════════════
document.getElementById('wordSearch').addEventListener('input', function () {
  renderWordList(vocab.filter(w => w.includes(this.value.toLowerCase())));
});

function renderWordList(list) {
  document.getElementById('wordList').innerHTML = list.map(w =>
    `<div class="word-chip" onclick="useWord('${w}')">${w} <span class="freq">×${wordCounts[w]}</span></div>`
  ).join('');
}

function renderTopWords() {
  const top = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 50);
  const max = top[0][1];
  document.getElementById('topWordsList').innerHTML = top.map(([w, c]) => `
    <div class="top-word-row">
      <div class="top-word-label" onclick="useWord('${w}')">${w}</div>
      <div class="top-word-bar-wrap"><div class="top-word-bar" style="width:${(c / max * 100).toFixed(1)}%"></div></div>
      <div class="top-word-count">${c}</div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════
// ANALYSE PARETO
// ═══════════════════════════════════════════════════════════════
function renderPareto() {
  const sorted   = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]);
  const totalOcc = sorted.reduce((s, [, c]) => s + c, 0);
  let cum = 0, idx80 = -1, idx50 = -1;
  const cumPct = sorted.map(([, c], i) => {
    cum += c;
    const pct = cum / totalOcc * 100;
    if (idx80 === -1 && pct >= 80) idx80 = i;
    if (idx50 === -1 && pct >= 50) idx50 = i;
    return pct;
  });
  const pct80Words    = idx80 + 1;
  const pct80WordsPct = (pct80Words / sorted.length * 100).toFixed(1);
  const pct50Words    = idx50 + 1;

  document.getElementById('paretoStats').innerHTML = `
    <div class="pareto-stat"><div class="pareto-stat-val v1">${pct80Words.toLocaleString()}</div><div class="pareto-stat-lbl">mots couvrent 80% des occurrences</div></div>
    <div class="pareto-stat"><div class="pareto-stat-val v2">${pct80WordsPct}%</div><div class="pareto-stat-lbl">du vocabulaire total</div></div>
    <div class="pareto-stat"><div class="pareto-stat-val v3">${pct50Words.toLocaleString()}</div><div class="pareto-stat-lbl">mots couvrent 50% des occurrences</div></div>
    <div class="pareto-stat"><div class="pareto-stat-val" style="color:var(--accent4)">${sorted[0][0]}</div><div class="pareto-stat-lbl">mot le plus fréquent (×${sorted[0][1]})</div></div>`;

  const canvas = document.getElementById('paretoCanvas');
  const wrap   = canvas.parentElement;
  canvas.width  = wrap.clientWidth || 900;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = { top: 24, right: 60, bottom: 50, left: 60 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top  - PAD.bottom;
  const maxDisplay = Math.min(sorted.length, 200);
  const maxCount   = sorted[0][1];

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(42,42,58,0.8)'; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = PAD.top + cH * (g / 4);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    ctx.fillStyle = '#666680'; ctx.font = `${Math.round(canvas.width * 0.011)}px JetBrains Mono,monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxCount * (1 - g / 4)), PAD.left - 6, y + 4);
    ctx.textAlign = 'left';
    ctx.fillText((100 - g * 25) + '%', PAD.left + cW + 6, y + 4);
  }

  const barW = Math.max(1, cW / maxDisplay - 0.5);
  for (let i = 0; i < maxDisplay; i++) {
    const c  = sorted[i][1];
    const bH = cH * (c / maxCount);
    const x  = PAD.left + i * (cW / maxDisplay);
    const y  = PAD.top + cH - bH;
    if (i < pct80Words) {
      const t = i / pct80Words;
      ctx.fillStyle = `rgba(${Math.round(124 + t * 131)},${Math.round(109 + t * 146)},255,0.7)`;
    } else {
      ctx.fillStyle = 'rgba(102,102,128,0.3)';
    }
    ctx.fillRect(x, y, Math.max(barW, 1), bH);
  }

  ctx.beginPath(); ctx.strokeStyle = 'rgba(109,255,204,0.9)'; ctx.lineWidth = 2;
  for (let i = 0; i < maxDisplay; i++) {
    const x = PAD.left + i * (cW / maxDisplay) + (barW / 2);
    const y = PAD.top  + cH * (1 - cumPct[i] / 100);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  const y80 = PAD.top + cH * 0.2;
  ctx.beginPath(); ctx.strokeStyle = 'rgba(255,109,155,0.7)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]); ctx.moveTo(PAD.left, y80); ctx.lineTo(PAD.left + cW, y80); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,109,155,0.8)'; ctx.font = `bold ${Math.round(canvas.width * 0.011)}px JetBrains Mono,monospace`;
  ctx.textAlign = 'left'; ctx.fillText('80%', PAD.left + cW + 6, y80 + 4);

  const x80 = PAD.left + idx80 * (cW / maxDisplay);
  ctx.beginPath(); ctx.strokeStyle = 'rgba(255,109,155,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.moveTo(x80, PAD.top); ctx.lineTo(x80, PAD.top + cH); ctx.stroke(); ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(42,42,58,1)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, PAD.top + cH); ctx.lineTo(PAD.left + cW, PAD.top + cH); ctx.stroke();
  ctx.fillStyle = '#666680'; ctx.font = `${Math.round(canvas.width * 0.012)}px JetBrains Mono,monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`Mots triés par fréquence décroissante (${maxDisplay} affichés sur ${sorted.length})`, PAD.left + cW / 2, H - 8);
}

// ═══════════════════════════════════════════════════════════════
// GENERATION
// ═══════════════════════════════════════════════════════════════
function useWord(w) {
  document.getElementById('seedWord').value = w;
  document.getElementById('sectionGenerate').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.getElementById('btnGenerate').addEventListener('click', generateText);
document.getElementById('seedWord').addEventListener('keydown', e => { if (e.key === 'Enter') generateText(); });

function generateText() {
  if (!matrixBuilt) { notify('Construisez d\'abord la matrice !', '⚠️'); return; }
  const seedRaw = document.getElementById('seedWord').value.trim().toLowerCase();
  let count = Math.max(1, Math.min(50, parseInt(document.getElementById('repeatCount').value) || 1));
  document.getElementById('repeatCount').value = count;
  if (!seedRaw) { notify('Entrez un mot de départ', '⚠️'); return; }
  const tokens = [], seed = seedRaw.split(/\s+/).pop();
  if (wordIndex[seed] === undefined) {
    tokens.push({ word: seed, type: 'error' });
    document.getElementById('resultBox').innerHTML = renderTokens(tokens) + '<br><span style="color:var(--accent2);font-size:.82rem">Ce mot n\'est pas dans le vocabulaire du document.</span>';
    return;
  }
  tokens.push({ word: seed, type: 'seed' });
  let current = seed;
  for (let k = 0; k < count; k++) {
    const next = predictNext(current);
    if (!next) { tokens.push({ word: '[fin de chaîne]', type: 'error' }); break; }
    tokens.push({ word: next, type: 'gen' }); current = next;
  }
  document.getElementById('resultBox').innerHTML = renderTokens(tokens);
}

function predictNext(word) {
  const i = wordIndex[word]; if (i === undefined) return null;
  const row = normMatrix[i]; let best = null, bestProb = -1;
  for (const j in row) { const ji = parseInt(j); if (ji === i) continue; if (row[ji] > bestProb) { bestProb = row[ji]; best = vocab[ji]; } }
  return best;
}

function renderTokens(tokens) {
  return tokens.map(t => `<span class="result-token token-${t.type}">${t.word}</span>`).join(' ');
}

// ═══════════════════════════════════════════════════════════════
// STEPS
// ═══════════════════════════════════════════════════════════════
function setStep(n) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('step' + i);
    el.className = 'step';
    if (i < n) el.classList.add('done');
    else if (i === n) el.classList.add('active');
  }
}

window.addEventListener('resize', () => {
  if (document.getElementById('paretoSection').style.display !== 'none') renderPareto();
});
