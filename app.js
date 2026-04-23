"use strict";

/* ════════════════════════════════════════════════════════════
   INDICE DELLE SEZIONI
   ────────────────────────────────────────────────────────────
   1. UTILITIES         — helper generici (autoResize, clamp, path)
   2. MARKDOWN          — parser e toolbar per le textarea
   3. TIRO DADI         — overlay animato SVG per i tiri
   4. STATO APP         — costanti, defaultChar, chars, activeIdx
   5. SAVE / LOAD       — persistenza su localStorage
   6. UI HELPERS        — toast, confirm, modal, indicatore salvataggio
   7. RENDER            — funzioni che generano il DOM dallo stato
   8. BIND              — event listener globali (input, shortcut, ecc.)
   9. AZIONI UTENTE     — pozioni, legami, orologi, tema, import/export
   10. INIT             — avvio dell'applicazione
   ════════════════════════════════════════════════════════════ */

// ─── 1. UTILITIES ───────────────────────────────────────────
// Adatta l'altezza di una textarea al suo contenuto
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// Collega un pulsante all'azione "elimina con pressione prolungata".
// Supporta mouse e touch. Durata di default: 1500ms.
// - btn: il pulsante DOM
// - onConfirm: callback eseguita al completamento della pressione
// - ms: durata della pressione richiesta (opzionale, default 1500)
function bindHoldToDelete(btn, onConfirm, ms = 1500) {
  let timer = null;
  const start = () => { timer = setTimeout(onConfirm, ms); };
  const cancel = () => { clearTimeout(timer); };
  btn.addEventListener('mousedown',  start);
  btn.addEventListener('mouseup',    cancel);
  btn.addEventListener('mouseleave', cancel);
  btn.addEventListener('touchstart', e => { e.preventDefault(); start(); });
  btn.addEventListener('touchend',   cancel);
  btn.addEventListener('touchcancel', cancel);
}

/* ════════════════════════════════════════════════════════════
   2. MARKDOWN — parser minimale e toolbar per le textarea
   ════════════════════════════════════════════════════════════ */

// Converte una stringa Markdown semplice in HTML sicuro.
// Supporta: ### titolo, **grassetto**, *corsivo*, `code`, ---, liste
function parseMarkdown(text) {
  if (!text) return '';
  let html = text
    // Escape dei caratteri HTML pericolosi
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Titoli (### > ## > #)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    // Grassetto e corsivo (triplo > doppio > singolo)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>')
    // Codice inline
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Separatore orizzontale
    .replace(/^---$/gm, '<hr>')
    // Liste puntate e numerate (trasformate in <li>, wrappate in <ul> dopo)
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragrafi (doppio newline) e interruzioni di riga
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Raggruppa <li> consecutivi in un unico <ul>
  html = html.replace(/(<li>.*?<\/li>(\s*<br>)*)+/g, m => `<ul>${m.replace(/<br>/g,'')}</ul>`);
  return `<p>${html}</p>`;
}

// Inserisce sintassi markdown attorno alla selezione corrente della textarea
function mdInsert(ta, action) {
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.slice(start, end);
  let before = '', after = '', insert = sel;

  if (action === 'bold')   { before = '**'; after = '**'; insert = sel || 'testo'; }
  if (action === 'italic') { before = '*';  after = '*';  insert = sel || 'testo'; }
  if (action === 'h3')     { before = '### '; after = ''; insert = sel || 'Titolo'; }
  if (action === 'ul')     { before = '- ';  after = ''; insert = sel || 'elemento'; }
  if (action === 'hr')     { before = '\n---\n'; after = ''; insert = ''; }

  const newVal = ta.value.slice(0, start) + before + insert + after + ta.value.slice(end);
  ta.value = newVal;
  ta.selectionStart = start + before.length;
  ta.selectionEnd   = start + before.length + insert.length;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
}

// Inizializza un wrapper markdown: costruisce la toolbar, collega
// i pulsanti di formattazione e il toggle anteprima/modifica
function initMdWrap(wrap) {
  const ta      = wrap.querySelector('textarea');
  const preview = wrap.querySelector('.md-preview');
  const toolbar = wrap.querySelector('.md-toolbar');
  if (!ta || !preview || !toolbar) return;

  // Costruisce la toolbar: pulsanti allineati a destra, 👁 separato
  toolbar.innerHTML = `
    <div class="md-toolbar-right" style="margin-left:auto; display:flex; align-items:center; gap:14px;">
      <button class="md-tool-btn" data-action="bold"   title="Grassetto"><b>B</b></button>
      <button class="md-tool-btn" data-action="italic" title="Corsivo"><i>I</i></button>
      <button class="md-tool-btn" data-action="h3"     title="Titolo">H</button>
      <button class="md-tool-btn" data-action="ul"     title="Lista">•</button>
      <button class="md-tool-btn" data-action="hr"     title="Separatore">—</button>
      <button class="md-tool-btn md-preview-btn" title="Anteprima / Modifica" style="font-size:20px; padding:6px 14px; margin-left:18px;">👁</button>
    </div>
  `;

  const prevBtn    = toolbar.querySelector('.md-preview-btn');
  const actionBtns = toolbar.querySelectorAll('.md-tool-btn[data-action]');
  let isPreviewing = false;

  // Alterna fra modalità modifica e modalità anteprima markdown
  function setPreviewMode(on) {
    isPreviewing = on;
    if (on) {
      preview.innerHTML = parseMarkdown(ta.value);
      preview.style.minHeight = ta.offsetHeight + 'px';
      preview.classList.add('visible');
      ta.style.display = 'none';
      prevBtn.classList.add('active');
      // In anteprima i pulsanti di formattazione sono disattivati
      actionBtns.forEach(b => { b.disabled = true; b.style.opacity = '0.3'; b.style.pointerEvents = 'none'; });
    } else {
      preview.classList.remove('visible');
      ta.style.display = '';
      prevBtn.classList.remove('active');
      actionBtns.forEach(b => { b.disabled = false; b.style.opacity = ''; b.style.pointerEvents = ''; });
    }
  }

  // Click sui pulsanti di formattazione: inserisce sintassi md
  actionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isPreviewing) return;
      mdInsert(ta, btn.getAttribute('data-action'));
    });
  });

  // Toggle anteprima e aggiornamento live mentre si scrive
  prevBtn.addEventListener('click', () => setPreviewMode(!isPreviewing));
  ta.addEventListener('input', () => {
    if (isPreviewing) preview.innerHTML = parseMarkdown(ta.value);
  });
}

// Inizializza tutti i wrapper markdown presenti nel DOM,
// marcandoli per evitare doppia inizializzazione
function initAllMdWraps() {
  document.querySelectorAll('.md-wrap').forEach(wrap => {
    if (!wrap.dataset.mdInit) {
      wrap.dataset.mdInit = '1';
      initMdWrap(wrap);
    }
  });
}

