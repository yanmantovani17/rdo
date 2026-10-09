/**
 * RDO -> Google Sheets
 * Cole este código em: Planilha > Extensões > Apps Script (apague o que estiver lá).
 * Depois: Implantar > Nova implantação > App da Web
 *   Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 * Copie o endereço que termina em /exec e cole no app (aba Obra > Google Sheets).
 *
 * Cada envio regrava os dados daquela obra + data (não duplica se enviar de novo).
 */

var ABAS = {
  Dias:         ['Obra', 'Data', 'RDO_N', 'Dia_semana', 'Efetivo_total', 'Equipamentos_total', 'Chuva_mm', 'Horas_paradas', 'Servicos_com_producao', 'Dia_paralisado', 'Atualizado_em'],
  Producao:     ['Obra', 'Data', 'Empresa', 'Servico', 'Unidade', 'Producao'],
  Efetivo:      ['Obra', 'Data', 'Empresa', 'Funcao', 'Quantidade'],
  Equipamentos: ['Obra', 'Data', 'Equipamento', 'Quantidade', 'Frente_obs'],
  Clima:        ['Obra', 'Data', 'Periodo', 'Condicao', 'Status', 'Observacao']
};

function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ABAS).forEach(function (nome) { aba_(ss, nome); });
  return json_({ ok: true, planilha: ss.getName() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    var dias = body.dias || [];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(ABAS).forEach(function (nome) {
      var novos = [];
      dias.forEach(function (d) {
        (d.tabelas[nome] || []).forEach(function (linha) {
          var l = [d.obra, data_(d.data)].concat(linha);
          if (nome === 'Dias') l[ABAS.Dias.length - 1] = new Date(Number(l[ABAS.Dias.length - 1]) || Date.now());
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
  if (sh.getLastRow() === 0) {
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
    if (nome === 'Dias') sh.getRange(2, n, todas.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  }
}

function data_(iso) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function iso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
