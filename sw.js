// Mantém o app funcionando sem internet. Ao publicar uma nova versão, troque VERSAO.
const VERSAO = 'rdo-v13';
const ARQUIVOS = ['./', 'index.html', 'rdo-gen.js', 'template.js', 'jszip.min.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('rdo-') && k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonte = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonte) return;
  if (url.pathname.endsWith('version.json')) return;
  // rede primeiro (pega atualizações), cache se estiver sem sinal
  const alvo = fonte ? req : new Request(url.origin + url.pathname, { cache: 'no-cache', credentials: 'same-origin' });
  e.respondWith(fetch(alvo).then(res => {
    if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(VERSAO).then(c => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined))));
});

// ---------- Lembretes (notificações às 10h e 19h, enviadas pela planilha) ----------
const MSG = {
  manha: [
    'Bom dia, chefe! O café já foi, agora só falta o RDO. ☕📋',
    'O concreto cura sozinho. O RDO, não. Bora preencher? 🧱',
    'Obra boa é obra documentada. Separa 5 minutinhos pro RDO de hoje? 💪',
    'Já anotou quem chegou e quais máquinas estão rodando? O RDO agradece. 🚜',
    'Dica do dia: preencher o RDO cedo evita aquele "o que foi que fizeram ontem?" 😅',
    'O cliente pode até esquecer. A medição, nunca. Bora alimentar o RDO! 📏',
    'Choveu? Fez sol? Parou? Conta tudo pro RDO antes que a memória falhe. 🌦️',
    'Um RDO por dia mantém o pleito longe. Partiu? 📑',
    'Fiscal chegando, RDO em dia. Que tal garantir agora? 👷',
    'Produção sem registro é produção que não aconteceu. Lança no RDO! 📊',
    'Você constrói obras. O RDO constrói a sua defesa. Bora! 🛡️',
    'Equipe na frente, app no bolso. Começa o RDO de hoje? 📱'
  ],
  noite: [
    'O dia acabou, mas o RDO ainda está te esperando. Último esforço! 🌙',
    'Antes do sofá, o RDO. Promete que são só 5 minutos. 🛋️',
    'Hoje teve produção? Então merece ir pra planilha! 📈',
    'O RDO de hoje está mais vazio que canteiro em feriado. Bora preencher? 🏗️',
    'Missão final do dia: RDO preenchido e enviado. Você consegue! 🎯',
    'Amanhã você vai agradecer o você de hoje por ter feito o RDO. 🙌',
    'Esqueceu de mim? 🥺 Assinado: o RDO de hoje.',
    'Fecha o dia com chave de ouro: RDO completo e bolinha verde. 🟢',
    'Se não está no RDO, não aconteceu. Registra o que rolou hoje! ✍️',
    'Engenheiro que preenche RDO dorme tranquilo. Boa noite em breve! 😴'
  ],
  feito: [
    'RDO de hoje completo e na planilha. Você é fera! 🏆',
    'Bolinha verde garantida hoje. Pode descansar, engenheiro! 🟢',
    'RDO em dia, consciência tranquila. Mandou bem! 👏',
    'Hoje você ganhou do RDO. Amanhã tem revanche. 😎'
  ]
};
function hojeISO_() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
async function mostrarLembrete_(dados) {
  let feito = false;
  try { const c = await caches.open('status-rdo'); const r = await c.match('status'); if (r) { const j = await r.json(); feito = j.hoje === hojeISO_() && j.completo; } } catch (e) {}
  const h = new Date().getHours();
  const lista = feito ? MSG.feito : (h < 15 ? MSG.manha : MSG.noite);
  const corpo = (dados && dados.corpo) || lista[Math.floor(Math.random() * lista.length)];
  return self.registration.showNotification(feito ? 'RDO em dia ✅' : 'Hora do RDO 📋', {
    body: corpo, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'rdo-lembrete', renotify: true, data: { url: './' }
  });
}
self.addEventListener('push', e => {
  let dados = null; try { dados = e.data ? e.data.json() : null; } catch (err) {}
  e.waitUntil(mostrarLembrete_(dados));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
