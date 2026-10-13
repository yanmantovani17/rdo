// Gera o PDF da FVS no layout da ficha Libercon (A4 paisagem) e a planilha de controle.
(function(){
'use strict';
function t(s){ return String(s==null?'':s)
  .replace(/[–—−]/g,'-').replace(/[‘’‚´]/g,"'").replace(/[“”„]/g,'"')
  .replace(/≤/g,'<=').replace(/≥/g,'>=').replace(/…/g,'...').replace(/[•●▪]/g,'-')
  .replace(/＋/g,'+').replace(/ /g,' ').replace(/[^\x00-\xFF]/g,''); }
function br(iso){ if(!iso) return '___/___/_____'; var p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function n3(n){ return String(n).padStart(3,'0'); }
function blobToDataURL(b){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(r.result); }; r.onerror=rej; r.readAsDataURL(b); }); }
function imgSize(u){ return new Promise(function(res){ var im=new Image(); im.onload=function(){ res({w:im.naturalWidth,h:im.naturalHeight}); }; im.onerror=function(){ res(null); }; im.src=u; }); }
function fit(iw,ih,bw,bh){ var s=Math.min(bw/iw,bh/ih); return {w:iw*s,h:ih*s}; }

var GRAY=[217,217,217], LIGHT=[242,242,242], LINE=[90,90,90];

