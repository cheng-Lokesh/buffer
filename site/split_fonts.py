# -*- coding: utf-8 -*-
"""把 index.html 内嵌的 base64 字体抽成 assets/*.woff2，产出可读源码版 index.src.html。
index.html 保持不变（线上部署用的自包含版）。
"""
import base64
import os
import re

D = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(D, "assets")
html = open(os.path.join(D, "index.html"), encoding="utf-8").read()

pat = re.compile(r"(@font-face\s*\{[^}]*?font-family:\s*'([^']+)'[^}]*?src:\s*url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\)[^}]*?\})", re.S)

out = html
n = 0
for block, fam, b64 in pat.findall(html):
    data = base64.b64decode(b64)
    fn = fam + ".woff2"
    open(os.path.join(A, fn), "wb").write(data)
    new = re.sub(r"src:\s*url\(data:font/woff2;base64,[A-Za-z0-9+/=]+\)\s*(?:format\('woff2'\)\s*)?",
                 "src:url('assets/%s') format('woff2')" % fn, block)
    new = new.replace("format('woff2') format('woff2')", "format('woff2')")
    out = out.replace(block, new)
    n += 1
    print("  抽出 %-16s %6.1f KB -> assets/%s" % (fam, len(data) / 1024, fn))

open(os.path.join(D, "index.src.html"), "w", encoding="utf-8").write(out)
print("\n共处理 %d 个内嵌字体" % n)
print("index.html      %6.1f KB  (自包含，部署用)" % (len(html) / 1024))
print("index.src.html  %6.1f KB  (可读源码版)" % (len(out) / 1024))
