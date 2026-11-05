#!/bin/bash
# Abre PULSO Breath en http://localhost:8091
# (desde localhost el navegador recuerda los permisos de micrófono y cámara).
cd "$(dirname "$0")"
PORT=8091
URL="http://localhost:$PORT/"
echo ""
echo "  PULSO · Breath  →  $URL"
echo "  Para cerrarla, pulsa Ctrl + C o cierra esta ventana."
echo ""
if command -v node >/dev/null 2>&1; then
  (sleep 1; open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL") &
  node -e "
const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();
const T={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
http.createServer((q,r)=>{let p=decodeURIComponent(new URL(q.url,'http://x').pathname);if(p==='/')p='/index.html';const f=path.normalize(path.join(root,p));
if(!f.startsWith(root)){r.writeHead(403);return r.end();}fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end('No encontrado');}r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});r.end(d);});
}).listen($PORT,'127.0.0.1');"
elif [ -x /usr/bin/python3 ] && /usr/bin/xcode-select -p >/dev/null 2>&1; then
  (sleep 1; open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL") &
  /usr/bin/python3 -m http.server $PORT --bind 127.0.0.1
else
  echo "  No se ha encontrado Node.js. Se abre el archivo directamente:"
  echo "  funcionará, pero el navegador te pedirá permisos cada vez."
  echo "  Para evitarlo, instala Node.js desde https://nodejs.org"
  open -a "Google Chrome" "index.html" 2>/dev/null || open "index.html"
fi