/* ════════════════════════════════════════════════════════════
   3. TIRO DADI — overlay animato per i tiri dei dadi
   Ogni forma (d6…d20) ha uno SVG dedicato con colore e bagliore.
   ════════════════════════════════════════════════════════════ */
const DIE_SHAPES = {
  d6: {
    glow: 'rgba(76,173,110,0.7)', color: '#4cad6e',
    svg: `<rect x="10" y="10" width="100" height="100" rx="18" fill="rgba(76,173,110,0.15)" stroke="#4cad6e" stroke-width="5"/>
          <circle cx="35" cy="35" r="7" fill="#4cad6e" opacity=".8"/>
          <circle cx="85" cy="35" r="7" fill="#4cad6e" opacity=".8"/>
          <circle cx="35" cy="60" r="7" fill="#4cad6e" opacity=".8"/>
          <circle cx="85" cy="60" r="7" fill="#4cad6e" opacity=".8"/>
          <circle cx="35" cy="85" r="7" fill="#4cad6e" opacity=".8"/>
          <circle cx="85" cy="85" r="7" fill="#4cad6e" opacity=".8"/>`, vb:'0 0 120 120'
  },
  d8: {
    glow: 'rgba(201,168,76,0.7)', color: '#c9a84c',
    svg: `<polygon points="60,5 115,45 115,95 60,115 5,95 5,45" fill="rgba(201,168,76,0.12)" stroke="#c9a84c" stroke-width="5" stroke-linejoin="round"/>`, vb:'0 0 120 120'
  },
  d10: {
    glow: 'rgba(76,122,201,0.7)', color: '#4c7ac9',
    svg: `<polygon points="60,4 112,30 116,85 60,116 4,85 8,30" fill="rgba(76,122,201,0.12)" stroke="#4c7ac9" stroke-width="5" stroke-linejoin="round"/>`, vb:'0 0 120 120'
  },
  d12: {
    glow: 'rgba(201,76,76,0.7)', color: '#c94c4c',
    svg: `<polygon points="60,4 104,20 116,65 96,108 24,108 4,65 16,20" fill="rgba(201,76,76,0.12)" stroke="#c94c4c" stroke-width="5" stroke-linejoin="round"/>`, vb:'0 0 120 120'
  },
  d20: {
    glow: 'rgba(124,111,201,0.7)', color: '#7c6fc9',
    svg: `<polygon points="60,4 114,35 114,85 60,116 6,85 6,35" fill="rgba(124,111,201,0.12)" stroke="#7c6fc9" stroke-width="5" stroke-linejoin="round"/>
          <polygon points="60,28 90,44 90,76 60,92 30,76 30,44" fill="none" stroke="rgba(124,111,201,0.4)" stroke-width="2"/>`, vb:'0 0 120 120'
  }
};

