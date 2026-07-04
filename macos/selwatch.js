// ハイライト英単語帳 — 選択監視デーモン「単語帳セレクタ」
// どのアプリでも「英単語を選択したまま約1秒」で自動的に単語帳へ追加する。
// ガード: 英単語/短フレーズのみ・入力欄(テキストフィールド等)は無視・
//         同じ選択は再追加しない・2.5秒クールダウン。
// セットアップ.command が osacompile で /Applications/単語帳セレクタ.app にビルドし、
// server.py が子プロセスとして常駐させる。
// ※初回のみ「システム設定 → プライバシーとセキュリティ → アクセシビリティ」で
//   「単語帳セレクタ」をオンにする必要がある。
'use strict';
ObjC.import('Foundation');

const app = Application.currentApplication();
app.includeStandardAdditions = true;
const se = Application('System Events');

function isTerm(t) {
  if (!t || t.length < 3 || t.length > 40) return false;
  if (!/^[A-Za-z][A-Za-z'’ \-]*$/.test(t)) return false;
  const words = t.split(' ').filter(Boolean);
  if (words.length > 3) return false;
  if (words[0].length < 3) return false;
  return true;
}

function selectedText() {
  try {
    const procs = se.applicationProcesses.whose({ frontmost: true });
    const p = procs.at(0);
    const appName = String(p.name());
    if (appName === '単語帳セレクタ') return null;
    const el = p.attributes.byName('AXFocusedUIElement').value();
    if (!el) return null;
    let role = '';
    try { role = String(el.attributes.byName('AXRole').value() || ''); } catch (e) {}
    if (/AXTextField|AXTextArea|AXComboBox|AXSearchField/.test(role)) return null; // 入力欄では無効
    let t = null;
    try { t = el.attributes.byName('AXSelectedText').value(); } catch (e) { return null; }
    if (!t) return null;
    return { text: String(t), app: appName };
  } catch (e) { return null; }
}

function addWord(t, src) {
  let res = '';
  try {
    res = app.doShellScript(
      '/usr/bin/curl -sG --max-time 3 "http://localhost:8331/api/add?fmt=txt"' +
      ' --data-urlencode "source=選択(' + src.replace(/["\\$`]/g, '') + ')"' +
      ' --data-urlencode "w=' + t + '"'
    );
  } catch (e) { return; }
  const tab = res.indexOf('\t');
  const word = tab > 0 ? res.slice(0, tab) : t;
  const gloss = tab > 0 ? res.slice(tab + 1) : '';
  try { app.displayNotification(gloss || '訳はアプリで入力してください', { withTitle: '単語帳に追加: ' + word }); } catch (e) {}
}

function run() {
  let prev = '', lastAdded = '', cool = 0, emptySince = 0;
  while (true) {
    delay(0.6);
    const sel = selectedText();
    const t = sel ? sel.text.replace(/\s+/g, ' ').trim() : '';
    const now = Date.now();
    if (!t) {
      if (!emptySince) emptySince = now;
      if (lastAdded && now - emptySince > 6000) lastAdded = '';  // 選択が消えてしばらくしたら同語の再追加を許可
      prev = '';
      continue;
    }
    emptySince = 0;
    // 同じ選択が2ティック連続(≒1.2秒保持) → 追加
    if (t === prev && t !== lastAdded && now >= cool && isTerm(t)) {
      lastAdded = t;
      cool = now + 2500;
      addWord(t, sel.app);
    }
    prev = t;
  }
}
