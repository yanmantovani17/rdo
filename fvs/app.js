(function(){
'use strict';
var APP_VER = '2026.10.09-1';   // troque junto com version.json a cada publicação
var $ = function(s, r){ return (r||document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
function h(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function br(iso){ if(!iso) return ''; var p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function brShort(iso){ if(!iso) return ''; var p=iso.split('-'); return p[2]+'/'+p[1]; }
function uid(p){ return (p||'')+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function norm(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
function daysSince(iso){ if(!iso) return 0; var a=new Date(iso+'T12:00:00'), b=new Date(todayISO()+'T12:00:00'); return Math.round((b-a)/864e5); }
var toastTimer; function toast(t){ var el=$('#toast'); el.textContent=t; el.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(function(){ el.hidden=true; },3400); }
function setSync(t){ $('#sync').textContent=t; }

// ---------- storage ----------
var LS={get:function(k){ try{ var v=localStorage.getItem('fvs:'+k); return v?JSON.parse(v):null; }catch(e){ return null; } },
        set:function(k,v){ try{ localStorage.setItem('fvs:'+k, JSON.stringify(v)); }catch(e){} }};
var DB=(function(){
  var dbp=null;
  function open(){ if(!dbp) dbp=new Promise(function(res,rej){ var q=indexedDB.open('fvs-app',1);
      q.onupgradeneeded=function(){ var d=q.result; if(!d.objectStoreNames.contains('fichas')) d.createObjectStore('fichas',{keyPath:'id'}); if(!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); };
      q.onsuccess=function(){ res(q.result); }; q.onerror=function(){ rej(q.error); }; }); return dbp; }
  function tx(store,mode,fn){ return open().then(function(d){ return new Promise(function(res,rej){ var t=d.transaction(store,mode); var r=fn(t.objectStore(store)); t.oncomplete=function(){ res(r&&r.result); }; t.onerror=function(){ rej(t.error); }; t.onabort=function(){ rej(t.error); }; }); }); }
  return {
    all:function(){ return tx('fichas','readonly',function(s){ return s.getAll(); }); },
    put:function(f){ return tx('fichas','readwrite',function(s){ return s.put(f); }); },
    del:function(id){ return tx('fichas','readwrite',function(s){ return s.delete(id); }); },
    getB:function(k){ return tx('blobs','readonly',function(s){ return s.get(k); }); },
    putB:function(k,v){ return tx('blobs','readwrite',function(s){ return s.put(v,k); }); },
    delB:function(k){ return tx('blobs','readwrite',function(s){ return s.delete(k); }); },
    keysB:function(){ return tx('blobs','readonly',function(s){ return s.getAllKeys(); }); }
  };
})();

var DEFAULT_CFG={obra:'GOLGI RODOANEL NORTE', unidade:'', insp:'', sigla:'', prod:'', qual:'', eng:'', locais:[], seq:0};
var cfg=Object.assign({},DEFAULT_CFG);
var fichas=[];           // all records, in memory
var cur=null;            // open ficha
var view='painel';
var filtro='';           // painel status filter
var catSel='Todas';
var novoModelo=null;
var MODELOS=window.FVS_MODELOS||[];
function modeloById(id){ return MODELOS.find(function(m){ return m.id===id; }); }
function saveCfg(){ LS.set('cfg',cfg); }

var saveTimers={};
function touch(f){ f=f||cur; if(!f) return; f.atualizado=Date.now(); setSync('salvando…'); clearTimeout(saveTimers[f.id]);
  saveTimers[f.id]=setTimeout(function(){ delete saveTimers[f.id]; persist(f); },500); }
function persist(f){ return DB.put(f).then(function(){ setSync('salvo no celular'); }).catch(function(e){ console.error(e); setSync('erro ao salvar'); toast('Não consegui salvar. Libere espaço no celular.'); }); }
function flushAll(){ Object.keys(saveTimers).forEach(function(id){ clearTimeout(saveTimers[id]); delete saveTimers[id]; var f=fichas.find(function(x){return x.id===id;}); if(f) persist(f); }); }

// ---------- model ----------
function initials(n){ return String(n||'').trim().split(/\s+/).filter(Boolean).map(function(p){ return p[0]; }).join('').slice(0,3).toUpperCase(); }
function sigla(){ return cfg.sigla || initials(cfg.insp) || ''; }
function novaFicha(m, local, proj, ini){
  cfg.seq=(cfg.seq||0)+1; saveCfg();
  var prev=null;
  var itens=m.itens.map(function(it){ var o={sec:it[0], item:it[1], oque:it[2], quanto:it[3], medir:it[4], aceitar:it[5], v1:null, v2:null, obs:'', fotos:[]};
    if(!o.quanto && prev && prev.quanto && (prev.item===o.item || String(prev.item).split(' – ')[0]===String(o.item).split(' – ')[0])) o.quanto=prev.quanto; prev=o; return o; });
  return { id:uid('f'), n:cfg.seq, modelo:m.id, num:m.num, rev:m.rev, codigo:m.codigo, titulo:m.titulo, cat:m.cat,
    cond:m.cond.slice(), seg:m.seg.slice(), amb:m.amb.slice(),
    chk:{c:m.cond.map(function(){return false;}), s:m.seg.map(function(){return false;}), a:m.amb.map(function(){return false;})},
    itens:itens, local:local, projetos:proj||'', info:'Verificação preliminar amostral, que não implica na aceitação definitiva dos serviços.',
    obsFinais:'', inicio:ini||todayISO(), termino:'', unidade:cfg.unidade||'', obra:cfg.obra||'',
    ass:{prod:{nome:cfg.prod||'',data:'',sig:null}, qual:{nome:cfg.qual||'',data:'',sig:null}, eng:{nome:cfg.eng||'',data:'',sig:null}},
    fotos:[], criado:Date.now(), atualizado:Date.now() };
}
function itemState(it){ if(!it.v1) return ''; if(it.v1.c!=='R') return it.v1.c; if(it.v2&&it.v2.c!=='R') return 'RA'; return 'R'; }
function stats(f){ var t=f.itens.length, feitos=0, pend=0, rep=0, last='';
  f.itens.forEach(function(it){ if(it.v1){ feitos++; if(it.v1.d>last) last=it.v1.d; if(it.v1.c==='R'){ rep++; if(!it.v2||it.v2.c==='R') pend++; else if(it.v2.d>last) last=it.v2.d; } } });
  var st=pend?'pend':(feitos<t?'and':'ok'); var ass=['prod','qual','eng'].filter(function(k){ return f.ass[k]&&f.ass[k].sig; }).length;
  return {t:t, feitos:feitos, pend:pend, rep:rep, st:st, ass:ass, last:last}; }
var ST_LBL={and:'Em andamento', pend:'Reparo pendente', ok:'Concluída'};
function fCode(f){ return f.num? 'FVS '+f.num : 'FVS'; }
function autoTermino(f){ var s=stats(f); if(s.st==='ok' && !f.termino) f.termino=s.last||todayISO(); }

// ---------- views ----------
function showView(v, opts){
  view=v; opts=opts||{};
  ['painel','novo','ficha','pend','obra'].forEach(function(x){ $('#view-'+x).hidden=x!==v; });
  var main=(v==='painel'||v==='pend'||v==='obra');
  $('#brandMain').hidden=!main; $('#tabs').hidden=!main; $('#brandSub').hidden=main; $('#subGap').hidden=main;
  ['painel','pend','obra'].forEach(function(x){ $('#tab-'+x).setAttribute('aria-selected',String(x===v)); });
  $('#bar').hidden=!(v==='painel'||v==='ficha');
  if(v==='painel'){ $('#prog').hidden=true; $('#barBtn').textContent='+ Nova FVS'; $('#barBtn').className='btn pri'; renderPainel(); }
  if(v==='pend') renderPend();
  if(v==='obra') renderCfg();
  if(v==='novo') renderNovo(opts);
  if(v==='ficha') renderFicha(opts);
  updatePendCnt();
  if(!opts.keepScroll) window.scrollTo(0,0);
}
function setSub(title, meta, num){ $('#subTitle').textContent=title; $('#subMeta').textContent=meta||''; var n=$('#subNum'); n.hidden=!num; n.textContent=num||''; }
function updatePendCnt(){ var n=0; fichas.forEach(function(f){ n+=stats(f).pend; }); var c=$('#pendCnt'); c.hidden=!n; c.textContent=n; }

// ---------- painel ----------
function renderPainel(){
  var cnt={and:0,pend:0,ok:0}; fichas.forEach(function(f){ cnt[stats(f).st]++; });
  $('#obraName').innerHTML=h(cfg.obra||'FVS')+'<small>Fichas de Verificação de Serviço</small>';
  $('#tiles').innerHTML=['and','pend','ok'].map(function(k){ return '<button type="button" class="tile '+k+'" data-f="'+k+'" aria-pressed="'+(filtro===k)+'"><b>'+cnt[k]+'</b><span>'+ST_LBL[k]+'</span></button>'; }).join('');
  renderFList();
}
function renderFList(){
  var q=norm($('#q').value).trim();
  var list=fichas.slice().sort(function(a,b){ return b.n-a.n; }).filter(function(f){
    if(filtro && stats(f).st!==filtro) return false;
    if(!q) return true;
    return norm(f.titulo+' '+f.local+' '+f.codigo+' '+f.num+' nº'+f.n+' '+f.n).indexOf(q)>=0; });
  var el=$('#flist');
  if(!fichas.length){ el.innerHTML='<div class="empty"><b>Nenhuma FVS ainda</b>Toque em “+ Nova FVS”, escolha o serviço e o local. As 67 fichas da Libercon já estão no app.</div>'; return; }
  if(!list.length){ el.innerHTML='<div class="empty"><b>Nada encontrado</b>Mude a busca ou o filtro.</div>'; return; }
  el.innerHTML=list.map(function(f){ var s=stats(f); var pct=s.t?Math.round(100*s.feitos/s.t):0;
    var meta=[s.feitos+'/'+s.t+' itens', s.pend? s.pend+' a reparar':'', 'início '+brShort(f.inicio), s.ass? s.ass+'/3 assinaturas':''].filter(Boolean).join(' · ');
    return '<button type="button" class="frow '+s.st+'" data-id="'+f.id+'"><span class="n">Nº'+String(f.n).padStart(3,'0')+'</span><span class="grow">'+
      '<span class="tt">'+h(fCode(f))+' · '+h(f.titulo)+'</span><span class="loc">'+h(f.local||'—')+'</span>'+
      '<span class="meta"><span class="badge '+s.st+'">'+ST_LBL[s.st]+'</span> '+h(meta)+'</span><span class="bar-mini"><i style="width:'+pct+'%"></i></span></span></button>'; }).join('');
}
$('#tiles').addEventListener('click',function(e){ var b=e.target.closest('.tile'); if(!b) return; filtro=(filtro===b.dataset.f)?'':b.dataset.f; renderPainel(); });
$('#q').addEventListener('input',renderFList);
$('#flist').addEventListener('click',function(e){ var b=e.target.closest('.frow'); if(!b) return; openFicha(b.dataset.id); });

function openFicha(id, itemIdx){ var f=fichas.find(function(x){return x.id===id;}); if(!f) return; cur=f; pushNav(); showView('ficha',{item:itemIdx}); }

// ---------- nova FVS ----------
var CATS=['Todas'].concat(MODELOS.reduce(function(a,m){ if(a.indexOf(m.cat)<0) a.push(m.cat); return a; },[]));
function renderNovo(opts){
  setSub('Nova FVS','Escolha o serviço e o local','');
  $('#tq').value='';
  if(opts.modelo){ pickModelo(opts.modelo); return; }
  $('#novo1').hidden=false; $('#novo2').hidden=true; novoModelo=null;
  $('#tcats').innerHTML=CATS.map(function(c){ return '<button type="button" class="chip" aria-pressed="'+(c===catSel)+'" data-c="'+h(c)+'">'+h(c)+'</button>'; }).join('');
  renderTList();
}
function usedCount(id){ return fichas.filter(function(f){ return f.modelo===id; }).length; }
function renderTList(){
  var q=norm($('#tq').value).trim();
  var list=MODELOS.filter(function(m){ if(catSel!=='Todas' && m.cat!==catSel) return false; if(!q) return true; return norm(m.titulo+' '+m.num+' '+m.codigo+' '+m.cat).indexOf(q)>=0; });
  // most used first when not searching
  if(!q){ var used=list.filter(function(m){ return usedCount(m.id); }).sort(function(a,b){ return usedCount(b.id)-usedCount(a.id); }).slice(0,5); if(used.length && catSel==='Todas'){ list=used.concat(list.filter(function(m){ return used.indexOf(m)<0; })); } }
  $('#tlist').innerHTML=list.length? list.map(function(m){ var u=usedCount(m.id);
    return '<button type="button" class="tpl" data-id="'+m.id+'"><span class="code">'+h(m.num||'—')+'</span><span class="grow"><span class="tt">'+h(m.titulo)+'</span><span class="meta">'+h(m.cat)+' · '+m.itens.length+' itens · '+h(m.rev)+(u?' · usada '+u+'×':'')+'</span></span></button>'; }).join('')
    : '<div class="empty"><b>Nenhuma ficha</b>Tente outra palavra.</div>';
}
function pickModelo(id){ var m=modeloById(id); if(!m) return; novoModelo=m;
  $('#novo1').hidden=true; $('#novo2').hidden=false;
  $('#pickedTpl').innerHTML='<span class="code">'+h(m.num||'—')+'</span><span class="grow"><span class="tt">'+h(m.titulo)+'</span><span class="meta">'+m.itens.length+' itens · toque para trocar</span></span>';
  $('#nLocais').value=''; $('#nIni').value=todayISO();
  var last=fichas.filter(function(f){ return f.modelo===m.id; }).sort(function(a,b){ return b.n-a.n; })[0];
  $('#nProj').value=last? last.projetos : '';
  var sug=[]; (cfg.locais||[]).forEach(function(l){ if(sug.indexOf(l)<0) sug.push(l); });
  fichas.slice().sort(function(a,b){ return b.n-a.n; }).forEach(function(f){ if(f.local && sug.indexOf(f.local)<0 && sug.length<14) sug.push(f.local); });
  $('#nSug').innerHTML=sug.slice(0,14).map(function(l){ return '<button type="button" class="chip" data-l="'+h(l)+'">'+h(l)+'</button>'; }).join('');
  updateCreateBtn(); window.scrollTo(0,0);
}
function locaisDigitados(){ return $('#nLocais').value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean); }
function updateCreateBtn(){ var n=locaisDigitados().length; $('#nCreate').textContent= n>1? 'Abrir '+n+' FVS (uma por local)' : 'Abrir FVS'; }
$('#tq').addEventListener('input',renderTList);
$('#tcats').addEventListener('click',function(e){ var b=e.target.closest('.chip'); if(!b) return; catSel=b.dataset.c; $$('#tcats .chip').forEach(function(x){ x.setAttribute('aria-pressed',String(x===b)); }); renderTList(); });
$('#tlist').addEventListener('click',function(e){ var b=e.target.closest('.tpl'); if(b) pickModelo(b.dataset.id); });
$('#pickedTpl').addEventListener('click',function(){ renderNovo({}); });
$('#nLocais').addEventListener('input',updateCreateBtn);
$('#nSug').addEventListener('click',function(e){ var b=e.target.closest('.chip'); if(!b) return; var ta=$('#nLocais'); var cur_=locaisDigitados(); if(cur_.indexOf(b.dataset.l)<0){ cur_.push(b.dataset.l); ta.value=cur_.join('\n'); } updateCreateBtn(); });
$('#nCreate').addEventListener('click',async function(){
  if(!novoModelo) return; var locs=locaisDigitados();
  if(!locs.length){ toast('Informe a peça ou o local inspecionado.'); $('#nLocais').focus(); return; }
  if(locs.length>40){ toast('No máximo 40 locais de uma vez.'); return; }
  var made=locs.map(function(l){ return novaFicha(novoModelo, l, $('#nProj').value.trim(), $('#nIni').value||todayISO()); });
  for(var i=0;i<made.length;i++){ fichas.push(made[i]); await persist(made[i]); }
  if(made.length===1){ cur=made[0]; replaceNav(); showView('ficha'); toast('FVS Nº'+String(cur.n).padStart(3,'0')+' aberta.'); }
  else { goHome(); toast(made.length+' FVS abertas.'); }
});

// ---------- ficha ----------
function renderFicha(opts){
  var f=cur; if(!f){ goHome(); return; }
  setSub(fCode(f)+' · '+f.titulo, f.local, 'Nº'+String(f.n).padStart(3,'0'));
  var v=$('#view-ficha'); var html='';
  var nCk=f.cond.length+f.seg.length+f.amb.length;
  // identification
  html+='<details class="card" id="c-id"'+(opts&&opts.item!=null?'':' open')+'><summary><span class="dot on"></span><h2>Identificação</h2><span class="sum">'+h(f.local)+'</span><span class="chev">›</span></summary><div class="body">'+
    '<label class="field"><span class="lbl">Peça / local inspecionado</span><input type="text" data-k="local" value="'+h(f.local)+'"></label>'+
    '<label class="field"><span class="lbl">Projetos / referências</span><input type="text" data-k="projetos" value="'+h(f.projetos)+'"></label>'+
    '<div class="grid2"><label class="field"><span class="lbl">Data início</span><input type="date" data-k="inicio" value="'+h(f.inicio)+'"></label>'+
    '<label class="field"><span class="lbl">Data término</span><input type="date" data-k="termino" value="'+h(f.termino)+'"></label></div>'+
    '<label class="field"><span class="lbl">Unidade de negócio</span><input type="text" data-k="unidade" value="'+h(f.unidade)+'"></label>'+
    '<label class="field"><span class="lbl">Informações relevantes</span><textarea data-k="info" rows="2">'+h(f.info)+'</textarea></label>'+
    '<p class="note">Modelo: '+h(f.codigo)+'</p></div></details>';
  // checks
  if(nCk){
    html+='<details class="card" id="c-ck"><summary><span class="dot" id="ckDot"></span><h2>Antes de começar</h2><span class="sum" id="ckSum"></span><span class="chev">›</span></summary><div class="body">'+
      ckGroup('1. Condições para início','c',f.cond,f.chk.c)+ckGroup('2. Segurança e saúde','s',f.seg,f.chk.s)+ckGroup('3. Meio ambiente','a',f.amb,f.chk.a)+
      '<button type="button" class="btn sm ghost" id="ckAll">Marcar tudo</button></div></details>';
  }
  // items
  html+='<h2 class="sheet-h" style="margin-top:6px">Requisitos da qualidade</h2><p class="note">A = aprovado · R = reparar · NA = não aplicável. Se marcar R, descreva o reparo e faça a 2ª verificação depois.</p><div id="items">';
  var lastSec=null;
  f.itens.forEach(function(it,i){ if(it.sec && it.sec!==lastSec){ html+='<h3 class="sec-h">'+h(it.sec)+'</h3>'; lastSec=it.sec; } html+=itemHTML(it,i); });
  html+='</div><button type="button" class="btn ghost full" id="allA">Aprovar (A) os itens ainda sem marcação</button>';
  // final obs + photos
  html+='<details class="card" id="c-obs"><summary><span class="dot'+(f.obsFinais||f.fotos.length?' on':'')+'"></span><h2>Observações e fotos gerais</h2><span class="sum">'+(f.fotos.length?f.fotos.length+' foto(s)':'')+'</span><span class="chev">›</span></summary><div class="body">'+
    '<label class="field"><span class="lbl">Observações finais</span><textarea data-k="obsFinais" rows="3">'+h(f.obsFinais)+'</textarea></label>'+
    '<div class="field"><span class="lbl">Fotos gerais</span><div class="thumbs" data-gfotos>'+thumbsHTML(f.fotos,'g')+addPhHTML('g')+'</div></div></div></details>';
  // signatures
  html+='<details class="card" id="c-ass"><summary><span class="dot" id="assDot"></span><h2>Assinaturas</h2><span class="sum" id="assSum"></span><span class="chev">›</span></summary><div class="body"><div class="sigs">'+
    [['prod','Produção'],['qual','Qualidade'],['eng','Engenharia']].map(function(p){ var a=f.ass[p[0]];
      return '<div class="sig" data-s="'+p[0]+'"><h3>'+p[1]+'</h3><div class="grid2"><label class="field"><span class="lbl">Nome</span><input type="text" data-a="nome" value="'+h(a.nome)+'"></label><label class="field"><span class="lbl">Data</span><input type="date" data-a="data" value="'+h(a.data)+'"></label></div>'+
      '<div class="sigimg" data-sign="'+p[0]+'" role="button" tabindex="0">'+(a.sig?'':'Toque para assinar')+'</div></div>'; }).join('')+
    '</div><p class="note">Pode deixar em branco e assinar no papel depois de imprimir.</p></div></details>';
  html+='<div class="row" style="margin-top:6px"><button type="button" class="btn grow" id="dupBtn">Nova FVS deste serviço</button><button type="button" class="btn danger" id="delBtn">Excluir</button></div>';
  v.innerHTML=html;
  // bar
  $('#prog').hidden=false; $('#barBtn').textContent='Gerar PDF'; $('#barBtn').className='btn pri';
  refreshFichaMeta();
  loadThumbs(v); loadSigs();
  if(opts&&opts.item!=null){ var el=$('#it-'+opts.item); if(el){ setTimeout(function(){ el.scrollIntoView({block:'start'}); el.classList.add('flash'); },60); } }
}
function ckGroup(title,k,list,vals){ if(!list.length) return ''; return '<div class="ckgrp"><h3>'+h(title)+'</h3>'+list.map(function(t,i){ return '<label class="ck"><input type="checkbox" data-ck="'+k+'" data-i="'+i+'"'+(vals[i]?' checked':'')+'><span>'+h(t)+'</span></label>'; }).join('')+'</div>'; }
function segBtns(it,which,i){ var v=it[which]; return '<div class="seg3" role="group" aria-label="'+(which==='v1'?'1ª':'2ª')+' verificação">'+['A','R','NA'].map(function(c){ return '<button type="button" data-i="'+i+'" data-w="'+which+'" data-c="'+c+'" aria-pressed="'+(!!v&&v.c===c)+'">'+c+'</button>'; }).join('')+'</div>'; }
function whoHTML(v){ return v? '<span class="who">'+h(v.i||'')+(v.i?' · ':'')+brShort(v.d)+'</span>' : ''; }
function itemHTML(it,i){
  var st=itemState(it);
  var crit='';
  if(it.medir) crit+='<dt>Medir</dt><dd>'+h(it.medir)+'</dd>';
  if(it.aceitar) crit+='<dt>Aceitar</dt><dd class="acc">'+h(it.aceitar)+'</dd>';
  if(it.quanto) crit+='<dt>Quanto</dt><dd>'+h(it.quanto)+'</dd>';
  var s='<article class="it s-'+st+'" id="it-'+i+'" data-i="'+i+'"><div class="it-h"><span class="n">'+(i+1)+'</span><div class="grow"><b>'+h(it.item||it.oque)+'</b>'+(it.oque&&it.item?'<div class="oq">'+h(it.oque)+'</div>':'')+'</div></div>'+
    (crit?'<dl class="crit">'+crit+'</dl>':'')+
    '<div class="ver"><span class="lbl">1ª verificação</span>'+segBtns(it,'v1',i)+whoHTML(it.v1)+'</div>';
  if(it.v1&&it.v1.c==='R'){
    s+='<div class="rep"><label class="field"><span class="lbl">O que precisa reparar</span><textarea data-obs="'+i+'" rows="2" placeholder="Descreva a não conformidade e o reparo pedido">'+h(it.obs)+'</textarea></label>'+
      '<div class="thumbs">'+thumbsHTML(it.fotos,i)+addPhHTML(i)+'</div>'+
      '<div class="ver"><span class="lbl">2ª verificação</span>'+segBtns(it,'v2',i)+whoHTML(it.v2)+'</div>'+
      (it.v2&&it.v2.c==='R'?'<p class="note" style="color:var(--warn)">Reprovado de novo. Registre nas observações e refaça a verificação após novo reparo.</p>':'')+'</div>';
  } else if(it.obs || it.fotos.length || it._open){
    s+='<label class="field"><span class="lbl">Observação</span><textarea data-obs="'+i+'" rows="2">'+h(it.obs)+'</textarea></label><div class="thumbs">'+thumbsHTML(it.fotos,i)+addPhHTML(i)+'</div>';
  } else {
    s+='<button type="button" class="linkbtn" data-more="'+i+'">+ Observação / foto</button>';
  }
  return s+'</article>';
}
function thumbsHTML(list,owner){ return (list||[]).map(function(p){ return '<div class="th" data-ph="'+p.id+'"><button type="button" class="x" data-rmph="'+p.id+'" data-owner="'+owner+'" aria-label="Remover foto">×</button></div>'; }).join(''); }
function addPhHTML(owner){ return '<label class="addph"><span class="ico">＋</span>Foto<input type="file" accept="image/*" multiple data-addph="'+owner+'"></label>'; }
function rerenderItem(i){ var el=$('#it-'+i); if(!el) return; var tmp=document.createElement('div'); tmp.innerHTML=itemHTML(cur.itens[i],i); var n=tmp.firstChild; el.replaceWith(n); loadThumbs(n); }
function refreshFichaMeta(){
  var f=cur, s=stats(f);
  $('#prog').innerHTML='<b>'+s.feitos+'/'+s.t+'</b>'+(s.pend? s.pend+' a reparar' : ST_LBL[s.st].toLowerCase());
  var nCk=f.cond.length+f.seg.length+f.amb.length, okCk=f.chk.c.concat(f.chk.s,f.chk.a).filter(Boolean).length;
  if($('#ckSum')){ $('#ckSum').textContent=okCk+'/'+nCk+' conferidos'; $('#ckDot').className='dot'+(okCk===nCk?' on':''); }
  if($('#assSum')){ $('#assSum').textContent=s.ass+'/3'; $('#assDot').className='dot'+(s.ass===3?' on':''); }
  var tm=$('[data-k="termino"]'); if(tm && tm.value!==f.termino) tm.value=f.termino||'';
}
function setVer(i,w,c){
  var it=cur.itens[i]; var prev=it[w];
  if(prev && prev.c===c){ it[w]=null; if(w==='v1'){ it.v2=null; } }
  else { it[w]={c:c, i:sigla(), d:todayISO()}; if(w==='v1' && c!=='R'){ it.v2=null; } }
  autoTermino(cur);
  rerenderItem(i); refreshFichaMeta(); touch(); updatePendCnt();
  if(w==='v1' && c==='R' && it.v1){ var ta=$('[data-obs="'+i+'"]'); if(ta && !it.obs) ta.focus(); }
}
var fv=$('#view-ficha');
fv.addEventListener('click',function(e){
  var b=e.target.closest('.seg3 button'); if(b){ setVer(+b.dataset.i, b.dataset.w, b.dataset.c); return; }
  var m=e.target.closest('[data-more]'); if(m){ var i=+m.dataset.more; cur.itens[i]._open=true; rerenderItem(i); var ta=$('[data-obs="'+i+'"]'); if(ta) ta.focus(); return; }
  var rm=e.target.closest('[data-rmph]'); if(rm){ e.preventDefault(); removePhoto(rm.dataset.owner, rm.dataset.rmph); return; }
  var th=e.target.closest('.th'); if(th){ viewPhoto(th.dataset.ph); return; }
  var sg=e.target.closest('[data-sign]'); if(sg){ openPad(sg.dataset.sign); return; }
  if(e.target.id==='ckAll'){ ['c','s','a'].forEach(function(k){ cur.chk[k]=cur.chk[k].map(function(){return true;}); }); $$('[data-ck]',fv).forEach(function(x){ x.checked=true; }); refreshFichaMeta(); touch(); return; }
  if(e.target.id==='allA'){ var n=cur.itens.filter(function(it){ return !it.v1; }).length; if(!n){ toast('Todos os itens já estão marcados.'); return; }
    if(!confirm('Marcar A (aprovado) nos '+n+' itens que ainda estão sem marcação?')) return;
    cur.itens.forEach(function(it,i){ if(!it.v1){ it.v1={c:'A', i:sigla(), d:todayISO()}; rerenderItem(i); } }); autoTermino(cur); refreshFichaMeta(); touch(); updatePendCnt(); return; }
  if(e.target.id==='dupBtn'){ var mid=cur.modelo; flushAll(); pushNav(); showView('novo',{modelo:mid}); return; }
  if(e.target.id==='delBtn'){ deleteFicha(cur); return; }
});
fv.addEventListener('keydown',function(e){ var sg=e.target.closest('[data-sign]'); if(sg&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); openPad(sg.dataset.sign); } });
fv.addEventListener('input',function(e){
  var t=e.target;
  if(t.dataset.k){ cur[t.dataset.k]=t.value; if(t.dataset.k==='local'||t.dataset.k==='titulo') setSub(fCode(cur)+' · '+cur.titulo, cur.local, 'Nº'+String(cur.n).padStart(3,'0')); touch(); return; }
  if(t.dataset.obs!=null){ cur.itens[+t.dataset.obs].obs=t.value; touch(); return; }
  if(t.dataset.a){ var s=t.closest('.sig').dataset.s; cur.ass[s][t.dataset.a]=t.value; touch(); return; }
});
fv.addEventListener('change',function(e){
  var t=e.target;
  if(t.dataset.ck){ cur.chk[t.dataset.ck][+t.dataset.i]=t.checked; refreshFichaMeta(); touch(); return; }
  if(t.dataset.addph!=null){ var fl=Array.prototype.slice.call(t.files||[]); t.value=''; addPhotos(t.dataset.addph, fl); return; }
  if(t.type==='date' && t.dataset.k){ cur[t.dataset.k]=t.value; touch(); }
});

// ---------- photos ----------
var urlCache={};
async function blobURL(key){ if(urlCache[key]) return urlCache[key]; var b=await DB.getB(key); if(!b) return null; return (urlCache[key]=URL.createObjectURL(b)); }
async function loadThumbs(root){ var els=$$('.th',root); for(var i=0;i<els.length;i++){ var u=await blobURL(els[i].dataset.ph); if(u) els[i].style.backgroundImage='url("'+u+'")'; } }
function loadImg(blob){ return new Promise(function(res,rej){ var u=URL.createObjectURL(blob); var im=new Image(); im.onload=function(){ res(im); setTimeout(function(){ URL.revokeObjectURL(u); },1000); }; im.onerror=rej; im.src=u; }); }
async function shrink(file){ var im=await loadImg(file); var max=1600, s=Math.min(1, max/Math.max(im.naturalWidth,im.naturalHeight)); var c=document.createElement('canvas'); c.width=Math.round(im.naturalWidth*s); c.height=Math.round(im.naturalHeight*s); c.getContext('2d').drawImage(im,0,0,c.width,c.height); return new Promise(function(res){ c.toBlob(res,'image/jpeg',0.82); }); }
async function addPhotos(owner, files){
  if(!files||!files.length) return; var f=cur; setSync('salvando foto…');
  for(var k=0;k<files.length;k++){
    try{ var b=await shrink(files[k]); var id=uid('ph'); await DB.putB(id,b); var rec={id:id, d:todayISO()};
      if(owner==='g') f.fotos.push(rec); else { var it=f.itens[+owner]; it.fotos.push(rec); it._open=true; } }
    catch(e){ console.error(e); toast('Não consegui ler uma das fotos.'); }
  }
  if(owner==='g'){ var box=$('[data-gfotos]'); box.innerHTML=thumbsHTML(f.fotos,'g')+addPhHTML('g'); loadThumbs(box); } else rerenderItem(+owner);
  touch();
}
async function removePhoto(owner, id){ if(!confirm('Remover esta foto?')) return; var list= owner==='g'? cur.fotos : cur.itens[+owner].fotos;
  var ix=list.findIndex(function(p){ return p.id===id; }); if(ix<0) return; list.splice(ix,1); DB.delB(id).catch(function(){});
  if(owner==='g'){ var box=$('[data-gfotos]'); box.innerHTML=thumbsHTML(cur.fotos,'g')+addPhHTML('g'); loadThumbs(box); } else rerenderItem(+owner); touch(); }
async function viewPhoto(id){ var u=await blobURL(id); if(!u) return; var a=document.createElement('a'); a.href=u; a.target='_blank'; a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove(); }

// ---------- signatures ----------
var pad={k:null, drawn:false};
function openPad(k){ pad.k=k; pad.drawn=false; $('#padTitle').textContent='Assinatura – '+({prod:'Produção',qual:'Qualidade',eng:'Engenharia'})[k]; $('#padOv').hidden=false;
  var c=$('#padCanvas'); var r=c.getBoundingClientRect(); var dpr=window.devicePixelRatio||1; c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr);
  var x=c.getContext('2d'); x.setTransform(dpr,0,0,dpr,0,0); x.fillStyle='#fff'; x.fillRect(0,0,r.width,r.height); x.lineWidth=2.4; x.lineCap='round'; x.lineJoin='round'; x.strokeStyle='#14223a'; }
(function(){ var c=$('#padCanvas'), drawing=false, last=null;
  function pt(e){ var r=c.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
  c.addEventListener('pointerdown',function(e){ drawing=true; last=pt(e); c.setPointerCapture(e.pointerId); var x=c.getContext('2d'); x.beginPath(); x.arc(last.x,last.y,1.1,0,7); x.fillStyle='#14223a'; x.fill(); pad.drawn=true; e.preventDefault(); });
  c.addEventListener('pointermove',function(e){ if(!drawing) return; var p=pt(e), x=c.getContext('2d'); x.beginPath(); x.moveTo(last.x,last.y); x.lineTo(p.x,p.y); x.stroke(); last=p; pad.drawn=true; e.preventDefault(); });
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){ c.addEventListener(ev,function(){ drawing=false; }); });
})();
$('#padClear').addEventListener('click',function(){ openPad(pad.k); });
$('#padCancel').addEventListener('click',function(){ $('#padOv').hidden=true; });
$('#padOk').addEventListener('click',function(){
  var k=pad.k, f=cur; if(!pad.drawn){ toast('Assine no quadro branco.'); return; }
  $('#padCanvas').toBlob(async function(b){ var id='sig'+uid(); await DB.putB(id,b); var old=f.ass[k].sig; f.ass[k].sig=id; if(old) DB.delB(old).catch(function(){}); if(!f.ass[k].data) f.ass[k].data=todayISO();
    $('#padOv').hidden=true; var dIn=$('.sig[data-s="'+k+'"] input[data-a="data"]'); if(dIn) dIn.value=f.ass[k].data; loadSigs(); refreshFichaMeta(); touch(); },'image/png');
});
async function loadSigs(){ var f=cur; for(var k of ['prod','qual','eng']){ var el=$('[data-sign="'+k+'"]'); if(!el) continue; var id=f.ass[k].sig; if(id){ var u=await blobURL(id); if(u){ el.style.backgroundImage='url("'+u+'")'; el.textContent=''; } } else { el.style.backgroundImage='none'; el.textContent='Toque para assinar'; } } }

// ---------- delete ----------
async function deleteFicha(f){
  if(!confirm('Excluir a FVS Nº'+String(f.n).padStart(3,'0')+' ('+f.titulo+' – '+f.local+')? Isso não pode ser desfeito.')) return;
  var keys=[]; f.fotos.forEach(function(p){ keys.push(p.id); }); f.itens.forEach(function(it){ it.fotos.forEach(function(p){ keys.push(p.id); }); }); ['prod','qual','eng'].forEach(function(k){ if(f.ass[k].sig) keys.push(f.ass[k].sig); });
  clearTimeout(saveTimers[f.id]); delete saveTimers[f.id];
  await DB.del(f.id); keys.forEach(function(k){ DB.delB(k).catch(function(){}); });
  fichas=fichas.filter(function(x){ return x!==f; }); cur=null; goHome(); toast('FVS excluída.');
}

// ---------- pendências ----------
function renderPend(){
  var rows=[]; fichas.forEach(function(f){ f.itens.forEach(function(it,i){ if(itemState(it)==='R') rows.push({f:f, it:it, i:i}); }); });
  rows.sort(function(a,b){ return (a.it.v1.d||'').localeCompare(b.it.v1.d||''); });
  $('#plist').innerHTML=rows.length? rows.map(function(r){ var d=daysSince(r.it.v1.d);
    return '<button type="button" class="frow pend" data-id="'+r.f.id+'" data-i="'+r.i+'"><span class="n">Nº'+String(r.f.n).padStart(3,'0')+'</span><span class="grow"><span class="tt">'+h(r.it.item||r.it.oque)+'</span>'+
      '<span class="loc">'+h(fCode(r.f))+' · '+h(r.f.titulo)+' — '+h(r.f.local)+'</span>'+(r.it.obs?'<span class="meta">“'+h(r.it.obs)+'”</span>':'<span class="meta" style="color:var(--warn)">Sem descrição do reparo</span>')+
      '<span class="meta">'+(r.it.v2&&r.it.v2.c==='R'?'reprovado 2× · ':'')+'aberto em '+br(r.it.v1.d)+(d>0?' · há '+d+' dia'+(d>1?'s':''):' · hoje')+'</span></span></button>'; }).join('')
    : '<div class="empty"><b>Nenhum reparo pendente</b>Os itens marcados R aparecem aqui até passarem na 2ª verificação.</div>';
}
$('#plist').addEventListener('click',function(e){ var b=e.target.closest('.frow'); if(b) openFicha(b.dataset.id, +b.dataset.i); });

// ---------- config ----------
function renderCfg(){
  $('#c-obra').value=cfg.obra||''; $('#c-unid').value=cfg.unidade||''; $('#c-insp').value=cfg.insp||''; $('#c-sigla').value=cfg.sigla||'';
  $('#c-prod').value=cfg.prod||''; $('#c-qual').value=cfg.qual||''; $('#c-eng').value=cfg.eng||''; $('#c-locais').value=(cfg.locais||[]).join('\n');
  $('#verInfo').textContent='Versão '+APP_VER+' · '+MODELOS.length+' modelos de FVS · '+fichas.length+' fichas salvas neste celular';
}
$('#saveCfg').addEventListener('click',function(){
  cfg.obra=$('#c-obra').value.trim(); cfg.unidade=$('#c-unid').value.trim(); cfg.insp=$('#c-insp').value.trim(); cfg.sigla=$('#c-sigla').value.trim().toUpperCase();
  cfg.prod=$('#c-prod').value.trim(); cfg.qual=$('#c-qual').value.trim(); cfg.eng=$('#c-eng').value.trim();
  cfg.locais=$('#c-locais').value.split('\n').map(function(s){return s.trim();}).filter(Boolean).slice(0,40);
  saveCfg(); toast('Dados da obra salvos.');
});

// ---------- files ----------
var ready={file:null,url:null};
async function deliver(name, blob, mime, okMsg){
  var file=null; try{ file=new File([blob],name,{type:mime}); }catch(e){}
  if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:name}); toast(okMsg); return; }
    catch(e){ if(e&&e.name==='AbortError'){ toast('Envio cancelado. O arquivo pode ser gerado de novo quando quiser.'); return; } }
    // share blocked (lost tap): show panel so the next tap shares it
    showReady(name, blob, file); return;
  }
  showReady(name, blob, file);
}
function showReady(name, blob, file){ if(ready.url) URL.revokeObjectURL(ready.url); ready.file=file; ready.url=URL.createObjectURL(blob);
  $('#readyName').textContent=name; var a=$('#readyOpen'); a.href=ready.url; a.setAttribute('download',name);
  $('#readyShare').hidden=!(file&&navigator.canShare&&navigator.canShare({files:[file]})); $('#readyOv').hidden=false; }
