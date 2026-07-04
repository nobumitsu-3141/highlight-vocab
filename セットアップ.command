#!/bin/bash
# ハイライト英単語帳 — Mac「どこでも追加」セットアップ（ダブルクリックで実行）
#   1) アプリを ~/Library/Application Support/hlvocab/app にミラー
#      （常駐サーバは Desktop を読めないため。アプリを更新したらこれを再実行）
#   2) 常駐サーバ(ポート8331)+ダブルコピー監視 をログイン時に自動起動するよう登録
#   3) 右クリックメニューに「単語帳に追加」クイックアクションを登録（⌘⇧E も割り当て）
cd "$(dirname "$0")"
SRC="$(pwd)"
DEST="$HOME/Library/Application Support/hlvocab/app"
UID_N=$(id -u)
echo "=== ハイライト英単語帳: Mac連携セットアップ ==="
echo ""

# --- 1. ミラー ---
mkdir -p "$DEST"
rsync -a --delete --exclude .git "$SRC/" "$DEST/"
echo "✔ アプリ本体を常駐用ミラーへコピーしました"

# --- 2. 常駐サーバ (LaunchAgent) ---
mkdir -p ~/Library/LaunchAgents
sed "s|__APP__|$DEST|g" "macos/com.nobumitsu.hlvocab.server.plist" > ~/Library/LaunchAgents/com.nobumitsu.hlvocab.server.plist
launchctl bootout "gui/$UID_N/com.nobumitsu.hlvocab.server" 2>/dev/null
sleep 1
launchctl bootstrap "gui/$UID_N" ~/Library/LaunchAgents/com.nobumitsu.hlvocab.server.plist 2>/dev/null
sleep 3
if curl -s --max-time 3 "http://localhost:8331/api/status" | grep -q '"ok": true'; then
  echo "✔ 常駐サーバ: 起動OK（http://localhost:8331・ログイン時も自動起動）"
else
  echo "✘ サーバの起動を確認できませんでした。/tmp/hlvocab-server.log を確認してください"
fi
if pgrep -f "clipwatch.js" >/dev/null; then
  echo "✔ ダブルコピー監視: 稼働中（英単語を ⌘C ⌘C と2回コピーすると追加されます）"
else
  echo "△ ダブルコピー監視がまだ起動していません（数秒後に自動起動します）"
fi

# --- 3. Mac アプリ（/Applications + Dock）---
bash macos/make_app.sh

# --- 3b. Chrome拡張をデスクトップから見つけやすく ---
ln -sfn "$SRC/chrome-extension" ~/Desktop/単語帳Chrome拡張
echo "✔ デスクトップに「単語帳Chrome拡張」リンクを作成しました"

# --- 4. クイックアクション + ショートカット ---
mkdir -p ~/Library/Services
rm -rf ~/Library/Services/単語帳に追加.workflow
cp -R "macos/単語帳に追加.workflow" ~/Library/Services/
defaults write pbs NSServicesStatus -dict-add '"(null) - 単語帳に追加 - runWorkflowAsService"' '{key_equivalent = "@$e";}'
/System/Library/CoreServices/pbs -update 2>/dev/null
echo "✔ クイックアクション「単語帳に追加」を登録（ショートカット: ⌘⇧E）"

echo ""
echo "── いちばん速い使い方 ─────────────────────"
echo "・英単語を選択して ⌘C を素早く2回（ダブルコピー）→ 即追加＋訳の通知"
echo "  （Chrome・Safari・プレビューのPDF・メール…どこでもOK）"
echo "・または選択して ⌘⇧E（効かないアプリは一度再起動を）"
echo "・単語帳アプリ: http://localhost:8331 （開いた瞬間に自動取り込み）"
echo "・Chrome拡張（選択で＋ボタン／Option+ホバーで訳）: chrome://extensions →"
echo "  デベロッパーモードON → 「パッケージ化されていない拡張機能を読み込む」→"
echo "  このフォルダの chrome-extension を選択"
echo "────────────────────────────────────────"
open "http://localhost:8331"
echo ""
echo "このウィンドウは閉じて構いません。"
