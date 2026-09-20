// Serve only the two built, simulated demo apps on loopback. No dependencies.
import {createServer} from 'node:http';
import {existsSync, createReadStream, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const repo = fileURLToPath(new URL('../', import.meta.url));
const apps = [
  {name:'Flutter', port:4173, root:resolve(repo,'packages/flutter/example/build/web')},
  {name:'React Native', port:4174, root:resolve(repo,'packages/react-native/example/dist')},
];
const mime = {'.html':'text/html', '.js':'application/javascript', '.json':'application/json',
  '.css':'text/css', '.wasm':'application/wasm', '.png':'image/png', '.svg':'image/svg+xml',
  '.woff2':'font/woff2', '.ttf':'font/ttf', '.ico':'image/x-icon'};
for (const app of apps) {
  if (!existsSync(resolve(app.root,'index.html'))) {
    throw new Error('Build '+app.name+' first; see docs/preview/README.md');
  }
}
const servers = [];
for (const app of apps) {
  const server = createServer((req,res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(app.root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(app.root + sep) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404); res.end('Not found'); return;
      }
      res.writeHead(200, {'Content-Type':mime[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
      const stream = createReadStream(file);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch { res.writeHead(400); res.end('Bad request'); }
  });
  server.on('error', error => { console.error(error.message); process.exit(1); });
  server.listen(app.port,'127.0.0.1',()=>console.log(app.name+' preview: http://127.0.0.1:'+app.port));
  servers.push(server);
}
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{
  for (const server of servers) server.close();
});