// Esegue il tiro di un dado e mostra un overlay animato.
// - dieStr: 'd6' | 'd8' | 'd10' | 'd12' | 'd20'
// - attrLabel: nome dell'attributo (es. "Destrezza")
// - attrColor: colore da applicare al dado (opzionale)
function rollDie(dieStr, attrLabel, attrColor) {
  const sides  = parseInt(dieStr.slice(1));
  const result = Math.floor(Math.random() * sides) + 1;
  const isCrit   = result === sides;   // Massimo del dado
  const isFumble = result === 1;       // Minimo del dado
  const shape = DIE_SHAPES[dieStr] || DIE_SHAPES['d8'];

  // Colore del dado: preferisce quello dell'attributo, altrimenti il default
  const col = attrColor || shape.color;
  // Verde per critico, rosso per fumble, bianco per risultato normale
  const resultColor = isCrit ? '#4cad6e' : isFumble ? '#c94c4c' : '#fff';

  // Rigenera l'SVG sostituendo il colore di default con quello scelto
  const coloredSvg = shape.svg.replace(new RegExp(shape.color.replace('#','\\#'), 'g'), col);

  // Crea l'overlay a schermo intero con il dado animato
  const overlay = document.createElement('div');
  overlay.className = 'dice-overlay';
  overlay.innerHTML = `
    <div class="dice-stage">
      <div class="dice-svg-wrap" style="filter: drop-shadow(0 0 28px ${col}aa);">
        <svg viewBox="${shape.vb}" xmlns="http://www.w3.org/2000/svg">${coloredSvg}</svg>
        <div class="dice-result-num" style="color:${resultColor};">${result}</div>
      </div>
      <div class="dice-label"><em>${attrLabel}</em> — ${dieStr}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Dopo 2.2s chiude l'overlay e mostra il toast riepilogativo
  setTimeout(() => {
    overlay.classList.add('out');
    overlay.querySelector('.dice-stage').classList.add('out');
    setTimeout(() => overlay.remove(), 400);

    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = 'toast toast--roll' + (isCrit ? ' toast--crit' : isFumble ? ' toast--fumble' : '');
    t.innerHTML = `
      <span class="roll-attr">${attrLabel}</span>
      <span class="roll-die">${dieStr}</span>
      <span class="roll-result" style="color:${resultColor};">${result}</span>
    `;
    c.appendChild(t);
    setTimeout(() => t.remove(), 7000);
  }, 2200);
}

/* ════════════════════════════════════════════════════════════
   4. STATO APP — costanti, stato predefinito, variabili globali
   ════════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'fabula_ultima_v2';
// Taglie di dado supportate, ordinate dalla più alta alla più bassa
const DICE = ['d20','d12','d10','d8','d6'];

// Status alterati: ogni status "affects" alcune caratteristiche
// causando un downgrade del dado (major conta doppio)
const STATUS_LIST = [
  { key:'slow',      label:'Lento',      major:false, affects:'dex' },
  { key:'dazed',     label:'Confuso',    major:false, affects:'ins' },
  { key:'weak',      label:'Debole',     major:false, affects:'mig' },
  { key:'shaken',    label:'Scosso',     major:false, affects:'wlp' },
  { key:'poisoned',  label:'Avvelenato', major:true,  affects:'mig,wlp' },
  { key:'enraged',   label:'Furente',    major:true,  affects:'dex,ins' },
];

// Mapping chiave → etichetta e colore tema per gli attributi
const ATTR_CONFIG = [
  { key:'dex', label:'Destrezza', color:'#4cad6e' },
  { key:'ins', label:'Intuito',   color:'#4c7ac9' },
  { key:'mig', label:'Vigore',    color:'#c94c4c' },
  { key:'wlp', label:'Volontà',   color:'#7c6fc9' },
];

// Oggetto legame vuoto (sentimenti tutti falsi)
function defaultBond() {
  return { name:'', admiration:false, loyalty:false, affection:false,
           inferiority:false, mistrust:false, hatred:false };
}

// Personaggio predefinito — usato per creazione e normalizzazione dati legacy
function defaultChar() {
  return {
    name:'', portraitUrl:'', level:5,
    identity:'', theme:'', origin:'',
    fabulaPoints: 3,
    attributes: {
      dex:{ base:'d8' }, ins:{ base:'d8' },
      mig:{ base:'d8' }, wlp:{ base:'d8' },
    },
    status: { slow:false, dazed:false, weak:false, shaken:false, poisoned:false, enraged:false },
    points: {
      hp:{ max:40, current:40 },
      mp:{ max:40, current:40 },
      ip:{ max:6,  current:6  },
    },
    initiative:0, defense:8, magicDefense:8,
    equipment: {
      mainHand:  { item:'', desc:'' },
      offHand:   { item:'', desc:'' },
      armor:     { item:'', desc:'' },
      accessory: { item:'', desc:'' },
      extra:     { item:'', desc:'' },
    },
    backpackNotes:'', campaignNotes:'', zenit:0,
    classes:[
      { classLevel:'', freeBenefits:'', skills:'' },
      { classLevel:'', freeBenefits:'', skills:'' },
      { classLevel:'', freeBenefits:'', skills:'' },
    ],
    bonds: Array.from({length:4}, defaultBond),
    clocks: [],
  };
}

// Variabili globali dell'applicazione
let chars     = [];    // Array di tutti i personaggi salvati
let activeIdx = 0;     // Indice del personaggio attualmente visualizzato
let saveTimer = null;  // Timer per il salvataggio debounced
let isDark    = true;  // Stato del tema (true = scuro)

// Shortcut per accedere al personaggio attivo
function state() { return chars[activeIdx]; }

/* ════════════════════════════════════════════════════════════
   UTILITIES — helper puri su valori e oggetti
   ════════════════════════════════════════════════════════════ */

// Limita un numero tra min e max
function clamp(n, mn, mx) { return Math.max(mn, Math.min(mx, n)); }

// Accesso annidato tramite stringa "a.b.c"
function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}
// Assegnazione annidata tramite stringa "a.b.c" (crea gli oggetti mancanti)
function setByPath(obj, path, val) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in cur)) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length-1]] = val;
}

// Fonde due oggetti ricorsivamente (inc sovrascrive base).
// Usato per integrare i dati salvati con i default del personaggio
// quando si aggiungono nuovi campi allo schema.
function deepMerge(base, inc) {
  if (typeof base !== 'object' || base === null) return inc ?? base;
  if (Array.isArray(base)) {
    const arr = Array.isArray(inc) ? inc : [];
    const len = Math.max(base.length, arr.length);
    const out = [];
    for (let i = 0; i < len; i++) {
      if (i < base.length && i < arr.length) out.push(deepMerge(base[i], arr[i]));
      else out.push(i < arr.length ? arr[i] : base[i]);
    }
    return out;
  }
  const out = { ...base };
  if (typeof inc !== 'object' || inc === null) return out;
  for (const k of Object.keys(inc)) {
    out[k] = k in out ? deepMerge(out[k], inc[k]) : inc[k];
  }
  return out;
}

// Helper sui dadi
function normDie(v) { return DICE.includes(v) ? v : 'd8'; }  // Normalizza un valore a un dado valido
function dieVal(d) { return parseInt(d.slice(1)); }           // Estrae il numero di facce da 'd8'

// Abbassa la taglia del dado di N passi (d12 → d10 → d8 → ...), min d6
function downgradeDie(die, steps) {
  let idx = DICE.indexOf(normDie(die));
  for (let i = 0; i < steps; i++) idx = Math.min(idx + 1, DICE.length - 1);
  return DICE[idx];
}

/* ════════════════════════════════════════════════════════════
   ATTRIBUTI CALCOLATI — applica gli status per ottenere i dadi
   "attuali" (un downgrade per status che influisce sull'attributo).
   ════════════════════════════════════════════════════════════ */
function computeCurrents() {
  const s = state();
  const st = s.status;
  // Conta quanti status influenzano ciascun attributo
  const affected = {
    dex: (st.slow ? 1:0) + (st.enraged ? 1:0),
    ins: (st.dazed ? 1:0) + (st.enraged ? 1:0),
    mig: (st.weak ? 1:0) + (st.poisoned ? 1:0),
    wlp: (st.shaken ? 1:0) + (st.poisoned ? 1:0),
  };
  const currents = {};
  for (const k of Object.keys(s.attributes)) {
    currents[k] = downgradeDie(s.attributes[k].base, affected[k] || 0);
  }
  return currents;
}

/* ════════════════════════════════════════════════════════════
   5. SAVE / LOAD — persistenza su localStorage
   Salvataggio con debounce per non scrivere a ogni keystroke.
   ════════════════════════════════════════════════════════════ */

// Accoda un salvataggio: attende 300ms prima di scrivere davvero
function queueSave() {
  setIndicator('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLocal, 300);
}

// Scrive tutti i personaggi e le preferenze su localStorage
function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ chars, activeIdx, isDark }));
  setIndicator('saved');
  setTimeout(() => setIndicator('idle'), 2000);
}

// Migra i dati dal formato vecchio (equipment come stringa piatta)
// al formato attuale ({ item, desc }). Chiamata dopo deepMerge al load.
function normalizeChar(c) {
  const slots = ['mainHand','offHand','armor','accessory','extra'];
  slots.forEach(slot => {
    if (typeof c.equipment[slot] === 'string') {
      c.equipment[slot] = { item: c.equipment[slot], desc: '' };
    }
    if (!c.equipment[slot] || typeof c.equipment[slot] !== 'object') {
      c.equipment[slot] = { item:'', desc:'' };
    }
  });
  return c;
}

// Carica i dati da localStorage. Restituisce true se riuscito.
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.chars && Array.isArray(data.chars)) {
      // Formato corrente: array di personaggi
      chars = data.chars.map(c => normalizeChar(deepMerge(defaultChar(), c)));
      activeIdx = clamp(data.activeIdx || 0, 0, chars.length - 1);
      isDark = data.isDark !== undefined ? data.isDark : true;
    } else {
      // Formato legacy: un solo personaggio come oggetto
      chars = [normalizeChar(deepMerge(defaultChar(), data))];
      activeIdx = 0;
    }
    return true;
  } catch { return false; }
}

// Aggiorna l'indicatore di stato in alto (Pronto / Salvo… / ✓ Salvato)
function setIndicator(mode) {
  const el = document.getElementById('saveIndicator');
  el.className = 'save-indicator ' + mode;
  el.textContent = mode === 'saving' ? 'Salvo…' : mode === 'saved' ? '✓ Salvato' : 'Pronto';
}

/* ════════════════════════════════════════════════════════════
   6. UI HELPERS — toast temporanei e dialog di conferma
   ════════════════════════════════════════════════════════════ */

// Mostra un messaggio in basso a destra per ~3 secondi.
// type può essere 'success', 'error' o vuoto (neutro)
function toast(msg, type = '') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// Mostra un dialog di conferma modale. Ritorna Promise<boolean>.
function confirm(title, msg) {
  return new Promise(resolve => {
    const ov = document.getElementById('confirmOverlay');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    ov.classList.add('open');
    const yes = document.getElementById('confirmYes');
    const no  = document.getElementById('confirmNo');
    const cleanup = (result) => {
      ov.classList.remove('open');
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
      resolve(result);
    };
    const onYes = () => cleanup(true);
    const onNo  = () => cleanup(false);
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
  });
}

/* ════════════════════════════════════════════════════════════
   7. RENDER — funzioni che generano il DOM dallo stato
   Ogni renderXxx() legge lo stato corrente e ricostruisce
   la porzione di UI di sua competenza.
   ════════════════════════════════════════════════════════════ */

// Mostra il ritratto del personaggio (da URL o placeholder)
function renderPortrait() {
  const img = document.getElementById('portraitImg');
  const url = (state().portraitUrl || '').trim();
  if (url) {
    img.src = url;
    img.classList.add('loaded');
  } else {
    img.src = '';
    img.classList.remove('loaded');
  }
}

// Disegna le "pilloline" dei Punti Fabula (click per rimuoverne una)
function renderFabulaPills() {
  const s = state();
  const container = document.getElementById('fabulaPills');
  container.innerHTML = '';
  for (let i = 0; i < s.fabulaPoints; i++) {
    const pill = document.createElement('div');
    pill.className = 'fp-pill active';
    pill.title = 'Clicca per rimuovere';
    pill.addEventListener('click', () => {
      s.fabulaPoints = Math.max(0, s.fabulaPoints - 1);
      renderFabulaPills();
      queueSave();
    });
    container.appendChild(pill);
  }
}

// Listener per il "+" accanto ai Punti Fabula
document.getElementById('btnAddFP').addEventListener('click', () => {
  state().fabulaPoints = (state().fabulaPoints || 0) + 1;
  renderFabulaPills();
  queueSave();
});

// Disegna le 4 card degli attributi (Destrezza, Intuito, Vigore, Volontà).
// Mostra il dado base e, se un malus è attivo, il dado attuale ridotto
// con un'evidenziazione arancione. Doppio click per tirare.
function renderAttributes() {
  const grid = document.getElementById('attrGrid');
  grid.innerHTML = '';
  const currents = computeCurrents();
  const s = state();

  ATTR_CONFIG.forEach(({ key, label, color }) => {
    const base = normDie(s.attributes[key]?.base || 'd8');
    const cur  = currents[key];
    const modified = base !== cur;

    const box = document.createElement('div');
    box.className = 'attr-box' + (modified ? ' has-malus' : '');
    box.setAttribute('data-attr', key);

    // Con malus attivo il dado diventa arancione (indica il downgrade)
    const dieColor = modified ? '#e08030' : color;

    box.innerHTML = `
      <div class="attr-name">${label}</div>
      <div class="attr-die-row">
        <div class="attr-die">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="24,4 44,14 44,34 24,44 4,34 4,14"
              fill="${modified ? 'rgba(224,128,48,0.15)' : (isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)')}"
              stroke="${dieColor}" stroke-width="${modified?2:1.5}" opacity="${modified?1:0.6}"/>
          </svg>
          <div class="attr-die-val" style="color:${modified?'#f0c060':''};">${base}</div>
        </div>
        <select class="attr-die-select" data-attr-key="${key}">
          ${DICE.map(d => `<option value="${d}"${d===base?' selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="attr-current${modified?' modified':''}">
        ${modified ? `▼ ${cur}` : ''}
      </div>
    `;

    const sel = box.querySelector('select');
    sel.addEventListener('change', () => {
      s.attributes[key].base = sel.value;
      renderAttributes();
      queueSave();
    });

    // Doppio click / doppio tap sul rombo = tiro dado
    const die = box.querySelector('.attr-die');
    die.style.cursor = 'pointer';
    die.title = `Doppio click per tirare ${cur}`;
    die.addEventListener('dblclick', () => rollDie(cur, label, dieColor));
    // Touch: doppio tap
    let lastTap = 0;
    die.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTap < 300) { e.preventDefault(); rollDie(cur, label, dieColor); }
      lastTap = now;
    });

    grid.appendChild(box);
  });
}

