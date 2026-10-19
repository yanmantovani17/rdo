// Gera os PDFs das fichas de entrega de EPI e ferramentas (jsPDF + autotable).
(function () {
  'use strict';
  var MOTIVO = { PRIMEIRA_ENTREGA: '1ª entrega', ADICIONAL: 'Adicional', TROCA_PERIODICA: 'Troca no prazo', DESGASTE_NATURAL: 'Desgaste', DANIFICADO: 'Danificado', PERDA: 'Perda' };
  var ASFALTO = [38, 49, 59], SINAL = [232, 161, 0], CINZA = [93, 102, 112], LINHA = [205, 210, 206];

  function pad2(n) { return String(n).padStart(2, '0'); }
  function dataHora(v) { var d = new Date(v); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function data(v) { if (!v) return ''; var d = new Date(v); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { var p = v.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; } return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function cpf(v) { v = String(v || ''); return v.length === 11 ? v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9) : (v || '—'); }
  function qtd(n) { return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }
  function numero(id) { return String(id).padStart(6, '0'); }

  function novoDoc() { var J = window.jspdf.jsPDF; return new J({ unit: 'mm', format: 'a4' }); }

  function imagem(doc, src, x, y, maxW, maxH) {
    if (!src) return;
    try {
      var p = doc.getImageProperties(src), r = Math.min(maxW / p.width, maxH / p.height);
      var w = p.width * r, h = p.height * r;
      doc.addImage(src, 'PNG', x + (maxW - w) / 2, y + (maxH - h) / 2, w, h, undefined, 'FAST');
    } catch (e) { /* imagem inválida: deixa em branco */ }
  }

  function cabecalho(doc, emp, titulo, direita) {
    var W = doc.internal.pageSize.getWidth();
    doc.setFillColor.apply(doc, ASFALTO); doc.rect(0, 0, W, 24, 'F');
    doc.setFillColor.apply(doc, SINAL); doc.rect(0, 24, W, 1.6, 'F');
    var x = 12;
    if (emp.logo) { doc.setFillColor(255, 255, 255); doc.roundedRect(10, 4, 30, 16, 2, 2, 'F'); imagem(doc, emp.logo, 11, 5, 28, 14); x = 45; }
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(titulo, x, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    var linha = [emp.nome, emp.cnpj ? 'CNPJ ' + emp.cnpj : '', emp.obra].filter(Boolean).join('  ·  ');
    if (linha) doc.text(doc.splitTextToSize(linha, W - x - 52)[0], x, 17);
    if (direita) { doc.setFont('courier', 'bold'); doc.setFontSize(12); doc.text(direita, W - 12, 13, { align: 'right' }); }
    doc.setTextColor(29, 35, 41);
    return 32;
  }

  function caixaColaborador(doc, y, c) {
    var W = doc.internal.pageSize.getWidth();
    doc.setDrawColor.apply(doc, LINHA); doc.setLineWidth(0.3); doc.roundedRect(10, y, W - 20, 20, 2, 2);
    function campo(rot, val, x, yy, w) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor.apply(doc, CINZA); doc.text(rot.toUpperCase(), x, yy);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(29, 35, 41);
      doc.text(doc.splitTextToSize(String(val || '—'), w)[0], x, yy + 4.6);
    }
    var col = (W - 28) / 4;
    campo('Colaborador', c.nome, 14, y + 5, col * 2 - 4);
    campo('CPF', cpf(c.cpf), 14 + col * 2, y + 5, col - 4);
    campo('Matrícula', c.matricula, 14 + col * 3, y + 5, col - 4);
    campo('Função', c.funcao, 14, y + 14, col * 2 - 4);
    campo(c.rotData || 'Admissão', c.data, 14 + col * 2, y + 14, col * 2 - 4);
    return y + 25;
  }

  function termo(doc, y, texto) {
    var W = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor.apply(doc, CINZA); doc.text('TERMO DE RESPONSABILIDADE', 10, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(29, 35, 41);
    var linhas = doc.splitTextToSize(texto || '', W - 20);
    doc.text(linhas, 10, y + 4.5, { lineHeightFactor: 1.3 });
    return y + 4.5 + linhas.length * 8.6 * 0.3528 * 1.3 + 3;
  }

  function rodape(doc) {
    var n = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, CINZA);
      doc.text('Gerado em ' + dataHora(new Date()) + ' pelo app EPI e Ferramentas', 10, H - 7);
      doc.text('Página ' + i + ' de ' + n, W - 10, H - 7, { align: 'right' });
    }
  }

  function carimboCancelada(doc, motivo) {
    var W = doc.internal.pageSize.getWidth();
    doc.setTextColor(180, 35, 24); doc.setFont('helvetica', 'bold'); doc.setFontSize(40);
    doc.text('CANCELADA', W / 2, 150, { align: 'center', angle: 20 });
    doc.setFontSize(10); doc.text('Motivo: ' + (motivo || ''), W / 2, 162, { align: 'center' });
    doc.setTextColor(29, 35, 41);
  }

  // Ficha de uma entrega
  function ficha(d) {
    var doc = novoDoc(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), e = d.entrega;
    var y = cabecalho(doc, d.empresa || {}, 'FICHA DE ENTREGA DE EPI E FERRAMENTAS', 'Nº ' + numero(e.id));
    y = caixaColaborador(doc, y, { nome: e.colaborador_nome, cpf: e.colaborador_cpf, matricula: e.colaborador_matricula, funcao: e.funcao_nome, rotData: 'Data e hora da entrega', data: dataHora(e.data_hora) });
    doc.autoTable({
      startY: y, margin: { left: 10, right: 10 },
      head: [['Item', 'Tipo', 'CA', 'Qtd', 'Motivo']],
      body: d.itens.map(function (i) { return [i.item_nome, i.item_tipo === 'EPI' ? 'EPI' : 'Ferramenta', i.ca || '—', qtd(i.quantidade), MOTIVO[i.motivo] || i.motivo]; }),
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.2, lineColor: LINHA, lineWidth: 0.2 },
      headStyles: { fillColor: ASFALTO, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 1: { cellWidth: 24 }, 2: { cellWidth: 22 }, 3: { cellWidth: 14, halign: 'right' }, 4: { cellWidth: 30 } }
    });
    y = doc.lastAutoTable.finalY + 6;
    if (e.observacao) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor.apply(doc, CINZA); doc.text('OBSERVAÇÃO', 10, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(29, 35, 41);
      var ob = doc.splitTextToSize(e.observacao, W - 20); doc.text(ob, 10, y + 4.5); y += 6 + ob.length * 4.4;
    }
    var alturaTermo = doc.splitTextToSize(e.termo || '', W - 20).length * 4 + 10;
    if (y + alturaTermo + 52 > H - 14) { doc.addPage(); y = 16; }
    y = termo(doc, y, e.termo) + 4;
    // assinaturas
    var bw = (W - 30) / 2;
    [[e.assinatura_colaborador, e.colaborador_nome, 'Colaborador'], [e.assinatura_responsavel, e.responsavel_nome, 'Responsável pela entrega']].forEach(function (a, k) {
      var x = 10 + k * (bw + 10);
      imagem(doc, a[0], x, y, bw, 26);
      doc.setDrawColor(29, 35, 41); doc.setLineWidth(0.3); doc.line(x, y + 28, x + bw, y + 28);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(doc.splitTextToSize(a[1] || '', bw)[0], x + bw / 2, y + 32.5, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, CINZA); doc.text(a[2], x + bw / 2, y + 36.5, { align: 'center' }); doc.setTextColor(29, 35, 41);
    });
    y += 44;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor.apply(doc, CINZA);
    var aut = doc.splitTextToSize('Assinada eletronicamente no app em ' + dataHora(e.data_hora) + ', no aparelho do responsável, após login individual. Os dados e as assinaturas ficam gravados no banco sem possibilidade de alteração. Código de integridade (SHA-256): ' + (e.hash || ''), W - 20);
    doc.text(aut, 10, y);
    if (e.cancelada) carimboCancelada(doc, e.cancelada_motivo);
    rodape(doc);
    return doc.output('blob');
  }

  // Ficha completa do colaborador (histórico de tudo o que recebeu)
  function fichaColaborador(d) {
    var doc = novoDoc(), W = doc.internal.pageSize.getWidth(), c = d.colaborador;
    var y = cabecalho(doc, d.empresa || {}, 'FICHA DE CONTROLE DE EPI E FERRAMENTAS', '');
    y = caixaColaborador(doc, y, { nome: c.nome, cpf: c.cpf, matricula: c.matricula, funcao: c.funcao, rotData: 'Admissão', data: data(c.admissao) });
    y = termo(doc, y, d.termo) + 1;
    var ass = {};
    d.fichas.forEach(function (f) { ass[f.id] = f; });
    var linhas = d.itens.map(function (i) {
      var f = ass[i.entrega_id] || {};
      var sit = f.cancelada ? 'Ficha cancelada' : i.devolvido_em ? 'Devolvido ' + data(i.devolvido_em) + (i.devolucao_estado && i.devolucao_estado !== 'BOM' ? ' (' + i.devolucao_estado.toLowerCase() + ')' : '') : i.substituido_em ? 'Trocado ' + data(i.substituido_em) : 'Em uso';
      return { r: [data(i.data), numero(i.entrega_id), i.item_nome, i.ca || '—', qtd(i.quantidade), MOTIVO[i.motivo] || i.motivo, sit, ''], ass: f.assinatura_colaborador };
    });
    doc.autoTable({
      startY: y, margin: { left: 10, right: 10, top: 14 },
      head: [['Data', 'Ficha', 'Item', 'CA', 'Qtd', 'Motivo', 'Situação', 'Assinatura']],
      body: linhas.map(function (l) { return l.r; }),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, lineColor: LINHA, lineWidth: 0.2, minCellHeight: 11, valign: 'middle' },
      headStyles: { fillColor: ASFALTO, textColor: 255, fontStyle: 'bold', minCellHeight: 7 },
      columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 15 }, 3: { cellWidth: 14 }, 4: { cellWidth: 10, halign: 'right' }, 5: { cellWidth: 19 }, 6: { cellWidth: 26 }, 7: { cellWidth: 30 } },
      didDrawCell: function (h) {
        if (h.section === 'body' && h.column.index === 7) { var l = linhas[h.row.index]; if (l && l.ass) imagem(doc, l.ass, h.cell.x + 1, h.cell.y + 0.8, h.cell.width - 2, h.cell.height - 1.6); }
      }
    });
    y = doc.lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor.apply(doc, CINZA);
    doc.text(doc.splitTextToSize('Cada linha foi assinada pelo colaborador no momento da entrega, no app, com login individual do responsável. As fichas individuais (com as duas assinaturas e o código de integridade) podem ser emitidas pelo número.', W - 20), 10, y);
    rodape(doc);
    return doc.output('blob');
  }

  window.EPIPDF = { ficha: ficha, fichaColaborador: fichaColaborador, numero: numero };
})();
