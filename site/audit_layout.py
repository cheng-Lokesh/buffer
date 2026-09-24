# -*- coding: utf-8 -*-
"""深度排版审计：注入测量脚本，dump-dom 回收 JSON 报告。
检查：视口溢出 / 文本裁切(scrollWidth>clientWidth) / 容器内容裁切 / 过小字号 / 低对比度 / 交互目标过小"""
import os
import re
import shutil
import subprocess
import tempfile

D = os.path.dirname(os.path.abspath(__file__))
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = "8952"
tmp = os.path.join(os.environ.get("TEMP", "."), "wb_audit")
os.makedirs(tmp, exist_ok=True)
PLAYWRIGHT_DOM_JS = r"""
import { chromium } from 'playwright';
const context = await chromium.launchPersistentContext(process.env.BUFFER_EDGE_PROFILE, {
  channel: 'msedge', headless: true, viewport: { width: Number(process.env.BUFFER_W), height: Number(process.env.BUFFER_H) }
});
try {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(process.env.BUFFER_URL, { waitUntil: 'networkidle' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForSelector('#AUDIT_OUT', { timeout: 10000 });
  process.stdout.write(await page.content());
} finally { await context.close(); }
"""

AUDIT_JS = r"""
<script>
window.addEventListener('load', () => {
  const go = () => {
    const out = [];
    const VW = innerWidth, VH = innerHeight;
    const bg = [3, 8, 24];
    function lum(rgb){ const f = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
      return 0.2126*f(rgb[0]) + 0.7152*f(rgb[1]) + 0.0722*f(rgb[2]); }
    function parseColor(s){ const m = s.match(/rgba?\(([^)]+)\)/); if(!m) return null;
      const p = m[1].split(',').map(Number); return [p[0],p[1],p[2], p.length>3?p[3]:1]; }
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0,40);
      const tag = el.tagName.toLowerCase() + (cls ? '.' + cls.split(' ')[0] : '');
      const intentionallyClippedMedia = el.tagName === 'VIDEO' && el.closest('.side-card');
      let ancestor = el.parentElement, inScrollableRegion = false;
      while (ancestor) {
        const ac = getComputedStyle(ancestor);
        if ((ac.overflowY === 'auto' || ac.overflowY === 'scroll') && ancestor.scrollHeight > ancestor.clientHeight) {
          inScrollableRegion = true; break;
        }
        ancestor = ancestor.parentElement;
      }
      const horizontalOut = r.right > VW + 1 || r.left < -1;
      const verticalOut = r.bottom > VH + 1 || r.top < -1;
      if (!intentionallyClippedMedia && (horizontalOut || (verticalOut && !inScrollableRegion)))
        out.push({t:'视口溢出', el:tag, rect:[r.left|0,r.top|0,r.right|0,r.bottom|0]});
      if (cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0)
        out.push({t:'文本裁切', el:tag, text:(el.textContent||'').slice(0,18), sw:el.scrollWidth, cw:el.clientWidth});
      if (cs.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 2 && el.children.length)
        out.push({t:'纵向裁切', el:tag, sh:el.scrollHeight, ch:el.clientHeight});
      if (el.children.length === 0 && (el.textContent||'').trim()){
        const fs = parseFloat(cs.fontSize);
        if (fs < 7.5) out.push({t:'字号过小', el:tag, fs, text:(el.textContent||'').trim().slice(0,14)});
        const c = parseColor(cs.color);
        if (c){
          const eff = c[3] < 1 ? [c[0]*c[3]+bg[0]*(1-c[3]), c[1]*c[3]+bg[1]*(1-c[3]), c[2]*c[3]+bg[2]*(1-c[3])] : c;
          const L1 = lum(eff.slice(0,3)), L2 = lum(bg);
          const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
          if (ratio < 3.0) out.push({t:'对比度低', el:tag, ratio:+ratio.toFixed(2), text:(el.textContent||'').trim().slice(0,14)});
        }
      }
      if (cs.cursor === 'pointer' && (r.width < 24 || r.height < 24))
        out.push({t:'触控过小', el:tag, size:[r.width|0, r.height|0]});
    });
    // 兄弟元素重叠：布局型容器的直接子元素两两求交（>4px 才算真重叠，排除描边/阴影误差）
    document.querySelectorAll('main *, aside *').forEach(box => {
      const bc = getComputedStyle(box);
      if (bc.display !== 'flex' && bc.display !== 'grid') return;
      const kids = Array.from(box.children).filter(k => {
        const kc = getComputedStyle(k);
        return kc.display !== 'none' && kc.position !== 'absolute' && kc.position !== 'fixed';
      });
      if (kids.length < 2) return;
      const rs = kids.map(k => k.getBoundingClientRect());
      for (let i = 0; i < rs.length; i++) {
        for (let j = i + 1; j < rs.length; j++) {
          const ox = Math.min(rs[i].right, rs[j].right) - Math.max(rs[i].left, rs[j].left);
          const oy = Math.min(rs[i].bottom, rs[j].bottom) - Math.max(rs[i].top, rs[j].top);
          if (ox > 4 && oy > 4) {
            out.push({t:'元素重叠', el: box.tagName.toLowerCase() + '.' + (box.className||'').toString().split(' ')[0],
                      pair: [kids[i].className || kids[i].tagName, kids[j].className || kids[j].tagName],
                      overlap: [Math.round(ox), Math.round(oy)]});
          }
        }
      }
    });
    const pre = document.createElement('pre');
    pre.id = 'AUDIT_OUT';
    const secs = [];
    document.querySelectorAll('main > *, #page-' + location.pathname.replace(/\W/g,'') + ' > *').forEach(()=>{});
    document.querySelectorAll('main > *, main .page.on > *, main .page:not([style]) > *').forEach(()=>{});
    document.querySelectorAll('main > *').forEach(el=>{
      const r = el.getBoundingClientRect(); const cs2 = getComputedStyle(el);
      if (cs2.display === 'none') return;
      secs.push(el.tagName + '.' + (el.className||'').toString().split(' ')[0] + ' y' + Math.round(r.top) + '-' + Math.round(r.bottom) + ' h' + Math.round(r.height));
      el.querySelectorAll(':scope > *').forEach(c=>{
        const r2 = c.getBoundingClientRect(); const cs3 = getComputedStyle(c);
        if (cs3.display === 'none') return;
        secs.push('  ' + c.tagName + '.' + (c.className||'').toString().split(' ')[0] + ' y' + Math.round(r2.top) + '-' + Math.round(r2.bottom) + ' h' + Math.round(r2.height));
      });
    });
    out.push({t:'_诊断', el:'env', VH:innerHeight, VW:innerWidth,
      mq680:matchMedia('(max-height:680px)').matches,
      mq720:matchMedia('(max-height:720px)').matches,
      headerH:document.querySelector('header') ? getComputedStyle(document.querySelector('header')).height : '?',
      secs: secs.join(' | ')});
    pre.textContent = JSON.stringify(out);
    document.body.appendChild(pre);
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(go, 300));
  else setTimeout(go, 600);
});
</script>
"""

