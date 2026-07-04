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
  if (t.split(' ').filter(Boolean).length > 6) return false;   // 単語〜短フレーズのみ
  return true;
}

// まとまった英文か（1回コピーで難単語を自動回収する対象）
function isEnglishText(t) {
  if (!t || t.length < 120 || t.length > 20000) return false;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  const nonspace = (t.match(/\S/g) || []).length;
  if (!nonspace || letters / nonspace < 0.7) return false;    // 日本語やコード混じりは除外
  if ((t.match(/[A-Za-z][A-Za-z'’-]+/g) || []).length < 20) return false;
  return true;
}

function harvestText(t) {
  try {
    const tmp = '/tmp/hlvocab-clip.txt';
    ObjC.wrap(t).writeToFileAtomicallyEncodingError(tmp, true, $.NSUTF8StringEncoding, null);
    const res = app.doShellScript(
      '/usr/bin/curl -s --max-time 5 "http://localhost:8331/api/add?fmt=txt"' +
      ' --data-urlencode "source=コピーした英文"' +
      ' --data-urlencode "text@' + tmp + '"'
    );
    const parts = res.split('\t');   // CAND \t 数 \t 単語一覧
    if (parts[0] === 'CAND' && +parts[1] > 0) {
      app.displayNotification((parts[2] || '').slice(0, 120),
        { withTitle: '難単語を' + parts[1] + '語 候補に追加（アプリで確認）' });
    }
  } catch (e) {}
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
  let lastTextSig = '';
  while (true) {
    delay(0.25);
    let c;
    try { c = pb.changeCount; } catch (e) { continue; }
    if (c === last) continue;
    const delta = c - last;
    const now = Date.now();
    last = c;
    if (now < coolUntil) { lastChangeAt = now; continue; }
    const raw = clipText();
    const t = raw.replace(/\s+/g, ' ').trim();
    // ① 単語/短フレーズの2連続コピー → 即・単語帳へ
    if ((delta >= 2 || (now - lastChangeAt) < 900) && isEnglishTerm(t)) {
      lastChangeAt = now;
      coolUntil = now + 1800;
      addWord(t);
      continue;
    }
    // ② まとまった英文の1回コピー → 難単語だけ候補として回収
    if (isEnglishText(raw)) {
      const sig = raw.length + ':' + raw.slice(0, 40) + raw.slice(-40);
      if (sig !== lastTextSig) {
        lastTextSig = sig;
        coolUntil = now + 5000;
        harvestText(raw);
      }
    }
    lastChangeAt = now;
  }
}
