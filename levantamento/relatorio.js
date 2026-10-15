// Relatório fotográfico em PDF (A4 retrato) e planilha de orçamento/levantamento (.xlsx com formatação e fórmulas).
(function(){
'use strict';
function t(s){ return String(s==null?'':s)
  .replace(/[–—−]/g,'-').replace(/[‘’‚´]/g,"'").replace(/[“”„]/g,'"')
  .replace(/≤/g,'<=').replace(/≥/g,'>=').replace(/…/g,'...').replace(/[•●▪]/g,'-').replace(/＋/g,'+')
  .replace(/ /g,' ').replace(/²/g,'2').replace(/³/g,'3').replace(/[^\x00-\xFF]/g,''); }
function pad2(n){ return String(n).padStart(2,'0'); }
function n3(n){ return String(n).padStart(3,'0'); }
function blobToDataURL(b){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(r.result); }; r.onerror=rej; r.readAsDataURL(b); }); }
function loadImg(src){ return new Promise(function(res){ var im=new Image(); im.onload=function(){ res(im); }; im.onerror=function(){ res(null); }; im.src=src; }); }
async function fotoParaPDF(blob, max, q){ var u=URL.createObjectURL(blob); var im=await loadImg(u); URL.revokeObjectURL(u); if(!im) return null;
  var s=Math.min(1, max/Math.max(im.naturalWidth,im.naturalHeight)); var c=document.createElement('canvas'); c.width=Math.round(im.naturalWidth*s); c.height=Math.round(im.naturalHeight*s);
  c.getContext('2d').drawImage(im,0,0,c.width,c.height); return {src:c.toDataURL('image/jpeg',q), w:c.width, h:c.height}; }

var ASF=[38,49,59], SIG=[232,161,0], SIGS=[255,243,209], INK=[29,35,41], MUT=[93,102,112], LIN=[200,205,202], LIGHT=[243,245,243];
var PCOR={U:[192,57,43], A:[180,86,27], M:[232,161,0], B:[47,125,79]};