async function build(f, cfg, getBlob){
  var r=await layout(f, cfg, getBlob, false);
  if(r.sigAlone) r=await layout(f, cfg, getBlob, true);   // tenta caber as assinaturas na mesma folha
  return r.doc.output('blob');
}
async function layout(f, cfg, getBlob, compact){
  var jsPDF=window.jspdf.jsPDF; var FS=compact?6.3:7.2, PAD=compact?0.7:1.1, SIGH=compact?15:22;
  var doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
  var W=297, H=210, M=8, CW=W-2*M;
  var common={theme:'grid', margin:{left:M,right:M,top:M,bottom:12}, styles:{font:'helvetica',fontSize:FS,cellPadding:PAD,lineColor:LINE,lineWidth:0.15,textColor:20,valign:'middle',overflow:'linebreak'},
    headStyles:{fillColor:GRAY,textColor:20,fontStyle:'bold',halign:'center',lineColor:LINE,lineWidth:0.15}};
  var nFvs=n3(f.n);

  // ---- photo numbering (items first, then general) ----
  var photos=[], itemPh={};
  f.itens.forEach(function(it,i){ (it.fotos||[]).forEach(function(p){ photos.push({id:p.id, cap:'Item '+(i+1)+' - '+(it.item||it.oque)+(it.v1?' (1ª verif.: '+it.v1.c+(it.v2?' / 2ª: '+it.v2.c:'')+')':''), d:p.d}); (itemPh[i]=itemPh[i]||[]).push(photos.length); }); });
  (f.fotos||[]).forEach(function(p,k){ photos.push({id:p.id, cap:'Foto geral '+(k+1), d:p.d}); });

  // ---- header ----
  // logo da obra (aba Obra, faixa 4:1 em JPEG) ou o logo padrão da ficha
  var LG = (cfg && cfg.logo && /^data:image\/jpeg/.test(cfg.logo)) ? {src:cfg.logo, fmt:'JPEG', ar:4} : (window.LOGO_PNG ? {src:window.LOGO_PNG, fmt:'PNG', ar:384/55} : null);
  var rightW=64, midW=56, leftW=CW-rightW-midW;
  var logoW=LG ? Math.min(46, 10*LG.ar) : 0, logoH=LG ? logoW/LG.ar : 0;
  doc.autoTable(Object.assign({}, common, {
    startY:M, body:[
      [{content:t('FVS - '+f.titulo), colSpan:2, styles:{fontSize:11.5,fontStyle:'bold',halign:'center',minCellHeight:12}}, {content:'', styles:{minCellHeight:12}}],
      [t('Peça / local inspecionado: '+(f.local||'')), t('Data início: '+br(f.inicio)+'\nData término: '+br(f.termino)), t(f.codigo+'\nUnidade de Negócio: '+(f.unidade||''))],
      [{content:t('Projetos / referências: '+(f.projetos||'')), colSpan:2}, t('Obra: '+(f.obra||cfg.obra||'')+'\nFVS Nº '+nFvs)],
      [{content:t('Informações relevantes, se aplicável: '+(f.info||'')), colSpan:3}],
      [{content:t('Observações finais: '+(f.obsFinais||'')), colSpan:3, styles:{minCellHeight:6}}]
    ],
    columnStyles:{0:{cellWidth:leftW},1:{cellWidth:midW},2:{cellWidth:rightW}},
    didDrawCell:function(d){ if(d.section==='body'&&d.row.index===0&&d.column.index===2&&LG){ try{ doc.addImage(LG.src,LG.fmt,d.cell.x+(d.cell.width-logoW)/2,d.cell.y+(d.cell.height-logoH)/2,logoW,logoH); }catch(e){} } }
  }));

  // ---- conditions / safety / environment ----
  var groups=[[f.cond,f.chk.c],[f.seg,f.chk.s],[f.amb,f.chk.a]];
  var nRows=Math.max(f.cond.length,f.seg.length,f.amb.length,1);
  var cbody=[]; for(var r=0;r<nRows;r++){ cbody.push(groups.map(function(g){ return g[0][r]!=null? t(g[0][r]) : ''; })); }
  doc.autoTable(Object.assign({}, common, {
    startY:doc.lastAutoTable.finalY, head:[['1. CONDIÇÕES PARA INÍCIO DOS SERVIÇOS','2. SEGURANÇA E SAÚDE','3. MEIO AMBIENTE'].map(t)], body:cbody,
    styles:Object.assign({}, common.styles, {cellPadding:{top:compact?0.5:0.9,bottom:compact?0.5:0.9,left:6,right:1.2}}),
    headStyles:Object.assign({}, common.headStyles, {cellPadding:1}),
    columnStyles:{0:{cellWidth:CW/3},1:{cellWidth:CW/3},2:{cellWidth:CW/3}},
    didDrawCell:function(d){ if(d.section!=='body') return; var g=groups[d.column.index]; if(g[0][d.row.index]==null) return;
      var bx=d.cell.x+1.6, by=d.cell.y+d.cell.height/2-1.5; doc.setDrawColor(40); doc.setLineWidth(0.25); doc.rect(bx,by,3,3);
      if(g[1][d.row.index]){ doc.setLineWidth(0.45); doc.line(bx+0.5,by+1.6,bx+1.3,by+2.5); doc.line(bx+1.3,by+2.5,bx+2.6,by+0.5); } doc.setLineWidth(0.15); doc.setDrawColor(LINE[0]); }
  }));

  // ---- quality requirements ----
  var body=[], rowMeta=[], lastSec=null, lastItem=null;
  f.itens.forEach(function(it,i){
    if(it.sec && it.sec!==lastSec){ body.push([{content:t(it.sec), colSpan:10, styles:{fillColor:LIGHT,fontStyle:'bold',halign:'left'}}]); rowMeta.push(null); lastSec=it.sec; lastItem=null; }
    var name=(it.item && it.item!==lastItem)? it.item : ''; lastItem=it.item;
    var obs=it.obs||''; if(itemPh[i]) obs+=(obs?' ':'')+'[Foto '+itemPh[i].join(', ')+']';
    if(it.v2&&it.v2.c==='R') obs=(obs?obs+' ':'')+'(reprovado na 2ª verificação)';
    body.push([t((i+1)+'. '+name), t(it.oque), t(it.quanto), t(it.medir), t(it.aceitar), it.v1?it.v1.c:'', it.v1?t(it.v1.i+(it.v1.d?' '+br(it.v1.d).slice(0,5):'')):'', it.v2?it.v2.c:'', it.v2?t(it.v2.i+(it.v2.d?' '+br(it.v2.d).slice(0,5):'')):'', t(obs)]);
    rowMeta.push(it);
  });
  var cw=[44,46,17,30,46,10,14,10,14]; var used=cw.reduce(function(a,b){return a+b;},0); cw.push(CW-used);
  var colStyles={}; cw.forEach(function(w,i){ colStyles[i]={cellWidth:w}; });
  [2,5,6,7,8].forEach(function(i){ colStyles[i].halign='center'; }); [5,7].forEach(function(i){ colStyles[i].fontStyle='bold'; colStyles[i].fontSize=8; });
  colStyles[6].fontSize=6.2; colStyles[8].fontSize=6.2;
  doc.autoTable(Object.assign({}, common, {
    startY:doc.lastAutoTable.finalY, showHead:'everyPage',
    head:[[{content:'4. REQUISITOS DA QUALIDADE',colSpan:5},{content:'A - Aprovado   R - Reparar   NA - Não Aplicável',colSpan:4},{content:'OBSERVAÇÕES',rowSpan:2}],
          ['Itens para execução e verificação','O que verificar','Quanto verificar','Como medir','Como aceitar','Verif. 1\ncód.','inspet.','Verif. 2\ncód.','inspet.'].map(function(x){ return {content:t(x)}; })],
    body:body, columnStyles:colStyles,
    headStyles:Object.assign({}, common.headStyles, {fontSize:7,valign:'middle'}),
    didParseCell:function(d){ if(d.section!=='body') return; if(d.column.index===5||d.column.index===7){ var v=d.cell.raw;
        if(v==='R'){ d.cell.styles.fillColor=[251,224,204]; d.cell.styles.textColor=[150,60,10]; }
        else if(v==='A'){ d.cell.styles.textColor=[25,105,55]; }
        else if(v==='NA'){ d.cell.styles.textColor=[100,100,100]; } } }
  }));

  // ---- signatures ----
  var y=doc.lastAutoTable.finalY+2, sigAlone=false;
  if(y+SIGH+6>H-12){ if(!compact && doc.getNumberOfPages()===1) sigAlone=true; doc.addPage(); y=M; }
  var sigData={};
  for(var k of ['prod','qual','eng']){ var a=f.ass[k]; if(a&&a.sig){ try{ var b=await getBlob(a.sig); if(b){ var u=await blobToDataURL(b); sigData[k]={u:u, s:await imgSize(u)}; } }catch(e){} } }
  var keys=['prod','qual','eng'];
  doc.autoTable(Object.assign({}, common, {
    startY:y, head:[['Produção','Qualidade','Engenharia']],
    body:[keys.map(function(k){ var a=f.ass[k]||{}; return t('Assinatura / Carimbo'+(a.nome?'  -  '+a.nome:'')+'          Data: '+br(a.data)); })],
    columnStyles:{0:{cellWidth:CW/3},1:{cellWidth:CW/3},2:{cellWidth:CW/3}},
    bodyStyles:{minCellHeight:SIGH,valign:'bottom',halign:'center',fontSize:7.2},
    didDrawCell:function(d){ if(d.section!=='body') return; var sd=sigData[keys[d.column.index]]; if(!sd||!sd.s) return;
      var box=fit(sd.s.w,sd.s.h,d.cell.width-20,d.cell.height-7); try{ doc.addImage(sd.u,'PNG',d.cell.x+(d.cell.width-box.w)/2,d.cell.y+1,box.w,box.h); }catch(e){} }
  }));

  // ---- photo annex ----
  if(photos.length){
    var cols=3, rows=2, gap=5, cellW=(CW-gap*(cols-1))/cols, top=M+10, cellH=(H-top-14-gap*(rows-1))/rows, capH=8, imgH=cellH-capH;
    for(var p=0;p<photos.length;p++){
      var slot=p%(cols*rows);
      if(slot===0){ doc.addPage(); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(20);
        doc.text(t('REGISTRO FOTOGRÁFICO - FVS Nº '+nFvs+' - '+f.titulo), M, M+4, {maxWidth:CW-50});
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.text(t('Local: '+(f.local||'')), M, M+8.5);
        if(LG){ var lw=Math.min(36,8*LG.ar); try{ doc.addImage(LG.src,LG.fmt,W-M-lw,M,lw,lw/LG.ar); }catch(e){} } }
      var cx=M+(slot%cols)*(cellW+gap), cy=top+Math.floor(slot/cols)*(cellH+gap);
      doc.setDrawColor(LINE[0]); doc.setLineWidth(0.2); doc.rect(cx,cy,cellW,cellH);
      try{ var bl=await getBlob(photos[p].id); if(bl){ var du=await blobToDataURL(bl); var sz=await imgSize(du); if(sz){ var bx=fit(sz.w,sz.h,cellW-2,imgH-2); doc.addImage(du,'JPEG',cx+(cellW-bx.w)/2,cy+1+(imgH-2-bx.h)/2,bx.w,bx.h,undefined,'FAST'); } } else { doc.setFontSize(8); doc.text('Foto não encontrada neste aparelho',cx+cellW/2,cy+imgH/2,{align:'center'}); } }catch(e){}
      doc.setFillColor(LIGHT[0],LIGHT[1],LIGHT[2]); doc.rect(cx,cy+imgH,cellW,capH,'FD');
      doc.setFont('helvetica','normal'); doc.setFontSize(7.2); doc.setTextColor(20);
      var cap=doc.splitTextToSize(t('Foto '+(p+1)+' - '+photos[p].cap+(photos[p].d?' - '+br(photos[p].d):'')), cellW-3).slice(0,2);
      doc.text(cap, cx+1.5, cy+imgH+3.2);
    }
  }

  // ---- footer ----
  var pages=doc.getNumberOfPages(), stamp=new Date();
  var when=String(stamp.getDate()).padStart(2,'0')+'/'+String(stamp.getMonth()+1).padStart(2,'0')+'/'+stamp.getFullYear()+' '+String(stamp.getHours()).padStart(2,'0')+':'+String(stamp.getMinutes()).padStart(2,'0');
  for(var pg=1; pg<=pages; pg++){ doc.setPage(pg); doc.setFont('helvetica','normal'); doc.setFontSize(6.8); doc.setTextColor(110);
    doc.text(t('FVS Nº '+nFvs+' - '+(f.obra||cfg.obra||'')+' - '+(f.local||'')), M, H-5, {maxWidth:CW-60});
    doc.text(t('Página '+pg+' de '+pages+'  -  gerado em '+when), W-M, H-5, {align:'right'}); }
  return {doc:doc, sigAlone:sigAlone};
}

