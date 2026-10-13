/**
 * FVS -> Google Sheets  (segundo arquivo do MESMO projeto do Apps Script do RDO)
 *
 * Como instalar (uma vez):
 *   1. Abra a planilha do RDO (MATRIX_CAJAMAR_PRODUTIVIDADE) > Extensões > Apps Script.
 *   2. Troque o conteúdo de Codigo.gs pela versão nova (ela tem a linha que chama as FVS).
 *   3. Clique no "+" ao lado de Arquivos > Script, dê o nome FVS e cole este código.
 *   4. Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar.
 *
 * O login, os usuários (aba Usuarios da planilha do RDO) e os lembretes são os mesmos do RDO.
 * As fichas vão para a planilha de FVS abaixo, nas abas:
 *   FVS         - uma linha por ficha (Nº, processo, local, status, % de aprovação, quem preencheu)
 *   Itens       - uma linha por item verificado (A / R / NA da 1ª e da 2ª verificação)
 *   Indicadores - % de aprovação por processo, por mês e os itens que mais reprovam (fórmulas)
 * Cada envio regrava a ficha inteira (não duplica se enviar de novo).
 */

var FVS_PLANILHA_ID = '14hWLYy6Vv9O0YLEloFozDz84UFKw9uO5WusLq63U_70';   // MATRIZ_CAJAMAR_FVS

var FVS_ABAS = {
  FVS:   ['Obra', 'FVS_N', 'Codigo', 'Processo', 'Categoria', 'Local', 'Projetos', 'Data_inicio', 'Data_termino',
          'Itens', 'Verificados', 'A', 'R', 'NA', 'Reparos_pendentes', 'Aprovacao_1a_verif', 'Status', 'Inspetor',
          'Atualizado_em', 'Preenchido_por', 'Id'],
  Itens: ['Obra', 'FVS_N', 'Processo', 'Local', 'Mes', 'Secao', 'Item_N', 'Item', 'O_que_verificar',
          'Verif_1', 'Inspetor_1', 'Data_1', 'Verif_2', 'Inspetor_2', 'Data_2', 'Resultado_final', 'Observacao', 'Id']
};
var FVS_DATAS = { FVS: [8, 9, 19], Itens: [12, 15] };   // colunas (1 = A) que são datas

// chamado pelo doPost do Codigo.gs quando body.acao === 'fvs' (já com o login conferido)
function fvsReceber_(body, quem) {
  var ss = SpreadsheetApp.openById(FVS_PLANILHA_ID);
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

// rode esta função uma vez no editor se quiser recriar a aba Indicadores do zero
function fvsRefazerIndicadores() { fvsIndicadores_(SpreadsheetApp.openById(FVS_PLANILHA_ID), true); }

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
function fvsIndicadores_(ss, refazer) {
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
