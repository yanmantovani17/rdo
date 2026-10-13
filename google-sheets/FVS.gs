/**
 * FVS -> Google Sheets   (projeto próprio do Apps Script, separado do RDO)
 *
 * INSTALAR (uma vez, de preferência no computador):
 *   1. Abra a planilha MATRIZ_CAJAMAR_FVS > Extensões > Apps Script.
 *   2. Apague tudo o que estiver no arquivo e cole este código. Salve.
 *   3. Escolha a função "instalar" na barra de cima e clique em Executar. Autorize.
 *      (cria as abas FVS, Itens, Indicadores e Usuarios e liga os lembretes das 10h e 19h)
 *   4. Implantar > Nova implantação > App da Web
 *        Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *      Copie o endereço que termina em /exec e mande para o Claude (ou cole no app de FVS).
 *   Para atualizar o código depois: Implantar > Gerenciar implantações > lápis > Versão: Nova versão.
 *
 * USUÁRIOS: na aba "Usuarios" desta planilha, uma linha por pessoa:
 *   Usuario | Senha | Nome | Ativo (Sim/Não)
 * A senha digitada é trocada automaticamente por uma versão embaralhada (hash) no primeiro login.
 * Para tirar o acesso de alguém, mude "Ativo" para Não. Sem login, o app não envia nada.
 *
 * ABAS:
 *   FVS         - uma linha por ficha (Nº, processo, local, status, % de aprovação, quem preencheu)
 *   Itens       - uma linha por item verificado (A / R / NA da 1ª e da 2ª verificação)
 *   Indicadores - % de aprovação por processo, por mês e os itens que mais reprovam (fórmulas)
 * Cada envio regrava a ficha inteira (não duplica se enviar de novo).
 */

var FVS_PLANILHA_ID = '14hWLYy6Vv9O0YLEloFozDz84UFKw9uO5WusLq63U_70';   // MATRIZ_CAJAMAR_FVS
function planilha_() { return SpreadsheetApp.openById(FVS_PLANILHA_ID); }

function instalar() {
  var ss = planilha_();
  Object.keys(FVS_ABAS).forEach(function (nome) { fvsAba_(ss, nome); });
  fvsIndicadores_(ss, false);
  abaUsuarios_(ss);
  instalarLembretes();
  Logger.log('Pronto: abas criadas na planilha "' + ss.getName() + '". Cadastre os usuários na aba Usuarios e faça a implantação como App da Web.');
}

