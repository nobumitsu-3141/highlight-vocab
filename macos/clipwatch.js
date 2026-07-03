// ハイライト英単語帳 — ダブルコピー(⌘C×2)監視デーモン
// server.py が起動・管理する。osascript -l JavaScript macos/clipwatch.js で単体実行も可。
// 仕組み: クリップボードの changeCount を0.25秒ごとに監視し、
//         0.9秒以内に2回コピーされた「英単語/短いフレーズ」だけを受信箱へ送る。
'use strict';
ObjC.import('AppKit');
ObjC.import('Foundation');

const app = Application.currentApplication();
app.includeStandardAdditions = true;

function clipText() {
  try {
    const s = $.NSPasteboard.generalPasteboard.stringForType($.NSPasteboardTypeString);
    return s.isNil() ? '' : ObjC.unwrap(s);
  } catch (e) { return ''; }
}

function isEnglishTerm(t) {
  if (!t || t.length < 2 || t.length > 80) return false;
  if (!/^[A-Za-z][A-Za-z'’ \-]*$/.test(t)) return false;      // 英字・空白・'・- のみ
  if (t.split(' ').filter(Boolean).length > 6) return false;   // 長文コピーは無視
  return true;
}

function addWord(t) {
  // t は isEnglishTerm 検証済み（シェルに危険な文字は含まれない）
  let res = '';
  try {
    res = app.doShellScript(
      '/usr/bin/curl -sG --max-time 3 "http://localhost:8331/api/add?fmt=txt"' +
      ' --data-urlencode "source=ダブルコピー(2回コピー)"' +
      ' --data-urlencode "w=' + t + '"'
    );
  } catch (e) {
    try { app.displayNotification('常駐サーバが見つかりません。セットアップ.commandを実行してください。', { withTitle: 'ハイライト英単語帳' }); } catch (e2) {}
    return;
  }
  const tab = res.indexOf('\t');
  const word = tab > 0 ? res.slice(0, tab) : t;
  const gloss = tab > 0 ? res.slice(tab + 1) : '';
  try { app.displayNotification(gloss || '訳はアプリで入力してください', { withTitle: '単語帳に追加: ' + word }); } catch (e3) {}
}

function run() {
  const pb = $.NSPasteboard.generalPasteboard;
  let last = pb.changeCount;
  let lastChangeAt = 0;
  let coolUntil = 0;
  while (true) {
    delay(0.25);
    let c;
    try { c = pb.changeCount; } catch (e) { continue; }
    if (c === last) continue;
    const delta = c - last;
    const now = Date.now();
    last = c;
    if (now < coolUntil) { lastChangeAt = now; continue; }
    // 2連続コピー: 1ティック内に2回変化(delta>=2) or 前回変化から0.9秒以内
    if (delta >= 2 || (now - lastChangeAt) < 900) {
      lastChangeAt = now;
      const t = clipText().replace(/\s+/g, ' ').trim();
      if (isEnglishTerm(t)) {
        coolUntil = now + 1800;   // 連打の重複防止
        addWord(t);
      }
    } else {
      lastChangeAt = now;
    }
  }
}