function d(iso){ if(!iso) return ''; var p=iso.split('-'); return new Date(+p[0],+p[1]-1,+p[2]); }
function controle(XLSX, fichas, cfg, stats, itemState){
  var LBL={and:'Em andamento',pend:'Reparo pendente',ok:'Concluída'};
  var r1=[['Nº','Código','Serviço','Categoria','Local','Projetos / referências','Início','Término','Itens','Verificados','A','R','NA','Reparos pendentes','Status','Assinaturas']];
  var r2=[['Nº FVS','Serviço','Local','Item','O que verificar','Como aceitar','Reparo pedido','Aberto em','Dias em aberto','Situação']];
  var r3=[['Nº FVS','Serviço','Local','Seção','Item','O que verificar','Como aceitar','Verif. 1','Inspetor','Data','Verif. 2','Inspetor','Data','Observação','Fotos']];
  var hoje=new Date(); var today=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()).getTime();
  fichas.forEach(function(f){ var s=stats(f), cA=0,cR=0,cN=0;
    f.itens.forEach(function(it){ if(it.v1){ if(it.v1.c==='A') cA++; else if(it.v1.c==='R') cR++; else cN++; }
      var st=itemState(it);
      if(st==='R') r2.push([f.n, (f.num?'FVS '+f.num+' - ':'')+f.titulo, f.local, it.item, it.oque, it.aceitar, it.obs, d(it.v1.d), Math.round((today-d(it.v1.d))/864e5), it.v2&&it.v2.c==='R'?'Reprovado na 2ª verificação':'Aguardando reparo']);
      r3.push([f.n, (f.num?'FVS '+f.num+' - ':'')+f.titulo, f.local, it.sec, it.item, it.oque, it.aceitar, it.v1?it.v1.c:'', it.v1?it.v1.i:'', it.v1?d(it.v1.d):'', it.v2?it.v2.c:'', it.v2?it.v2.i:'', it.v2?d(it.v2.d):'', it.obs, (it.fotos||[]).length||'']);
    });
    r1.push([f.n, f.codigo, f.titulo, f.cat||'', f.local, f.projetos, d(f.inicio), d(f.termino), s.t, s.feitos, cA, cR, cN, s.pend, LBL[s.st], s.ass+'/3']);
  });
  function sheet(rows, widths){ var ws=XLSX.utils.aoa_to_sheet(rows,{cellDates:true, dateNF:'dd/mm/yyyy'}); ws['!cols']=widths.map(function(w){ return {wch:w}; }); ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length-1,c:rows[0].length-1}})}; return ws; }
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(r1,[6,26,48,20,30,30,11,11,7,10,5,5,5,10,16,11]), 'FVS');
  XLSX.utils.book_append_sheet(wb, sheet(r2,[8,40,28,34,40,34,40,11,9,24]), 'Pendências');
  XLSX.utils.book_append_sheet(wb, sheet(r3,[8,40,28,24,34,40,34,8,9,11,8,9,11,40,6]), 'Itens verificados');
  var out=XLSX.write(wb,{bookType:'xlsx',type:'array',cellDates:true});
  return new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
window.FVSPDF={build:build, controle:controle};
})();
