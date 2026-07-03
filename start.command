#!/bin/bash
# ハイライト英単語帳 を開く（ダブルクリックで実行）
# 常駐サーバが動いていればそのまま開き、無ければこの場で起動する
cd "$(dirname "$0")"
PORT=8331
if curl -s --max-time 2 "http://localhost:${PORT}/api/status" | grep -q '"ok": true'; then
  echo "常駐サーバ稼働中 → ブラウザで開きます"
  open "http://localhost:${PORT}"
else
  echo "http://localhost:${PORT} で起動します（終了はこのウィンドウで Ctrl+C）"
  echo "※ログイン時の自動起動にするには「セットアップ.command」を一度実行してください"
  (sleep 1 && open "http://localhost:${PORT}") &
  python3 server.py
fi
