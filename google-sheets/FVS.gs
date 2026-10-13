/**
 * FVS -> Google Sheets
 * Cole este código em: Planilha > Extensões > Apps Script (apague o que estiver lá).
 * Depois: Implantar > Nova implantação > App da Web
 *   Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 * Copie o endereço que termina em /exec e cole no app de FVS (aba Obra > Google Sheets).
 *
 * Abas:
 *   FVS         - uma linha por ficha (Nº, processo, local, status, % de aprovação)
 *   Itens       - uma linha por item verificado (A / R / NA da 1ª e da 2ª verificação)
 *   Indicadores - % de aprovação por processo, por mês e os itens que mais reprovam (fórmulas)
 * Cada envio regrava a ficha inteira (não duplica se enviar de novo).
 */

var ABAS = {
  FVS:   ['Obra', 'FVS_N', 'Codigo', 'Processo', 'Categoria', 'Local', 'Projetos', 'Data_inicio', 'Data_termino',
          'Itens', 'Verificados', 'A', 'R', 'NA', 'Reparos_pendentes', 'Aprovacao_1a_verif', 'Status', 'Inspetor', 'Atualizado_em', 'Id'],
  Itens: ['Obra', 'FVS_N', 'Processo', 'Local', 'Mes', 'Secao', 'Item_N', 'Item', 'O_que_verificar',
          'Verif_1', 'Inspetor_1', 'Data_1', 'Verif_2', 'Inspetor_2', 'Data_2', 'Resultado_final', 'Observacao', 'Id']
};
var DATAS = { FVS: [8, 9, 19], Itens: [12, 15] };   // colunas (1 = A) que são datas