// =====================================================================
// PDF
// =====================================================================
async function pdf(D, progress){
  var L=D.lev, C=D.cfg, U=D.util, FL=D.fotos;
  var jsPDF=window.jspdf.jsPDF; var doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  var W=210, H=297, M=14, CW=W-2*M, TOP=24, BOT=16, y=TOP;
  var leve=C.fotoPdf==='leve', MAXPX=leve?900:1300, QJ=leve?0.62:0.76;

  // pré-processa as fotos (reduz para o PDF)
  var imgs={}, total=FL.list.length, feitas=0;
  async function img(id){ if(imgs[id]!==undefined) return imgs[id]; var b=await D.getBlob(id); imgs[id]= b? await fotoParaPDF(b,MAXPX,QJ) : null; feitas++; if(progress&&total) progress(Math.min(99,Math.round(feitas/total*100))); return imgs[id]; }

  function font(sz, st, cor){ doc.setFont('helvetica', st||'normal'); doc.setFontSize(sz); doc.setTextColor.apply(doc, cor||INK); }
  function novaPagina(){ doc.addPage(); y=TOP; }
  function espaco(hh){ if(y+hh>H-BOT){ novaPagina(); return true; } return false; }
  function titulo(txt){ espaco(16); y+=2; doc.setFillColor.apply(doc,ASF); doc.rect(M,y,CW,8,'F'); doc.setFillColor.apply(doc,SIG); doc.rect(M,y,2.2,8,'F');
    font(11,'bold',[255,255,255]); doc.text(t(txt).toUpperCase(), M+5, y+5.6); y+=12; }
  function subtitulo(txt, extra){ espaco(14); doc.setDrawColor.apply(doc,SIG); doc.setLineWidth(0.8); doc.line(M,y+7.2,M+CW,y+7.2);
    font(11.5,'bold',INK); doc.text(t(txt), M, y+5.5); if(extra){ font(8.5,'normal',MUT); doc.text(t(extra), M+CW, y+5.5, {align:'right'}); } y+=10; }
  function paragrafo(rotulo, txt, sz){ if(!txt) return; sz=sz||9.2; var lh=sz*0.42; font(sz,'normal',INK);
    var corpo=doc.splitTextToSize(t((rotulo?rotulo+': ':'')+txt), CW); var linhas=corpo;
    for(var i=0;i<linhas.length;i++){ espaco(lh+1); if(i===0&&rotulo){ font(sz,'bold',INK); var r=t(rotulo+':'); doc.text(r, M, y+lh); var wr=doc.getTextWidth(r+' ');
        font(sz,'normal',INK); var resto=linhas[0].slice(r.length).replace(/^\s+/,''); doc.text(resto, M+wr, y+lh); }
      else { font(sz,'normal',INK); doc.text(linhas[i], M, y+lh); } y+=lh+0.9; }
    y+=1.6; }
  var common={theme:'grid', margin:{left:M,right:M,top:TOP,bottom:BOT}, styles:{font:'helvetica',fontSize:8.4,cellPadding:1.6,lineColor:LIN,lineWidth:0.15,textColor:INK,valign:'middle',overflow:'linebreak'},
    headStyles:{fillColor:ASF,textColor:255,fontStyle:'bold',lineColor:ASF}, alternateRowStyles:{fillColor:[250,251,250]}};
  function tabela(opts){ doc.autoTable(Object.assign({}, common, {startY:y}, opts)); y=doc.lastAutoTable.finalY+4; }
  function chave(pares){ // tabela de 4 colunas: rótulo | valor | rótulo | valor
    var body=[]; for(var i=0;i<pares.length;i+=2){ var a=pares[i], b=pares[i+1]||['','']; body.push([t(a[0]), t(a[1]), t(b[0]), t(b[1])]); }
    tabela({body:body, columnStyles:{0:{fontStyle:'bold',fillColor:LIGHT,cellWidth:30},1:{cellWidth:CW/2-30},2:{fontStyle:'bold',fillColor:LIGHT,cellWidth:30},3:{cellWidth:CW/2-30}}, alternateRowStyles:{}}); }
  function legendaFoto(f){ var it=f.item; var base=f.leg || (it? (it.serv||it.desc||'') : f.onde); return 'F'+pad2(f.num)+' - '+base; }
  async function gradeFotos(lista){ if(!lista.length) return; var gap=5, cw=(CW-gap)/2, bh=leve?62:68, capH=8.5;
    for(var i=0;i<lista.length;i+=2){ espaco(bh+capH+3);
      for(var k=0;k<2;k++){ var f=lista[i+k]; if(!f) continue; var x=M+k*(cw+gap); var im=await img(f.id);
        doc.setFillColor(236,238,236); doc.rect(x,y,cw,bh,'F');
        if(im){ var s=Math.min(cw/im.w, bh/im.h), w=im.w*s, hh=im.h*s; try{ doc.addImage(im.src,'JPEG',x+(cw-w)/2,y+(bh-hh)/2,w,hh,'f'+f.id,'FAST'); }catch(e){} }
        doc.setFillColor.apply(doc,ASF); doc.rect(x,y,13,5.5,'F'); font(8,'bold',[255,255,255]); doc.text('F'+pad2(f.num), x+6.5, y+3.9, {align:'center'});
        font(7.6,'normal',INK); var cap=doc.splitTextToSize(t(legendaFoto(f).replace(/^F\d+ - /,'')), cw*0.6).slice(0,2); doc.text(cap, x, y+bh+3.4);
        font(6.6,'normal',MUT); doc.text(t(U.brDT(f.d)), x+cw, y+bh+3.4, {align:'right'}); if(f.gps) doc.text(f.gps.lat.toFixed(5)+', '+f.gps.lng.toFixed(5), x+cw, y+bh+6.6, {align:'right'}); }
      y+=bh+capH+3; } y+=1; }

  // ---------------- capa ----------------
  doc.setFillColor.apply(doc,ASF); doc.rect(0,0,W,46,'F');
  doc.setFillColor.apply(doc,ASF); doc.rect(0,46,W,4,'F');
  for(var sx=-10; sx<W+10; sx+=8){ doc.setFillColor.apply(doc,SIG); doc.lines([[4,0],[-4,4],[-4,0]], sx+4, 46, [1,1], 'F', true); }
  font(9,'bold',SIG); doc.text(t((C.empresa||'').toUpperCase()), M, 14);
  font(19,'bold',[255,255,255]); doc.text('RELATÓRIO DE LEVANTAMENTO', M, 26); font(13,'normal',[230,233,230]); doc.text(t('Técnico e fotográfico · Nº '+n3(L.n)), M, 34);
  if(C.logo){ try{ doc.setFillColor(255,255,255); doc.roundedRect(W-M-58,9,58,16.5,2,2,'F'); doc.addImage(C.logo,'JPEG',W-M-57,9.5,56,14,'logo','FAST'); }catch(e){} }
  y=60; font(17,'bold',INK); var tl=doc.splitTextToSize(t(L.titulo||'Levantamento de obra'), CW); doc.text(tl, M, y); y+=tl.length*7;
  font(10.5,'normal',MUT); if(L.endereco){ var el=doc.splitTextToSize(t(L.endereco), CW); doc.text(el, M, y); y+=el.length*4.8; }
  if(L.cliente){ doc.text(t('Cliente: '+L.cliente), M, y); y+=4.8; } y+=3;
  var capa=L.capa&&FL.map[L.capa]? L.capa : (FL.list[0]&&FL.list[0].id);
  var boxH=108;
  if(capa){ var ci=await img(capa); if(ci){ var s=Math.min(CW/ci.w, boxH/ci.h), w=ci.w*s, hh=ci.h*s; doc.setFillColor(236,238,236); doc.rect(M,y,CW,boxH,'F'); try{ doc.addImage(ci.src,'JPEG',M+(CW-w)/2,y+(boxH-hh)/2,w,hh,'f'+capa,'FAST'); }catch(e){} y+=boxH+6; } }
  else y+=4;
  var its=D.itens, nU=its.filter(function(i){ return i.prio==='U'; }).length, nA=its.filter(function(i){ return i.prio==='A'; }).length;
  var cards=[[String((L.ambs||[]).length),'ambientes'],[String(its.length),'itens levantados'],[String(nU+nA),'urgentes / alta'],[String(FL.list.length),'fotos']];
  var cw4=(CW-9)/4; cards.forEach(function(c,i){ var x=M+i*(cw4+3); doc.setFillColor.apply(doc,LIGHT); doc.rect(x,y,cw4,17,'F'); doc.setFillColor.apply(doc, i===2&&(nU+nA)? PCOR.U : SIG); doc.rect(x,y,cw4,1.4,'F');
    font(15,'bold',INK); doc.text(c[0], x+4, y+9.5); font(7.8,'normal',MUT); doc.text(t(c[1].toUpperCase()), x+4, y+14.2); }); y+=23;
  doc.autoTable(Object.assign({}, common, {startY:y, body:[
      ['Data da visita', t(U.br(L.data)+(L.hIni?'  ·  '+L.hIni+(L.hFim?' às '+L.hFim:''):'')), 'Tipo de serviço', t(L.tipoServ||'')],
      ['Responsável técnico', t((L.resp||'')+(L.crea?' - '+L.crea:'')), 'Acompanhou', t(L.acomp||'')]],
    columnStyles:{0:{fontStyle:'bold',fillColor:LIGHT,cellWidth:32},1:{cellWidth:CW/2-32},2:{fontStyle:'bold',fillColor:LIGHT,cellWidth:30},3:{cellWidth:CW/2-30}}, alternateRowStyles:{}}));
  font(8,'normal',MUT); doc.text(t([C.empresa, C.tel, C.email].filter(Boolean).join('  ·  ')), W/2, H-10, {align:'center'});

  // ---------------- 1. dados ----------------
  novaPagina(); var sec=0;
  titulo((++sec)+'. Dados do levantamento');
  chave([['Obra',L.titulo||''],['Nº',n3(L.n)],['Cliente',L.cliente||''],['Contato',L.contato||''],['Endereço',L.endereco||''],['Localização',L.gps? (U.fmt(L.gps.lat,5)+', '+U.fmt(L.gps.lng,5)+' (±'+L.gps.acc+' m)') : ''],
    ['Data',U.br(L.data)],['Horário',(L.hIni||'')+(L.hFim?' às '+L.hFim:'')],['Clima',L.clima||''],['Chuva últimas 48 h',L.chuva48||''],
    ['Tipo de serviço',L.tipoServ||''],['Tipo de imóvel',L.imovel||''],['Idade aprox.',L.idade? L.idade+' anos':''],['Pavimentos',L.pavs||''],['Área construída',L.area? L.area+' m²':''],['Ocupado na obra',L.ocupado||''],
    ['Responsável técnico',L.resp||''],['CREA / CAU',L.crea||''],['Acompanhou',L.acomp||''],['Empresa',C.empresa||'']]);
  paragrafo('Escopo solicitado pelo cliente', L.objetivo);

  // ---------------- 2. resumo ----------------
  titulo((++sec)+'. Resumo dos itens levantados');
  var porD={}; its.forEach(function(it){ var k=it.disc||'out'; var r=porD[k]||(porD[k]={n:0,U:0,A:0,M:0,B:0}); r.n++; r[it.prio]=(r[it.prio]||0)+1; });
  var rb=[]; U.DISC.forEach(function(d){ var r=porD[d.id]; if(r) rb.push([t(d.n), r.n, r.U||'', r.A||'', r.M||'', r.B||'']); });
  if(rb.length){ rb.push([{content:'Total',styles:{fontStyle:'bold'}}, {content:its.length,styles:{fontStyle:'bold'}}, nU||'', nA||'', its.filter(function(i){return i.prio==='M';}).length||'', its.filter(function(i){return i.prio==='B';}).length||'']);
    tabela({head:[['Disciplina','Itens','Urgente','Alta','Média','Baixa']], body:rb, columnStyles:{0:{cellWidth:CW-75},1:{halign:'center',cellWidth:15},2:{halign:'center',cellWidth:15},3:{halign:'center',cellWidth:15},4:{halign:'center',cellWidth:15},5:{halign:'center',cellWidth:15}},
      didParseCell:function(d){ if(d.section==='head'&&d.column.index>0) d.cell.styles.halign='center'; if(d.section==='body'&&d.column.index===2&&d.cell.raw) { d.cell.styles.textColor=PCOR.U; d.cell.styles.fontStyle='bold'; } }}); }
  else paragrafo('', 'Nenhum item lançado.');
  var crit=its.filter(function(i){ return i.prio==='U'||i.prio==='A'; });
  if(crit.length){ subtitulo('Itens com prioridade urgente ou alta');
    tabela({head:[['Item','Ambiente','Serviço / situação','Prioridade']], body:crit.map(function(it){ return ['#'+pad2(it.n), t(U.ambNome(it.amb)), t((it.serv||'')+(it.desc?(it.serv?' - ':'')+it.desc:'')), t(U.prioNome(it.prio))]; }),
      columnStyles:{0:{cellWidth:13,halign:'center'},1:{cellWidth:32},2:{cellWidth:CW-13-32-22},3:{cellWidth:22,halign:'center'}},
      didParseCell:function(d){ if(d.section==='body'&&d.column.index===3){ var p=crit[d.row.index].prio; d.cell.styles.textColor=PCOR[p]; d.cell.styles.fontStyle='bold'; } }}); }

  // ---------------- 3. checklist ----------------
  var ck=U.ckTodos().filter(function(q){ var r=L.ck[q.k]; return r&&(r.v||r.o); });
  if(ck.length){ titulo((++sec)+'. Checklist da visita');
    var RES={S:'Sim',N:'Não',NA:'N/A'};
    tabela({head:[['Grupo','Ponto verificado','Resp.','Detalhe']], body:ck.map(function(q){ var r=L.ck[q.k]; return [t(q.g), t(q.q), RES[r.v]||'-', t(r.o||'')]; }),
      columnStyles:{0:{cellWidth:30,textColor:MUT},1:{cellWidth:CW-30-14-48},2:{cellWidth:14,halign:'center',fontStyle:'bold'},3:{cellWidth:48}},
      didParseCell:function(d){ if(d.section==='body'&&d.column.index===2){ var v=d.cell.raw; d.cell.styles.textColor= v==='Sim'? PCOR.B : (v==='Não'? PCOR.A : MUT); } }}); }

  // ---------------- 4. fotos gerais ----------------
  var gerais=FL.list.filter(function(f){ return f.onde==='Geral / fachada'; });
  if(gerais.length){ titulo((++sec)+'. Registro fotográfico geral'); await gradeFotos(gerais); }

  // ---------------- 5. ambientes e itens ----------------
  titulo((++sec)+'. Levantamento por ambiente'); var secAmb=sec;
  var grupos=[]; (L.ambs||[]).forEach(function(a){ grupos.push({a:a, its:its.filter(function(i){ return i.amb===a.id; })}); });
  var soltos=its.filter(function(i){ return !U.ambById(i.amb); }); if(soltos.length) grupos.push({a:null, its:soltos});
  if(!grupos.length) paragrafo('', 'Nenhum ambiente ou item lançado.');
  for(var g=0; g<grupos.length; g++){ var G=grupos[g], a=G.a, nome=a? (a.nome||'Ambiente') : 'Geral (sem ambiente definido)';
    if(g>0 && y>TOP+40) espaco(70);
    var cc=a? U.ambCalc(a) : null, dims='';
    if(a&&!isNaN(cc.piso)) dims=U.fmt(U.num(a.c))+' x '+U.fmt(U.num(a.l))+(a.pd?' x pé-dir. '+U.fmt(U.num(a.pd)):'')+' m  ·  piso '+U.fmt(cc.piso)+' m²'+(!isNaN(cc.paredes)?'  ·  paredes '+U.fmt(cc.paredes)+' m²':'');
    subtitulo(secAmb+'.'+(g+1)+'  '+nome+(a&&a.pav?'  ('+a.pav+')':''), dims);
    if(a){ paragrafo('Observações', a.obs); var fa=FL.list.filter(function(f){ return f.amb===a && !f.item; }); await gradeFotos(fa); }
    if(!G.its.length){ paragrafo('', 'Nenhum serviço lançado neste ambiente.'); continue; }
    for(var j=0;j<G.its.length;j++){ var it=G.its[j], q=U.qtdItem(it);
      espaco(34);
      // faixa do item
      doc.setFillColor.apply(doc,LIGHT); doc.rect(M,y,CW,8,'F'); doc.setFillColor.apply(doc,PCOR[it.prio]||SIG); doc.rect(M,y,1.8,8,'F');
      font(9.6,'bold',INK); var ttl=doc.splitTextToSize(t('#'+pad2(it.n)+'  '+(it.serv||it.desc||'Item')), CW-40)[0]; doc.text(ttl, M+4, y+5.4);
      var pn=t(U.prioNome(it.prio).toUpperCase()); font(7.6,'bold',[255,255,255]); var pw=doc.getTextWidth(pn)+5; doc.setFillColor.apply(doc,PCOR[it.prio]||SIG); doc.roundedRect(M+CW-pw-2,y+1.8,pw,4.6,1,1,'F'); doc.text(pn, M+CW-2-pw/2, y+5, {align:'center'});
      y+=10;
      font(8.4,'normal',MUT); doc.text(t([U.discNome(it.disc), U.tipoNome(it.tipo), 'Quantidade: '+(isNaN(q)?'a medir':U.fmtQ(q)+' '+t(it.und))].join('   ·   ')), M, y+2.5); y+=6;
      paragrafo('Situação encontrada', it.desc); paragrafo('Causa provável', it.causa); paragrafo('Como executar', it.como); paragrafo('Material / especificação', it.mat); paragrafo('Observações', it.obs);
      var meds=(it.med||[]).filter(function(m){ return U.medParcial(m); });
      if(meds.length && !(it.qtdMan!==''&&it.qtdMan!=null)){ espaco(12+meds.length*4.6);
        doc.autoTable(Object.assign({}, common, {startY:y, margin:{left:M,right:M+CW*0.25,top:TOP,bottom:BOT}, styles:Object.assign({},common.styles,{fontSize:7.4,cellPadding:1}),
          head:[['Memória de cálculo','C','L','H/esp.','x','Parcial']], body:meds.map(function(m){ var f=function(v){ return isNaN(U.num(v))?'':U.fmt(U.num(v)); }; return [t((m.neg?'(-) ':'')+(m.d||'')), f(m.c), f(m.l), f(m.h), m.n||'', U.fmt(U.medParcial(m))]; }).concat([[{content:'Total',colSpan:5,styles:{fontStyle:'bold',halign:'right'}},{content:U.fmtQ(q)+' '+t(it.und),styles:{fontStyle:'bold'}}]]),
          headStyles:Object.assign({},common.headStyles,{fillColor:[90,100,110],lineColor:[90,100,110]}), columnStyles:{1:{halign:'right'},2:{halign:'right'},3:{halign:'right'},4:{halign:'center'},5:{halign:'right'}}}));
        y=doc.lastAutoTable.finalY+3; }
      var fi=FL.list.filter(function(f){ return f.item===it; }); await gradeFotos(fi);
      y+=2; }
  }

  // ---------------- 6. quantitativos ----------------
  titulo((++sec)+'. Quadro de quantitativos');
  var qb=[], idx=0; U.DISC.forEach(function(d){ var li=its.filter(function(i){ return (i.disc||'out')===d.id; }); if(!li.length) return; idx++;
    qb.push([{content:idx+'  '+t(d.n).toUpperCase(), colSpan:6, styles:{fontStyle:'bold',fillColor:SIGS}}]);
    li.forEach(function(it,k){ var q=U.qtdItem(it); qb.push([idx+'.'+(k+1), '#'+pad2(it.n), t(U.ambNome(it.amb)), t(it.serv||it.desc||''), t(it.und), isNaN(q)?'a medir':U.fmtQ(q)]); }); });
  if(qb.length) tabela({head:[['Item','Ref.','Ambiente','Serviço','Und','Qtd']], body:qb, columnStyles:{0:{cellWidth:12},1:{cellWidth:12,halign:'center'},2:{cellWidth:32},3:{cellWidth:CW-12-12-32-12-20},4:{cellWidth:12,halign:'center'},5:{cellWidth:20,halign:'right'}}});
  else paragrafo('', 'Nenhum item lançado.');
  font(7.8,'normal',MUT); espaco(6); doc.text(t('Quantidades levantadas em campo, sujeitas a confirmação no projeto executivo. Os custos estão na planilha de orçamento que acompanha este relatório.'), M, y); y+=6;

  // ---------------- 7. conclusões ----------------
  var co=L.concl||{};
  if(co.diag||co.seq||co.ensaios||co.pend||co.prazo||co.equipe||co.obs){ titulo((++sec)+'. Conclusões e recomendações');
    paragrafo('Diagnóstico geral', co.diag); paragrafo('Sequência de execução recomendada', co.seq); paragrafo('Ensaios, projetos e laudos necessários', co.ensaios);
    paragrafo('Informações pendentes', co.pend); paragrafo('Prazo estimado', co.prazo? co.prazo+' dias úteis' : ''); paragrafo('Equipe sugerida', co.equipe); paragrafo('Observações finais', co.obs); }

  // ---------------- assinaturas ----------------
  espaco(44); y+=6; var sw=(CW-12)/2;
  for(var si=0; si<2; si++){ var k=si? 'cli':'resp', A=L.ass[k]||{}, x=M+si*(sw+12);
    if(A.sig){ var sb=await D.getBlob(A.sig); if(sb){ var su=await blobToDataURL(sb); var sim=await loadImg(su); if(sim){ var ss=Math.min(sw/sim.naturalWidth, 22/sim.naturalHeight); try{ doc.addImage(su,'PNG',x+(sw-sim.naturalWidth*ss)/2,y,sim.naturalWidth*ss,sim.naturalHeight*ss,'sig'+k,'FAST'); }catch(e){} } } }
    doc.setDrawColor.apply(doc,INK); doc.setLineWidth(0.3); doc.line(x,y+24,x+sw,y+24);
    font(9,'bold',INK); doc.text(t(A.nome || (si? (L.acomp||L.cliente||'') : (L.resp||''))), x+sw/2, y+28.5, {align:'center'});
    font(8,'normal',MUT); doc.text(t(si? 'Cliente / acompanhante' : 'Responsável técnico'+(L.crea?' - '+L.crea:'')), x+sw/2, y+32.5, {align:'center'}); }
  y+=38;

  // ---------------- cabeçalho e rodapé em todas as páginas (menos a capa) ----------------
  var np=doc.getNumberOfPages();
  for(var p=2;p<=np;p++){ doc.setPage(p);
    if(C.logo){ try{ doc.addImage(C.logo,'JPEG',M,6,36,9,'logo','FAST'); }catch(e){} } else { font(9,'bold',INK); doc.text(t(C.empresa||''), M, 12); }
    font(8.5,'bold',INK); doc.text(t('Relatório de levantamento Nº '+n3(L.n)), W-M, 10, {align:'right'}); font(7.6,'normal',MUT); doc.text(t(doc.splitTextToSize(L.titulo||'',100)[0]||''), W-M, 14, {align:'right'});
    doc.setDrawColor.apply(doc,SIG); doc.setLineWidth(0.9); doc.line(M,17.5,W-M,17.5);
    doc.setDrawColor.apply(doc,LIN); doc.setLineWidth(0.2); doc.line(M,H-11,W-M,H-11);
    font(7.4,'normal',MUT); doc.text(t([C.empresa, L.resp? 'Resp. técnico: '+L.resp+(L.crea?' ('+L.crea+')':'') : ''].filter(Boolean).join('  ·  ')), M, H-7);
    doc.text('Página '+p+' de '+np, W-M, H-7, {align:'right'}); }
  if(progress) progress(100);
  return doc.output('blob');
}

