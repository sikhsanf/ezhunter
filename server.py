"""Tiny static server for Ashen Wilds. Sends no-cache headers so edits always show up on reload.

    python server.py            -> http://localhost:5173 (this PC only)
    python server.py --lan      -> also reachable from phones/tablets on the same Wi-Fi
"""
import http.server
import os
import sys

PORT = 5173


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".webmanifest": "application/manifest+json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    host = "0.0.0.0" if "--lan" in sys.argv else "127.0.0.1"
    with http.server.ThreadingHTTPServer((host, PORT), Handler) as httpd:
        print(f"Ashen Wilds running at http://localhost:{PORT}")
        httpd.serve_forever()
