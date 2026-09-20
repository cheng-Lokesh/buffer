# -*- coding: utf-8 -*-
"""收集全部手写文案字符 -> 重新下载字体子集到 assets/ -> 重建 index.html（字体内联）"""
import base64
import io
import os
import re
import urllib.parse
import urllib.request

from fontTools.ttLib import TTFont

D = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(D, "assets")

src = open(os.path.join(D, "index.src.html"), encoding="utf-8").read()
chars = set()
for m in re.finditer(r'class="[^"]*(?:quote|sc-text)[^"]*"[^>]*>(.*?)</div>', src, re.S):
    chars |= set(re.sub(r"<[^>]+>", "", m.group(1)))
chars = {c for c in chars if c.strip()}
TEXT = "".join(sorted(chars))
print("手写文案不重复字符 %d 个" % len(chars))

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}
FONTS = [
    ("LongCang", "Long Cang"),
    ("ZCOOLXW", "ZCOOL XiaoWei"),
    ("LXGWLight", "LXGW WenKai TC:wght@300"),
    ("LXGWWenKai", "LXGW WenKai TC"),
    ("ZhiMangXing", "Zhi Mang Xing"),
    ("LiuJianMaoCao", "Liu Jian Mao Cao"),
    ("mashanzheng", "Ma Shan Zheng"),
]

for out, fam in FONTS:
    url = ("https://fonts.googleapis.com/css2?family=" + urllib.parse.quote(fam)
           + "&text=" + urllib.parse.quote(TEXT) + "&display=swap")
    css = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode()
    m = re.search(r"url\((https://[^)]+)\)", css)
    data = urllib.request.urlopen(m.group(1), timeout=60).read()
    cmap = set(TTFont(io.BytesIO(data)).getBestCmap().keys())
    miss = sorted(c for c in chars if ord(c) not in cmap)
    if miss:
        raise SystemExit("%s 缺字: %s" % (out, "".join(miss)))
    open(os.path.join(A, out + ".woff2"), "wb").write(data)
    print("  OK %-14s %5.1f KB 覆盖完整" % (out, len(data) / 1024))

# 重建 index.html：把 6 个外链字体内联成 base64（MaShanZheng 保持外链，与历史一致）
out = src
count = 0
def inline(mo):
    global count
    fname = mo.group(1)
    p = os.path.join(A, fname)
    if not os.path.exists(p):
        return mo.group(0)
    if fname == "mashanzheng.woff2":
        return mo.group(0)
    count += 1
    b64 = base64.b64encode(open(p, "rb").read()).decode()
    return "src:url(data:font/woff2;base64,%s) format('woff2')" % b64

out = re.sub(r"src:url\('assets/([A-Za-z0-9_]+\.woff2)'\) format\('woff2'\)", inline, out)
open(os.path.join(D, "index.html"), "w", encoding="utf-8").write(out)
print("已内联 %d 个字体 -> index.html (%.1f KB)" % (count, len(out) / 1024))
