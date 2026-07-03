# ハイライト英単語帳 (highlight-vocab)

英文（貼り付け / PDF / テキストファイル）を読みながら、知らない単語に
マウスオーバーで意味を表示 → クリックで単語帳に追加 → SM-2 間隔反復で復習する PWA。
さらに **Macのどこで選択した単語でも**（Chrome・プレビューのPDF・メール等）、
アプリを開かずに右クリック→「単語帳に追加」で取り込める。

- 起動ポート: **8331**（`start.command`。`セットアップ.command` 実行後はログイン時に常駐）
- プレビュー検証用ポート: **8332**（`/tmp/hlvocab-preview` に server.py ごとコピーして配信）
- 辞書: EJDict-hand（CC0 / パブリックドメイン、約4.6万語）を `dict.js` に内蔵（完全オフライン動作）
- PDF: pdf.js（Apache-2.0）を `lib/` に同梱
- オンライン時のみ: Free Dictionary API（発音記号・例文）、Datamuse（コロケーション）を自動取得
- データ保存: すべて端末内 localStorage（設定タブからバックアップ書き出し/読み込み）

## 構成
- `index.html` — アプリ本体（単一HTML）
- `dict.js` — 内蔵英和辞書 + 基礎語リスト
- `sw.js` — Service Worker（**中身を変えたら CACHE 版数 `hlvocab-vN` を必ず上げる**）
- `manifest.webmanifest` / `icons/`
- `lib/pdf.min.js`, `lib/pdf.worker.min.js`
- `server.py` — 常駐ローカルサーバ（静的配信＋受信箱API `/api/add|inbox|clear|status`、127.0.0.1限定）
- `セットアップ.command` — Mac連携の一括セットアップ（LaunchAgent登録＋クイックアクション登録）
- `macos/` — クイックアクション `単語帳に追加.workflow` と LaunchAgent plist の原本
- `chrome-extension/` — Chrome拡張（選択→＋単語帳ボタン / Option+ホバー辞書 / 右クリックメニュー）

## Mac「どこでも追加」の仕組み
1. `セットアップ.command` が、アプリ一式を `~/Library/Application Support/hlvocab/app` にミラーし、
   そこから server.py を LaunchAgent（`com.nobumitsu.hlvocab.server`、KeepAlive）で常駐させる。
   **launchd の python は TCC で ~/Desktop を読めない**ため、Desktop 直起動は不可（既知の落とし穴）。
   → **アプリのファイルを更新したら `セットアップ.command` を再実行**（ミラー更新＋再起動）。
2. 追加経路（すべて `curl localhost:8331/api/add` に集約、通知に訳を表示）
   - **ダブルコピー**: server.py が `macos/clipwatch.js`（JXA、クリップボードの changeCount 監視）を
     子プロセスとして起動。英単語/短フレーズを0.9秒以内に2回コピーすると追加。誤発火防止の
     フィルタ（英字のみ・6語以下・80字以下・1.8秒クールダウン）つき。無効化は環境変数 `HLVOCAB_CLIP=0`。
   - **⌘⇧E / 右クリック→サービス→「単語帳に追加」**: `~/Library/Services/単語帳に追加.workflow`。
     ショートカットは `defaults write pbs NSServicesStatus` で登録（アプリによっては再起動後に有効）。
   - **Chrome拡張**: 選択で「＋単語帳」ボタン、右クリック最上部メニュー、Option+ホバー辞書。
3. 受信箱は `~/Library/Application Support/hlvocab/inbox.json`
4. アプリ（localhost:8331）を開くと `/api/inbox` から自動取り込み → SM-2 の新規カードに
5. 辞書は拡張内にも同梱（Option+ホバー用）。**dict.js を更新したら `chrome-extension/dict.js` にもコピー**すること

## 主な機能
1. **リーダー**: 単語ホバーで即時辞書表示、クリックで追加（出てきた文を例文として自動保存）。
   フレーズはドラッグ選択で追加。追加済みの単語は本文中で黄色ハイライト。
2. **単語帳**: 訳・使い方・例文を編集可能。オンラインなら自動取得ボタンあり。
3. **復習**: SM-2。英→和に合格すると翌日から和→英が解放される2方向学習。4択クイックテストつき。
4. **どこからでも追加**: 設定タブのブックマークレットで、任意のWebページから選択した単語を追加。
