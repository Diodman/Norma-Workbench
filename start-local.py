#!/usr/bin/env python3
"""Serve the bundled app on loopback using only the Python standard library."""
import argparse
import functools
import http.server
import json
from pathlib import Path
import socket
import sys
import threading
import urllib.parse
import webbrowser

ROOT = Path(__file__).resolve().parent / 'app'


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8', '.jsonld': 'application/ld+json; charset=utf-8',
        '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
        '.svg': 'image/svg+xml', '.woff2': 'font/woff2'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def do_GET(self):
        self._serve(False)

    def do_HEAD(self):
        self._serve(True)

    def _serve(self, head_only):
        try:
            decoded = urllib.parse.unquote(self.path.split('?', 1)[0], errors='strict').replace('\\', '/')
            if '\x00' in decoded:
                raise ValueError('Bad path')
            target = (ROOT / decoded.lstrip('/')).resolve()
            target.relative_to(ROOT.resolve())
        except (ValueError, UnicodeError):
            self.send_error(403)
            return
        if decoded == '/__norma_status':
            body = json.dumps({'app': 'norma-workbench-local', 'version': '1.0.0'}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if not head_only:
                self.wfile.write(body)
            return
        if target.is_dir() and target != ROOT.resolve():
            self.send_error(404)
            return
        if head_only:
            super().do_HEAD()
        else:
            super().do_GET()

    def do_POST(self):
        self.send_error(405)

    do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_POST


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(5)
        return connection, address


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4267)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port must be between 1 and 65535')
    if not (ROOT / 'index.html').is_file():
        raise SystemExit('The app folder is missing. Extract the entire ZIP first.')
    try:
        server = Server(('127.0.0.1', args.port), functools.partial(Handler, directory=str(ROOT)))
    except OSError as error:
        raise SystemExit('Cannot start local server. Close the previous Norma window or try --port 4268.\n' + str(error))
    url = 'http://127.0.0.1:{}/'.format(args.port)
    print('\nNorma Workbench\n' + url + '\nKeep this window open. Press Ctrl+C to stop.\n', flush=True)
    if not args.no_browser:
        threading.Timer(0.2, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
