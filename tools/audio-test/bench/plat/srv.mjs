import http from 'http';import fs from 'fs';
const iso=process.argv[3]==='iso';
http.createServer((q,s)=>{const u=q.url.split('?')[0].slice(1)||'parent.html';
 if(!fs.existsSync(u)){s.writeHead(404);return s.end()}
 const h={'content-type':u.endsWith('.js')?'text/javascript':'text/html'};
 if(iso){h['Cross-Origin-Opener-Policy']='same-origin';h['Cross-Origin-Embedder-Policy']='require-corp'}
 s.writeHead(200,h);s.end(fs.readFileSync(u))}).listen(+process.argv[2]);
