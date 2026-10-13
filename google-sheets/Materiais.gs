/**
 * CONTROLE DE MATERIAL -> Google Sheets   (projeto próprio do Apps Script, separado do RDO e do FVS)
 *
 * INSTALAR (uma vez, de preferência no computador):
 *   1. Abra a planilha de materiais (ID abaixo, em MAT_PLANILHA_ID) > Extensões > Apps Script.
 *   2. Apague tudo o que estiver no arquivo e cole este código. Salve.
 *   3. Escolha a função "instalar" na barra de cima e clique em Executar. Autorize.
 *      (cria as abas Indicadores, Lancamentos, Entregas, Pecas, Projeto, Materiais e Usuarios)
 *   4. Implantar > Nova implantação > App da Web
 *        Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *      Copie o endereço que termina em /exec e mande para o Claude (ou cole no app na tela de login).
 *   Para atualizar o código depois: Implantar > Gerenciar implantações > lápis > Versão: Nova versão.
 *
 * USUÁRIOS: na aba "Usuarios" desta planilha, uma linha por pessoa:
 *   Usuario | Senha | Nome | Ativo (Sim/Não) | Perfil (Engenharia/Campo)
 *   Engenharia = cadastra materiais e projeto e lança consumo.  Campo = só lança consumo.
 *   A senha digitada vira um código embaralhado (hash) no primeiro login.
 *   Dá para copiar as linhas da aba Usuarios do FVS: as senhas continuam valendo (falta só a coluna Perfil).
 *
 * ABAS (o app regrava tudo a cada envio; não edite à mão as abas de dados, edite pelo app):
 *   Indicadores - perda por material, por tipo de peça e por mês (números prontos, sem fórmulas)
 *   Lancamentos - um registro por lançamento (data, peças, previsto x real, % de perda)
 *   Entregas    - uma linha por NF / caminhão / retirada
 *   Pecas       - uma linha por peça executada, com o real rateado
 *   Projeto     - itens de projeto (código, nº de peças, quantidade por peça)
 *   Materiais   - catálogo de materiais, unidade e perda aceitável
 */

var MAT_PLANILHA_ID = '1WPcWJEqgLLRL6I76wyO0XKB4qdPJqqbEG7LENq7842E';   // MATRIX_CAJAMAR_MATERIAL
// https://docs.google.com/spreadsheets/d/1WPcWJEqgLLRL6I76wyO0XKB4qdPJqqbEG7LENq7842E/edit
function planilha_() { try { return SpreadsheetApp.openById(MAT_PLANILHA_ID); } catch (e) { return SpreadsheetApp.getActiveSpreadsheet(); } }

var MAT_ABAS = {
  Materiais:   ['Material', 'Unidade', 'Categoria', 'Perda_aceitavel', 'Ativo', 'Previsto_projeto', 'Atualizado_em', 'Por', 'Id', 'Dados'],
  Projeto:     ['Material', 'Unidade', 'Grupo', 'Codigo', 'Descricao', 'Pecas_projeto', 'Qtd_por_peca', 'Previsto_total', 'Pecas_executadas',
                'Atualizado_em', 'Por', 'Id', 'Dados'],
  Lancamentos: ['Data', 'Mes', 'Material', 'Unidade', 'Frente', 'Fornecedor', 'Pecas', 'Locais', 'Previsto', 'Recebido', 'Devolvido', 'Real',
                'Desvio', 'Perda_pct', 'Perda_justificada', 'Perda_pct_sem_justificada', 'Documentos', 'Observacao', 'Lancado_por', 'Atualizado_em', 'Id', 'Dados'],
  Entregas:    ['Data', 'Mes', 'Material', 'Unidade', 'Documento', 'Veiculo', 'Fornecedor', 'Quantidade', 'Obs', 'Lanc_Id'],
  Pecas:       ['Data', 'Mes', 'Material', 'Unidade', 'Grupo', 'Codigo', 'Local', 'Qtd', 'Previsto', 'Real_rateado', 'Lanc_Id']
};
var TIPO_ABA = { mat: 'Materiais', item: 'Projeto', lanc: 'Lancamentos' };

