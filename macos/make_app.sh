#!/bin/bash
# 「ハイライト英単語帳.app」を /Applications に作成し、Dock に追加する
# （セットアップ.command から呼ばれる。単体実行も可）
set -e
cd "$(dirname "$0")/.."   # アプリのルートへ
APPPATH="/Applications/ハイライト英単語帳.app"
TMP=$(mktemp -d)

# 本体: サーバ生存確認(落ちていれば起こす)→ Chromeのアプリモードで開く
cat > "$TMP/main.applescript" <<'EOS'
do shell script "curl -s --max-time 2 http://localhost:8331/api/status | grep -q ok || { launchctl kickstart gui/$(id -u)/com.nobumitsu.hlvocab.server >/dev/null 2>&1; sleep 2; }"
do shell script "if [ -d '/Applications/Google Chrome.app' ]; then open -na 'Google Chrome' --args --app=http://localhost:8331/; else open 'http://localhost:8331/'; fi"
EOS
rm -rf "$APPPATH"
osacompile -o "$APPPATH" "$TMP/main.applescript"

# アイコン差し替え
mkdir -p "$TMP/icon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s icons/icon-512.png --out "$TMP/icon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s*2))
  sips -z $d $d icons/icon-512.png --out "$TMP/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/icon.iconset" -o "$APPPATH/Contents/Resources/applet.icns"
touch "$APPPATH"

# Dock に追加（すでにあれば何もしない。exportでUTF-8のまま照合する）
if ! defaults export com.apple.dock - 2>/dev/null | grep -q "ハイライト英単語帳"; then
  defaults write com.apple.dock persistent-apps -array-add '<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>/Applications/ハイライト英単語帳.app</string><key>_CFURLStringType</key><integer>0</integer></dict></dict></dict>'
  killall Dock
fi
rm -rf "$TMP"
echo "✔ /Applications/ハイライト英単語帳.app を作成し、Dock に追加しました"
