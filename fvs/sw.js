// Mantém o app funcionando sem internet. Ao publicar uma nova versão, troque VERSAO.
const VERSAO = 'fvs-v6';
const ARQUIVOS = ['./', 'index.html', 'app.js', 'fvs-pdf.js', 'modelos.js', 'logo.js', 'jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js', 'xlsx.mini.min.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'version.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('fvs-') && k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonte = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonte) return;
  if (!fonte && !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  if (url.pathname.endsWith('version.json')) return;
  // rede primeiro (pega atualizações), cache se estiver sem sinal
  // sempre pergunta ao servidor se o arquivo mudou (ignora o cache do navegador)
  e.respondWith(fetch(req, fonte ? undefined : { cache: 'no-cache' }).then(res => {
    if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(VERSAO).then(c => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined))));
});

// ---------- Lembretes (notificações às 10h e 19h, enviadas pelo script da planilha de FVS) ----------
const MSG = {
  pend: [
    'Tem reparo esperando a 2ª verificação. Bora fechar essas pendências? 🔧',
    'Reparo feito é reparo verificado. Passa lá e marca a 2ª verificação! ✅',
    'As pendências não se resolvem sozinhas. Confere os reparos hoje? 👷',
    'Fiscal gosta de FVS fechada. Que tal zerar os reparos pendentes? 📋'
  ],
  abertas: [
    'Tem FVS em aberto. Termina de marcar os itens e gera o PDF? 📄',
    'Serviço executado, ficha verificada. Fecha as FVS de hoje? 🏗️',
    'Qualidade que não está na FVS não aparece na % de aprovação. Bora lançar! 📊',
    'Antes de liberar a próxima etapa, confere a FVS. Segurança e qualidade! 🦺'
  ],
  ok: [
    'Nenhuma pendência nas FVS. Qualidade em dia! 🏆',
    'Todas as FVS fechadas. Pode liberar a próxima etapa tranquilo. 🟢',
    'FVS em dia e na planilha. Mandou bem! 👏'
  ]
};
async function mostrarLembrete_(dados) {
  let st = null;
  try { const c = await caches.open('status-fvs'); const r = await c.match('status'); if (r) st = await r.json(); } catch (e) {}
  const pend = st ? st.pend : 0, abertas = st ? st.abertas : 0;
  const lista = pend ? MSG.pend : (abertas ? MSG.abertas : MSG.ok);
  let corpo = (dados && dados.corpo) || lista[Math.floor(Math.random() * lista.length)];
  if (!(dados && dados.corpo) && (pend || abertas)) corpo = (pend ? pend + (pend > 1 ? ' reparos pendentes' : ' reparo pendente') : abertas + (abertas > 1 ? ' FVS em aberto' : ' FVS em aberto')) + '. ' + corpo;
  return self.registration.showNotification(pend ? 'FVS: reparos pendentes 🔧' : (abertas ? 'FVS em aberto 📋' : 'FVS em dia ✅'), {
    body: corpo, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'fvs-lembrete', renotify: true, data: { url: './' }
  });
}
self.addEventListener('push', e => {
  let dados = null; try { dados = e.data ? e.data.json() : null; } catch (err) {}
  e.waitUntil(mostrarLembrete_(dados));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c && c.url.indexOf('/fvs/') >= 0) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