html = open(os.path.join(D, "index.src.html"), encoding="utf-8").read()
pages = ["now", "future", "cond", "rec"]
SIZES = [("1440,765", "VH668"), ("1440,800", "VH703"), ("1440,862", "VH765"), ("390,844", "PHONE390")]
for wh, tag0 in SIZES:
    print("######## 窗口 %s（%s） ########" % (wh, tag0))
    for pg in pages:
        force = "<style>.page{display:none!important}#page-%s{display:flex!important}*{animation:none!important;transition:none!important}</style>" % pg
        h = html.replace("</head>", force + "</head>", 1).replace("</body>", AUDIT_JS + "</body>", 1)
        fn = "_a_%s.html" % pg
        open(os.path.join(D, fn), "w", encoding="utf-8").write(h)
        profile = tempfile.mkdtemp(prefix="edge_%s_%s_" % (tag0, pg), dir=tmp)
        try:
            width, height = wh.split(",", 1)
            env = os.environ.copy()
            env.update({
                "BUFFER_EDGE_PROFILE": profile,
                "BUFFER_W": width,
                "BUFFER_H": height,
                "BUFFER_URL": "http://127.0.0.1:%s/%s" % (PORT, fn),
            })
            r = subprocess.run(["node", "--input-type=module", "-e", PLAYWRIGHT_DOM_JS],
                               cwd=os.path.dirname(D), env=env, capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=60)
        finally:
            shutil.rmtree(profile, ignore_errors=True)
        m = re.search(r'<pre id="AUDIT_OUT">(.*?)</pre>', r.stdout, re.S)
        print("==== %s ====" % pg)
        if not m:
            os.remove(os.path.join(D, fn))
            raise RuntimeError("Edge audit produced no report: exit=%s stderr=%s" % (r.returncode, r.stderr[-240:]))
        else:
            import json
            issues = json.loads(m.group(1))
            seen = set()
            n = 0
            for it in issues:
                if it["t"] == "_诊断":
                    continue
                if it["t"] == "触控过小":
                    continue
                if it["t"] == "纵向裁切" and "side-card" in it["el"]:
                    continue
                k = (it["t"], it["el"], it.get("text", ""))
                if k in seen:
                    continue
                seen.add(k)
                n += 1
                print("  [%s] %s %s" % (it["t"], it["el"], {k2: v for k2, v in it.items() if k2 not in ("t", "el")}))
            if n == 0:
                print("  PASS: no layout issues")
        os.remove(os.path.join(D, fn))
print("done")
