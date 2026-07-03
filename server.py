#!/usr/bin/env python3
# ハイライト英単語帳 — 常駐ローカルサーバ（標準ライブラリのみ・127.0.0.1限定）
#
#   静的配信 : このフォルダ（アプリ本体）を http://localhost:8331 で配信
#   受け取りAPI:
#     GET /api/add?w=WORD[&context=..][&source=..][&fmt=txt]
#         → 受信箱(inbox)に追記し、内蔵辞書の訳を返す
#     GET /api/inbox          → 未取り込みの単語リスト(JSON)
#     GET /api/clear?upto=TS  → ts<=TS の項目を削除（アプリが取り込み後に呼ぶ）
#     GET /api/status         → 稼働確認
#
# 受信箱は ~/Library/Application Support/hlvocab/inbox.json
# （Desktop の TCC 制限を避けるため、データはこちらに置く）

import json
import os
import re
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get('HLVOCAB_PORT', '8331'))
APP = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.expanduser('~/Library/Application Support/hlvocab')
INBOX = os.path.join(DATA_DIR, 'inbox.json')
os.makedirs(DATA_DIR, exist_ok=True)

LOCK = threading.Lock()

# ---------------- 辞書（dict.js を起動時にパース） ----------------
DICT = None
IRREG = {
 'went':'go','gone':'go','did':'do','done':'do','was':'be','were':'be','been':'be','is':'be','are':'be','am':'be',
 'has':'have','had':'have','having':'have','said':'say','made':'make','took':'take','taken':'take','came':'come',
 'got':'get','gotten':'get','gave':'give','given':'give','found':'find','thought':'think','told':'tell',
 'became':'become','shown':'show','left':'leave','felt':'feel','brought':'bring','began':'begin','begun':'begin',
 'kept':'keep','held':'hold','wrote':'write','written':'write','stood':'stand','heard':'hear','meant':'mean',
 'met':'meet','ran':'run','paid':'pay','sat':'sit','spoke':'speak','spoken':'speak','led':'lead','grew':'grow',
 'grown':'grow','lost':'lose','fell':'fall','fallen':'fall','sent':'send','built':'build','understood':'understand',
 'drew':'draw','drawn':'draw','broke':'break','broken':'break','spent':'spend','rose':'rise','risen':'rise',
 'drove':'drive','driven':'drive','bought':'buy','wore':'wear','worn':'wear','chose':'choose','chosen':'choose',
 'ate':'eat','eaten':'eat','knew':'know','known':'know','saw':'see','seen':'see','sought':'seek','taught':'teach',
 'caught':'catch','fought':'fight','flew':'fly','flown':'fly','threw':'throw','thrown':'throw','laid':'lay',
 'slept':'sleep','woke':'wake','woken':'wake','forgot':'forget','forgotten':'forget','children':'child','men':'man',
 'women':'woman','feet':'foot','teeth':'tooth','mice':'mouse','people':'person','better':'good','best':'good',
 'worse':'bad','worst':'bad','lives':'life','knives':'knife','leaves':'leaf','selves':'self','wives':'wife',
 'halves':'half','shelves':'shelf','lying':'lie','dying':'die','tying':'tie',
}


def load_dict():
    global DICT
    if DICT is not None:
        return DICT
    DICT = {}
    try:
        with open(os.path.join(APP, 'dict.js'), encoding='utf-8') as f:
            for line in f:
                if line.startswith('window.EJDICT_RAW='):
                    raw = json.loads(line[len('window.EJDICT_RAW='):].rstrip().rstrip(';'))
                    for ln in raw.split('\n'):
                        t = ln.find('\t')
                        if t > 0:
                            DICT[ln[:t]] = ln[t + 1:]
                    break
    except Exception:
        pass
    return DICT


def lemma_candidates(w):
    out = [w]
    if w in IRREG:
        out.append(IRREG[w])
    if w.endswith("'s"):
        out.append(w[:-2])
    if w.endswith("s'"):
        out.append(w[:-1])
    if w.endswith('ies'):
        out.append(w[:-3] + 'y')
    for suf, rep in (('ied', 'y'), ('ier', 'y'), ('iest', 'y'), ('ily', 'y')):
        if w.endswith(suf):
            out.append(w[:-len(suf)] + rep)
    if w.endswith('es'):
        out += [w[:-2], w[:-1]]
    elif w.endswith('s') and not w.endswith('ss'):
        out.append(w[:-1])
    if w.endswith('ing'):
        b = w[:-3]
        out += [b, b + 'e']
        if len(b) > 2 and b[-1] == b[-2]:
            out.append(b[:-1])
    if w.endswith('ed'):
        b = w[:-2]
        out += [b, w[:-1]]
        if len(b) > 2 and b[-1] == b[-2]:
            out.append(b[:-1])
    if w.endswith('est'):
        out += [w[:-3], w[:-2]]
    elif w.endswith('er'):
        out += [w[:-2], w[:-1]]
    if w.endswith('ly'):
        out.append(w[:-2])
    seen, res = set(), []
    for c in out:
        if c and c not in seen:
            seen.add(c)
            res.append(c)
    return res