// Disegna i badge degli status alterati (lento, confuso, ecc.)
// Al toggle ricalcola gli attributi attuali (potrebbero essere modificati)
function renderStatus() {
  const row = document.getElementById('statusRow');
  row.innerHTML = '';
  const s = state();

  STATUS_LIST.forEach(({ key, label, major }) => {
    const badge = document.createElement('label');
    badge.className = `status-badge${major?' major':''}${s.status[key]?' active':''}`;
    badge.innerHTML = `<input type="checkbox" data-status="${key}" ${s.status[key]?'checked':''} />${label}`;
    const cb = badge.querySelector('input');
    cb.addEventListener('change', () => {
      s.status[key] = cb.checked;
      badge.classList.toggle('active', cb.checked);
      renderAttributes(); // Ricalcola i dadi attuali in base al nuovo status
      queueSave();
    });
    row.appendChild(badge);
  });
}

// Aggiorna una barra risorsa (HP o MP): larghezza riempimento, testo e slider
function renderBar(which) {
  const s = state();
  const pt = s.points[which];
  const max = pt.max || 0;
  const cur = clamp(pt.current || 0, 0, max);
  pt.current = cur;

  const fill   = document.getElementById(`${which}Fill`);
  const val    = document.getElementById(`${which}Value`);
  const slider = document.getElementById(`${which}Slider`);

  const pct = max > 0 ? (cur / max * 100).toFixed(1) : '0';
  fill.style.width = pct + '%';
  val.textContent = `${cur} / ${max}`;
  slider.max   = max;
  slider.value = cur;
}

// Aggiorna tutte le barre insieme
function renderAllBars() {
  renderBar('hp');
  renderBar('mp');
}

/* ════════════════════════════════════════════════════════════
   LEGAMI — ogni legame può contenere fino a 3 sentimenti (da 3
   coppie opposte). La "forza" è il numero di sentimenti attivi.
   ════════════════════════════════════════════════════════════ */