function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ABAS).forEach(function (nome) { aba_(ss, nome); });
  indicadores_(ss, true);
  return json_({ ok: true, planilha: ss.getName() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    var fichas = body.fichas || [], remover = body.remover || [];
    var ids = {};
    fichas.forEach(function (f) { ids[f.id] = true; });
    remover.forEach(function (id) { ids[id] = true; });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var novosF = [], novosI = [];
    fichas.forEach(function (f) {
      novosF.push(datas_('FVS', f.fvs).concat([f.id]));
      (f.itens || []).forEach(function (l) { novosI.push(datas_('Itens', l).concat([f.id])); });
    });
    regravar_(ss, 'FVS', ids, novosF);
    regravar_(ss, 'Itens', ids, novosI);
    indicadores_(ss, false);
    return json_({ ok: true, fichas: fichas.length, removidas: remover.length });
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
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#26313b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

// converte as colunas de data (vêm como "aaaa-mm-dd" ou número) em datas da planilha
function datas_(nome, linha) {
  var cab = ABAS[nome], l = linha.slice(0, cab.length - 1);
  while (l.length < cab.length - 1) l.push('');
  DATAS[nome].forEach(function (c) {
    var v = l[c - 1];
    if (typeof v === 'number') l[c - 1] = new Date(v);
    else if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) { var p = v.split('-'); l[c - 1] = new Date(+p[0], +p[1] - 1, +p[2]); }
  });
  return l;
}

// apaga as linhas das fichas enviadas (pela coluna Id) e grava as novas no lugar
function regravar_(ss, nome, ids, novos) {
  var sh = aba_(ss, nome);
  var n = ABAS[nome].length;
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
    DATAS[nome].forEach(function (c) {
      sh.getRange(2, c, todas.length, 1).setNumberFormat(c === 19 ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy');
    });
    if (nome === 'FVS') sh.getRange(2, 16, todas.length, 1).setNumberFormat('0%');
  }
}

// aba de indicadores: só fórmulas, recalcula sozinha quando chegam fichas novas
function indicadores_(ss, refazer) {
  var sh = ss.getSheetByName('Indicadores');
  if (sh && !refazer) return;
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
  sh.getRange('B5').setFormula('=COUNTA(FVS!B2:B)');
  sh.getRange('C5').setFormula('=D5+E5');
  sh.getRange('D5').setFormula('=COUNTIF(Itens!J2:J,"A")');
  sh.getRange('E5').setFormula('=COUNTIF(Itens!J2:J,"R")');
  sh.getRange('F5').setFormula('=COUNTIF(Itens!J2:J,"NA")');
  sh.getRange('G5').setFormula('=IF(C5=0,"",D5/C5)');
  sh.getRange('H5').setFormula('=IF(C5=0,"",COUNTIF(Itens!P2:P,"Aprovado*")/C5)');
  sh.getRange('I5').setFormula('=COUNTIF(Itens!P2:P,"Reparo pendente")');
  sh.getRange('A5:I5').setFontWeight('bold').setBackground('#fff3d1');
  sh.getRange('A6').setFormula('=IFERROR(SORT(UNIQUE(FILTER(Itens!C2:C,Itens!C2:C<>""))),"")');
  sh.getRange('B6').setFormula('=ARRAYFORMULA(IF(A6:A="","",COUNTIF(FVS!D2:D,A6:A)))');
  sh.getRange('C6').setFormula('=ARRAYFORMULA(IF(A6:A="","",D6:D+E6:E))');
  sh.getRange('D6').setFormula('=ARRAYFORMULA(IF(A6:A="","",COUNTIFS(Itens!C2:C,A6:A,Itens!J2:J,"A")))');
  sh.getRange('E6').setFormula('=ARRAYFORMULA(IF(A6:A="","",COUNTIFS(Itens!C2:C,A6:A,Itens!J2:J,"R")))');
  sh.getRange('F6').setFormula('=ARRAYFORMULA(IF(A6:A="","",COUNTIFS(Itens!C2:C,A6:A,Itens!J2:J,"NA")))');
  sh.getRange('G6').setFormula('=ARRAYFORMULA(IF(A6:A="","",IF(C6:C=0,"",D6:D/C6:C)))');
  sh.getRange('H6').setFormula('=ARRAYFORMULA(IF(A6:A="","",IF(C6:C=0,"",COUNTIFS(Itens!C2:C,A6:A,Itens!P2:P,"Aprovado*")/C6:C)))');
  sh.getRange('I6').setFormula('=ARRAYFORMULA(IF(A6:A="","",COUNTIFS(Itens!C2:C,A6:A,Itens!P2:P,"Reparo pendente")))');
  sh.getRange('G5:H').setNumberFormat('0.0%');

  // bloco 2: por mês
  var cab2 = ['Mês', 'Itens avaliados (A+R)', 'A', 'R', '% aprovação de 1ª'];
  sh.getRange(4, 11, 1, cab2.length).setValues([cab2]).setFontWeight('bold').setBackground(esc).setFontColor('#ffffff').setWrap(true);
  sh.getRange('K5').setFormula('=IFERROR(SORT(UNIQUE(FILTER(Itens!E2:E,Itens!E2:E<>""))),"")');
  sh.getRange('L5').setFormula('=ARRAYFORMULA(IF(K5:K="","",M5:M+N5:N))');
  sh.getRange('M5').setFormula('=ARRAYFORMULA(IF(K5:K="","",COUNTIFS(Itens!E2:E,K5:K,Itens!J2:J,"A")))');
  sh.getRange('N5').setFormula('=ARRAYFORMULA(IF(K5:K="","",COUNTIFS(Itens!E2:E,K5:K,Itens!J2:J,"R")))');
  sh.getRange('O5').setFormula('=ARRAYFORMULA(IF(K5:K="","",IF(L5:L=0,"",M5:M/L5:L)))');
  sh.getRange('O5:O').setNumberFormat('0.0%');

  // bloco 3: itens que mais reprovam
  sh.getRange('Q4:S4').setFontWeight('bold').setBackground(esc).setFontColor('#ffffff').setWrap(true);
  sh.getRange('Q4').setFormula('=IFERROR(QUERY(Itens!A1:R,"select C, H, count(J) where J = \'R\' group by C, H order by count(J) desc limit 20 label C \'Processo\', H \'Item que mais reprova\', count(J) \'Reprovações (R na 1ª)\'",1),"Itens que mais reprovam: nenhuma reprovação ainda")');

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

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
