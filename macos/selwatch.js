// ハイライト英単語帳 — 選択監視デーモン「単語帳セレクタ」
// どのアプリでも:
//   ・⌥(Option)+ダブルクリック選択 → 即・単語帳へ（待ち時間なし）
//   ・普通に選択して約1秒そのまま → 自動で単語帳へ
// ガード: 英単語/短フレーズのみ・入力欄(テキストフィールド等)は無視・
//         同じ選択は再追加しない・2.5秒クールダウン。
// セットアップ.command が osacompile で /Applications/単語帳セレクタ.app にビルドし、
// server.py が子プロセスとして常駐させる。
// ※初回のみ「システム設定 → プライバシーとセキュリティ → アクセシビリティ」で
//   「単語帳セレクタ」をオンにする必要がある。
'use strict';
ObjC.import('Foundation');
ObjC.import('AppKit');

const OPTION_FLAG = 1 << 19;   // NSEventModifierFlagOption
function optionHeld() {
  try { return (Number($.NSEvent.modifierFlags) & OPTION_FLAG) !== 0; } catch (e) { return false; }
}

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

let __snd = null;   // 再生中の解放を防ぐ
function ding(name) {  // 追加されたことが音でわかるように（通知が出ない環境でも確実）
  try {
    const s = $.NSSound.alloc.initWithContentsOfFileByReference('/System/Library/Sounds/' + name + '.aiff', true);
    if (!s.isNil()) { __snd = s; s.play; }
  } catch (e) {}
}

function addWord(t, src) {
  let res = '';
  try {
    res = app.doShellScript(
      '/usr/bin/curl -sG --max-time 3 "http://localhost:8331/api/add?fmt=txt"' +
      ' --data-urlencode "source=選択(' + src.replace(/["\\$`]/g, '') + ')"' +
      ' --data-urlencode "w=' + t + '"'
    );
  } catch (e) { ding('Basso'); return; }
  ding('Glass');
  const tab = res.indexOf('\t');
  const word = tab > 0 ? res.slice(0, tab) : t;
  const gloss = tab > 0 ? res.slice(tab + 1) : '';
  try { app.displayNotification(gloss || '訳はアプリで入力してください', { withTitle: '単語帳に追加: ' + word }); } catch (e) {}
}

function run() {
  let prev = '', same = 0, lastAdded = '', cool = 0, emptySince = 0;
  while (true) {
    delay(0.3);
    const opt = optionHeld();
    const sel = selectedText();
    const t = sel ? sel.text.replace(/\s+/g, ' ').trim() : '';
    const now = Date.now();
    if (!t) {
      if (!emptySince) emptySince = now;
      if (lastAdded && now - emptySince > 6000) lastAdded = '';  // 選択が消えてしばらくしたら同語の再追加を許可
      prev = ''; same = 0;
      continue;
    }
    emptySince = 0;
    same = (t === prev) ? same + 1 : 0;
    // ⌥を押しながらの選択 → 即追加 ／ 通常は約1.2秒(4ティック)保持で追加
    const ready = opt ? true : (same >= 4);
    if (ready && t !== lastAdded && now >= cool && isTerm(t)) {
      lastAdded = t;
      cool = now + 2500;
      addWord(t, sel.app);
    }
    prev = t;
  }
}
