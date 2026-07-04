/* ハイライト英単語帳 拡張 — content script
   - 英文を選択すると「＋単語帳」ボタンが浮かぶ → クリックで追加
   - Option(Alt)キーを押しながらマウスオーバーで、その場に訳ツールチップ
     （ツールチップ表示中にクリックでその単語を追加） */
'use strict';
(() => {
  if (window.__hlvLoaded) return;
  window.__hlvLoaded = true;

  // ページ丸ごと回収（backgroundからの要求に本文テキストを返す）
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'grabText') {
      const root = document.querySelector('article, main, [role="main"]') || document.body;
      sendResponse({ title: document.title || location.hostname,
                     text: (root && root.innerText || '').slice(0, 20000) });
    }
  });

  const Z = 2147483000;
  /* ---------- UI部品 ---------- */
  const btn = document.createElement('button');
  btn.id = '__hlv_btn';
  btn.textContent = '＋単語帳';
  css(btn, {
    position: 'fixed', zIndex: Z, display: 'none', padding: '6px 12px',
    background: '#1e293b', color: '#fff', border: 'none', borderRadius: '16px',
    font: '600 13px -apple-system, "Hiragino Sans", sans-serif', cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,.35)'
  });
  const tip = document.createElement('div');
  tip.id = '__hlv_tip';
  css(tip, {
    position: 'fixed', zIndex: Z, display: 'none', maxWidth: '300px',
    background: '#1e293b', color: '#f1f5f9', borderRadius: '8px', padding: '7px 10px',
    font: '13px/1.5 -apple-system, "Hiragino Sans", sans-serif',
    boxShadow: '0 4px 16px rgba(0,0,0,.35)', pointerEvents: 'none', whiteSpace: 'pre-wrap'
  });
  const toastEl = document.createElement('div');
  toastEl.id = '__hlv_toast';
  css(toastEl, {
    position: 'fixed', zIndex: Z, display: 'none', left: '50%', bottom: '28px',
    transform: 'translateX(-50%)', maxWidth: '80vw',
    background: '#16a34a', color: '#fff', borderRadius: '18px', padding: '9px 16px',
    font: '600 13px -apple-system, "Hiragino Sans", sans-serif',
    boxShadow: '0 4px 16px rgba(0,0,0,.35)'
  });
  function mount() {
    if (!document.body) return;
    document.body.appendChild(btn); document.body.appendChild(tip); document.body.appendChild(toastEl);
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  function css(el, obj) { for (const k in obj) el.style[k] = obj[k]; }
  let toastTimer = null;
  function toast(msg, ok) {
    toastEl.textContent = msg;
    toastEl.style.background = ok ? '#16a34a' : '#b91c1c';
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, 2200);
  }
  function sendAdd(word, context) {
    let responded = false;
    try {
      chrome.runtime.sendMessage(
        { type: 'add', word, context: context || '', source: document.title || location.hostname },
        (r) => {
          responded = true;
          if (chrome.runtime.lastError || !r) toast('追加できません。サーバ停止中かも（セットアップ.commandを実行）', false);
          else toast('追加: ' + r.word + (r.gloss ? ' — ' + r.gloss.replace(/\s*\/\s*/g, '、').slice(0, 40) : ''), true);
        }
      );
    } catch (e) { toast('拡張機能を再読み込みしてください', false); }
    setTimeout(() => { if (!responded) toast('応答がありません（サーバ停止中かも）', false); }, 3000);
  }

  /* ---------- 文脈センテンスの切り出し ---------- */
  function sentenceAround(node, word) {
    try {
      let el = node.nodeType === 3 ? node.parentElement : node;
      while (el && el !== document.body && el.textContent.length < 30) el = el.parentElement;
      const text = (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
      const i = text.indexOf(word);
      if (i < 0 || text.length < word.length + 10) return '';
      let start = 0, end = text.length;
      for (let j = i; j > 0; j--) if (/[.!?]/.test(text[j - 1]) && text[j] === ' ') { start = j + 1; break; }
      for (let j = i + word.length; j < text.length; j++) if (/[.!?]/.test(text[j])) { end = j + 1; break; }
      const s = text.slice(start, end).trim();
      return s.length <= 240 ? s : '';
    } catch (e) { return ''; }
  }

  /* ---------- 選択 → ボタン ---------- */
  let selTimer = null;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { btn.style.display = 'none'; return; }
      const t = String(sel).replace(/\s+/g, ' ').trim();
      if (!t || t.length > 80 || !/^[A-Za-z][A-Za-z'’ .\-]*$/.test(t)) { btn.style.display = 'none'; return; }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) { btn.style.display = 'none'; return; }
      btn.dataset.word = t;
      btn.dataset.ctx = sentenceAround(sel.anchorNode, t);
      btn.style.display = 'block';
      let x = r.left + r.width / 2 - 45;
      x = Math.max(8, Math.min(x, window.innerWidth - 100));
      let y = r.bottom + 8;
      if (y + 40 > window.innerHeight) y = r.top - 42;
      btn.style.left = x + 'px'; btn.style.top = y + 'px';
    }, 250);
  });
  btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  btn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const w = btn.dataset.word; btn.style.display = 'none';
    try { window.getSelection().removeAllRanges(); } catch (err) {}
    if (w) sendAdd(w, btn.dataset.ctx);
  });

  /* ---------- Option(Alt)+ホバー辞書 ---------- */
  let hoverWord = '', hoverCtxNode = null, lookupTimer = null;
  function wordAtPoint(x, y) {
    const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (!range || range.startContainer.nodeType !== 3) return null;
    const textNode = range.startContainer, text = textNode.textContent, off = range.startOffset;
    const isW = (c) => /[A-Za-z'’-]/.test(c);
    if (off >= text.length || !isW(text[off])) return null;
    let s = off, e = off;
    while (s > 0 && isW(text[s - 1])) s--;
    while (e < text.length && isW(text[e])) e++;
    const w = text.slice(s, e);
    if (!/^[A-Za-z]/.test(w) || w.length < 2) return null;
    return { word: w, node: textNode };
  }
  document.addEventListener('mousemove', (e) => {
    if (!e.altKey) { if (tip.style.display !== 'none') tip.style.display = 'none'; hoverWord = ''; return; }
    const hit = wordAtPoint(e.clientX, e.clientY);
    if (!hit) { tip.style.display = 'none'; hoverWord = ''; return; }
    if (hit.word === hoverWord) { position(e); return; }
    hoverWord = hit.word; hoverCtxNode = hit.node;
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(() => {
      const w = hoverWord;
      try {
        chrome.runtime.sendMessage({ type: 'lookup', word: w }, (r) => {
          if (chrome.runtime.lastError || w !== hoverWord) return;
          tip.textContent = r
            ? w + (r.key !== w.toLowerCase() ? ' (' + r.key + ')' : '') + '\n' +
              r.gloss.replace(/\s*\/\s*/g, '、').slice(0, 90) + '\n［クリックで単語帳へ］'
            : w + '\n辞書に見つかりません［クリックで単語帳へ］';
          tip.style.display = 'block';
          position(e);
        });
      } catch (err) {}
    }, 120);
  }, { passive: true });
  function position(e) {
    if (tip.style.display === 'none') return;
    let x = e.clientX + 14, y = e.clientY + 18;
    if (x + tip.offsetWidth > window.innerWidth - 8) x = e.clientX - tip.offsetWidth - 10;
    if (y + tip.offsetHeight > window.innerHeight - 8) y = e.clientY - tip.offsetHeight - 12;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') { tip.style.display = 'none'; hoverWord = ''; }
  });
  document.addEventListener('click', (e) => {
    if (e.altKey && hoverWord && tip.style.display !== 'none') {
      e.preventDefault(); e.stopPropagation();
      const ctx = hoverCtxNode ? sentenceAround(hoverCtxNode, hoverWord) : '';
      sendAdd(hoverWord, ctx);
      tip.style.display = 'none'; hoverWord = '';
    }
  }, true);
})();