// Etichette dei 6 sentimenti possibili
const FEELINGS = [
  { key:'admiration', label:'Ammirazione' },
  { key:'loyalty',    label:'Lealtà' },
  { key:'affection',  label:'Affetto' },
  { key:'inferiority',label:'Inferiorità' },
  { key:'mistrust',   label:'Sfiducia' },
  { key:'hatred',     label:'Odio' },
];

function bondStrength(bond) {
  return ['admiration','loyalty','affection','inferiority','mistrust','hatred']
    .filter(k => bond[k]).length;
}

function renderBonds() {
  const container = document.getElementById('bondsList');
  container.innerHTML = '';
  const s = state();

  s.bonds.forEach((bond, i) => {
    const card = document.createElement('div');
    card.className = 'bond-card';

    const strength = bondStrength(bond);
    card.innerHTML = `
      ${strength > 0 ? `<div class="bond-strength">Forza ${strength}</div>` : ''}
      <div class="bond-header">
        <textarea class="bond-name-input" placeholder="Nome / descrizione…" rows="1">${bond.name||''}</textarea>
        <button class="bond-delete" data-bond-idx="${i}" title="Rimuovi (tieni premuto)">🗑</button>
      </div>
      <div class="bond-feelings">
        ${FEELINGS.map(f => `
          <label class="bond-feeling${bond[f.key]?' checked':''}">
            <input type="checkbox" data-bond="${i}" data-feeling="${f.key}" ${bond[f.key]?'checked':''} />
            ${f.label}
          </label>
        `).join('')}
      </div>
    `;

    // Nome/descrizione del legame (textarea con auto-resize)
    const nameEl = card.querySelector('.bond-name-input');
    nameEl.addEventListener('input', e => {
      s.bonds[i].name = e.target.value;
      autoResize(nameEl);
      queueSave();
    });
    requestAnimationFrame(() => autoResize(nameEl));

    // Checkbox dei sentimenti: aggiornano lo stato e il badge "Forza"
    card.querySelectorAll('[data-feeling]').forEach(cb => {
      cb.addEventListener('change', () => {
        const feeling = cb.getAttribute('data-feeling');
        s.bonds[i][feeling] = cb.checked;
        cb.closest('.bond-feeling').classList.toggle('checked', cb.checked);
        // Ricalcola la forza e aggiorna l'etichetta
        const str = bondStrength(s.bonds[i]);
        let strEl = card.querySelector('.bond-strength');
        if (str > 0) {
          if (!strEl) { strEl = document.createElement('div'); strEl.className = 'bond-strength'; card.insertBefore(strEl, card.firstChild); }
          strEl.textContent = `Forza ${str}`;
        } else if (strEl) strEl.remove();
        queueSave();
      });
    });

    // Eliminazione: richiede pressione prolungata (1.5s) per evitare errori
    const delBtn = card.querySelector('.bond-delete');
    bindHoldToDelete(delBtn, async () => {
      if (s.bonds.length <= 1) { toast('Non puoi eliminare l\'unico legame', 'error'); return; }
      s.bonds.splice(i, 1);
      renderBonds();
      queueSave();
    });

    container.appendChild(card);
  });
}

/* ════════════════════════════════════════════════════════════
   CLASSI — un personaggio ha da 3 (fisse) fino a 5 classi.
   Le prime 3 non sono eliminabili (regola del gioco base).
   ════════════════════════════════════════════════════════════ */
function renderClasses() {
  const container = document.getElementById('classesList');
  container.innerHTML = '';
  const s = state();

  s.classes.forEach((cls, i) => {
    const block = document.createElement('div');
    block.className = 'class-block';
    block.innerHTML = `
      ${i > 0 ? '<div class="section-divider" style="margin-bottom:12px;"></div>' : ''}
      <div class="class-header">
        <div>
          <div class="field-label">Classe / Livello</div>
          <input class="field-input" type="text" value="${cls.classLevel||''}" placeholder="Es. Maestro d'Armi 3" />
        </div>
        <div style="display:flex;gap:6px;align-items:flex-end;">
          <div style="flex:1;">
            <div class="field-label">Benefici Gratuiti</div>
            <input class="field-input" type="text" value="${cls.freeBenefits||''}" placeholder="Es. +5 PV" />
          </div>
          ${i >= 3 ? `<button class="class-del-btn" data-cls-idx="${i}" title="Rimuovi (tieni premuto)">🗑</button>` : ''}
        </div>
      </div>
      <div class="class-skills-label">Abilità e Note</div>
      <div class="md-wrap">
        <div class="md-toolbar"></div>
        <textarea class="class-textarea" placeholder="Abilità scelte, effetti, note…">${cls.skills||''}</textarea>
        <div class="md-preview"></div>
      </div>
    `;

    // Binding dei tre campi della classe
    const [clsInput, fbInput] = block.querySelectorAll('input');
    const ta = block.querySelector('textarea');

    clsInput.addEventListener('input', () => { s.classes[i].classLevel = clsInput.value; queueSave(); });
    fbInput.addEventListener('input',  () => { s.classes[i].freeBenefits = fbInput.value; queueSave(); });
    ta.addEventListener('input', () => { s.classes[i].skills = ta.value; autoResize(ta); queueSave(); });
    // Altezza iniziale della textarea in base al contenuto già salvato
    requestAnimationFrame(() => autoResize(ta));

    // Eliminazione a pressione prolungata (solo classi opzionali dalla 4ª in poi)
    const delBtn = block.querySelector('.class-del-btn');
    if (delBtn) {
      bindHoldToDelete(delBtn, () => {
        s.classes.splice(i, 1);
        renderClasses();
        queueSave();
      });
    }

    container.appendChild(block);
  });

  // Pulsante "+ Aggiungi Classe" (max 5 classi per personaggio)
  if (s.classes.length < 5) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.style.cssText = 'width:100%;margin-top:8px;justify-content:center;';
    addBtn.textContent = '+ Aggiungi Classe';
    addBtn.addEventListener('click', () => {
      s.classes.push({ classLevel:'', freeBenefits:'', skills:'' });
      renderClasses();
      queueSave();
    });
    container.appendChild(addBtn);
  }

  // Init markdown in newly created wraps
  requestAnimationFrame(initAllMdWraps);
}

/* ════════════════════════════════════════════════════════════
   OROLOGI — segnatempo per obiettivi e pericoli.
   Ogni orologio ha N settori riempibili (4, 6, 8, 10 o 12).
   Click sul settore per riempirlo/svuotarlo.
   ════════════════════════════════════════════════════════════ */
function defaultClock() {
  return { name:'', size:6, filled:0, desc:'' };
}

