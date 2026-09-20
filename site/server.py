# -*- coding: utf-8 -*-
"""
带防缓存 + Range 支持的本地静态服务

解决两个实际问题：
1. 「外部浏览器看到的还是旧版本」→ HTML 发 no-store，每次刷新取最新；
   视频/图片/字体缓存 1 天，避免反复加载几十 MB 的视频。
2. 「大视频要整份下载、不能拖动」→ 实现 HTTP Range（206），
   浏览器可流式边下边播、可 seek。

用法： python server.py [端口]    默认 8899
"""
import http.server
import os
import socketserver
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899

NO_CACHE_EXT = ('.html', '.htm', '.css', '.js', '.json', '.mjs')


class _LimitedReader:
    """把文件对象包装成"最多只读 n 字节"，供 Range 响应使用"""

    def __init__(self, fp, remaining):
        self.fp = fp
        self.remaining = remaining

    def read(self, size=-1):
        if self.remaining <= 0:
            return b''
        if size is None or size < 0 or size > self.remaining:
            size = self.remaining
        data = self.fp.read(size)
        self.remaining -= len(data)
        return data

    def close(self):
        self.fp.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        path = self.path.split('?')[0].split('#')[0].lower()
        if path.endswith(NO_CACHE_EXT) or path.endswith('/'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        else:
            self.send_header('Cache-Control', 'public, max-age=86400')
        super().end_headers()

    def send_head(self):
        rng = self.headers.get('Range')
        if not rng or not rng.startswith('bytes='):
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()

        size = os.path.getsize(path)
        try:
            spec = rng.split('=', 1)[1].split(',')[0].strip()
            s, _, e = spec.partition('-')
            start = int(s) if s else 0
            end = int(e) if e else size - 1
        except Exception:
            return super().send_head()
        if start >= size:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        end = min(end, size - 1)

        fp = open(path, 'rb')
        try:
            fp.seek(start)
            self.send_response(206)
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.send_header('Content-Length', str(end - start + 1))
            self.end_headers()
            return _LimitedReader(fp, end - start + 1)
        except Exception:
            fp.close()
            raise

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    # 不启用 SO_REUSEADDR：Windows 下它允许同一端口被多个进程重复绑定，
    # 会导致请求被随机分配甚至拿到旧进程的内容。宁可启动失败也不要双绑。
    allow_reuse_address = False
    daemon_threads = True


with Server(('127.0.0.1', PORT), Handler) as httpd:
    print(f'serving {DIR} at http://127.0.0.1:{PORT}/index.html  (html no-cache, range ok)', flush=True)
    httpd.serve_forever()