// =====================================================================
// XLSX (escrito à mão com JSZip, para ter formatação, fórmulas e valores já calculados)
// =====================================================================
function xe(s){ return String(s==null?'':s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function colL(i){ var s=''; i++; while(i>0){ var m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; }
// estilos (índices de cellXfs)
var S={def:0, tit:1, head:2, txt:3, n2:4, brl:5, grp:6, grpR:7, totR:8, lbl:9, inR:10, inP:11, ctr:12, totL:13, note:14, val:15, n2b:16, sub:17};
var STYLES='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
'<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="&quot;R$&quot; #,##0.00"/><numFmt numFmtId="166" formatCode="0.00%"/></numFmts>'+
'<fonts count="6"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF26313B"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><i/><sz val="9"/><color rgb="FF5D6670"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FF26313B"/><name val="Arial"/></font></fonts>'+
'<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+
'<fill><patternFill patternType="solid"><fgColor rgb="FF26313B"/><bgColor indexed="64"/></patternFill></fill>'+
'<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3D1"/><bgColor indexed="64"/></patternFill></fill>'+
'<fill><patternFill patternType="solid"><fgColor rgb="FFE7EAEC"/><bgColor indexed="64"/></patternFill></fill>'+
'<fill><patternFill patternType="solid"><fgColor rgb="FFFFFDE7"/><bgColor indexed="64"/></patternFill></fill></fills>'+
'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFC5C2"/></left><right style="thin"><color rgb="FFBFC5C2"/></right><top style="thin"><color rgb="FFBFC5C2"/></top><bottom style="thin"><color rgb="FFBFC5C2"/></bottom><diagonal/></border></borders>'+
'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
'<cellXfs count="18">'+
'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+                                                                                        // 0 def
'<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'+                                                                         // 1 tit
'<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'+ // 2 head
'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'+          // 3 txt
'<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>'+ // 4 n2
'<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>'+ // 5 brl
'<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'+                                             // 6 grp
'<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>'+                      // 7 grpR
'<xf numFmtId="165" fontId="1" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>'+                      // 8 totR
'<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'+                                                                          // 9 lbl
'<xf numFmtId="165" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>'+ // 10 inR
'<xf numFmtId="166" fontId="1" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>'+                      // 11 inP
'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>'+ // 12 ctr
'<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>'+ // 13 totL
'<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="0"/></xf>'+                          // 14 note
'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+                                                                                        // 15 val
'<xf numFmtId="164" fontId="1" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>'+                      // 16 n2b
'<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>'+                                                                          // 17 sub
'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function Sheet(nome){ this.nome=nome; this.rows=[]; this.cols=[]; this.merges=[]; this.freeze=0; this.filter=null; this.heights={}; }
Sheet.prototype.set=function(r,c,cell){ (this.rows[r]=this.rows[r]||[])[c]=cell; };
Sheet.prototype.xml=function(){ var self=this, out=[];
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
  out.push('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'); out.push('<sheetViews><sheetView workbookViewId="0"'+(self.nome==='Orçamento'?' tabSelected="1"':'')+'>'+(self.freeze?'<pane ySplit="'+self.freeze+'" topLeftCell="A'+(self.freeze+1)+'" activePane="bottomLeft" state="frozen"/>':'')+'</sheetView></sheetViews>');
  out.push('<sheetFormatPr defaultRowHeight="13.5"/>');
  if(self.cols.length) out.push('<cols>'+self.cols.map(function(w,i){ return '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>'; }).join('')+'</cols>');
  out.push('<sheetData>');
  self.rows.forEach(function(row,r){ if(!row) return; var ht=self.heights[r]; out.push('<row r="'+(r+1)+'"'+(ht?' ht="'+ht+'" customHeight="1"':'')+'>');
    row.forEach(function(c,ci){ if(!c) return; var ref=colL(ci)+(r+1), s=c.s!=null?' s="'+c.s+'"':'';
      if(c.f!=null){ var v=(typeof c.v==='number'&&isFinite(c.v))? '<v>'+c.v+'</v>' : ''; out.push('<c r="'+ref+'"'+s+'><f>'+xe(c.f)+'</f>'+v+'</c>'); }
      else if(typeof c.v==='number'&&isFinite(c.v)) out.push('<c r="'+ref+'"'+s+'><v>'+c.v+'</v></c>');
      else if(c.v==null||c.v==='') out.push('<c r="'+ref+'"'+s+'/>');
      else out.push('<c r="'+ref+'"'+s+' t="inlineStr"><is><t xml:space="preserve">'+xe(c.v)+'</t></is></c>'); });
    out.push('</row>'); });
  out.push('</sheetData>');
  if(self.filter) out.push('<autoFilter ref="'+self.filter+'"/>');
  if(self.merges.length) out.push('<mergeCells count="'+self.merges.length+'">'+self.merges.map(function(m){ return '<mergeCell ref="'+m+'"/>'; }).join('')+'</mergeCells>');
  out.push('<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>');
  out.push('</worksheet>'); return out.join(''); };
function cell(v,s){ return {v:v, s:s}; }
function fcell(f,v,s){ return {f:f, v:v, s:s}; }

async function xlsx(D){
  var L=D.lev, C=D.cfg, U=D.util, FL=D.fotos, its=D.itens;
  var sheets=[];
  var qtdVal=function(it){ var q=U.qtdItem(it); return isNaN(q)? '' : Math.round(q*10000)/10000; };
  var fotosDo=function(it){ return FL.list.filter(function(f){ return f.item===it; }).map(function(f){ return 'F'+pad2(f.num); }).join(', '); };

  // ---------- Memória de cálculo (montada antes para o orçamento poder apontar para ela) ----------
  var mem=new Sheet('Memória de cálculo'); mem.cols=[7,42,6,34,10,10,10,7,7,12];
  mem.set(0,0,cell('MEMÓRIA DE CÁLCULO – Levantamento Nº '+n3(L.n),S.tit)); mem.set(1,0,cell(L.titulo||'',S.sub));
  mem.set(2,0,cell('Parcial = produto das medidas preenchidas × vezes × sinal (−1 = desconto). Altere as medidas aqui e a quantidade do orçamento acompanha.',S.note));
  var mh=['Item','Serviço','Und','Trecho','Compr. (m)','Larg. (m)','Alt./esp. (m)','Vezes','Sinal','Parcial']; mh.forEach(function(h,i){ mem.set(4,i,cell(h,S.head)); }); mem.freeze=5; mem.heights[4]=28;
  var mr=5, memTot={};
  its.forEach(function(it){ var direto=(it.qtdMan!==''&&it.qtdMan!=null&&!isNaN(U.num(it.qtdMan))); var meds=(it.med||[]).filter(function(m){ return U.medParcial(m)||m.d; });
    if(!meds.length&&!direto) return; var r0=mr;
    if(direto){ mem.set(mr,0,cell('#'+pad2(it.n),S.ctr)); mem.set(mr,1,cell(it.serv||it.desc||'',S.txt)); mem.set(mr,2,cell(it.und,S.ctr)); mem.set(mr,3,cell('Quantidade direta (contagem / estimativa)',S.txt));
      for(var k=4;k<9;k++) mem.set(mr,k,cell('',S.txt)); mem.set(mr,9,cell(U.num(it.qtdMan),S.n2)); mr++; }
    else meds.forEach(function(m){ var nv=function(v){ var x=U.num(v); return isNaN(x)? '' : x; };
      mem.set(mr,0,cell('#'+pad2(it.n),S.ctr)); mem.set(mr,1,cell(mr===r0?(it.serv||it.desc||''):'',S.txt)); mem.set(mr,2,cell(it.und,S.ctr)); mem.set(mr,3,cell(m.d||'',S.txt));
      mem.set(mr,4,cell(nv(m.c),S.n2)); mem.set(mr,5,cell(nv(m.l),S.n2)); mem.set(mr,6,cell(nv(m.h),S.n2)); mem.set(mr,7,cell(nv(m.n),S.n2)); mem.set(mr,8,cell(m.neg?-1:1,S.ctr));
      var R=mr+1; mem.set(mr,9,fcell('IF(COUNT(E'+R+':G'+R+')=0,0,PRODUCT(E'+R+':G'+R+')*IF(H'+R+'="",1,H'+R+')*I'+R+')', Math.round(U.medParcial(m)*10000)/10000, S.n2)); mr++; });
    mem.set(mr,0,cell('',S.totL)); mem.set(mr,1,cell('',S.totL)); mem.set(mr,2,cell(it.und,S.totL)); mem.merges.push('D'+(mr+1)+':I'+(mr+1)); mem.set(mr,3,cell('Total do item #'+pad2(it.n),S.totL)); for(var kk=4;kk<9;kk++) mem.set(mr,kk,cell('',S.totL));
    mem.set(mr,9,fcell('SUM(J'+(r0+1)+':J'+mr+')', qtdVal(it)===''?0:qtdVal(it), S.n2b)); memTot[it.id]='J'+(mr+1); mr+=2; });
  if(mr===5) mem.set(5,0,cell('Nenhuma medição lançada.',S.note));

  // ---------- Orçamento ----------
  var o=new Sheet('Orçamento'); o.cols=[7,7,18,42,52,6,10,15,14,14,14,16,11,13,30];
  o.set(0,0,cell('ORÇAMENTO E LEVANTAMENTO – Nº '+n3(L.n),S.tit)); o.heights[0]=22;
  var info=[['Obra',L.titulo||''],['Cliente',L.cliente||''],['Endereço',L.endereco||''],['Data da visita',U.br(L.data)+'   ·   Resp. técnico: '+(L.resp||'')+(L.crea?' ('+L.crea+')':'')],['Empresa',C.empresa||'']];
  info.forEach(function(p,i){ o.set(1+i,0,cell(p[0],S.lbl)); o.set(1+i,2,cell(p[1],S.val)); o.merges.push('A'+(2+i)+':B'+(2+i)); o.merges.push('C'+(2+i)+':H'+(2+i)); });
  o.set(1,10,cell('BDI',S.lbl)); o.set(1,11,cell(0.25,S.inP)); var BDI='$L$2';
  o.set(2,10,cell('Preencha as colunas amarelas (custo unitário de material e de mão de obra). O resto calcula sozinho.',S.note));
  var HR=7; ['Item','Ref.','Ambiente','Serviço','Como executar / especificação','Und','Qtd','Ref. de preço (SINAPI / cotação)','Material unit. (R$)','Mão de obra unit. (R$)','Unit. total (R$)','Total (R$)','Prioridade','Fotos','Observações'].forEach(function(h,i){ o.set(HR,i,cell(h,S.head)); });
  o.heights[HR]=42; o.freeze=HR+1;
  var r=HR+1, subtot=[], gi=0;
  U.DISC.forEach(function(d){ var li=its.filter(function(i){ return (i.disc||'out')===d.id; }); if(!li.length) return; gi++;
    var gr=r; o.set(gr,0,cell(String(gi),S.grp)); o.set(gr,1,cell('',S.grp)); o.set(gr,2,cell(d.n.toUpperCase(),S.grp)); o.merges.push('C'+(gr+1)+':K'+(gr+1)); for(var k=3;k<11;k++) o.set(gr,k,cell('',S.grp));
    for(var k2=12;k2<15;k2++) o.set(gr,k2,cell('',S.grp)); r++;
    var r1=r;
    li.forEach(function(it,k){ var R=r+1, q=qtdVal(it);
      o.set(r,0,cell(gi+'.'+(k+1),S.ctr)); o.set(r,1,cell('#'+pad2(it.n),S.ctr)); o.set(r,2,cell(U.ambNome(it.amb),S.txt)); o.set(r,3,cell(it.serv||it.desc||'',S.txt));
      o.set(r,4,cell([it.como, it.mat? 'Material: '+it.mat : ''].filter(Boolean).join('\n'),S.txt)); o.set(r,5,cell(it.und,S.ctr));
      o.set(r,6, memTot[it.id]? fcell("'Memória de cálculo'!"+memTot[it.id], q===''?0:q, S.n2) : cell(q,S.n2));
      o.set(r,7,cell('',S.txt)); o.set(r,8,cell('',S.inR)); o.set(r,9,cell('',S.inR));
      o.set(r,10,fcell('I'+R+'+J'+R,0,S.brl)); o.set(r,11,fcell('G'+R+'*K'+R,0,S.brl));
      o.set(r,12,cell(U.prioNome(it.prio),S.ctr)); o.set(r,13,cell(fotosDo(it),S.txt)); o.set(r,14,cell(it.obs||'',S.txt)); r++; });
    o.set(gr,11,fcell('SUM(L'+(r1+1)+':L'+r+')',0,S.grpR)); subtot.push('L'+(gr+1)); });
  if(!subtot.length){ o.set(r,0,cell('Nenhum item lançado.',S.note)); r++; }
  r++;
  var tot=function(lbl,f,st){ o.set(r,9,cell(lbl,S.totL)); o.merges.push('H'+(r+1)+':K'+(r+1)); o.set(r,7,cell(lbl,S.totL)); o.set(r,8,cell('',S.totL)); o.set(r,10,cell('',S.totL)); o.set(r,9,cell('',S.totL)); o.set(r,11,fcell(f,0,st)); r++; };
  var rT=r+1; tot('Custo direto total', subtot.length? subtot.join('+') : '0', S.totR);
  tot('BDI', 'L'+rT+'*'+BDI, S.totR);
  tot('PREÇO TOTAL', 'L'+rT+'+L'+(rT+1), S.totR);
  r++; o.set(r,0,cell('Quantidades levantadas em campo em '+U.br(L.data)+'. Conferir no projeto executivo antes de fechar o preço. Coluna "Ref." = número do item no relatório fotográfico.',S.note));
  o.filter='A'+(HR+1)+':O'+Math.max(HR+1,r-5);
  sheets.push(o);

  // ---------- Levantamento (todos os campos) ----------
  var lv=new Sheet('Levantamento'); lv.cols=[7,18,24,16,11,44,30,36,52,30,6,10,14,30];
  lv.set(0,0,cell('LEVANTAMENTO DE CAMPO – Nº '+n3(L.n),S.tit)); lv.set(1,0,cell((L.titulo||'')+(L.endereco?' – '+L.endereco:''),S.sub));
  ['Ref.','Ambiente','Disciplina','Natureza','Prioridade','Situação encontrada','Causa provável','Serviço','Como executar','Material / especificação','Und','Qtd','Fotos','Observações'].forEach(function(h,i){ lv.set(3,i,cell(h,S.head)); });
  lv.heights[3]=28; lv.freeze=4;
  its.forEach(function(it,k){ var rr=4+k; [ ['#'+pad2(it.n),S.ctr],[U.ambNome(it.amb),S.txt],[U.discNome(it.disc),S.txt],[U.tipoNome(it.tipo),S.txt],[U.prioNome(it.prio),S.ctr],[it.desc,S.txt],[it.causa,S.txt],[it.serv,S.txt],[it.como,S.txt],[it.mat,S.txt],[it.und,S.ctr],[qtdVal(it),S.n2],[fotosDo(it),S.txt],[it.obs,S.txt] ].forEach(function(c,i){ lv.set(rr,i,cell(c[0]==null?'':c[0],c[1])); }); });
  lv.filter='A4:N'+Math.max(4,3+its.length);
  sheets.push(lv); sheets.push(mem);

  // ---------- Ambientes ----------
  var am=new Sheet('Ambientes'); am.cols=[24,12,11,11,11,11,12,12,13,12,50];
  am.set(0,0,cell('AMBIENTES E ÁREAS',S.tit)); am.set(1,0,cell('Áreas calculadas por fórmula: altere as medidas e tudo se atualiza.',S.note));
  ['Ambiente','Pavimento','Compr. (m)','Larg. (m)','Pé-direito (m)','Vãos (m²)','Piso (m²)','Perímetro (m)','Paredes (m²)','Volume (m³)','Observações'].forEach(function(h,i){ am.set(3,i,cell(h,S.head)); }); am.heights[3]=28; am.freeze=4;
  var ar=4; (L.ambs||[]).forEach(function(a){ var R=ar+1, c=U.ambCalc(a), nv=function(v){ var x=U.num(v); return isNaN(x)? '' : x; }, r2=function(v){ return isNaN(v)? 0 : Math.round(v*10000)/10000; };
    am.set(ar,0,cell(a.nome||'',S.txt)); am.set(ar,1,cell(a.pav||'',S.txt)); am.set(ar,2,cell(nv(a.c),S.n2)); am.set(ar,3,cell(nv(a.l),S.n2)); am.set(ar,4,cell(nv(a.pd),S.n2)); am.set(ar,5,cell(nv(a.vaos),S.n2));
    am.set(ar,6,fcell('C'+R+'*D'+R, r2(c.piso), S.n2)); am.set(ar,7,fcell('2*(C'+R+'+D'+R+')', r2(c.perim), S.n2)); am.set(ar,8,fcell('MAX(0,H'+R+'*E'+R+'-F'+R+')', r2(c.paredes), S.n2)); am.set(ar,9,fcell('G'+R+'*E'+R, r2(c.vol), S.n2)); am.set(ar,10,cell(a.obs||'',S.txt)); ar++; });
  if(ar>4){ am.set(ar,0,cell('Total',S.totL)); for(var q=1;q<6;q++) am.set(ar,q,cell('',S.totL)); ['G','H','I','J'].forEach(function(cl,i){ var sum=0; (L.ambs||[]).forEach(function(a){ var c=U.ambCalc(a); var v=[c.piso,c.perim,c.paredes,c.vol][i]; if(!isNaN(v)) sum+=v; }); am.set(ar,6+i,fcell('SUM('+cl+'5:'+cl+ar+')', Math.round(sum*10000)/10000, S.n2b)); }); am.set(ar,10,cell('',S.totL)); }
  else am.set(4,0,cell('Nenhum ambiente cadastrado.',S.note));
  sheets.push(am);

  // ---------- Checklist ----------
  var ck=new Sheet('Checklist'); ck.cols=[26,60,10,50];
  ck.set(0,0,cell('CHECKLIST DA VISITA',S.tit)); ['Grupo','Ponto verificado','Resposta','Detalhe'].forEach(function(h,i){ ck.set(2,i,cell(h,S.head)); }); ck.freeze=3;
  var RES={S:'Sim',N:'Não',NA:'N/A'};
  U.ckTodos().forEach(function(qq,i){ var rr=L.ck[qq.k]||{}; ck.set(3+i,0,cell(qq.g,S.txt)); ck.set(3+i,1,cell(qq.q,S.txt)); ck.set(3+i,2,cell(RES[rr.v]||'',S.ctr)); ck.set(3+i,3,cell(rr.o||'',S.txt)); });
  sheets.push(ck);

  // ---------- Fotos ----------
  var fo=new Sheet('Fotos'); fo.cols=[7,22,8,40,44,17,22,60];
  fo.set(0,0,cell('LISTA DE FOTOS',S.tit)); fo.set(1,0,cell('Mesma numeração do relatório em PDF e do arquivo ZIP de fotos.',S.note));
  ['Nº','Onde','Item','Serviço','Legenda','Data / hora','Localização (GPS)','Nome do arquivo no ZIP'].forEach(function(h,i){ fo.set(3,i,cell(h,S.head)); }); fo.freeze=4;
  FL.list.forEach(function(f,i){ var arq=('F'+pad2(f.num)+' - '+f.onde+(f.item?' - #'+pad2(f.item.n)+' '+(f.item.serv||''):'')+(f.leg?' - '+f.leg:'')).replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').slice(0,110)+'.jpg';
    [['F'+pad2(f.num),S.ctr],[f.onde,S.txt],[f.item?'#'+pad2(f.item.n):'',S.ctr],[f.item?(f.item.serv||f.item.desc||''):'',S.txt],[f.leg,S.txt],[U.brDT(f.d),S.ctr],[f.gps? f.gps.lat+', '+f.gps.lng : '',S.ctr],[arq,S.txt]].forEach(function(c,k){ fo.set(4+i,k,cell(c[0]||'',c[1])); }); });
  sheets.push(fo);

  // ---------- Dados ----------
  var da=new Sheet('Dados da visita'); da.cols=[30,90];
  da.set(0,0,cell('DADOS DA VISITA E CONCLUSÕES',S.tit)); var co=L.concl||{};
  [['Nº do levantamento',n3(L.n)],['Obra',L.titulo],['Cliente',L.cliente],['Contato',L.contato],['Endereço',L.endereco],['Localização (GPS)',L.gps? L.gps.lat+', '+L.gps.lng : ''],
   ['Data',U.br(L.data)],['Horário',(L.hIni||'')+(L.hFim?' às '+L.hFim:'')],['Clima',L.clima],['Choveu nas últimas 48 h',L.chuva48],['Tipo de serviço',L.tipoServ],['Tipo de imóvel',L.imovel],['Idade aproximada (anos)',L.idade],['Pavimentos',L.pavs],['Área construída (m²)',L.area],['Ocupado durante a obra',L.ocupado],
   ['Responsável técnico',L.resp],['CREA / CAU',L.crea],['Acompanhou a visita',L.acomp],['Escopo pedido pelo cliente',L.objetivo],
   ['',''],['Diagnóstico geral',co.diag],['Sequência recomendada',co.seq],['Ensaios / projetos necessários',co.ensaios],['Informações pendentes',co.pend],['Prazo estimado (dias úteis)',co.prazo],['Equipe sugerida',co.equipe],['Observações finais',co.obs]
  ].forEach(function(p,i){ if(!p[0]){ return; } da.set(2+i,0,cell(p[0],S.grp)); da.set(2+i,1,cell(p[1]||'',S.txt)); });
  sheets.push(da);

  // ---------- pacote ----------
  var z=new window.JSZip();
  z.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
    sheets.map(function(s,i){ return '<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('')+
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  z.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  z.file('docProps/core.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+xe('Orçamento e levantamento Nº '+n3(L.n)+' - '+(L.titulo||''))+'</dc:title><dc:creator>'+xe(C.empresa||'App Levantamento')+'</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+new Date().toISOString().slice(0,19)+'Z</dcterms:created></cp:coreProperties>');
  var defNames=sheets.map(function(s,i){ return s.filter? '<definedName name="_xlnm._FilterDatabase" localSheetId="'+i+'" hidden="1">\''+xe(s.nome)+'\'!'+s.filter.replace(/([A-Z]+)(\d+)/g,'$$$1$$$2')+'</definedName>' : ''; }).join('');
  z.file('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>'+
    sheets.map(function(s,i){ return '<sheet name="'+xe(s.nome)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>'; }).join('')+'</sheets>'+(defNames?'<definedNames>'+defNames+'</definedNames>':'')+'<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  z.file('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    sheets.map(function(s,i){ return '<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>'; }).join('')+
    '<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  z.file('xl/styles.xml',STYLES);
  sheets.forEach(function(s,i){ z.file('xl/worksheets/sheet'+(i+1)+'.xml', s.xml()); });
  return z.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression:'DEFLATE'});
}

window.LEVREL={pdf:pdf, xlsx:xlsx};
})();