function instalar() {
  var ss = planilha_();
  Object.keys(MAT_ABAS).forEach(function (nome) { matAba_(ss, nome); });
  abaUsuarios_(ss);
  matIndicadores_(ss, matCarregar_(ss));
  limpaFolhaPadrao_(ss);
  Logger.log('Pronto: abas criadas na planilha "' + ss.getName() + '". Cadastre os usuários na aba Usuarios (coluna Perfil = Engenharia para você) e faça a implantação como App da Web.');
}
function limpaFolhaPadrao_(ss) {
  var p = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1') || ss.getSheetByName('Planilha1');
  if (p && ss.getSheets().length > 1 && p.getLastRow() === 0) ss.deleteSheet(p);
}

function doGet(e) {
  var ss = planilha_();
  Object.keys(MAT_ABAS).forEach(function (nome) { matAba_(ss, nome); });
  abaUsuarios_(ss);
  return json_({ ok: true, planilha: ss.getName(), login: true, app: 'material' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.acao === 'login') return json_(login_(body));
    var quem = sessao_(body.token);
    if (!quem) return json_({ ok: false, codigo: 'nao_autorizado', erro: 'Faça login novamente.' });
    if (body.acao === 'sessao') return json_({ ok: true, usuario: quem.usuario, nome: quem.nome, perfil: quem.perfil });
    if (body.acao === 'sair') { PropertiesService.getScriptProperties().deleteProperty('S_' + body.token); return json_({ ok: true }); }
    var ss = planilha_();
    if (body.acao === 'teste') { Object.keys(MAT_ABAS).forEach(function (n) { matAba_(ss, n); }); return json_({ ok: true, planilha: ss.getName(), perfil: quem.perfil }); }
    if (body.acao === 'baixar') return json_(matBaixar_(ss, quem));
    if (body.acao === 'enviar') return json_(matReceber_(ss, body, quem));
    return json_({ ok: false, erro: 'ação desconhecida: ' + body.acao });
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.stack || err) });
  } finally {
    lock.releaseLock();
  }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ===================== DADOS =====================
function matAba_(ss, nome) {
  var sh = ss.getSheetByName(nome), cab = MAT_ABAS[nome];
  if (!sh) sh = ss.insertSheet(nome);
  if (sh.getLastRow() === 0 || sh.getRange(1, cab.length).getValue() !== cab[cab.length - 1]) {
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#26313b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    if (cab[cab.length - 1] === 'Dados') sh.hideColumns(cab.length);
  }
  return sh;
}

// lê os registros (coluna Dados, em JSON) das abas Materiais, Projeto e Lancamentos
function matCarregar_(ss) {
  var db = { mat: {}, item: {}, lanc: {} };
  Object.keys(TIPO_ABA).forEach(function (k) {
    var nome = TIPO_ABA[k], sh = matAba_(ss, nome), n = MAT_ABAS[nome].length, u = sh.getLastRow();
    if (u < 2) return;
    sh.getRange(2, n, u - 1, 1).getValues().forEach(function (l) {
      if (!l[0]) return;
      try { var r = JSON.parse(l[0]); if (r && r.id) db[k][r.id] = r; } catch (e) {}
    });
  });
  return db;
}

