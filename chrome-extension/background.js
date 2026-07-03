/* ハイライト英単語帳 拡張 — background service worker
   - 右クリックメニュー「…を単語帳に追加」(Chrome内蔵PDFビューアでも動く)
   - content script からの辞書引き(lookup)と追加(add)のハブ */
'use strict';
const API_BASE = 'http://localhost:8331';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'hlv-add',
    title: '「%s」を単語帳に追加',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'hlv-add' || !info.selectionText) return;
  const r = await addWord(info.selectionText, (tab && tab.title) || 'Chrome', '');
  notify(r);
});

async function addWord(word, source, context) {
  try {
    const u = new URL(API_BASE + '/api/add');
    u.searchParams.set('w', String(word).replace(/\s+/g, ' ').trim().slice(0, 80));
    u.searchParams.set('source', (source || 'Chrome').slice(0, 100));
    if (context) u.searchParams.set('context', String(context).slice(0, 300));
    const res = await fetch(u.toString());
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function notify(r) {
  const opt = r
    ? { type: 'basic', iconUrl: 'icons/icon128.png',
        title: '単語帳に追加: ' + r.word,
        message: (r.gloss ? r.gloss.replace(/\s*\/\s*/g, '、') : '訳はアプリで入力してください').slice(0, 130) }
    : { type: 'basic', iconUrl: 'icons/icon128.png',
        title: 'ハイライト英単語帳',
        message: '常駐サーバが見つかりません。highlight-vocab の「セットアップ.command」を実行してください。' };
  chrome.notifications.create(opt);
}

/* ---------------- 内蔵辞書 (dict.js を遅延ロード) ---------------- */
let DICT = null;
async function ensureDict() {
  if (DICT) return DICT;
  const res = await fetch(chrome.runtime.getURL('dict.js'));
  const text = await res.text();
  const line = text.split('\n').find(l => l.startsWith('window.EJDICT_RAW='));
  if (!line) { DICT = new Map(); return DICT; }
  const raw = JSON.parse(line.slice('window.EJDICT_RAW='.length).replace(/;\s*$/, ''));
  DICT = new Map();
  for (const ln of raw.split('\n')) {
    const t = ln.indexOf('\t');
    if (t > 0) DICT.set(ln.slice(0, t), ln.slice(t + 1));
  }
  return DICT;
}

const IRREG = {went:'go',gone:'go',did:'do',done:'do',was:'be',were:'be',been:'be',is:'be',are:'be',am:'be',
has:'have',had:'have',having:'have',said:'say',made:'make',took:'take',taken:'take',came:'come',got:'get',
gotten:'get',gave:'give',given:'give',found:'find',thought:'think',told:'tell',became:'become',shown:'show',
left:'leave',felt:'feel',brought:'bring',began:'begin',begun:'begin',kept:'keep',held:'hold',wrote:'write',
written:'write',stood:'stand',heard:'hear',meant:'mean',met:'meet',ran:'run',paid:'pay',sat:'sit',spoke:'speak',
spoken:'speak',led:'lead',grew:'grow',grown:'grow',lost:'lose',fell:'fall',fallen:'fall',sent:'send',built:'build',
understood:'understand',drew:'draw',drawn:'draw',broke:'break',broken:'break',spent:'spend',rose:'rise',risen:'rise',
drove:'drive',driven:'drive',bought:'buy',wore:'wear',worn:'wear',chose:'choose',chosen:'choose',ate:'eat',eaten:'eat',
knew:'know',known:'know',saw:'see',seen:'see',sought:'seek',taught:'teach',caught:'catch',fought:'fight',flew:'fly',
flown:'fly',threw:'throw',thrown:'throw',laid:'lay',slept:'sleep',woke:'wake',woken:'wake',forgot:'forget',
forgotten:'forget',children:'child',men:'man',women:'woman',feet:'foot',teeth:'tooth',mice:'mouse',people:'person',
better:'good',best:'good',worse:'bad',worst:'bad',lives:'life',knives:'knife',leaves:'leaf',selves:'self',
wives:'wife',halves:'half',shelves:'shelf',lying:'lie',dying:'die',tying:'tie'};

function lemmaCandidates(w) {
  const out = [w];
  if (IRREG[w]) out.push(IRREG[w]);
  if (/'s$/.test(w)) out.push(w.slice(0, -2));
  if (/s'$/.test(w)) out.push(w.slice(0, -1));
  if (/ies$/.test(w)) out.push(w.slice(0, -3) + 'y');
  if (/ied$/.test(w)) out.push(w.slice(0, -3) + 'y');
  if (/ier$/.test(w)) out.push(w.slice(0, -3) + 'y');
  if (/iest$/.test(w)) out.push(w.slice(0, -4) + 'y');
  if (/ily$/.test(w)) out.push(w.slice(0, -3) + 'y');
  if (/es$/.test(w)) { out.push(w.slice(0, -2)); out.push(w.slice(0, -1)); }
  else if (/s$/.test(w) && !/ss$/.test(w)) out.push(w.slice(0, -1));
  if (/ing$/.test(w)) {
    const b = w.slice(0, -3); out.push(b); out.push(b + 'e');
    if (b.length > 2 && b[b.length - 1] === b[b.length - 2]) out.push(b.slice(0, -1));
  }
  if (/ed$/.test(w)) {
    const b = w.slice(0, -2); out.push(b); out.push(w.slice(0, -1));
    if (b.length > 2 && b[b.length - 1] === b[b.length - 2]) out.push(b.slice(0, -1));
  }
  if (/est$/.test(w)) { out.push(w.slice(0, -3)); out.push(w.slice(0, -2)); }
  else if (/er$/.test(w)) { out.push(w.slice(0, -2)); out.push(w.slice(0, -1)); }
  if (/ly$/.test(w)) out.push(w.slice(0, -2));
  return [...new Set(out.filter(x => x && x.length > 0))];
}

function lookupWord(raw) {
  const w = String(raw).toLowerCase().replace(/’/g, "'");
  if (!DICT) return null;
  if (/\s/.test(w)) {
    const k = w.replace(/\s+/g, ' ').trim();
    return DICT.has(k) ? { key: k, gloss: DICT.get(k) } : null;
  }
  for (const c of lemmaCandidates(w)) {
    if (DICT.has(c)) return { key: c, gloss: DICT.get(c) };
  }
  return null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'lookup') {
    ensureDict().then(() => sendResponse(lookupWord(msg.word))).catch(() => sendResponse(null));
    return true; // async
  }
  if (msg && msg.type === 'add') {
    addWord(msg.word, msg.source, msg.context).then(r => sendResponse(r)).catch(() => sendResponse(null));
    return true; // async
  }
});