// Genera l'SVG di un orologio con N sezioni, colorate se riempite
function drawClockSVG(size, filled, color) {
  const R = 54, cx = 60, cy = 60;
  const gap = 0.04; // spaziatura in radianti tra i settori
  let paths = '';
  for (let i = 0; i < size; i++) {
    // Calcola gli angoli di inizio e fine del settore
    const startAngle = (i / size) * Math.PI * 2 - Math.PI / 2 + gap / 2;
    const endAngle   = ((i + 1) / size) * Math.PI * 2 - Math.PI / 2 - gap / 2;
    const x1 = cx + R * Math.cos(startAngle);
    const y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle);
    const y2 = cy + R * Math.sin(endAngle);
    const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
    const isFilled = i < filled;
    paths += `<path d="M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${largeArc},1 ${x2},${y2} Z"
      fill="${isFilled ? color : 'rgba(255,255,255,0.04)'}"
      stroke="var(--bg-card)" stroke-width="2"
      style="transition: fill 0.2s ease; cursor:pointer;"
      data-sector="${i}" class="clock-sector" />`;
  }
  // Cerchio di contorno
  paths += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${color}" stroke-width="2" opacity="0.4"/>`;
  return `<svg viewBox="0 0 120 120" width="110" height="110" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}

// Palette ciclica: ogni orologio usa un colore diverso in ordine
const CLOCK_COLORS = ['#c9a84c','#c94c4c','#4c7ac9','#4cad6e','#7c6fc9','#c97ac9'];

// Costruisce la lista degli orologi del personaggio
function renderClocks() {
  const container = document.getElementById('clocksList');
  container.innerHTML = '';
  const s = state();
  if (!s.clocks) s.clocks = [];

  s.clocks.forEach((clk, i) => {
    const color = CLOCK_COLORS[i % CLOCK_COLORS.length];
    const card = document.createElement('div');
    card.className = 'clock-card';

    card.innerHTML = `
      <div class="clock-header">
        <input class="clock-name-input" type="text" placeholder="Nome orologio…" value="${clk.name || ''}" />
        <select class="clock-size-select">
          ${[4,6,8,10,12].map(n => `<option value="${n}"${n===clk.size?' selected':''}>${n}</option>`).join('')}
        </select>
        <button class="clock-del-btn" title="Elimina (tieni premuto)">🗑</button>
      </div>
      <div class="clock-body">
        <div class="clock-face">
          <div class="clock-svg-wrap">${drawClockSVG(clk.size, clk.filled, color)}</div>
          <div class="clock-controls">
            <div class="clock-count">${clk.filled} / ${clk.size}</div>
            <div class="clock-btns">
              <button class="clock-btn empty" title="Rimuovi sezione">−</button>
              <button class="clock-btn fill"  title="Aggiungi sezione">+</button>
            </div>
            <button class="clock-reset-btn">Reset</button>
          </div>
        </div>
        <textarea class="clock-desc-textarea" placeholder="Descrizione, condizioni, note…">${clk.desc || ''}</textarea>
      </div>
    `;

    // Name
    card.querySelector('.clock-name-input').addEventListener('input', e => {
      s.clocks[i].name = e.target.value; queueSave();
    });

    // Textarea descrizione dell'orologio (auto-resize)
    const descTa = card.querySelector('.clock-desc-textarea');
    descTa.addEventListener('input', () => {
      s.clocks[i].desc = descTa.value;
      autoResize(descTa);
      queueSave();
    });
    requestAnimationFrame(() => autoResize(descTa));

    // Cambio numero di settori: troncaa filled se più grande della nuova size
    card.querySelector('.clock-size-select').addEventListener('change', e => {
      s.clocks[i].size = parseInt(e.target.value);
      s.clocks[i].filled = Math.min(s.clocks[i].filled, s.clocks[i].size);
      renderClocks(); queueSave();
    });

    // Click su un settore: se cliccato l'ultimo settore pieno lo svuota,
    // altrimenti riempie fino a quello cliccato incluso
    card.querySelectorAll('.clock-sector').forEach(sec => {
      sec.addEventListener('click', () => {
        const idx = parseInt(sec.getAttribute('data-sector'));
        s.clocks[i].filled = (s.clocks[i].filled === idx + 1) ? idx : idx + 1;
        renderClocks(); queueSave();
      });
    });

    // Pulsanti +/− per aggiungere/rimuovere un settore alla volta
    card.querySelector('.clock-btn.fill').addEventListener('click', () => {
      s.clocks[i].filled = Math.min(s.clocks[i].filled + 1, s.clocks[i].size);
      renderClocks(); queueSave();
    });
    card.querySelector('.clock-btn.empty').addEventListener('click', () => {
      s.clocks[i].filled = Math.max(s.clocks[i].filled - 1, 0);
      renderClocks(); queueSave();
    });

    // Reset: svuota completamente l'orologio
    card.querySelector('.clock-reset-btn').addEventListener('click', () => {
      s.clocks[i].filled = 0; renderClocks(); queueSave();
    });

    // Eliminazione a pressione prolungata (1.5s)
    const delBtn = card.querySelector('.clock-del-btn');
    bindHoldToDelete(delBtn, () => {
      s.clocks.splice(i, 1);
      renderClocks();
      queueSave();
    });

    container.appendChild(card);
  });
}

/* ════════════════════════════════════════════════════════════
   TAB PERSONAGGI — barra in alto con un tab per ogni PG salvato
   ════════════════════════════════════════════════════════════ */
function renderCharTabs() {
  const container = document.getElementById('charTabs');
  container.innerHTML = '';
  chars.forEach((c, i) => {
    const tab = document.createElement('button');
    tab.className = 'char-tab' + (i === activeIdx ? ' active' : '');
    tab.textContent = c.name || `PG ${i+1}`;
    tab.addEventListener('click', () => {
      activeIdx = i;
      renderAll();
      saveLocal();
    });
    container.appendChild(tab);
  });
}

/* ════════════════════════════════════════════════════════════
   RENDER COMPLETO — rifà tutta l'UI dallo stato corrente.
   Chiamato al boot e ogni volta che si cambia personaggio.
   ════════════════════════════════════════════════════════════ */
function renderAll() {
  const s = state();

  // Popola tutti i campi con attributo data-key dal loro percorso
  document.querySelectorAll('[data-key]').forEach(el => {
    const key = el.getAttribute('data-key');
    const val = getByPath(s, key);
    if (el.type === 'checkbox')     el.checked = !!val;
    else if (el.tagName === 'SELECT') el.value = val || '';
    else                              el.value = val ?? '';
  });

  // Rende tutte le sezioni dinamiche
  renderPortrait();
  renderFabulaPills();
  renderAttributes();
  renderStatus();
  renderAllBars();
  renderPotions();
  renderBonds();
  renderClocks();
  renderClasses();
  renderCharTabs();
  applyTheme();
  // Auto-resize delle textarea pre-popolate + init wrapper markdown
  requestAnimationFrame(() => {
    document.querySelectorAll('.equip-stats, .notes-textarea').forEach(autoResize);
    initAllMdWraps();
  });
}

/* ════════════════════════════════════════════════════════════
   8. BIND — listener globale sugli input con attributo data-key.
   Scrive automaticamente nel percorso corrispondente dello stato.
   ════════════════════════════════════════════════════════════ */
function bindInputs() {
  document.addEventListener('input', e => {
    const el = e.target;
    if (!el.hasAttribute('data-key')) return;

    const key = el.getAttribute('data-key');
    const s = state();
    let val;

    // Estrae il valore in base al tipo di elemento
    if (el.type === 'checkbox')    val = el.checked;
    else if (el.type === 'number') val = el.value === '' ? 0 : Number(el.value);
    else                           val = el.value;

    setByPath(s, key, val);

    // Effetti collaterali: alcune modifiche richiedono re-render
    if (el.tagName === 'TEXTAREA' && el.classList.contains('equip-stats'))    autoResize(el);
    if (el.tagName === 'TEXTAREA' && el.classList.contains('notes-textarea')) autoResize(el);
    if (key === 'portraitUrl') renderPortrait();
    if (key.startsWith('attributes.') && key.endsWith('.base')) renderAttributes();
    // Se cambia il massimo, clampa l'attuale e ridisegna la barra
    if (key === 'points.hp.max' || key === 'points.hp.current') { s.points.hp.current = clamp(s.points.hp.current, 0, s.points.hp.max); renderBar('hp'); }
    if (key === 'points.mp.max' || key === 'points.mp.current') { s.points.mp.current = clamp(s.points.mp.current, 0, s.points.mp.max); renderBar('mp'); }
    if (key === 'points.ip.max') s.points.ip.current = clamp(s.points.ip.current, 0, s.points.ip.max);
    if (key === 'name') renderCharTabs();

    queueSave();
  });
}

/* ════════════════════════════════════════════════════════════
   SLIDER HP / MP — controlli interattivi sulle barre risorse.
   Slider + pulsanti +/− con delta configurabile + click modal.
   ════════════════════════════════════════════════════════════ */
function bindSliders() {
  ['hp','mp'].forEach(which => {
    // Trascinamento dello slider sulla barra
    document.getElementById(`${which}Slider`).addEventListener('input', e => {
      state().points[which].current = parseInt(e.target.value);
      renderBar(which);
      queueSave();
    });

    // Click sul valore "cur/max" → apre il modal di modifica
    document.getElementById(`${which}Value`).addEventListener('click', () => {
      openModal(which);
    });
  });

  // Pulsanti +/− con delta personalizzabile
  document.querySelectorAll('[data-res]').forEach(btn => {
    btn.addEventListener('click', () => {
      const which = btn.getAttribute('data-res');
      const sign  = parseInt(btn.getAttribute('data-sign'));
      const deltaEl = document.getElementById(`${which}Delta`);
      const delta = Math.max(1, parseInt(deltaEl.value) || 1);
      const pt = state().points[which];
      pt.current = clamp(pt.current + sign * delta, 0, pt.max);
      renderBar(which);
      queueSave();
    });
  });
}

/* ════════════════════════════════════════════════════════════
   MODAL HP/MP — editor rapido con formato "cur/max"
   (es. "60/80" imposta attuali=60, massimi=80)
   ════════════════════════════════════════════════════════════ */
let modalTarget = null;  // 'hp' o 'mp' a seconda della barra cliccata

function openModal(which) {
  modalTarget = which;
  const pt = state().points[which];
  const ov = document.getElementById('modalOverlay');
  const inp = document.getElementById('modalInput');
  document.getElementById('modalTitle').textContent =
    which === 'hp' ? 'Modifica Punti Vita' : 'Modifica Punti Mente';
  inp.value = `${pt.current}/${pt.max}`;
  ov.classList.add('open');
  setTimeout(() => inp.focus(), 50);
}

// Parsa l'input: accetta "cur/max" oppure solo un numero (solo max)
function commitModal() {
  const inp = document.getElementById('modalInput');
  const raw = inp.value.trim();
  const s = state();
  const pt = s.points[modalTarget];
  if (raw.includes('/')) {
    const [l, r] = raw.split('/');
    const mayMax = parseInt(r);
    const mayCur = parseInt(l);
    if (!isNaN(mayMax)) pt.max = Math.max(0, mayMax);
    if (!isNaN(mayCur)) pt.current = mayCur;
  } else {
    const mayMax = parseInt(raw);
    if (!isNaN(mayMax)) pt.max = Math.max(0, mayMax);
  }
  pt.current = clamp(pt.current, 0, pt.max);
  closeModal();
  renderBar(modalTarget);
  queueSave();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// Listener del modal: conferma, annulla, tastiera, click fuori
document.getElementById('modalConfirm').addEventListener('click', commitModal);
document.getElementById('modalCancel').addEventListener('click',  closeModal);
document.getElementById('modalInput').addEventListener('keydown', e => {
  if (e.key === 'Enter')  commitModal();
  if (e.key === 'Escape') closeModal();
});
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

/* ============================================================
   POZIONI
   Configurazione data-driven: un array di oggetti descrive ogni
   pozione. renderPotions() crea i bottoni e registra i click.
   ============================================================ */

// SVG base di una boccetta (riutilizzato da tutte le pozioni).
// L'icona "tonico" aggiunge una crocetta sovrapposta.
const POTION_SVG_BASE = `
  <path d="M24 6h16v8l-6 6v6c0 4 2 6 6 10 4 4 6 8 6 14 0 10-8 18-18 18S16 60 16 50c0-6 2-10 6-14 4-4 6-6 6-10v-6l-6-6V6z" fill="currentColor" opacity=".18"/>
  <path d="M28 14h8v10l6 8c3 4 4 7 4 12 0 8-6 14-14 14S18 52 18 44c0-5 1-8 4-12l6-8V14z" fill="currentColor"/>
  <path d="M24 6h16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`;
