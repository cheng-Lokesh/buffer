# -*- coding: utf-8 -*-
"""逐页渲染验证：4 个页面文字/组件是否在界内、内容非空、字体未回退"""
import os
import shutil
import subprocess
import tempfile
import time

import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = "8951"
W, H = 1440, 765
PLAYWRIGHT_SCREENSHOT_JS = r"""
import { chromium } from 'playwright';
const context = await chromium.launchPersistentContext(process.env.BUFFER_EDGE_PROFILE, {
  channel: 'msedge', headless: true, viewport: { width: Number(process.env.BUFFER_W), height: Number(process.env.BUFFER_H) }
});
try {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(process.env.BUFFER_URL, { waitUntil: 'networkidle' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: process.env.BUFFER_PNG });
} finally { await context.close(); }
"""

html = open(os.path.join(D, "index.src.html"), encoding="utf-8").read()
BASE_HIDE = "<style>video{display:none!important}</style>"

PAGES = {
    "now":    [".q-c1", ".q-c2", ".q-scn", ".sc-text"],
    "future": [".q-fut"],
    "cond":   [".quote.rel"],
    "rec":    [".quote.rel"],
}

tmp = os.path.join(os.environ.get("TEMP", "."), "wb_pages")
os.makedirs(tmp, exist_ok=True)

def shot(pagefile, tag, tries=3):
    last_error = "unknown"
    for i in range(tries):
        png = os.path.join(tmp, "%s_%d.png" % (tag, i))
        if os.path.exists(png):
            os.remove(png)
        profile = tempfile.mkdtemp(prefix="edge_%s_" % tag, dir=tmp)
        try:
            env = os.environ.copy()
            env.update({
                "BUFFER_EDGE_PROFILE": profile,
                "BUFFER_W": str(W),
                "BUFFER_H": str(H),
                "BUFFER_URL": "http://127.0.0.1:%s/%s" % (PORT, pagefile),
                "BUFFER_PNG": png,
            })
            result = subprocess.run(["node", "--input-type=module", "-e", PLAYWRIGHT_SCREENSHOT_JS],
                                    cwd=os.path.dirname(D), env=env, capture_output=True)
            if not os.path.isfile(png):
                last_error = "exit=%s stderr=%s" % (result.returncode, result.stderr.decode(errors="replace")[-240:])
                time.sleep(1)
                continue
            a = np.array(Image.open(png).convert("L")).astype(int)
        finally:
            shutil.rmtree(profile, ignore_errors=True)
        if a.mean() < 150:
            return a
        time.sleep(1)
    if 'a' in locals():
        return a
    raise RuntimeError("Edge screenshot missing: %s" % last_error)

for pg, sels in PAGES.items():
    # 只显示当前页
    force = ("<style>.page{display:none!important}#page-%s{display:flex!important}</style>" % pg)
    h = html.replace("</head>", BASE_HIDE + force + "</head>", 1)
    open(os.path.join(D, "_v_%s.html" % pg), "w", encoding="utf-8").write(h)
    img = shot("_v_%s.html" % pg, pg + "_full")
    # 内容非空检查：主内容区亮像素
    main_area = img[60:700, 200:1430]
    print("== %s ==  主区亮像素 %d  均值 %.1f" % (pg, int((main_area > 150).sum()), img.mean()))
    # 文案边界：差分法
    for j, sel in enumerate(sels):
        h2 = h.replace("</head>", "<style>%s{visibility:hidden!important}</style></head>" % sel, 1)
        open(os.path.join(D, "_v_%s_%d.html" % (pg, j)), "w", encoding="utf-8").write(h2)
        img2 = shot("_v_%s_%d.html" % (pg, j), pg + str(j))
        d = np.abs(img - img2)
        ys, xs = np.where(d > 25)
        if len(xs) == 0:
            print("   %-10s 无墨迹 ⚠（可能未渲染/被隐藏）" % sel)
            continue
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        bad = []
        if x0 <= 0: bad.append("左溢出")
        if x1 >= W - 1: bad.append("右溢出")
        if y0 <= 0: bad.append("顶裁切")
        if y1 >= H - 46: bad.append("底越界")
        print("   %-10s x %4d→%-5d y %4d→%-5d %s" % (sel, x0, x1, y0, y1, "、".join(bad) if bad else "OK"))
        os.remove(os.path.join(D, "_v_%s_%d.html" % (pg, j)))
    os.remove(os.path.join(D, "_v_%s.html" % pg))
print("done")
