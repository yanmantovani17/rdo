/* Gerador do RDO: preenche o modelo .xlsx (embutido em base64) editando o XML das planilhas.
   Mantém formatação, validações, formatação condicional e logo do modelo original. */
(function (root) {
  'use strict';

  var FUNC_REC = ['Gerente de Contratos','Coordenador de Produção','Eng. de Produção','Eng. De Instalações','Eng. De Planejamento','Eng. De Controle de Custos','Arquiteto','Aux. de Controle de Custos','Analista técnico','Estagiário','Mestre de obras','Administrativo de Obra','Aux. Administrativo','Téc Seg. Trabalho','Auxiliar  de Seg. Trabalho','Encarregado','Almoxarife','Ajudante','Carpinteiro','Auxiliar de Almoxarife','Laboratorista','Líder','Serralheiro','Aux. Topógrafo','Operador','Topógrafo','Armador','Técnico','Pedreiro','Instalador','Eletricista','Vigilante','Montador','Meio oficial','Soldador','Supervisor de Obras','Encanador','Sócio Proprietário','Assistente técnico','Motorista','Greidista','Analista de Engenharia','Pintor','Servente','Calceteiro','Azulejista','Gestor','Aplicador'];
  var FUNC_VIS = ['Diretoria de Operações','Superintendente de Contratos','Gerência','Analista Ambiental','Coordenador de Projetos','Gerente de Segurança','Engenheiro de QSMS','Engenheiro de Segurança','Analista de Qualidade','Diretor de Operações','Comprador','Gerente Administrativo','Gerente de Instalações','Gerente de Custos','Coordenador de Suprimentos','Gerente de Projetos','Superintendente de Suprimentos'];
  var LIMITS = { empresas: 30, visitantes: 8, equipamentos: 20, atividades: 40, fotos: 24, extrasRec: 4, extrasVis: 35, responsaveis: 4 };
  var CONDICOES = ['Bom', 'Nublado', 'Chuvoso'];
  var STATUS = ['Sem impactos', 'Parcialmente Impactado', 'Paralisado', 'Sem Atividades'];

  // sheet files
  var S = { p1: 'xl/worksheets/sheet2.xml', p2: 'xl/worksheets/sheet3.xml', p3: 'xl/worksheets/sheet4.xml', p4: 'xl/worksheets/sheet5.xml' };
  var PHOTO_SHEETS = [
    { file: 'xl/worksheets/sheet5.xml', rels: 'xl/worksheets/_rels/sheet5.xml.rels' },
    { file: 'xl/worksheets/sheet10.xml', rels: 'xl/worksheets/_rels/sheet10.xml.rels' },
    { file: 'xl/worksheets/sheet11.xml', rels: 'xl/worksheets/_rels/sheet11.xml.rels' },
    { file: 'xl/worksheets/sheet12.xml', rels: 'xl/worksheets/_rels/sheet12.xml.rels' }
  ];
  // frames (0-based col/row of top-left, inclusive bottom-right) + caption cell
  var FRAMES = [
    { c1: 2, r1: 9, c2: 29, r2: 21, cap: 'C23' },
    { c1: 32, r1: 9, c2: 59, r2: 21, cap: 'AG23' },
    { c1: 2, r1: 25, c2: 29, r2: 37, cap: 'C39' },
    { c1: 32, r1: 25, c2: 59, r2: 37, cap: 'AG39' },
    { c1: 2, r1: 41, c2: 29, r2: 54, cap: 'C56' },
    { c1: 32, r1: 41, c2: 59, r2: 54, cap: 'AG56' }
  ];
  var COL_PX = 24, ROW_PX = 36, EMU = 9525, INSET = 38100;
  function frameAspect(i) { var f = FRAMES[i % 6]; return ((f.c2 - f.c1 + 1) * COL_PX) / ((f.r2 - f.r1 + 1) * ROW_PX); }

  // ---------- helpers ----------
  function colName(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function colNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function splitRef(ref) { var m = /^([A-Z]+)(\d+)$/.exec(ref); return { col: colNum(m[1]), row: +m[2] }; }
  function esc(t) {
    return String(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function serial(iso) { // 'YYYY-MM-DD' -> Excel serial
    if (!iso) return null; var p = iso.split('-');
    var d = Date.UTC(+p[0], +p[1] - 1, +p[2]);
    return Math.round(d / 86400000) + 25569;
  }
  var DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  function weekday(iso) { var p = iso.split('-'); return DIAS[new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()]; }
  function num(v) { var n = Number(v); return isFinite(n) && v !== '' && v !== null && v !== undefined ? n : null; }

  function cellRe(ref) { return new RegExp('<c r="' + ref + '"(?=[ >/])([^>]*?)(?:/>|>([\\s\\S]*?)</c>)'); }

  function buildCell(ref, attrs, value) {
    var a = attrs.replace(/\st="[^"]*"/, '').replace(/\s*\/$/, '');
    if (value === null || value === undefined || value === '') return '<c r="' + ref + '"' + a + '/>';
    if (typeof value === 'number') return '<c r="' + ref + '"' + a + '><v>' + value + '</v></c>';
    return '<c r="' + ref + '"' + a + ' t="inlineStr"><is><t xml:space="preserve">' + esc(value) + '</t></is></c>';
  }

  function insertCell(xml, ref, cellXml) {
    var p = splitRef(ref);
    var rowRe = new RegExp('<row r="' + p.row + '"(?=[ >/])([^>]*?)(/>|>([\\s\\S]*?)</row>)');
    var m = rowRe.exec(xml);
    if (!m) {
      // insert a new row in order
      var rows = /<row r="(\d+)"/g, mm, pos = xml.indexOf('</sheetData>');
      while ((mm = rows.exec(xml))) { if (+mm[1] > p.row) { pos = mm.index; break; } }
      if (xml.indexOf('<sheetData/>') >= 0) { xml = xml.replace('<sheetData/>', '<sheetData></sheetData>'); pos = xml.indexOf('</sheetData>'); }
      return xml.slice(0, pos) + '<row r="' + p.row + '">' + cellXml + '</row>' + xml.slice(pos);
    }
    var inner = m[2] === '/>' ? '' : m[3];
    var cells = /<c r="([A-Z]+)\d+"/g, cm, at = inner.length;
    while ((cm = cells.exec(inner))) { if (colNum(cm[1]) > p.col) { at = cm.index; break; } }
    var newInner = inner.slice(0, at) + cellXml + inner.slice(at);
    var attrs = m[1].replace(/\s*\/$/, '');
    return xml.slice(0, m.index) + '<row r="' + p.row + '"' + attrs + '>' + newInner + '</row>' + xml.slice(m.index + m[0].length);
  }

  // Set a literal value (replaces any formula)
  function setCell(xml, ref, value) {
    var m = cellRe(ref).exec(xml);
    if (!m) { if (value === null || value === undefined || value === '') return xml; return insertCell(xml, ref, buildCell(ref, '', value)); }
    return xml.slice(0, m.index) + buildCell(ref, m[1], value) + xml.slice(m.index + m[0].length);
  }

  // Update only the cached result of a formula cell (keeps the formula)
  function setCached(xml, ref, value) {
    var m = cellRe(ref).exec(xml);
    if (!m || !m[2] || m[2].indexOf('<f') < 0) return xml;
    var f = /<f[\s\S]*?(?:<\/f>|\/>)/.exec(m[2])[0];
    var a = m[1].replace(/\st="[^"]*"/, '');
    var out;
    if (typeof value === 'number') out = '<c r="' + ref + '"' + a + '>' + f + '<v>' + value + '</v></c>';
    else out = '<c r="' + ref + '"' + a + ' t="str">' + f + '<v>' + esc(value == null ? '' : value) + '</v></c>';
    return xml.slice(0, m.index) + out + xml.slice(m.index + m[0].length);
  }

  function setFormulaOrValue(xml, ref, value) { // for cells that may hold a formula we want replaced
    return setCell(xml, ref, value);
  }

  // ---------- main fill ----------
  function fillSheets(files, cfg, rdo) {
    var p1 = files[S.p1], p2 = files[S.p2], p3 = files[S.p3], p4 = files[S.p4];
    var obra = cfg.obra || '';
    var dSer = serial(rdo.data), iSer = serial(cfg.inicio), tSer = serial(cfg.termino);

    // header / período
    p1 = setCell(p1, 'B6', obra);
    p1 = setCell(p1, 'B10', dSer);
    p1 = setCell(p1, 'V10', iSer);
    p1 = setCell(p1, 'V11', tSer);
    var numero = (dSer && iSer) ? dSer - iSer + 1 : '';
    var previsto = (tSer && iSer) ? tSer - iSer + 1 : '';
    var decorrido = numero;
    p1 = setCached(p1, 'BB3', numero);
    p1 = setCached(p1, 'B11', rdo.data ? weekday(rdo.data) : '');
    p1 = setCached(p1, 'AL10', previsto);
    p1 = setCached(p1, 'AL11', decorrido);
    if (previsto !== '' && decorrido !== '') { p1 = setCached(p1, 'BB10', previsto - decorrido); p1 = setCached(p1, 'BB11', decorrido / previsto); }

    // clima
    var per = ['manha', 'tarde', 'noite'];
    var clima = rdo.clima || {};
    per.forEach(function (k, i) {
      var c = clima[k] || {}, r = 15 + i;
      p1 = setCell(p1, 'F' + r, c.cond || '');
      p1 = setCell(p1, 'J' + r, c.status || '');
      p1 = setCell(p1, 'R' + r, c.obs || '');
    });
    p1 = setCell(p1, 'BF15', num(rdo.mm));
    var par = rdo.paralisacao || [];
    for (var h = 0; h < 24; h++) p1 = setCell(p1, colName(10 + h * 2) + '18', par[h] ? 1 : 0);

    // efetivo recorrente
    var extrasRec = (cfg.funcoesExtras || []).slice(0, LIMITS.extrasRec);
    for (var e = 0; e < LIMITS.extrasRec; e++) p1 = setCell(p1, colName(56 + e) + '23', extrasRec[e] || '');
    var recCols = {}; FUNC_REC.forEach(function (f, i) { recCols[f] = 8 + i; }); extrasRec.forEach(function (f, i) { recCols[f] = 56 + i; });
    var efet = rdo.efetivo || [], totRec = 0;
    for (var r = 0; r < LIMITS.empresas; r++) {
      var row = 29 + r, item = efet[r] || null, rowSum = 0;
      p1 = setCell(p1, 'B' + row, item ? item.empresa : '');
      var q = (item && item.q) || {};
      for (var c = 8; c <= 59; c++) p1 = setCell(p1, colName(c) + row, null);
      Object.keys(q).forEach(function (fn) { var n = num(q[fn]); if (n && recCols[fn]) { p1 = setCell(p1, colName(recCols[fn]) + row, n); rowSum += n; } });
      p1 = setCached(p1, 'BH' + row, rowSum || '');
      totRec += rowSum;
    }
    p1 = setCached(p1, 'BH27', totRec);

    // visitantes
    var extrasVis = (cfg.funcoesVisExtras || []).slice(0, LIMITS.extrasVis);
    for (var ev = 0; ev < LIMITS.extrasVis; ev++) p1 = setCell(p1, colName(25 + ev) + '62', extrasVis[ev] || '');
    var visCols = {}; FUNC_VIS.forEach(function (f, i) { visCols[f] = 8 + i; }); extrasVis.forEach(function (f, i) { visCols[f] = 25 + i; });
    var vis = rdo.visitantes || [], totVis = 0;
    for (var v = 0; v < LIMITS.visitantes; v++) {
      var vrow = 68 + v, vi = vis[v] || null, vsum = 0;
      p1 = setCell(p1, 'B' + vrow, vi ? vi.empresa : '');
      for (var vc = 8; vc <= 59; vc++) p1 = setCell(p1, colName(vc) + vrow, null);
      var vq = (vi && vi.q) || {};
      Object.keys(vq).forEach(function (fn) { var n = num(vq[fn]); if (n && visCols[fn]) { p1 = setCell(p1, colName(visCols[fn]) + vrow, n); vsum += n; } });
      p1 = setCached(p1, 'BH' + vrow, vsum || '');
      totVis += vsum;
    }
    p1 = setCached(p1, 'BH66', totVis);
    p1 = setCached(p1, 'BG77', totRec + totVis);

    // responsáveis
    var el = cfg.elaboracao || [], rc = cfg.recebimento || [];
    var respRows = [];
    for (var i = 0; i < LIMITS.responsaveis; i++) {
      var rr = 82 + i, a = el[i] || {}, b = rc[i] || {};
      p1 = setCell(p1, 'B' + rr, a.nome || '');
      p1 = setCell(p1, 'O' + rr, a.funcao || '');
      p1 = setCell(p1, 'W' + rr, a.nome ? dSer : null);
      p1 = setCell(p1, 'AF' + rr, b.nome || '');
      p1 = setCell(p1, 'AS' + rr, b.funcao || '');
      respRows.push([a.nome || '', a.funcao || '', a.nome ? dSer : '', b.nome || '', b.funcao || '', '']);
    }

    // PAG 02 — equipamentos
    var eq = (rdo.equipamentos || []).filter(function (x) { return x && x.desc; });
    for (var k = 0; k < LIMITS.equipamentos; k++) {
      var left = k < 10, rowE = 10 + (k % 10), it = eq[k] || {};
      p2 = setCell(p2, (left ? 'C' : 'AG') + rowE, it.desc || '');
      p2 = setCell(p2, (left ? 'K' : 'AO') + rowE, it.desc ? (num(it.qtd) == null ? 0 : num(it.qtd)) : null);
      p2 = setCell(p2, (left ? 'M' : 'AQ') + rowE, it.obs || '');
    }
    // atividades
    var at = (rdo.atividades || []).filter(function (x) { return x && (x.desc || x.empresa); });
    if (!at.length) at = [{ empresa: '', desc: 'Sem atividades.' }];
    for (var t = 0; t < LIMITS.atividades; t++) {
      var leftA = t < 20, rowA = 23 + (t % 20), ia = at[t] || {};
      p2 = setCell(p2, (leftA ? 'C' : 'AG') + rowA, ia.empresa || '');
      p2 = setCell(p2, (leftA ? 'I' : 'AM') + rowA, ia.desc || '');
    }

    // PAG 03 — textos
    p3 = setCell(p3, 'B9', rdo.ocorrencias || '');
    p3 = setCell(p3, 'B29', rdo.comLibercon || '');
    p3 = setCell(p3, 'B47', rdo.comCliente || '');

    files[S.p1] = p1; files[S.p2] = p2; files[S.p3] = p3; files[S.p4] = p4;

    // cached copies on the other pages
    var respMap = {
      'xl/worksheets/sheet3.xml': 48, 'xl/worksheets/sheet4.xml': 67, 'xl/worksheets/sheet5.xml': 63
    };
    Object.keys(files).forEach(function (fn) {
      if (fn === S.p1 || !/^xl\/worksheets\/sheet\d+\.xml$/.test(fn)) return;
      var x = files[fn];
      x = setCached(x, 'B6', obra);
      x = setCached(x, 'BB3', numero);
      if (respMap[fn]) {
        respRows.forEach(function (vals, i) {
          var rr = respMap[fn] + i;
          ['B', 'O', 'W', 'AF', 'AS', 'BA'].forEach(function (col, j) { x = setCached(x, col + rr, vals[j]); });
        });
      }
      files[fn] = x;
    });
    return { numero: numero };
  }

  // ---------- photos ----------
  function addPhotos(zip, files, fotos, ctypes) {
    var list = (fotos || []).filter(function (f) { return f && (f.bytes || f.legenda); }).slice(0, LIMITS.fotos);
    // clear all captions
    PHOTO_SHEETS.forEach(function (ps) { FRAMES.forEach(function (fr) { files[ps.file] = setCell(files[ps.file], fr.cap, ''); }); });
    var bySheet = {};
    list.forEach(function (f, i) { var s = Math.floor(i / 6); (bySheet[s] = bySheet[s] || []).push({ f: f, slot: i % 6, n: i + 1 }); });
    var drawN = 0;
    Object.keys(bySheet).forEach(function (sIdx) {
      var ps = PHOTO_SHEETS[sIdx], items = bySheet[sIdx];
      items.forEach(function (it) { files[ps.file] = setCell(files[ps.file], FRAMES[it.slot].cap, it.f.legenda || ''); });
      var pics = items.filter(function (it) { return it.f.bytes; });
      if (!pics.length) return;
      drawN++;
      var dName = 'rdo_fotos' + drawN + '.xml';
      var anchors = '', rels = '';
      pics.forEach(function (it, j) {
        var fr = FRAMES[it.slot], rid = 'rIdImg' + (j + 1), media = 'rdo_foto_' + it.n + '.jpeg';
        zip.file('xl/media/' + media, it.f.bytes);
        rels += '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' + media + '"/>';
        var cx = (fr.c2 - fr.c1 + 1) * COL_PX * EMU - 2 * INSET, cy = (fr.r2 - fr.r1 + 1) * ROW_PX * EMU - 2 * INSET;
        anchors += '<xdr:twoCellAnchor editAs="oneCell">' +
          '<xdr:from><xdr:col>' + fr.c1 + '</xdr:col><xdr:colOff>' + INSET + '</xdr:colOff><xdr:row>' + fr.r1 + '</xdr:row><xdr:rowOff>' + INSET + '</xdr:rowOff></xdr:from>' +
          '<xdr:to><xdr:col>' + fr.c2 + '</xdr:col><xdr:colOff>' + (COL_PX * EMU - INSET) + '</xdr:colOff><xdr:row>' + fr.r2 + '</xdr:row><xdr:rowOff>' + (ROW_PX * EMU - INSET) + '</xdr:rowOff></xdr:to>' +
          '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + (j + 2) + '" name="Foto ' + it.n + '" descr="' + esc(it.f.legenda || '') + '"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
          '<xdr:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
          '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>';
      });
      zip.file('xl/drawings/' + dName, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' + anchors + '</xdr:wsDr>');
      zip.file('xl/drawings/_rels/' + dName + '.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>');
      ctypes.push('<Override PartName="/xl/drawings/' + dName + '" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>');
      // sheet rel
      var relXml = files[ps.rels] || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      relXml = relXml.replace('</Relationships>', '<Relationship Id="rIdRdoDrw" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/' + dName + '"/></Relationships>');
      files[ps.rels] = relXml;
      var sx = files[ps.file];
      var tags = ['<legacyDrawing', '<legacyDrawingHF', '<drawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'];
      var pos = -1; for (var q = 0; q < tags.length; q++) { pos = sx.indexOf(tags[q]); if (pos >= 0) break; }
      files[ps.file] = sx.slice(0, pos) + '<drawing r:id="rIdRdoDrw"/>' + sx.slice(pos);
    });
  }

  function b64ToBytes(b64) {
    if (typeof atob === 'function') { var bin = atob(b64), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  }

  async function generate(JSZip, templateB64, cfg, rdo, opts) {
    opts = opts || {};
    var zip = await JSZip.loadAsync(b64ToBytes(templateB64));
    var names = Object.keys(zip.files).filter(function (n) { return /^xl\/worksheets\/(_rels\/)?sheet\d+\.xml(\.rels)?$/.test(n); });
    var files = {};
    for (var i = 0; i < names.length; i++) files[names[i]] = await zip.file(names[i]).async('string');
    var info = fillSheets(files, cfg, rdo);
    // logo da empresa: o logo fica numa imagem só (xl/media/image1.jpeg) usada em B2 de todas as abas
    if (cfg.logo && /^data:image\/jpeg;base64,/.test(cfg.logo) && zip.file('xl/media/image1.jpeg')) {
      zip.file('xl/media/image1.jpeg', b64ToBytes(cfg.logo.split(',')[1]));
    }
    var ctypes = [];
    addPhotos(zip, files, rdo.fotos, ctypes);
    Object.keys(files).forEach(function (n) { zip.file(n, files[n]); });
    if (ctypes.length) {
      var ct = await zip.file('[Content_Types].xml').async('string');
      zip.file('[Content_Types].xml', ct.replace('</Types>', ctypes.join('') + '</Types>'));
    }
    // calcChain may reference cells whose formulas were replaced by values → drop it, Excel rebuilds
    zip.remove('xl/calcChain.xml');
    var ct2 = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', ct2.replace('<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/>', ''));
    var wr = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    zip.file('xl/_rels/workbook.xml.rels', wr.replace(/<Relationship Id="[^"]+" Type="[^"]+\/calcChain" Target="calcChain.xml"\/>/, ''));
    var data = await zip.generateAsync({ type: opts.type || 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return { data: data, numero: info.numero };
  }

  function fileName(cfg, rdo) {
    var p = (rdo.data || '').split('-');
    return p[0] + '.' + p[1] + '.' + p[2] + ' - ' + (cfg.obra || 'OBRA').replace(/[\\/:*?"<>|]/g, '') + ' - RDO.xlsx';
  }

  var api = { FUNC_REC: FUNC_REC, FUNC_VIS: FUNC_VIS, LIMITS: LIMITS, CONDICOES: CONDICOES, STATUS: STATUS, frameAspect: frameAspect, generate: generate, fileName: fileName, serial: serial, weekday: weekday };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RDOGen = api;
})(typeof window !== 'undefined' ? window : globalThis);