const POTION_SVG_CURE_EXTRA = `<path d="M26 44h12M32 38v12" stroke="rgba(0,0,0,.4)" stroke-width="3" stroke-linecap="round"/>`;

// Definizione delle 3 pozioni disponibili:
// - cls: classe CSS per il colore del bottone
// - cost: IP consumati dall'uso
// - title: testo del tooltip
// - apply(s): applica l'effetto sullo stato 's' del personaggio
// - toast: messaggio mostrato dopo l'uso
const POTIONS = [
  {
    id: 'hp',  cls: 'hp-p', cost: 3,
    title: 'Rimedio: +50 HP, −3 IP',
    svg: POTION_SVG_BASE,
    apply: s => s.points.hp.current = clamp(s.points.hp.current + 50, 0, s.points.hp.max),
    toast: '❤ +50 HP, −3 IP'
  },
  {
    id: 'mp',  cls: 'mp-p', cost: 3,
    title: 'Elisir: +50 MP, −3 IP',
    svg: POTION_SVG_BASE,
    apply: s => s.points.mp.current = clamp(s.points.mp.current + 50, 0, s.points.mp.max),
    toast: '✦ +50 MP, −3 IP'
  },
  {
    id: 'cure', cls: 'cu-p', cost: 2,
    title: 'Tonico: rimuovi status −2 IP',
    svg: POTION_SVG_BASE + POTION_SVG_CURE_EXTRA,
    apply: () => {}, // nessun effetto automatico, solo costo IP
    toast: '🟡 −2 IP (rimuovi uno status manualmente)'
  }
];

