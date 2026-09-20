# -*- coding: utf-8 -*-
"""从 index.src.html 重建 index.html（仅内联字体，不重新下载）"""
import base64
import os
import re

D = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(D, "assets")
src = open(os.path.join(D, "index.src.html"), encoding="utf-8").read()

count = 0
def inline(mo):
    global count
    fname = mo.group(1)
    if fname == "mashanzheng.woff2":
        return mo.group(0)
    p = os.path.join(A, fname)
    if not os.path.exists(p):
        raise SystemExit("缺字体文件: " + fname)
    count += 1
    return "src:url(data:font/woff2;base64,%s) format('woff2')" % base64.b64encode(open(p, "rb").read()).decode()

out = re.sub(r"src:url\('assets/([A-Za-z0-9_]+\.woff2)'\) format\('woff2'\)", inline, src)
open(os.path.join(D, "index.html"), "w", encoding="utf-8").write(out)
print("内联 %d 个字体 -> index.html (%.1f KB)" % (count, len(out) / 1024))
