/**
 * RDO -> Google Sheets
 * Cole este código em: Planilha > Extensões > Apps Script (apague o que estiver lá).
 * Depois: Implantar > Nova implantação > App da Web
 *   Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 * Copie o endereço que termina em /exec e cole no app (aba Obra > Google Sheets).
 *
 * Cada envio regrava os dados daquela obra + data (não duplica se enviar de novo).
 *
 * FVS: o app de FVS usa este mesmo script e o mesmo login. Adicione o arquivo FVS.gs
 * (Arquivos > + > Script > nome FVS) com o código de google-sheets/FVS.gs.
 *
 * LEMBRETES (notificações às 10h e 19h): depois de colar o código, escolha a função
 * "instalarLembretes" na barra de cima, clique em Executar e autorize.
 * Depois: Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar.
 *
 * USUÁRIOS: na aba "Usuarios" da planilha, cadastre uma linha por pessoa:
 *   Usuario | Senha | Nome | Ativo (Sim/Não)
 * A senha digitada é trocada automaticamente por uma versão embaralhada (hash) no primeiro login.
 * Para tirar o acesso de alguém, mude "Ativo" para Não. Sem login, o app não envia nada.
 */

var ABAS = {
  Dias:         ['Obra', 'Data', 'RDO_N', 'Dia_semana', 'Efetivo_total', 'Equipamentos_total', 'Chuva_mm', 'Horas_paradas', 'Servicos_com_producao', 'Dia_paralisado', 'Atualizado_em', 'Preenchido_por'],
  Producao:     ['Obra', 'Data', 'Empresa', 'Servico', 'Unidade', 'Producao'],
  Efetivo:      ['Obra', 'Data', 'Empresa', 'Funcao', 'Quantidade'],
  Equipamentos: ['Obra', 'Data', 'Equipamento', 'Quantidade', 'Frente_obs'],
  Clima:        ['Obra', 'Data', 'Periodo', 'Condicao', 'Status', 'Observacao']
};

