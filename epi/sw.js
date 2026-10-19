// Mantém o app abrindo sem internet. Os dados nunca ficam no cache: vêm sempre do banco.
const VERSAO = 'epi-v1';
const ARQUIVOS = ['./', 'index.html', 'app.js', 'pdf.js', 'config.js', 'supabase.js', 'jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js', 'xlsx.mini.min.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('epi-') && k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonte = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonte) return;          // banco de dados: nunca passa pelo cache
  if (!fonte && !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  e.respondWith(fetch(req, fonte ? undefined : { cache: 'no-cache' }).then(res => {
    if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(VERSAO).then(c => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined))));
});