def related_candidates(w):
    """辞書に無い派生語 → 関連語の候補（anesthesiologist → anesthesiology 等）"""
    tries = []
    m = re.match(r'^(.*?)ists?$', w)
    if m:
        tries += [m.group(1) + 'y', m.group(1) + 'ism', m.group(1), m.group(1) + 'e']
    m = re.match(r'^(.*?)isms?$', w)
    if m:
        tries += [m.group(1), m.group(1) + 'y', m.group(1) + 'e']
    m = re.match(r'^(.*?)tions?$', w)
    if m:
        tries += [m.group(1) + 'te', m.group(1) + 't', m.group(1)]
    m = re.match(r'^(.*?)sions?$', w)
    if m:
        tries += [m.group(1) + 'de', m.group(1) + 'se', m.group(1) + 'd', m.group(1) + 't']
    if w.endswith('ally'):
        tries += [w[:-2], w[:-4]]
    if w.endswith('ness'):
        tries.append(w[:-4])
    m = re.match(r'^(.*?)ments?$', w)
    if m:
        tries.append(m.group(1))
    if w.endswith('ities'):
        tries.append(w[:-5] + 'y')
    if w.endswith('ity'):
        tries += [w[:-3] + 'e', w[:-3], w[:-3] + 'ous']
    if w.endswith('ive'):
        tries += [w[:-3] + 'e', w[:-3]]
    if w.endswith('ful') or w.endswith('less'):
        tries.append(re.sub(r'(ful|less)$', '', w))
    if w.endswith('able') or w.endswith('ible'):
        tries += [w[:-4], w[:-4] + 'e']
    m = re.match(r'^(.*?)ences?$', w)
    if m:
        tries.append(m.group(1) + 'ent')
    m = re.match(r'^(.*?)ances?$', w)
    if m:
        tries.append(m.group(1) + 'ant')
    if w.endswith('ency'):
        tries.append(w[:-4] + 'ent')
    if w.endswith('ancy'):
        tries.append(w[:-4] + 'ant')
    return [t for t in tries if t and len(t) > 2]


def lookup(word):
    """(見出し語, 訳) を返す。見つからなければ (None, '')"""
    d = load_dict()
    w = word.lower().replace('’', "'").strip()
    if ' ' in w:  # フレーズは完全一致のみ
        w = re.sub(r'\s+', ' ', w)
        return (w, d[w]) if w in d else (None, '')
    for c in lemma_candidates(w):
        if c in d:
            return (c, d[c])
    for c in related_candidates(w):
        if c in d:
            return (None, '(関連語 %s) %s' % (c, d[c]))
    return (None, '')


# ---------------- 受信箱 ----------------
def inbox_read():
    try:
        with open(INBOX, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def inbox_write(items):
    tmp = INBOX + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    os.replace(tmp, INBOX)


# ---------------- HTTP ----------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP, **kw)

    def log_message(self, fmt, *args):  # 静かに
        pass

    def _send(self, code, body, ctype='application/json; charset=utf-8'):
        data = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith('/api/'):
            return super().do_GET()

        def fixenc(s):
            # 生のUTF-8バイトがURLに来た場合(latin-1として届く)の救済
            try:
                return s.encode('latin-1').decode('utf-8')
            except (UnicodeEncodeError, UnicodeDecodeError):
                return s
        q = {k: fixenc(v[0]) for k, v in urllib.parse.parse_qs(parsed.query).items()}

        if parsed.path == '/api/status':
            return self._send(200, json.dumps({'ok': True, 'app': 'hlvocab', 'time': int(time.time())}))

        if parsed.path == '/api/add':
            w = re.sub(r'\s+', ' ', q.get('w', '')).strip()[:80]
            if not w or not re.search(r'[A-Za-z]', w):
                return self._send(400, json.dumps({'ok': False, 'error': 'no word'}))
            key, gloss = lookup(w)
            item = {
                'word': w, 'key': key or w.lower(), 'gloss': gloss,
                'context': q.get('context', '')[:300], 'source': q.get('source', '')[:100],
                'ts': int(time.time() * 1000),
            }
            with LOCK:
                items = inbox_read()
                if not any(x.get('key') == item['key'] for x in items):
                    items.append(item)
                    inbox_write(items)
            if q.get('fmt') == 'txt':
                g = gloss.replace('/', '、')[:80] if gloss else '(辞書に無い語。アプリで訳を入力)'
                return self._send(200, (item['key'] + '\t' + g), 'text/plain; charset=utf-8')
            return self._send(200, json.dumps({'ok': True, 'word': item['key'], 'gloss': gloss}, ensure_ascii=False))

        if parsed.path == '/api/inbox':
            with LOCK:
                items = inbox_read()
            return self._send(200, json.dumps({'items': items}, ensure_ascii=False))

        if parsed.path == '/api/clear':
            upto = int(q.get('upto', '0') or 0)
            with LOCK:
                items = [x for x in inbox_read() if x.get('ts', 0) > upto]
                inbox_write(items)
            return self._send(200, json.dumps({'ok': True, 'left': len(items)}))

        return self._send(404, json.dumps({'ok': False, 'error': 'unknown api'}))


def main():
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    threading.Thread(target=load_dict, daemon=True).start()  # 辞書は裏で先読み
    srv.serve_forever()


if __name__ == '__main__':
    main()
