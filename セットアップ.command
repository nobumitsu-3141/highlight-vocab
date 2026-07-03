#!/bin/bash
# ハイライト英単語帳 — Mac「どこでも追加」セットアップ（ダブルクリックで実行）
#   1) 常駐サーバ(ポート8331)をログイン時に自動起動するよう登録
#   2) 右クリックメニューに「単語帳に追加」クイックアクションを登録
cd "$(dirname "$0")"
APP="$(pwd)"
UID_N=$(id -u)
echo "=== ハイライト英単語帳: Mac連携セットアップ ==="
echo ""

# --- 1. 常駐サーバ (LaunchAgent) ---
mkdir -p ~/Library/LaunchAgents
sed "s|__APP__|$APP|g" "macos/com.nobumitsu.hlvocab.server.plist" > ~/Library/LaunchAgents/com.nobumitsu.hlvocab.server.plist
launchctl bootout "gui/$UID_N/com.nobumitsu.hlvocab.server" 2>/dev/null
sleep 1
launchctl bootstrap "gui/$UID_N" ~/Library/LaunchAgents/com.nobumitsu.hlvocab.server.plist 2>/dev/null
sleep 2
if curl -s --max-time 3 "http://localhost:8331/api/status" | grep -q '"ok": true'; then
  echo "✔ 常駐サーバ: 起動OK（http://localhost:8331・ログイン時も自動起動）"
else
  echo "✘ サーバの起動を確認できませんでした。/tmp/hlvocab-server.log を確認してください"
fi

# --- 2. クイックアクション ---
mkdir -p ~/Library/Services
rm -rf ~/Library/Services/単語帳に追加.workflow
cp -R "macos/単語帳に追加.workflow" ~/Library/Services/
/System/Library/CoreServices/pbs -update 2>/dev/null
echo "✔ クイックアクション「単語帳に追加」を登録しました"

echo ""
echo "── 使い方 ──────────────────────────────"
echo "・どのアプリでも英単語を選択 → 右クリック →「サービス」→「単語帳に追加」"
echo "  （Chrome・Safari・プレビューのPDF・メールなどOK。通知で訳が出ます）"
echo "・単語帳アプリ: http://localhost:8331 （開いた瞬間に自動で取り込まれます）"
echo "・ショートカットキーを付けるには: システム設定 → キーボード →"
echo "  キーボードショートカット → サービス → テキスト →「単語帳に追加」"
echo "・Chrome拡張（選択ボタン＋Optionキー押しながらマウスオーバーで訳表示）:"
echo "  chrome://extensions を開く → 右上「デベロッパーモード」ON →"
echo "  「パッケージ化されていない拡張機能を読み込む」→ このフォルダの chrome-extension を選択"
echo "────────────────────────────────────────"
open "http://localhost:8331"
echo ""
echo "このウィンドウは閉じて構いません。"