function doGet(e) {
  if (e && e.parameter && e.parameter.acao === 'vapid') return json_({ ok: true, vapid: chaves_().pub });
  var ss = planilha_();
  Object.keys(FVS_ABAS).forEach(function (nome) { fvsAba_(ss, nome); });
  fvsIndicadores_(ss, false);
  abaUsuarios_(ss);
  return json_({ ok: true, planilha: ss.getName(), login: true, app: 'fvs' });
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
    return json_(fvsReceber_(body, quem));
  } catch (err) {
    return json_({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function fvsReceber_(body, quem) {
  var ss = planilha_();
  if (body.teste) {
    Object.keys(FVS_ABAS).forEach(function (nome) { fvsAba_(ss, nome); });
    fvsIndicadores_(ss, false);
    return { ok: true, planilha: ss.getName() };
  }
  var fichas = body.fichas || [], remover = body.remover || [], ids = {};
  fichas.forEach(function (f) { ids[f.id] = true; });
  remover.forEach(function (id) { ids[id] = true; });
  var nome = (quem && (quem.nome || quem.usuario)) || '';
  var novosF = [], novosI = [];
  fichas.forEach(function (f) {
    var l = fvsDatas_('FVS', f.fvs);
    l[FVS_ABAS.FVS.indexOf('Preenchido_por')] = nome;
    novosF.push(l.concat([f.id]));
    (f.itens || []).forEach(function (it) { novosI.push(fvsDatas_('Itens', it).concat([f.id])); });
  });
  fvsRegravar_(ss, 'FVS', ids, novosF);
  fvsRegravar_(ss, 'Itens', ids, novosI);
  fvsIndicadores_(ss, false);
  return { ok: true, fichas: fichas.length, removidas: remover.length };
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

var FVS_ABAS = {
  FVS:   ['Obra', 'FVS_N', 'Codigo', 'Processo', 'Categoria', 'Local', 'Projetos', 'Data_inicio', 'Data_termino',
          'Itens', 'Verificados', 'A', 'R', 'NA', 'Reparos_pendentes', 'Aprovacao_1a_verif', 'Status', 'Inspetor',
          'Atualizado_em', 'Preenchido_por', 'Id'],
  Itens: ['Obra', 'FVS_N', 'Processo', 'Local', 'Mes', 'Secao', 'Item_N', 'Item', 'O_que_verificar',
          'Verif_1', 'Inspetor_1', 'Data_1', 'Verif_2', 'Inspetor_2', 'Data_2', 'Resultado_final', 'Observacao', 'Id']
};
var FVS_DATAS = { FVS: [8, 9, 19], Itens: [12, 15] };   // colunas (1 = A) que são datas

// rode esta função uma vez no editor se quiser recriar a aba Indicadores do zero
function fvsRefazerIndicadores() { fvsIndicadores_(planilha_(), true); }

function fvsAba_(ss, nome) {
  var sh = ss.getSheetByName(nome);
  var cab = FVS_ABAS[nome];
  if (!sh) sh = ss.insertSheet(nome);
  if (sh.getLastRow() === 0 || sh.getRange(1, cab.length).getValue() !== cab[cab.length - 1]) {
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#26313b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

// as linhas chegam sem a última coluna (Id); datas vêm como "aaaa-mm-dd" ou número
function fvsDatas_(nome, linha) {
  var cab = FVS_ABAS[nome], l = linha.slice(0, cab.length - 1);
  while (l.length < cab.length - 1) l.push('');
  FVS_DATAS[nome].forEach(function (c) {
    var v = l[c - 1];
    if (typeof v === 'number') l[c - 1] = new Date(v);
    else if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) { var p = v.split('-'); l[c - 1] = new Date(+p[0], +p[1] - 1, +p[2]); }
  });
  return l;
}

// apaga as linhas das fichas enviadas (pela coluna Id) e grava as novas no lugar
function fvsRegravar_(ss, nome, ids, novos) {
  var sh = fvsAba_(ss, nome);
  var n = FVS_ABAS[nome].length;
  var ultima = sh.getLastRow();
  var manter = [];
  if (ultima > 1) {
    manter = sh.getRange(2, 1, ultima - 1, n).getValues().filter(function (l) { return !ids[String(l[n - 1])]; });
    sh.getRange(2, 1, ultima - 1, n).clearContent();
  }
  var todas = manter.concat(novos);
  todas.sort(function (a, b) { return (Number(a[1]) - Number(b[1])) || ((Number(a[6]) || 0) - (Number(b[6]) || 0)); });
  if (todas.length) {
    if (nome === 'Itens') sh.getRange(2, 5, todas.length, 1).setNumberFormat('@');   // Mes como texto (2026-10)
    sh.getRange(2, 1, todas.length, n).setValues(todas);
    FVS_DATAS[nome].forEach(function (c) {
      sh.getRange(2, c, todas.length, 1).setNumberFormat(c === 19 ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy');
    });
    if (nome === 'FVS') sh.getRange(2, 16, todas.length, 1).setNumberFormat('0%');
  }
}

// aba de indicadores: só fórmulas, recalcula sozinha quando chegam fichas novas
// planilha em português usa ";" entre os argumentos das fórmulas; em inglês, ","
function fx_(ss, f) {
  var loc = String(ss.getSpreadsheetLocale() || 'pt_BR');
  if (/^en/i.test(loc)) return f;
  var out = '', aspas = false;
  for (var i = 0; i < f.length; i++) { var ch = f[i]; if (ch === '"') aspas = !aspas; out += (ch === ',' && !aspas) ? ';' : ch; }
  return out;
}
function fvsIndicadores_(ss, refazer) {
  var sh = ss.getSheetByName('Indicadores');
  // já existe e as fórmulas estão no separador certo: não mexe
  if (sh && !refazer && String(sh.getRange('D5').getFormula() || '').indexOf(fx_(ss, ',')) >= 0) return;
  if (!sh) sh = ss.insertSheet('Indicadores', 0);
  sh.clear();
  var esc = '#26313b', amarelo = '#e8a100';
  sh.getRange('A1').setValue('APROVAÇÃO DOS PROCESSOS - FVS').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('% de aprovação de 1ª = A ÷ (A + R) na 1ª verificação. % final inclui os itens aprovados após reparo. N/A fica fora da conta.')
    .setFontColor('#5d6670').setFontStyle('italic');

  // bloco 1: por processo
  var cab = ['Processo', 'FVS', 'Itens avaliados (A+R)', 'A - aprovados de 1ª', 'R - reprovados', 'N/A', '% aprovação de 1ª', '% aprovação final', 'Reparos pendentes'];
  sh.getRange(4, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground(esc).setFontColor('#ffffff').setWrap(true);
  sh.getRange('A5').setValue('TOTAL DA OBRA');
  sh.getRange('B5').setFormula(fx_(ss, '=COUNTA(FVS!B2:B)'));
  sh.getRange('C5').setFormula(fx_(ss, '=D5+E5'));
  sh.getRange('D5').setFormula(fx_(ss, '=COUNTIF(Itens!J2:J,"A")'));
  sh.getRange('E5').setFormula(fx_(ss, '=COUNTIF(Itens!J2:J,"R")'));
  sh.getRange('F5').setFormula(fx_(ss, '=COUNTIF(Itens!J2:J,"NA")'));
  sh.getRange('G5').setFormula(fx_(ss, '=IF(C5=0,"",D5/C5)'));
  sh.getRange('H5').setFormula(fx_(ss, '=IF(C5=0,"",COUNTIF(Itens!P2:P,"Aprovado*")/C5)'));
  sh.getRange('I5').setFormula(fx_(ss, '=COUNTIF(Itens!P2:P,"Reparo pendente")'));
  sh.getRange('A5:I5').setFontWeight('bold').setBackground('#fff3d1');
  sh.getRange('A6').setFormula(fx_(ss, '=IFERROR(SORT(UNIQUE(FILTER(Itens!C2:C,Itens!C2:C<>""))),"")'));
  sh.getRange('B6').setFormula(fx_(ss, '=ARRAYFORMULA(IF(A6:A="","",COUNTIF(FVS!D2:D,A6:A)))'));
  sh.getRange('C6').setFormula(fx_(ss, '=ARRAYFORMULA(IF(A6:A="","",D6:D+E6:E))'));
  sh.getRange('D6').setFormula(fx_(ss, '=ARRAYFORMULA(IF(A6:A="","",COUNTIFS(Itens!C2:C,A6:A,Itens!J2:J,"A")))'));
  sh.getRange('E6').setFormula(fx_(ss, '=ARRAYFORMULA(IF(A6:A="","",COUNTIFS(Itens!C2:C,A6:A,Itens!J2:J,"R")))'));
  sh.getRange('F6').setFormula(fx_(ss, '=ARRAYFORMULA(IF(A6:A="","",COUNTIFS(Itens!C2:C,A6:A,Itens!J2:J,"NA")))'));
  sh.getRange('G6').setFormula(fx_(ss, '=ARRAYFORMULA(IF(A6:A="","",IF(C6:C=0,"",D6:D/C6:C)))'));
  sh.getRange('H6').setFormula(fx_(ss, '=ARRAYFORMULA(IF(A6:A="","",IF(C6:C=0,"",COUNTIFS(Itens!C2:C,A6:A,Itens!P2:P,"Aprovado*")/C6:C)))'));
  sh.getRange('I6').setFormula(fx_(ss, '=ARRAYFORMULA(IF(A6:A="","",COUNTIFS(Itens!C2:C,A6:A,Itens!P2:P,"Reparo pendente")))'));
  sh.getRange('G5:H').setNumberFormat('0.0%');

  // bloco 2: por mês
  var cab2 = ['Mês', 'Itens avaliados (A+R)', 'A', 'R', '% aprovação de 1ª'];
  sh.getRange(4, 11, 1, cab2.length).setValues([cab2]).setFontWeight('bold').setBackground(esc).setFontColor('#ffffff').setWrap(true);
  sh.getRange('K5').setFormula(fx_(ss, '=IFERROR(SORT(UNIQUE(FILTER(Itens!E2:E,Itens!E2:E<>""))),"")'));
  sh.getRange('L5').setFormula(fx_(ss, '=ARRAYFORMULA(IF(K5:K="","",M5:M+N5:N))'));
  sh.getRange('M5').setFormula(fx_(ss, '=ARRAYFORMULA(IF(K5:K="","",COUNTIFS(Itens!E2:E,K5:K,Itens!J2:J,"A")))'));
  sh.getRange('N5').setFormula(fx_(ss, '=ARRAYFORMULA(IF(K5:K="","",COUNTIFS(Itens!E2:E,K5:K,Itens!J2:J,"R")))'));
  sh.getRange('O5').setFormula(fx_(ss, '=ARRAYFORMULA(IF(K5:K="","",IF(L5:L=0,"",M5:M/L5:L)))'));
  sh.getRange('O5:O').setNumberFormat('0.0%');

  // bloco 3: itens que mais reprovam
  sh.getRange('Q4:S4').setFontWeight('bold').setBackground(esc).setFontColor('#ffffff').setWrap(true);
  sh.getRange('Q4').setFormula(fx_(ss, '=IFERROR(QUERY(Itens!A1:R,"select C, H, count(J) where J = \'R\' group by C, H order by count(J) desc limit 20 label C \'Processo\', H \'Item que mais reprova\', count(J) \'Reprovações (R na 1ª)\'",1),"Itens que mais reprovam: nenhuma reprovação ainda")'));

  sh.setFrozenRows(4);
  sh.setColumnWidth(1, 300); sh.setColumnWidths(2, 8, 105); sh.setColumnWidth(10, 24);
  sh.setColumnWidth(11, 90); sh.setColumnWidths(12, 4, 95); sh.setColumnWidth(16, 24);
  sh.setColumnWidth(17, 260); sh.setColumnWidth(18, 300); sh.setColumnWidth(19, 110);
  sh.setRowHeight(4, 42);
  var regra = SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0.85).setBackground('#fbe8dc').setFontColor('#b4561b')
    .setRanges([sh.getRange('G5:H'), sh.getRange('O5:O')]).build();
  var regra2 = SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(0.95).setBackground('#e1f1e7').setFontColor('#2f7d4f')
    .setRanges([sh.getRange('G5:H'), sh.getRange('O5:O')]).build();
  sh.setConditionalFormatRules([regra, regra2]);
  sh.getRange('A3').setValue('Verde: 95% ou mais · Laranja: abaixo de 85%').setFontColor(amarelo).setFontWeight('bold');
}


// ===================== USUÁRIOS E LOGIN =====================
var CAB_USUARIOS = ['Usuario', 'Senha', 'Nome', 'Ativo'];
var DIAS_SESSAO = 90;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('FVS')
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
  var sh = abaUsuarios_(planilha_()), n = sh.getLastRow();
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
  var sh = abaUsuarios_(planilha_()), n = 0;
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
    abaUsuarios_(planilha_()).getRange(u.linha, 2).setValue(hashSenha_(String(body.senha), Utilities.getUuid().slice(0, 8)));
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
var SUB_VAPID = 'https://yanmantovani17.github.io/rdo/fvs/';

function instalarLembretes() {
  chaves_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['lembreteManha', 'lembreteNoite'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('lembreteManha').timeBased().everyDays(1).atHour(10).nearMinute(0).inTimezone('America/Sao_Paulo').create();
  ScriptApp.newTrigger('lembreteNoite').timeBased().everyDays(1).atHour(19).nearMinute(0).inTimezone('America/Sao_Paulo').create();
  UrlFetchApp.getRequest('https://web.push.apple.com/'); // pede a autorização de envio já agora
  Logger.log('Lembretes do FVS instalados: todo dia por volta das 10h e das 19h. Celulares cadastrados: ' + assinaturas_().length);
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