function matBaixar_(ss, quem) {
  var db = matCarregar_(ss);
  function arr(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
  return { ok: true, perfil: quem.perfil, nome: quem.nome, agora: Date.now(), planilha: ss.getName(),
           materiais: arr(db.mat), itens: arr(db.item), lancamentos: arr(db.lanc) };
}

function matReceber_(ss, body, quem) {
  var db = matCarregar_(ss), eng = quem.perfil === 'Engenharia', rejeitados = [], aceitos = 0;
  (body.registros || []).forEach(function (r) {
    if (!r || !r.id || !db[r.k]) return;
    if ((r.k === 'mat' || r.k === 'item') && !eng) { rejeitados.push({ id: r.id, motivo: 'Só a engenharia altera o cadastro de projeto.' }); return; }
    var atual = db[r.k][r.id];
    if (r.k === 'lanc' && !eng && atual && atual.por && String(atual.por).toLowerCase() !== quem.chave) {
      rejeitados.push({ id: r.id, motivo: 'Lançamento de outra pessoa: só ela ou a engenharia podem alterar.' }); return;
    }
    if (atual && Number(atual.atualizado || 0) > Number(r.atualizado || 0)) { rejeitados.push({ id: r.id, motivo: 'Já existe uma versão mais nova na planilha.', velho: true }); return; }
    r.por = (atual && atual.por) || r.por || quem.chave;
    r.porNome = (atual && atual.porNome) || r.porNome || quem.nome;
    r.editadoPor = quem.nome;
    db[r.k][r.id] = r; aceitos++;
  });
  (body.remover || []).forEach(function (x) {
    if (!x || !x.id || !db[x.k] || !db[x.k][x.id]) return;
    var atual = db[x.k][x.id];
    if ((x.k === 'mat' || x.k === 'item') && !eng) { rejeitados.push({ id: x.id, motivo: 'Só a engenharia apaga cadastro.' }); return; }
    if (x.k === 'lanc' && !eng && atual.por && String(atual.por).toLowerCase() !== quem.chave) { rejeitados.push({ id: x.id, motivo: 'Lançamento de outra pessoa.' }); return; }
    delete db[x.k][x.id]; aceitos++;
  });
  matGravar_(ss, db);
  matIndicadores_(ss, db);
  return { ok: true, aceitos: aceitos, rejeitados: rejeitados };
}

// ===================== CONTAS (as mesmas do app) =====================
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function calcLanc_(l, itens) {
  var prev = 0, rec = 0, perdaJ = 0;
  (l.pecas || []).forEach(function (p) { var it = p.item && itens[p.item]; p._prev = it ? num_(it.qu) * (p.q == null ? 1 : num_(p.q)) : num_(p.prev); prev += p._prev; });
  (l.ent || []).forEach(function (e) { rec += num_(e.q); });
  (l.perdas || []).forEach(function (e) { perdaJ += num_(e.q); });
  var real = rec - num_(l.dev);
  return { prev: prev, rec: rec, dev: num_(l.dev), real: real, desvio: real - prev, perdaJ: perdaJ,
           pct: prev ? real / prev - 1 : '', pctSemJ: prev ? (real - perdaJ) / prev - 1 : '' };
}
function semTemp_(o) { return JSON.stringify(o, function (k, v) { return k.charAt(0) === '_' ? undefined : v; }); }
function data_(iso) { if (!iso) return ''; var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function ord_(a, b) { return String(a).localeCompare(String(b), 'pt-BR', { numeric: true }); }

function matGravar_(ss, db) {
  var mats = db.mat, itens = db.item, linhas = { Materiais: [], Projeto: [], Lancamentos: [], Entregas: [], Pecas: [] };
  var prevMat = {}, execItem = {};
  Object.keys(itens).forEach(function (id) { var it = itens[id]; prevMat[it.mat] = (prevMat[it.mat] || 0) + num_(it.qu) * num_(it.n); });
  var lancs = Object.keys(db.lanc).map(function (k) { return db.lanc[k]; }).sort(function (a, b) { return ord_(a.data, b.data) || ord_(a.criado || 0, b.criado || 0); });
  lancs.forEach(function (l) {
    var m = mats[l.mat] || { nome: '(material apagado)', un: '' }, c = calcLanc_(l, itens), mes = String(l.data || '').slice(0, 7), dt = data_(l.data);
    var cods = [], locs = [];
    (l.pecas || []).forEach(function (p) {
      var it = p.item && itens[p.item], cod = it ? it.cod : (p.desc || 'Avulso');
      if (cods.indexOf(cod) < 0) cods.push(cod); if (p.local) locs.push(p.local);
      if (it) execItem[it.id] = (execItem[it.id] || 0) + (p.q == null ? 1 : num_(p.q));
      linhas.Pecas.push([dt, mes, m.nome, m.un, it ? (it.grupo || '') : 'Avulso', cod, p.local || '', p.q == null ? 1 : num_(p.q), p._prev, c.prev ? c.real * p._prev / c.prev : '', l.id]);
    });
    (l.ent || []).forEach(function (e) { linhas.Entregas.push([dt, mes, m.nome, m.un, e.doc || '', e.veic || '', l.forn || '', num_(e.q), e.obs || '', l.id]); });
    linhas.Lancamentos.push([dt, mes, m.nome, m.un, l.frente || '', l.forn || '', cods.join(', '), locs.join(', '), c.prev, c.rec, c.dev, c.real, c.desvio, c.pct,
      c.perdaJ, c.pctSemJ, (l.ent || []).map(function (e) { return e.doc; }).filter(String).join(', '), l.obs || '', l.porNome || l.por || '',
      new Date(num_(l.atualizado) || Date.now()), l.id, semTemp_(l)]);
  });
  Object.keys(mats).map(function (k) { return mats[k]; }).sort(function (a, b) { return ord_(a.nome, b.nome); }).forEach(function (m) {
    linhas.Materiais.push([m.nome, m.un, m.cat || '', num_(m.meta) / 100, m.ativo === false ? 'Não' : 'Sim', prevMat[m.id] || 0,
      new Date(num_(m.atualizado) || Date.now()), m.editadoPor || '', m.id, semTemp_(m)]);
  });
  Object.keys(itens).map(function (k) { return itens[k]; }).sort(function (a, b) {
    var ma = (mats[a.mat] || {}).nome || '', mb = (mats[b.mat] || {}).nome || ''; return ord_(ma, mb) || ord_(a.grupo || '', b.grupo || '') || ord_(a.cod, b.cod);
  }).forEach(function (it) {
    var m = mats[it.mat] || { nome: '(material apagado)', un: '' };
    linhas.Projeto.push([m.nome, m.un, it.grupo || '', it.cod, it.desc || '', num_(it.n), num_(it.qu), num_(it.qu) * num_(it.n), execItem[it.id] || 0,
      new Date(num_(it.atualizado) || Date.now()), it.editadoPor || '', it.id, semTemp_(it)]);
  });
  Object.keys(linhas).forEach(function (nome) { matEscrever_(ss, nome, linhas[nome]); });
}
var FORMATOS = {
  Materiais:   { D: '0.0%', F: '#,##0.000', G: 'dd/mm/yyyy hh:mm' },
  Projeto:     { F: '#,##0', G: '#,##0.000', H: '#,##0.000', I: '#,##0', J: 'dd/mm/yyyy hh:mm' },
  Lancamentos: { A: 'dd/mm/yyyy', B: '@', I: '#,##0.000', J: '#,##0.000', K: '#,##0.000', L: '#,##0.000', M: '#,##0.000', N: '0.0%', O: '#,##0.000', P: '0.0%', T: 'dd/mm/yyyy hh:mm' },
  Entregas:    { A: 'dd/mm/yyyy', B: '@', H: '#,##0.000' },
  Pecas:       { A: 'dd/mm/yyyy', B: '@', H: '#,##0', I: '#,##0.000', J: '#,##0.000' }
};
function matEscrever_(ss, nome, linhas) {
  var sh = matAba_(ss, nome), n = MAT_ABAS[nome].length, u = sh.getLastRow();
  if (u > 1) sh.getRange(2, 1, u - 1, n).clearContent();
  if (!linhas.length) return;
  var f = FORMATOS[nome] || {};
  Object.keys(f).forEach(function (col) { sh.getRange(col + '2:' + col + (linhas.length + 1)).setNumberFormat(f[col]); });
  sh.getRange(2, 1, linhas.length, n).setValues(linhas);
}

// ===================== INDICADORES =====================
function matIndicadores_(ss, db) {
  var sh = ss.getSheetByName('Indicadores');
  if (!sh) sh = ss.insertSheet('Indicadores', 0);
  sh.clear(); sh.setConditionalFormatRules([]);
  var esc = '#26313b', amarelo = '#e8a100', mats = db.mat, itens = db.item;
  var M = {}, I = {}, MES = {};
  Object.keys(mats).forEach(function (id) { M[id] = { prevProj: 0, prev: 0, real: 0, realSemPeca: 0, perdaJ: 0, n: 0 }; });
  Object.keys(itens).forEach(function (id) { var it = itens[id]; if (!M[it.mat]) return; M[it.mat].prevProj += num_(it.qu) * num_(it.n); I[id] = { exec: 0, prev: 0, real: 0 }; });
  Object.keys(db.lanc).forEach(function (id) {
    var l = db.lanc[id], m = M[l.mat]; if (!m) return; var c = calcLanc_(l, itens); m.n++;
    if (c.prev > 0) { m.prev += c.prev; m.real += c.real; m.perdaJ += c.perdaJ; } else m.realSemPeca += c.real;
    var k = String(l.data || '').slice(0, 7) + '|' + l.mat, x = MES[k] = MES[k] || { prev: 0, real: 0, semPeca: 0 };
    if (c.prev > 0) { x.prev += c.prev; x.real += c.real; } else x.semPeca += c.real;
    (l.pecas || []).forEach(function (p) { if (p.item && I[p.item]) { I[p.item].exec += (p.q == null ? 1 : num_(p.q)); I[p.item].prev += p._prev; if (c.prev) I[p.item].real += c.real * p._prev / c.prev; } });
  });
  function pct_(r, p) { return p ? r / p - 1 : ''; }
  sh.getRange('A1').setValue('CONTROLE DE MATERIAL - PREVISTO x REAL').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('Perda = Real ÷ Previsto das peças executadas − 1. Real = recebido − devolvido. "Sem justificada" desconta as perdas explicadas (bomba, descarte). Atualizado em ' +
    Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') + '.').setFontColor('#5d6670').setFontStyle('italic');
  sh.getRange('A3').setValue('Laranja: acima da perda aceitável do material · Verde: dentro').setFontColor(amarelo).setFontWeight('bold');

  var cab = ['Material', 'Un', 'Previsto do projeto', 'Previsto executado', '% executado', 'Real (peças executadas)', 'Desvio (real − previsto)', 'Perda %', 'Perda aceitável',
             'Perda % sem justificada', 'Consumo sem peça vinculada', 'Saldo a executar', 'Projeção de consumo até o fim', 'Lançamentos'];
  var lin = Object.keys(mats).map(function (id) { return mats[id]; }).sort(function (a, b) { return ord_(a.nome, b.nome); }).map(function (mt) {
    var x = M[mt.id], pp = x.prev ? x.real / x.prev - 1 : 0, saldo = Math.max(0, x.prevProj - x.prev);
    return [mt.nome, mt.un, x.prevProj, x.prev, x.prevProj ? x.prev / x.prevProj : '', x.real, x.real - x.prev, pct_(x.real, x.prev), num_(mt.meta) / 100,
            x.prev ? (x.real - x.perdaJ) / x.prev - 1 : '', x.realSemPeca, saldo, x.real + x.realSemPeca + saldo * (1 + pp), x.n];
  });
  var b1 = [cab].concat(lin.length ? lin : [['Nenhum material cadastrado ainda', '', '', '', '', '', '', '', '', '', '', '', '', '']]);
  sh.getRange(5, 1, b1.length, cab.length).setValues(b1);
  sh.getRange(5, 1, 1, cab.length).setFontWeight('bold').setBackground(esc).setFontColor('#ffffff').setWrap(true);
  sh.getRange(4, 1).setValue('POR MATERIAL').setFontWeight('bold');
  if (lin.length) {
    sh.getRange(6, 3, lin.length, 2).setNumberFormat('#,##0.000'); sh.getRange(6, 5, lin.length, 1).setNumberFormat('0.0%');
    sh.getRange(6, 6, lin.length, 2).setNumberFormat('#,##0.000'); sh.getRange(6, 8, lin.length, 3).setNumberFormat('0.0%');
    sh.getRange(6, 11, lin.length, 3).setNumberFormat('#,##0.000');
    lin.forEach(function (l, i) {
      if (l[7] === '') return; var cel = sh.getRange(6 + i, 8);
      if (l[7] > l[8]) cel.setBackground('#fbe8dc').setFontColor('#b4561b').setFontWeight('bold'); else cel.setBackground('#e1f1e7').setFontColor('#2f7d4f').setFontWeight('bold');
    });
  }
  var r0 = 6 + Math.max(lin.length, 1) + 2;
  sh.getRange(r0, 1).setValue('POR TIPO DE PEÇA (ITEM DE PROJETO)').setFontWeight('bold');
  var cab2 = ['Material', 'Grupo', 'Código', 'Peças no projeto', 'Peças executadas', '% executado', 'Previsto executado', 'Real rateado', 'Perda %', 'Un'];
  var lin2 = Object.keys(itens).map(function (id) { return itens[id]; }).filter(function (it) { return mats[it.mat]; }).sort(function (a, b) {
    return ord_(mats[a.mat].nome, mats[b.mat].nome) || ord_(a.grupo || '', b.grupo || '') || ord_(a.cod, b.cod);
  }).map(function (it) { var x = I[it.id]; return [mats[it.mat].nome, it.grupo || '', it.cod, num_(it.n), x.exec, num_(it.n) ? x.exec / num_(it.n) : '', x.prev, x.real, pct_(x.real, x.prev), mats[it.mat].un]; });
  var b2 = [cab2].concat(lin2.length ? lin2 : [['Nenhum item de projeto ainda', '', '', '', '', '', '', '', '', '']]);
  sh.getRange(r0 + 1, 1, b2.length, cab2.length).setValues(b2);
  sh.getRange(r0 + 1, 1, 1, cab2.length).setFontWeight('bold').setBackground(esc).setFontColor('#ffffff').setWrap(true);
  if (lin2.length) {
    sh.getRange(r0 + 2, 6, lin2.length, 1).setNumberFormat('0.0%'); sh.getRange(r0 + 2, 7, lin2.length, 2).setNumberFormat('#,##0.000');
    sh.getRange(r0 + 2, 9, lin2.length, 1).setNumberFormat('0.0%');
  }
  // por mês (à direita)
  var cab3 = ['Mês', 'Material', 'Previsto executado', 'Real', 'Perda %', 'Consumo sem peça'];
  var lin3 = Object.keys(MES).sort().map(function (k) { var p = k.split('|'), x = MES[k], mt = mats[p[1]] || { nome: '?' }; return [p[0], mt.nome, x.prev, x.real, pct_(x.real, x.prev), x.semPeca]; });
  var b3 = [cab3].concat(lin3.length ? lin3 : [['Sem lançamentos ainda', '', '', '', '', '']]);
  sh.getRange(4, 16).setValue('POR MÊS').setFontWeight('bold');
  sh.getRange(5, 16, b3.length, cab3.length).setValues(b3);
  sh.getRange(5, 16, 1, cab3.length).setFontWeight('bold').setBackground(esc).setFontColor('#ffffff').setWrap(true);
  sh.getRange(6, 16, Math.max(lin3.length, 1), 1).setNumberFormat('@');
  if (lin3.length) { sh.getRange(6, 18, lin3.length, 2).setNumberFormat('#,##0.000'); sh.getRange(6, 20, lin3.length, 1).setNumberFormat('0.0%'); sh.getRange(6, 21, lin3.length, 1).setNumberFormat('#,##0.000'); }
  sh.setFrozenRows(0);
  sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 120); sh.setColumnWidths(3, 12, 110); sh.setColumnWidth(15, 24); sh.setColumnWidth(16, 80); sh.setColumnWidth(17, 200);
  sh.setRowHeight(5, 48);
}

// ===================== USUÁRIOS E LOGIN =====================
var CAB_USUARIOS = ['Usuario', 'Senha', 'Nome', 'Ativo', 'Perfil'];
var DIAS_SESSAO = 90;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Material')
    .addItem('Proteger senhas agora', 'protegerSenhas')
    .addItem('Desconectar todos os celulares', 'encerrarSessoes')
    .addItem('Refazer indicadores', 'refazerIndicadores')
    .addToUi();
}
function refazerIndicadores() { var ss = planilha_(); var db = matCarregar_(ss); matGravar_(ss, db); matIndicadores_(ss, db); }

function abaUsuarios_(ss) {
  var sh = ss.getSheetByName('Usuarios');
  if (!sh) {
    sh = ss.insertSheet('Usuarios');
    sh.getRange(1, 1, 1, 5).setValues([CAB_USUARIOS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('G1').setValue('Uma pessoa por linha. Ativo = Sim ou Não. Perfil = Engenharia (cadastra projeto) ou Campo (só lança). A senha vira um código embaralhado depois do primeiro login.');
  } else if (sh.getRange(1, 5).getValue() !== 'Perfil') {
    sh.getRange(1, 5).setValue('Perfil').setFontWeight('bold');
  }
  return sh;
}
function usuarios_() {
  var sh = abaUsuarios_(planilha_()), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 5).getValues().map(function (l, i) {
    var u = String(l[0]).trim();
    return { linha: i + 2, usuario: u, chave: u.toLowerCase(), senha: String(l[1]), nome: String(l[2]).trim() || u,
             ativo: /^(sim|s|yes|1|true|ativo)$/i.test(String(l[3]).trim()),
             perfil: /^eng/i.test(String(l[4]).trim()) ? 'Engenharia' : 'Campo' };
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
  if (u.senha.indexOf('sha256$') !== 0)
    abaUsuarios_(planilha_()).getRange(u.linha, 2).setValue(hashSenha_(String(body.senha), Utilities.getUuid().slice(0, 8)));
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('S_' + token, JSON.stringify({ u: u.chave, exp: Date.now() + DIAS_SESSAO * 864e5 }));
  return { ok: true, token: token, usuario: u.usuario, nome: u.nome, perfil: u.perfil };
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
function unsigned_(b) { return b.map(function (x) { return x < 0 ? x + 256 : x; }); }
function signed_(b) { return b.map(function (x) { return x > 127 ? x - 256 : x; }); }
function SHA256_(bytes) { return unsigned_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signed_(bytes))); }
function utf8_(str) { var out = [], s = unescape(encodeURIComponent(str)); for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); return out; }