// Verifica se il personaggio ha abbastanza IP per usare una pozione
function checkIP(cost) {
  const ip = state().points.ip;
  if (ip.current < cost) {
    toast(`IP insufficienti (serve ${cost}, hai ${ip.current})`, 'error');
    return false;
  }
  return true;
}

// Costruisce la riga di bottoni pozione e registra i listener
function renderPotions() {
  const row = document.getElementById('potionRow');
  if (!row) return;
  row.innerHTML = POTIONS.map(p => `
    <button class="potion-btn ${p.cls}" title="${p.title}" data-potion="${p.id}">
      <svg class="potion-svg" viewBox="0 0 64 64" aria-hidden="true">${p.svg}</svg>
    </button>
  `).join('');

  row.querySelectorAll('[data-potion]').forEach(btn => {
    const potion = POTIONS.find(p => p.id === btn.dataset.potion);
    btn.addEventListener('click', () => {
      if (!checkIP(potion.cost)) return;
      const s = state();
      potion.apply(s);
      s.points.ip.current -= potion.cost;
      renderAllBars();
      document.querySelector('[data-key="points.ip.current"]').value = s.points.ip.current;
      toast(potion.toast, 'success');
      queueSave();
    });
  });
}

/* ════════════════════════════════════════════════════════════
   9. AZIONI UTENTE — pulsanti per aggiungere/gestire elementi
   ════════════════════════════════════════════════════════════ */

// "+ Aggiungi Legame" (max 6 legami per personaggio)
document.getElementById('btnAddBond').addEventListener('click', () => {
  if (state().bonds.length >= 6) { toast('Massimo 6 legami', 'error'); return; }
  state().bonds.push(defaultBond());
  renderBonds();
  queueSave();
});

// "+ Nuovo Orologio" (max 8 orologi per personaggio)
document.getElementById('btnAddClock').addEventListener('click', () => {
  if (!state().clocks) state().clocks = [];
  if (state().clocks.length >= 8) { toast('Massimo 8 orologi', 'error'); return; }
  state().clocks.push(defaultClock());
  renderClocks();
  queueSave();
});

// Toggle espansione/compressione per le card collassabili
document.querySelectorAll('[data-target]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.getAttribute('data-target'));
    if (!target) return;
    target.classList.toggle('collapsed');
    btn.classList.toggle('collapsed', target.classList.contains('collapsed'));
    btn.textContent = target.classList.contains('collapsed') ? '▸' : '▾';
  });
});

// Tema chiaro/scuro — applica e switch
function applyTheme() {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.getElementById('btnTheme').textContent = isDark ? '☾' : '☀';
}

document.getElementById('btnTheme').addEventListener('click', () => {
  isDark = !isDark;
  applyTheme();
  saveLocal();
});

// Gestione multi-personaggio: nuovo PG nella stessa istanza
document.getElementById('btnAddChar').addEventListener('click', () => {
  chars.push(defaultChar());
  activeIdx = chars.length - 1;
  renderAll();
  saveLocal();
  toast('Nuovo personaggio creato', 'success');
});

// Azzera il personaggio corrente (con conferma)
document.getElementById('btnNew').addEventListener('click', async () => {
  const ok = await confirm('Nuova scheda', 'Vuoi azzerare il personaggio corrente? I dati non salvati andranno persi.');
  if (!ok) return;
  chars[activeIdx] = defaultChar();
  renderAll();
  saveLocal();
  toast('Scheda azzerata');
});

// Esporta il personaggio attivo come file JSON scaricabile
document.getElementById('btnExport').addEventListener('click', () => {
  const s = state();
  const payload = { app:'fabula-ultima-sheet-v2', version:2, exportedAt:new Date().toISOString(), character:s };
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type:'application/json;charset=utf-8' });
  const a = document.createElement('a');
  // Nome file: nome del personaggio o "personaggio" come fallback
  const name = (s.name || 'personaggio').trim().replace(/[^\w\-]+/g,'_');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  toast('📤 Esportato', 'success');
});

// Importa un JSON del personaggio (formato nuovo o legacy)
document.getElementById('fileImport').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = '';  // Reset input per permettere re-import dello stesso file
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    // Supporta sia il formato con wrapper { character: ... } che legacy
    const incoming = data.character ?? data;
    chars[activeIdx] = deepMerge(defaultChar(), incoming);
    // Normalizza i dadi e assicura che esistano i bonds
    for (const k of Object.keys(chars[activeIdx].attributes)) {
      chars[activeIdx].attributes[k].base = normDie(chars[activeIdx].attributes[k].base);
    }
    if (!Array.isArray(chars[activeIdx].bonds)) chars[activeIdx].bonds = [defaultBond()];
    renderAll();
    saveLocal();
    toast('📥 Importato!', 'success');
  } catch {
    toast('File non valido', 'error');
  }
});

// Scorciatoie da tastiera: Ctrl/Cmd+S → salva manualmente
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 's') { e.preventDefault(); saveLocal(); toast('💾 Salvato', 'success'); }
  }
});

/* ════════════════════════════════════════════════════════════
   10. INIT — avvio dell'applicazione.
   Carica i dati salvati (o crea un nuovo PG), registra i
   listener globali e disegna l'interfaccia.
   ════════════════════════════════════════════════════════════ */
function init() {
  const loaded = loadLocal();
  if (!loaded || chars.length === 0) {
    // Primo avvio o dati corrotti: crea un personaggio vuoto
    chars = [defaultChar()];
    activeIdx = 0;
  }
  bindInputs();
  bindSliders();
  renderAll();
  setIndicator(loaded ? 'saved' : 'idle');
  setTimeout(() => setIndicator('idle'), 2000);
}

init();