function doGet(e) {
  if (e && e.parameter && e.parameter.acao === 'vapid') return json_({ ok: true, vapid: chaves_().pub });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ABAS).forEach(function (nome) { aba_(ss, nome); });
  abaUsuarios_(ss);
  return json_({ ok: true, planilha: ss.getName(), login: true });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.acao === 'login') return json_(login_(body));
    var quem = sessao_(body.token);
    if (!quem) return json_({ ok: false, codigo: 'nao_autorizado', erro: 'Faça login novamente.' });
    if (body.acao === 'sessao') return json_({ ok: true, usuario: quem.usuario, nome: quem.nome });
    if (body.acao === 'sair') { PropertiesService.getScriptProperties().deleteProperty('S_' + body.token); return json_({ ok: true }); }
    if (body.acao === 'assinar') return json_(assinar_(body, quem));
    if (body.acao === 'testar') return json_({ ok: true, enviados: enviarLembrete_() });
    if (body.acao === 'fvs') return json_(fvsReceber_(body, quem));   // app de FVS (arquivo FVS.gs)
    var dias = body.dias || [];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(ABAS).forEach(function (nome) {
      var novos = [];
      dias.forEach(function (d) {
        (d.tabelas[nome] || []).forEach(function (linha) {
          var l = [d.obra, data_(d.data)].concat(linha);
          if (nome === 'Dias') { var iA = ABAS.Dias.indexOf('Atualizado_em'); l[iA] = new Date(Number(l[iA]) || Date.now()); l[iA + 1] = quem.nome || quem.usuario; }
          novos.push(l);
        });
      });
      regravar_(ss, nome, dias, novos);
    });
    return json_({ ok: true, dias: dias.map(function (d) { return d.data; }) });
  } catch (err) {
    return json_({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function aba_(ss, nome) {
  var sh = ss.getSheetByName(nome);
  var cab = ABAS[nome];
  if (!sh) sh = ss.insertSheet(nome);
  if (sh.getLastRow() === 0 || sh.getRange(1, cab.length).getValue() !== cab[cab.length - 1]) {
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// apaga as linhas das obras+datas enviadas e grava as novas no lugar
function regravar_(ss, nome, dias, novos) {
  var sh = aba_(ss, nome);
  var cab = ABAS[nome], n = cab.length;
  var chaves = {};
  dias.forEach(function (d) { chaves[d.obra + '|' + d.data] = true; });
  var ultima = sh.getLastRow();
  var manter = [];
  if (ultima > 1) {
    manter = sh.getRange(2, 1, ultima - 1, n).getValues().filter(function (l) {
      return !chaves[String(l[0]) + '|' + iso_(l[1])];
    });
    sh.getRange(2, 1, ultima - 1, n).clearContent();
  }
  var todas = manter.concat(novos.map(function (l) {
    var x = l.slice(0, n); while (x.length < n) x.push('');
    return x;
  }));
  todas.sort(function (a, b) { return (a[1] - b[1]) || String(a[0]).localeCompare(String(b[0])); });
  if (todas.length) {
    sh.getRange(2, 1, todas.length, n).setValues(todas);
    sh.getRange(2, 2, todas.length, 1).setNumberFormat('dd/mm/yyyy');
    if (nome === 'Dias') sh.getRange(2, ABAS.Dias.indexOf('Atualizado_em') + 1, todas.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  }
}

function data_(iso) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function iso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }


// ===================== USUÁRIOS E LOGIN =====================
var CAB_USUARIOS = ['Usuario', 'Senha', 'Nome', 'Ativo'];
var DIAS_SESSAO = 90;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('RDO')
    .addItem('Proteger senhas agora', 'protegerSenhas')
    .addItem('Desconectar todos os celulares', 'encerrarSessoes')
    .addToUi();
}

function abaUsuarios_(ss) {
  var sh = ss.getSheetByName('Usuarios');
  if (!sh) {
    sh = ss.insertSheet('Usuarios');
    sh.getRange(1, 1, 1, 4).setValues([CAB_USUARIOS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('E1').setValue('Cadastre uma pessoa por linha. Ativo = Sim ou Não. A senha vira um código embaralhado depois do primeiro login.');
  }
  return sh;
}
function usuarios_() {
  var sh = abaUsuarios_(SpreadsheetApp.getActiveSpreadsheet()), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 4).getValues().map(function (l, i) {
    var u = String(l[0]).trim();
    return { linha: i + 2, usuario: u, chave: u.toLowerCase(), senha: String(l[1]), nome: String(l[2]).trim() || u,
             ativo: /^(sim|s|yes|1|true|ativo)$/i.test(String(l[3]).trim()) };
  }).filter(function (u) { return u.usuario; });
}
function hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b < 0 ? b + 256 : b)).toString(16)).slice(-2); }).join(''); }
function hashSenha_(senha, sal) { return 'sha256$' + sal + '$' + hex_(SHA256_(utf8_(sal + '|' + senha))); }
function senhaConfere_(guardada, digitada) {
  if (guardada.indexOf('sha256$') === 0) { var p = guardada.split('$'); return hashSenha_(digitada, p[1]) === guardada; }
  return guardada !== '' && guardada === digitada;
}
function protegerSenhas() {
  var sh = abaUsuarios_(SpreadsheetApp.getActiveSpreadsheet()), n = 0;
  usuarios_().forEach(function (u) {
    if (u.senha && u.senha.indexOf('sha256$') !== 0) { sh.getRange(u.linha, 2).setValue(hashSenha_(u.senha, Utilities.getUuid().slice(0, 8))); n++; }
  });
  try { SpreadsheetApp.getUi().alert(n + ' senha(s) protegida(s).'); } catch (e) {}
}
function encerrarSessoes() {
  var p = PropertiesService.getScriptProperties(), all = p.getProperties(), n = 0;
  Object.keys(all).forEach(function (k) { if (k.indexOf('S_') === 0) { p.deleteProperty(k); n++; } });
  try { SpreadsheetApp.getUi().alert(n + ' celular(es) desconectado(s). Todos vão precisar entrar de novo.'); } catch (e) {}
}
function login_(body) {
  var chave = String(body.usuario || '').trim().toLowerCase(), cache = CacheService.getScriptCache();
  if (!chave || !body.senha) return { ok: false, erro: 'Digite usuário e senha.' };
  var falhas = Number(cache.get('F_' + chave) || 0);
  if (falhas >= 5) return { ok: false, erro: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.' };
  var u = usuarios_().filter(function (x) { return x.chave === chave; })[0];
  if (!u || !u.ativo || !senhaConfere_(u.senha, String(body.senha))) {
    cache.put('F_' + chave, String(falhas + 1), 900);
    return { ok: false, erro: 'Usuário ou senha incorretos.' };
  }
  cache.remove('F_' + chave);
  if (u.senha.indexOf('sha256$') !== 0) // troca a senha digitada pela versão embaralhada
    abaUsuarios_(SpreadsheetApp.getActiveSpreadsheet()).getRange(u.linha, 2).setValue(hashSenha_(String(body.senha), Utilities.getUuid().slice(0, 8)));
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('S_' + token, JSON.stringify({ u: u.chave, exp: Date.now() + DIAS_SESSAO * 864e5 }));
  return { ok: true, token: token, usuario: u.usuario, nome: u.nome };
}
function sessao_(token) {
  if (!token || !/^[0-9a-f]{40,80}$/.test(String(token))) return null;
  var p = PropertiesService.getScriptProperties(), raw = p.getProperty('S_' + token);
  if (!raw) return null;
  var s = JSON.parse(raw);
  if (Date.now() > s.exp) { p.deleteProperty('S_' + token); return null; }
  var u = usuarios_().filter(function (x) { return x.chave === s.u; })[0];
  if (!u || !u.ativo) return null;
  return u;
}

// ===================== LEMBRETES (Web Push) =====================
var SUB_VAPID = 'https://yanmantovani17.github.io/rdo/';

function instalarLembretes() {
  chaves_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['lembreteManha', 'lembreteNoite'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('lembreteManha').timeBased().everyDays(1).atHour(10).nearMinute(0).inTimezone('America/Sao_Paulo').create();
  ScriptApp.newTrigger('lembreteNoite').timeBased().everyDays(1).atHour(19).nearMinute(0).inTimezone('America/Sao_Paulo').create();
  UrlFetchApp.getRequest('https://web.push.apple.com/'); // pede a autorização de envio já agora
  Logger.log('Lembretes instalados: todo dia por volta das 10h e das 19h. Celulares cadastrados: ' + assinaturas_().length);
}
function lembreteManha() { enviarLembrete_(); }
function lembreteNoite() { enviarLembrete_(); }

function assinaturas_() { return JSON.parse(PropertiesService.getScriptProperties().getProperty('ASSINATURAS') || '[]'); }
function salvarAssinaturas_(l) { PropertiesService.getScriptProperties().setProperty('ASSINATURAS', JSON.stringify(l)); }

function assinar_(body, quem) {
  var a = body.assinatura || {};
  if (!a.endpoint || !/^https:\/\//.test(a.endpoint)) return { ok: false, erro: 'assinatura inválida' };
  var l = assinaturas_().filter(function (x) { return x.endpoint !== a.endpoint; });
  l.push({ endpoint: a.endpoint, obra: body.obra || '', usuario: quem ? quem.usuario : '', criado: new Date().toISOString() });
  salvarAssinaturas_(l.slice(-20));
  return { ok: true, total: l.length };
}

function enviarLembrete_() {
  var k = chaves_(), l = assinaturas_(), manter = [], ok = 0, ativos = {};
  usuarios_().forEach(function (u) { if (u.ativo) ativos[u.chave] = true; });
  l.forEach(function (a) {
    if (a.usuario && !ativos[String(a.usuario).toLowerCase()]) return; // usuário desativado: para de receber
    try {
      var r = UrlFetchApp.fetch(a.endpoint, {
        method: 'post', muteHttpExceptions: true,
        headers: { TTL: '21600', Urgency: 'high', Authorization: vapidAuth_(a.endpoint, k, SUB_VAPID) }
      });
      var c = r.getResponseCode();
      if (c === 404 || c === 410) return;           // celular desinstalou ou desativou
      if (c >= 200 && c < 300) ok++;
      else Logger.log('Push ' + c + ': ' + r.getContentText());
      manter.push(a);
    } catch (err) { Logger.log(String(err)); manter.push(a); }
  });
  salvarAssinaturas_(manter);
  return ok;
}

function chaves_() {
  var p = PropertiesService.getScriptProperties(), d = p.getProperty('VAPID_D'), pub = p.getProperty('VAPID_PUB');
  if (d && pub) return { d: d, pub: pub };
  var semente = utf8_(Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + Date.now());
  var k = vapidKeys_(semente);
  p.setProperty('VAPID_D', k.d); p.setProperty('VAPID_PUB', k.pub);
  return k;
}
function unsigned_(b) { return b.map(function (x) { return x < 0 ? x + 256 : x; }); }
function signed_(b) { return b.map(function (x) { return x > 127 ? x - 256 : x; }); }
function SHA256_(bytes) { return unsigned_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signed_(bytes))); }
function HMAC_(key, data) { return unsigned_(Utilities.computeHmacSha256Signature(signed_(data), signed_(key))); }

// ===== VAPID (ES256 / P-256) em JavaScript puro — mesmo código vai para o Apps Script =====
// Depende de duas funções externas: SHA256_(bytes)->bytes e HMAC_(keyBytes, dataBytes)->bytes (bytes = array de 0..255)
var P256_ = {
  p: BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
  n: BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
  b: BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b'),
  gx: BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
  gy: BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
};
function mod_(a, m) { var r = a % m; return r < BigInt(0) ? r + m : r; }
function inv_(a, m) { // Euclides estendido
  var t = BigInt(0), nt = BigInt(1), r = m, nr = mod_(a, m);
  while (nr !== BigInt(0)) { var q = r / nr; var tmp = t - q * nt; t = nt; nt = tmp; tmp = r - q * nr; r = nr; nr = tmp; }
  return mod_(t, m);
}
// pontos em coordenadas jacobianas [X, Y, Z]; Z=0 é o infinito
function jDouble_(P) {
  var p = P256_.p, X = P[0], Y = P[1], Z = P[2];
  if (Z === BigInt(0) || Y === BigInt(0)) return [BigInt(0), BigInt(1), BigInt(0)];
  var YY = mod_(Y * Y, p), S = mod_(BigInt(4) * X * YY, p), ZZ = mod_(Z * Z, p);
  var M = mod_(BigInt(3) * (X - ZZ) * (X + ZZ), p); // a = -3
  var X3 = mod_(M * M - BigInt(2) * S, p);
  var Y3 = mod_(M * (S - X3) - BigInt(8) * YY * YY, p);
  var Z3 = mod_(BigInt(2) * Y * Z, p);
  return [X3, Y3, Z3];
}
function jAdd_(P, Q) {
  var p = P256_.p;
  if (P[2] === BigInt(0)) return Q; if (Q[2] === BigInt(0)) return P;
  var Z1Z1 = mod_(P[2] * P[2], p), Z2Z2 = mod_(Q[2] * Q[2], p);
  var U1 = mod_(P[0] * Z2Z2, p), U2 = mod_(Q[0] * Z1Z1, p);
  var S1 = mod_(P[1] * Q[2] * Z2Z2, p), S2 = mod_(Q[1] * P[2] * Z1Z1, p);
  if (U1 === U2) return S1 === S2 ? jDouble_(P) : [BigInt(0), BigInt(1), BigInt(0)];
  var H = mod_(U2 - U1, p), R = mod_(S2 - S1, p), HH = mod_(H * H, p), HHH = mod_(H * HH, p), V = mod_(U1 * HH, p);
  var X3 = mod_(R * R - HHH - BigInt(2) * V, p);
  var Y3 = mod_(R * (V - X3) - S1 * HHH, p);
  var Z3 = mod_(P[2] * Q[2] * H, p);
  return [X3, Y3, Z3];
}
function mul_(k, x, y) {
  var R = [BigInt(0), BigInt(1), BigInt(0)], A = [x, y, BigInt(1)];
  while (k > BigInt(0)) { if (k & BigInt(1)) R = jAdd_(R, A); A = jDouble_(A); k >>= BigInt(1); }
  if (R[2] === BigInt(0)) return null;
  var p = P256_.p, zi = inv_(R[2], p), zi2 = mod_(zi * zi, p);
  return [mod_(R[0] * zi2, p), mod_(R[1] * zi2 * zi, p)];
}
function toBytes_(n, len) { var out = []; for (var i = 0; i < len; i++) { out.unshift(Number(n & BigInt(255))); n >>= BigInt(8); } return out; }
function fromBytes_(b) { var n = BigInt(0); for (var i = 0; i < b.length; i++) n = (n << BigInt(8)) | BigInt(b[i]); return n; }
function b64u_(bytes) {
  var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', s = '', i;
  for (i = 0; i + 2 < bytes.length; i += 3) { var v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]; s += c[v >> 18] + c[(v >> 12) & 63] + c[(v >> 6) & 63] + c[v & 63]; }
  var rest = bytes.length - i;
  if (rest === 1) { var v1 = bytes[i] << 16; s += c[v1 >> 18] + c[(v1 >> 12) & 63]; }
  if (rest === 2) { var v2 = (bytes[i] << 16) | (bytes[i + 1] << 8); s += c[v2 >> 18] + c[(v2 >> 12) & 63] + c[(v2 >> 6) & 63]; }
  return s;
}
function b64uDec_(s) {
  var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', out = [], buf = 0, bits = 0;
  for (var i = 0; i < s.length; i++) { var v = c.indexOf(s[i]); if (v < 0) continue; buf = (buf << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); } }
  return out;
}
function utf8_(str) { var out = [], s = unescape(encodeURIComponent(str)); for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); return out; }
// gera par de chaves a partir de 32+ bytes aleatórios
function vapidKeys_(seedBytes) {
  var d = mod_(fromBytes_(SHA256_(seedBytes)), P256_.n - BigInt(1)) + BigInt(1);
  var Q = mul_(d, P256_.gx, P256_.gy);
  return { d: b64u_(toBytes_(d, 32)), pub: b64u_([4].concat(toBytes_(Q[0], 32), toBytes_(Q[1], 32))) };
}
// RFC 6979: k determinístico (não depende de gerador aleatório)
function rfc6979k_(dBytes, hBytes) {
  var n = P256_.n, h1 = toBytes_(mod_(fromBytes_(hBytes), n), 32);
  var V = [], K = [], i; for (i = 0; i < 32; i++) { V.push(1); K.push(0); }
  K = HMAC_(K, V.concat([0], dBytes, h1)); V = HMAC_(K, V);
  K = HMAC_(K, V.concat([1], dBytes, h1)); V = HMAC_(K, V);
  while (true) { V = HMAC_(K, V); var k = fromBytes_(V); if (k > BigInt(0) && k < n) return k; K = HMAC_(K, V.concat([0])); V = HMAC_(K, V); }
}
function es256_(dB64, msgBytes) {
  var n = P256_.n, dBytes = b64uDec_(dB64), d = fromBytes_(dBytes), h = SHA256_(msgBytes), e = mod_(fromBytes_(h), n);
  var k = rfc6979k_(dBytes, h), R = mul_(k, P256_.gx, P256_.gy), r = mod_(R[0], n);
  var s = mod_(inv_(k, n) * (e + r * d), n);
  return toBytes_(r, 32).concat(toBytes_(s, 32));
}
function vapidAuth_(endpoint, keys, sub) {
  var aud = endpoint.match(/^https?:\/\/[^\/]+/)[0];
  var head = b64u_(utf8_(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  var body = b64u_(utf8_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sub })));
  var sig = b64u_(es256_(keys.d, utf8_(head + '.' + body)));
  return 'vapid t=' + head + '.' + body + '.' + sig + ', k=' + keys.pub;
}