$('#readyShare').addEventListener('click',function(){ if(ready.file) navigator.share({files:[ready.file],title:ready.file.name}).then(function(){ $('#readyOv').hidden=true; }).catch(function(){}); });
$('#readyClose').addEventListener('click',function(){ $('#readyOv').hidden=true; });

function fileBase(f){ return (fCode(f)+' - '+f.titulo+' - '+f.local+' - N'+String(f.n).padStart(3,'0')).replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').slice(0,120); }
async function genPDF(){
  var f=cur; if(!f) return; flushAll(); var btn=$('#barBtn');
  if(!window.jspdf||!window.FVSPDF){ toast('O gerador de PDF não carregou. Abra o app uma vez com internet.'); return; }
  var s=stats(f); if(s.feitos<s.t && !confirm('Ainda faltam '+(s.t-s.feitos)+' itens sem marcação. Gerar o PDF assim mesmo?')) return;
  btn.disabled=true; btn.textContent='Montando o PDF…';
  try{ var blob=await window.FVSPDF.build(f, cfg, function(k){ return DB.getB(k); });
    await deliver(fileBase(f)+'.pdf', blob, 'application/pdf', 'PDF da FVS Nº'+String(f.n).padStart(3,'0')+' pronto.'); }
  catch(e){ console.error(e); toast('Erro ao montar o PDF. Tente de novo.'); }
  btn.disabled=false; btn.textContent='Gerar PDF';
}
$('#barBtn').addEventListener('click',function(){ if(view==='ficha') genPDF(); else { pushNav(); showView('novo'); } });

function loadScript(src){ return new Promise(function(res,rej){ var s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
$('#xlsBtn').addEventListener('click',async function(){
  if(!fichas.length){ toast('Ainda não há FVS para exportar.'); return; }
  var b=this; b.disabled=true; b.textContent='Montando a planilha…';
  try{ if(!window.XLSX) await loadScript('xlsx.mini.min.js');
    var blob=window.FVSPDF.controle(window.XLSX, fichas.slice().sort(function(a,c){ return a.n-c.n; }), cfg, stats, itemState);
    await deliver('Controle FVS - '+(cfg.obra||'obra').replace(/[\\/:*?"<>|]+/g,'-')+' - '+br(todayISO()).replace(/\//g,'-')+'.xlsx', blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Planilha de controle pronta.'); }
  catch(e){ console.error(e); toast('Erro ao montar a planilha.'); }
  b.disabled=false; b.textContent='Exportar controle em Excel';
});

// ---------- backup ----------
function blobToDataURL(b){ return new Promise(function(res){ var r=new FileReader(); r.onload=function(){ res(r.result); }; r.readAsDataURL(b); }); }
function dataURLToBlob(u){ var p=u.split(','), m=p[0].match(/:(.*?);/)[1], bin=atob(p[1]), a=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return new Blob([a],{type:m}); }
$('#expBk').addEventListener('click',async function(){
  var b=this; b.disabled=true; b.textContent='Preparando…';
  try{ flushAll(); var keys=await DB.keysB(); var blobs={}; for(var i=0;i<keys.length;i++){ var bl=await DB.getB(keys[i]); if(bl) blobs[keys[i]]=await blobToDataURL(bl); }
    var data={app:'fvs', versao:1, exportadoEm:new Date().toISOString(), cfg:cfg, fichas:fichas, blobs:blobs};
    var blob=new Blob([JSON.stringify(data)],{type:'application/json'});
    await deliver('backup-fvs-'+todayISO()+'.json', blob, 'application/json', 'Backup exportado ('+fichas.length+' fichas).'); }
  catch(e){ console.error(e); toast('Erro ao montar o backup.'); }
  b.disabled=false; b.textContent='Exportar backup';
});
$('#impBk').addEventListener('change',function(e){ var file=e.target.files[0]; e.target.value=''; if(!file) return;
  var rd=new FileReader(); rd.onload=async function(){
    try{ var d=JSON.parse(rd.result); if(!d||d.app!=='fvs') throw 0;
      if(!confirm('Restaurar '+(d.fichas||[]).length+' fichas desse backup? Fichas iguais serão substituídas pela versão do backup.')) return;
      var ks=Object.keys(d.blobs||{}); for(var i=0;i<ks.length;i++) await DB.putB(ks[i], dataURLToBlob(d.blobs[ks[i]]));
      for(var j=0;j<(d.fichas||[]).length;j++) await DB.put(d.fichas[j]);
      if(d.cfg){ var seq=Math.max(cfg.seq||0, d.cfg.seq||0); cfg=Object.assign({},DEFAULT_CFG,d.cfg); cfg.seq=seq; saveCfg(); }
      toast('Backup restaurado.'); setTimeout(function(){ location.reload(); },900);
    }catch(err){ toast('Esse arquivo não é um backup do app de FVS.'); } };
  rd.readAsText(file);
});

// ---------- navigation ----------
function pushNav(){ try{ history.pushState({fvs:1},''); }catch(e){} }
function replaceNav(){ try{ history.replaceState({fvs:1},''); }catch(e){} }
function goHome(){ flushAll(); cur=null; showView('painel'); }
window.addEventListener('popstate',function(){ if(view==='ficha'||view==='novo'){ flushAll(); cur=null; showView('painel'); } });
$('#backBtn').addEventListener('click',function(){ if(view==='novo' && !$('#novo2').hidden && !$('#nLocais').value.trim()){ renderNovo({}); return; } if(history.state&&history.state.fvs){ history.back(); } else goHome(); });
$$('.tabs button').forEach(function(b){ b.addEventListener('click',function(){ showView(b.dataset.view); }); });
document.addEventListener('visibilitychange',function(){ if(document.hidden) flushAll(); else checkUpdate(); });

// ---------- atualização automática ----------
// Toda vez que o app abre ou volta para a tela, confere se há versão nova publicada.
// Se houver, salva tudo e recarrega sozinho, voltando para a mesma ficha.
var swReg=null, updating=false;
async function checkUpdate(){
  if(updating || (location.protocol!=='https:' && location.hostname!=='localhost') || !navigator.onLine) return;
  try{
    if(swReg) swReg.update().catch(function(){});
    var r=await fetch('version.json?t='+Date.now(),{cache:'no-store'}); if(!r.ok) return;
    var v=(await r.json()).v; if(!v || v===APP_VER) return;
    try{ if(sessionStorage.getItem('fvs:tried')===v) return; sessionStorage.setItem('fvs:tried', v); }catch(e){}   // evita recarregar em loop
    updating=true; flushAll();
    try{ sessionStorage.setItem('fvs:reopen', JSON.stringify({id:cur&&cur.id, view:view})); sessionStorage.setItem('fvs:updated', v); }catch(e){}
    setSync('atualizando o app…');
    setTimeout(function(){ location.reload(); },600);
  }catch(e){}
}
window.addEventListener('pagehide',flushAll);

// ---------- boot ----------
if('serviceWorker' in navigator && location.protocol==='https:'){ window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(function(r){ swReg=r; }).catch(function(){}); }); }
try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist(); }catch(e){}
(async function boot(){
  var c=LS.get('cfg'); if(c) cfg=Object.assign({},DEFAULT_CFG,c);
  try{ fichas=(await DB.all())||[]; }catch(e){ console.error(e); toast('Não consegui abrir os dados deste celular.'); }
  var maxN=fichas.reduce(function(a,f){ return Math.max(a,f.n||0); },0); if(maxN>(cfg.seq||0)){ cfg.seq=maxN; saveCfg(); }
  setSync('salvo no celular');
  showView('painel');
  try{ var ro=JSON.parse(sessionStorage.getItem('fvs:reopen')||'null'); sessionStorage.removeItem('fvs:reopen');
    var upd=sessionStorage.getItem('fvs:updated'); sessionStorage.removeItem('fvs:updated');
    if(ro){ if(ro.view==='ficha' && ro.id && fichas.some(function(f){ return f.id===ro.id; })) openFicha(ro.id); else if(ro.view==='pend'||ro.view==='obra') showView(ro.view); }
    if(upd) setTimeout(function(){ toast('App atualizado para a versão nova.'); },400);
  }catch(e){}
  setTimeout(checkUpdate,1500);
  if(!c){ setTimeout(function(){ toast('Primeiro acesso: preencha a aba Obra com os nomes dos responsáveis.'); },600); }
})();
window.__fvs={get fichas(){return fichas;}, get cur(){return cur;}, cfg:function(){return cfg;}};
})();
