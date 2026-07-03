#!/bin/bash
# ハイライト英単語帳 をローカルで起動する（ダブルクリックで実行）
cd "$(dirname "$0")"
PORT=8331
echo "http://localhost:${PORT} で起動します（終了はこのウィンドウで Ctrl+C）"
(sleep 1 && open "http://localhost:${PORT}") &
python3 -m http.server ${PORT}
