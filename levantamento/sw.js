// Mantém o app funcionando sem internet. Ao publicar uma nova versão, troque VERSAO (e o version.json).
const VERSAO = 'lev-v3';
const ARQUIVOS = ['./', 'index.html', 'app.js', 'modelos.js', 'relatorio.js', 'jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js', 'jszip.min.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('lev-') && k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonte = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonte) return;
  if (!fonte && !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  if (url.pathname.endsWith('version.json')) return;
  // rede primeiro (pega atualizações), cache se estiver sem sinal
  e.respondWith(fetch(req, fonte ? undefined : { cache: 'no-cache' }).then(res => {
    if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(VERSAO).then(c => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined))));
});
