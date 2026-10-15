// Levantamento de obra: checklist de campo com fotos, observações e medidas.
// Gera o relatório fotográfico (PDF), a planilha de orçamento/levantamento (Excel) e as fotos numeradas (ZIP).
(function(){
'use strict';
var APP_VER = 4;   // troque junto com version.json a cada publicação
var $ = function(s, r){ return (r||document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
function h(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function pad2(n){ return String(n).padStart(2,'0'); }
function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function nowHM(){ var d=new Date(); return pad2(d.getHours())+':'+pad2(d.getMinutes()); }
function br(iso){ if(!iso) return ''; var p=String(iso).slice(0,10).split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function brDT(iso){ if(!iso) return ''; var d=new Date(iso); if(isNaN(d)) return br(iso); return pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+'/'+d.getFullYear()+' '+pad2(d.getHours())+':'+pad2(d.getMinutes()); }
function uid(p){ return (p||'')+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function norm(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
function num(v){ if(v==null||v==='') return NaN; var s=String(v).trim().replace(/\s/g,''); if(/,/.test(s)) s=s.replace(/\./g,'').replace(',','.'); return parseFloat(s); }
function fmt(n, d){ if(n==null||isNaN(n)) return ''; d=(d==null?2:d); return Number(n).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function fmtQ(n){ if(n==null||isNaN(n)) return '—'; return Math.abs(n-Math.round(n))<1e-9? fmt(n,0) : fmt(n,2); }
var toastTimer; function toast(t){ var el=$('#toast'); el.textContent=t; el.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(function(){ el.hidden=true; },3600); }
function setSync(t){ $('#sync').textContent=t; }

// ---------- armazenamento ----------
var LS={get:function(k){ try{ var v=localStorage.getItem('lev:'+k); return v?JSON.parse(v):null; }catch(e){ return null; } },
        set:function(k,v){ try{ localStorage.setItem('lev:'+k, JSON.stringify(v)); }catch(e){} }};
var DB=(function(){
  var dbp=null;
  function open(){ if(!dbp) dbp=new Promise(function(res,rej){ var q=indexedDB.open('lev-app',1);
      q.onupgradeneeded=function(){ var d=q.result; if(!d.objectStoreNames.contains('levs')) d.createObjectStore('levs',{keyPath:'id'}); if(!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); };
      q.onsuccess=function(){ res(q.result); }; q.onerror=function(){ rej(q.error); }; }); return dbp; }
  function tx(store,mode,fn){ return open().then(function(d){ return new Promise(function(res,rej){ var t=d.transaction(store,mode); var r=fn(t.objectStore(store)); t.oncomplete=function(){ res(r&&r.result); }; t.onerror=function(){ rej(t.error); }; t.onabort=function(){ rej(t.error); }; }); }); }
  return {
    all:function(){ return tx('levs','readonly',function(s){ return s.getAll(); }); },
    put:function(f){ return tx('levs','readwrite',function(s){ return s.put(f); }); },
    del:function(id){ return tx('levs','readwrite',function(s){ return s.delete(id); }); },
    getB:function(k){ return tx('blobs','readonly',function(s){ return s.get(k); }); },
    putB:function(k,v){ return tx('blobs','readwrite',function(s){ return s.put(v,k); }); },
    delB:function(k){ return tx('blobs','readwrite',function(s){ return s.delete(k); }); },
    keysB:function(){ return tx('blobs','readonly',function(s){ return s.getAllKeys(); }); }
  };
})();

var DISC=window.LEV_DISC||[], PRIO=window.LEV_PRIO||[], TIPO=window.LEV_TIPO||[], UND=window.LEV_UND||[], CHECK=window.LEV_CHECK||[];
function discById(id){ return DISC.find(function(d){ return d.id===id; }); }
function discNome(id){ var d=discById(id); return d? d.n : 'Outros'; }
function prioNome(id){ var p=PRIO.find(function(x){ return x.id===id; }); return p? p.n : ''; }
function tipoNome(id){ var p=TIPO.find(function(x){ return x.id===id; }); return p? p.n : ''; }

var DEFAULT_CFG={empresa:'', resp:'', crea:'', tel:'', email:'', seq:0, fotoPdf:'normal'};
var cfg=Object.assign({},DEFAULT_CFG);
var levs=[], cur=null, tab='vis', curItem=null, view='lista';
function saveCfg(){ LS.set('cfg',cfg); }

// ---------- modelo de dados ----------
function novoLev(){
  cfg.seq=(cfg.seq||0)+1; saveCfg();
  return { id:uid('lv'), n:cfg.seq, titulo:'', cliente:'', contato:'', endereco:'', gps:null, tipoServ:'Reforma', imovel:'', idade:'', pavs:'', area:'', ocupado:'',
    data:todayISO(), hIni:nowHM(), hFim:'', clima:'', chuva48:'', resp:cfg.resp||'', crea:cfg.crea||'', acomp:'', objetivo:'',
    fotos:[], capa:null, ambs:[], itens:[], seqItem:0, ck:{}, ckExtra:[],
    concl:{diag:'', seq:'', ensaios:'', pend:'', prazo:'', equipe:'', obs:''}, ass:{resp:{sig:null,nome:''}, cli:{sig:null,nome:''}},
    status:'campo', criado:Date.now(), atualizado:Date.now() };
}
function novoAmb(nome){ return { id:uid('am'), nome:nome||'', pav:'', c:'', l:'', pd:'', vaos:'', obs:'', fotos:[] }; }
function novoItem(lev, ambId, disc){ lev.seqItem=(lev.seqItem||0)+1;
  return { id:uid('it'), n:lev.seqItem, amb:ambId||'', disc:disc||'', serv:'', desc:'', causa:'', como:'', tipo:'pat', prio:'M', und:'m²', med:[], qtdMan:'', mat:'', obs:'', fotos:[], criado:Date.now() }; }
function ambById(lev, id){ return (lev.ambs||[]).find(function(a){ return a.id===id; }); }
function ambNome(lev, id){ var a=ambById(lev,id); return a? (a.nome||'Ambiente sem nome') : 'Geral'; }
function ambCalc(a){ var c=num(a.c), l=num(a.l), pd=num(a.pd), v=num(a.vaos)||0;
  var r={piso:NaN, perim:NaN, paredes:NaN, teto:NaN, vol:NaN};
  if(!isNaN(c)&&!isNaN(l)){ r.piso=c*l; r.teto=r.piso; r.perim=2*(c+l); if(!isNaN(pd)){ r.paredes=Math.max(0,r.perim*pd-v); r.vol=r.piso*pd; } }
  return r; }
function medParcial(m){ var dims=[num(m.c),num(m.l),num(m.h)].filter(function(x){ return !isNaN(x); }); if(!dims.length) return 0;
  var p=dims.reduce(function(a,b){ return a*b; },1); var n=num(m.n); if(!isNaN(n)) p*=n; return m.neg? -p : p; }
function qtdItem(it){ if(it.qtdMan!==''&&it.qtdMan!=null&&!isNaN(num(it.qtdMan))) return num(it.qtdMan);
  if(!it.med||!it.med.length) return NaN; var s=0, ok=false; it.med.forEach(function(m){ var p=medParcial(m); if(p) ok=true; s+=p; }); return ok? s : NaN; }
// itens na ordem do relatório: por ambiente (na ordem da aba Ambientes) e, dentro dele, pelo número
function itensOrdenados(lev){ var ord={}; (lev.ambs||[]).forEach(function(a,i){ ord[a.id]=i; });
  return (lev.itens||[]).slice().sort(function(a,b){ var oa=(a.amb in ord)? ord[a.amb] : 1e6, ob=(b.amb in ord)? ord[b.amb] : 1e6; return oa-ob || a.n-b.n; }); }
// numeração única das fotos (igual no PDF, na planilha e no ZIP)
function fotosNumeradas(lev){ var out=[], map={};
  function add(p, onde, item, amb){ out.push({id:p.id, num:out.length+1, leg:p.leg||'', d:p.d, gps:p.gps||null, onde:onde, item:item, amb:amb}); map[p.id]=out.length; }
  (lev.fotos||[]).forEach(function(p){ add(p,'Geral / fachada',null,null); });
  var its=itensOrdenados(lev);
  (lev.ambs||[]).forEach(function(a){ (a.fotos||[]).forEach(function(p){ add(p, a.nome||'Ambiente', null, a); });
    its.filter(function(it){ return it.amb===a.id; }).forEach(function(it){ (it.fotos||[]).forEach(function(p){ add(p, a.nome||'Ambiente', it, a); }); }); });
  its.filter(function(it){ return !ambById(lev,it.amb); }).forEach(function(it){ (it.fotos||[]).forEach(function(p){ add(p,'Geral',it,null); }); });
  return {list:out, map:map}; }
function contaFotos(lev){ var n=(lev.fotos||[]).length; (lev.ambs||[]).forEach(function(a){ n+=(a.fotos||[]).length; }); (lev.itens||[]).forEach(function(i){ n+=(i.fotos||[]).length; }); return n; }
function ckTodos(lev){ var all=[]; CHECK.forEach(function(g){ g.i.forEach(function(q){ all.push({k:q[0], q:q[1], g:g.g}); }); }); (lev.ckExtra||[]).forEach(function(x){ all.push({k:x.k, q:x.q, g:'Outros pontos verificados'}); }); return all; }
function ckRespondidos(lev){ var n=0; ckTodos(lev).forEach(function(q){ if(lev.ck[q.k]&&lev.ck[q.k].v) n++; }); return n; }

// ---------- salvar ----------
var saveTimer=null;
function touch(){ if(!cur) return; cur.atualizado=Date.now(); setSync('salvando…'); clearTimeout(saveTimer); saveTimer=setTimeout(function(){ persist(cur); },600); }
function persist(l){ return DB.put(l).then(function(){ setSync('salvo no celular'); }).catch(function(e){ console.error(e); setSync('erro ao salvar'); toast('Não consegui salvar. Libere espaço no celular.'); }); }
function flush(){ if(saveTimer&&cur){ clearTimeout(saveTimer); saveTimer=null; return persist(cur); } return Promise.resolve(); }
$$('[data-save]').forEach(function(b){ b.addEventListener('click',async function(){
  b.disabled=true; try{ saveCfgForm(); if(cur){ cur.atualizado=Date.now(); await persist(cur); } b.textContent='Salvo ✓'; b.classList.add('ok'); toast(cur? 'Levantamento salvo neste celular.' : 'Tudo salvo.');
    setTimeout(function(){ b.textContent='Salvar'; b.classList.remove('ok'); },1600); }catch(e){ toast('Não consegui salvar. Tente de novo.'); } finally{ b.disabled=false; } }); });

// ---------- navegação ----------
function pushNav(){ try{ history.pushState({lev:1},''); }catch(e){} }
function showView(v){
  view=v; ['lista','cfg','lev','item'].forEach(function(k){ $('#view-'+k).hidden=(k!==v); });
  var dentro=(v==='lev'||v==='item');
  $('#brandMain').hidden=dentro; $('#brandSub').hidden=!dentro; $('#tabsMain').hidden=dentro; $('#tabsLev').hidden=(v!=='lev'); $('#subGap').hidden=(v!=='item');
  $$('#tabsMain button').forEach(function(b){ b.setAttribute('aria-selected', String(b.dataset.main===v)); });
  if(v==='lista') renderLista();
  if(v==='cfg') renderCfg();
  if(v==='lev') renderLev();
  if(v==='item') renderItem();
  renderBar(); window.scrollTo(0,0);
}
function setSub(){ if(!cur) return;
  if(view==='item'&&curItem){ $('#subTitle').textContent='Item #'+pad2(curItem.n)+(curItem.serv? ' · '+curItem.serv : ''); $('#subMeta').textContent=ambNome(cur,curItem.amb)+' · '+(cur.titulo||'Levantamento'); $('#subNum').hidden=true; return; }
  $('#subTitle').textContent=cur.titulo||'Novo levantamento'; $('#subMeta').textContent=[br(cur.data), cur.cliente].filter(Boolean).join(' · ');
  $('#subNum').hidden=false; $('#subNum').textContent='Nº '+String(cur.n).padStart(3,'0');
  $('#cntIt').textContent=(cur.itens||[]).length; $('#cntCk').textContent=ckRespondidos(cur)+'/'+ckTodos(cur).length; }
$$('#tabsMain button').forEach(function(b){ b.addEventListener('click',function(){ showView(b.dataset.main); }); });
$$('#tabsLev button').forEach(function(b){ b.addEventListener('click',function(){ tab=b.dataset.tab; renderLev(); renderBar(); window.scrollTo(0,0); }); });
$('#backBtn').addEventListener('click',function(){ if(history.state&&history.state.lev) history.back(); else voltar(); });
window.addEventListener('popstate',function(){ voltar(); });
function voltar(){ flush(); if(view==='item'){ var y=cur&&cur._scrollVis; curItem=null; tab='vis'; showView('lev'); if(y) window.scrollTo(0,y); } else if(view==='lev'){ cur=null; showView('lista'); } }
function abrirLev(id, t){ var l=levs.find(function(x){ return x.id===id; }); if(!l) return; cur=l; tab=t||'vis'; pushNav(); showView('lev'); }
function abrirItem(it){ if(view==='lev'&&tab==='vis'&&cur) cur._scrollVis=window.scrollY; curItem=it; pushNav(); showView('item'); }

// ---------- barra inferior ----------
function renderBar(){ var b=$('#barIn'), html='';
  if(view==='lista'||view==='cfg') html='<button type="button" class="btn pri" data-act="novoLev">+ Novo levantamento</button>';
  else if(view==='lev'){
    html='<button type="button" class="btn dark" data-act="novoAmb">+ Ambiente</button><button type="button" class="btn pri" data-cam="quick">📷 Foto</button>';
  } else if(view==='item') html='<button type="button" class="btn cam" data-cam="i" aria-label="Adicionar foto">📷</button><button type="button" class="btn dark" data-act="outroItem">+ Próximo</button><button type="button" class="btn pri" data-act="pronto">Pronto ✓</button>';
  b.innerHTML=html; $('#bar').hidden=(view==='lev'&&tab==='rel'); }
document.addEventListener('click',function(e){ var a=e.target.closest('[data-act]'); if(!a) return; var act=a.dataset.act;
  if(act==='novoLev'){ abrirNovo(); }
  else if(act==='novoAmb'){ var n=prompt('Nome do ambiente (ex.: Sala, Banheiro social, Fachada)'); if(n&&n.trim()) addAmb(n.trim()); }
  else if(act==='novoItem'){ var amb=a.dataset.amb!=null? a.dataset.amb : (cur.lastAmb||''); cur.lastAmb=amb; criarItem(amb); }
  else if(act==='outroItem'){ var ant=curItem; flush(); var it=novoItem(cur, ant? ant.amb : '', ant? ant.disc : ''); cur.itens.push(it); touch(); curItem=it; renderItem(); renderBar(); window.scrollTo(0,0); toast('Item #'+pad2(it.n)+' em '+ambNome(cur,it.amb)+'.'); }
  else if(act==='pronto'){ if(history.state&&history.state.lev) history.back(); else voltar(); }
  else if(act==='pdf'){ gerarPDF(a); }
});
function criarItem(ambId, fotos){ var it=novoItem(cur, ambId, ''); cur.itens.push(it); touch(); curItem=it; pushNav(); showView('item'); return it; }

// ---------- LISTA ----------
function renderLista(){ var el=$('#view-lista');
  var ls=levs.slice().sort(function(a,b){ return (b.atualizado||0)-(a.atualizado||0); });
  var html='<h2 class="sheet-h">Levantamentos</h2>';
  if(!ls.length) html+='<div class="empty"><b>Nenhum levantamento ainda</b>Toque em “+ Novo levantamento” ao chegar na obra. Tudo fica salvo neste celular, mesmo sem internet.</div>';
  else html+='<div class="list">'+ls.map(function(l){ var nf=contaFotos(l);
    return '<button type="button" class="lrow" data-open="'+l.id+'"><span class="mini" data-capa="'+h(capaId(l)||'')+'"></span><span class="grow"><span class="tt">'+h(l.titulo||'Sem nome')+'</span>'+
      '<span class="meta">Nº '+String(l.n).padStart(3,'0')+' · '+br(l.data)+(l.cliente?' · '+h(l.cliente):'')+'</span>'+
      '<span class="meta">'+(l.ambs||[]).length+' ambientes · '+(l.itens||[]).length+' itens · '+nf+' fotos'+(l.status==='ok'?' · <span class="badge p-B">Concluído</span>':'')+'</span></span></button>'; }).join('')+'</div>';
  html+='<p class="note">Dica: abra o app uma vez com internet antes de ir para a obra. Depois ele funciona sem sinal.</p>';
  el.innerHTML=html; loadCapas(el); }
function capaId(l){ if(l.capa&&existeFoto(l,l.capa)) return l.capa; var f=fotosNumeradas(l).list[0]; return f? f.id : null; }
function existeFoto(l,id){ return fotosNumeradas(l).map[id]!=null; }
async function loadCapas(root){ var els=$$('[data-capa]',root); for(var i=0;i<els.length;i++){ var k=els[i].dataset.capa; if(!k) continue; var u=await blobURL(k); if(u) els[i].style.backgroundImage='url("'+u+'")'; } }
$('#view-lista').addEventListener('click',function(e){ var b=e.target.closest('[data-open]'); if(b) abrirLev(b.dataset.open, 'vis'); });

// ---------- LEVANTAMENTO (abas: Vistoria · Checklist · Relatório) ----------
var TIPOS_SERV=['Reforma','Manutenção','Vistoria técnica','Orçamento','Obra nova','Laudo / patologia'];
var CLIMAS=['Ensolarado','Nublado','Chuvoso','Garoa'];
var IMOVEIS=['Casa térrea','Sobrado','Apartamento','Comercial','Galpão','Terreno'];
var AMB_SUG=['Fachada','Sala','Cozinha','Banheiro','Quarto 1','Quarto 2','Área de serviço','Varanda','Garagem','Corredor','Escada','Laje / terraço','Telhado','Área externa','Muro'];
function renderLev(){ if(!cur) return; if(['vis','ck','rel'].indexOf(tab)<0) tab='vis'; setSub(); $$('#tabsLev button').forEach(function(b){ b.setAttribute('aria-selected', String(b.dataset.tab===tab)); });
  var el=$('#view-lev');
  if(tab==='vis') el.innerHTML=htmlVis(); else if(tab==='ck') el.innerHTML=htmlCk(); else el.innerHTML=htmlRel();
  loadThumbs(el); loadCapas(el); if(tab==='rel') loadSigs(); }
function inp(k, val, ph, extra){ return '<input type="text" data-k="'+k+'" value="'+h(val)+'"'+(ph?' placeholder="'+h(ph)+'"':'')+(extra||'')+'>'; }
function fld(lbl, inner){ return '<label class="field"><span class="lbl">'+lbl+'</span>'+inner+'</label>'; }
function ta(k, val, ph, rows){ return '<textarea data-k="'+k+'" rows="'+(rows||3)+'"'+(ph?' placeholder="'+h(ph)+'"':'')+'>'+h(val)+'</textarea>'; }
function chipsK(k, list, val){ return '<div class="chips">'+list.map(function(o){ return '<button type="button" class="chip" data-chip="'+k+'" data-v="'+h(o)+'" aria-pressed="'+(val===o)+'">'+h(o)+'</button>'; }).join('')+'</div>'; }
function thumbsHTML(list, owner, nmap, semBotao){ return '<div class="thumbs" data-thumbs="'+owner+'">'+(list||[]).map(function(p){ var n=nmap&&nmap[p.id];
    return '<button type="button" class="th" data-ph="'+p.id+'" data-owner="'+owner+'" aria-label="Foto '+(n||'')+'">'+(n?'<span class="num">F'+pad2(n)+'</span>':'')+(p.leg?'<span class="lg" title="Com legenda"></span>':'')+'</button>'; }).join('')+
  (semBotao?'':'<button type="button" class="addph cam" data-cam="'+owner+'"><span class="ico">📷</span>Foto</button>')+'</div>'; }
function itemRow(it){ var q=qtdItem(it), f0=(it.fotos||[])[0];
  return '<button type="button" class="irow p-'+it.prio+'" data-item="'+it.id+'"><span class="mini"'+(f0?' data-capa="'+f0.id+'"':'')+'>'+(f0?'':'📷')+'</span><span class="grow"><span class="tt">'+h(it.serv||it.desc||'Item sem descrição')+'</span>'+
    '<span class="meta"><span class="badge p-'+it.prio+'">'+prioNome(it.prio)+'</span> '+(isNaN(q)?'<span class="falta">sem quantidade</span>':fmtQ(q)+' '+h(it.und))+' · '+(it.fotos||[]).length+' foto'+((it.fotos||[]).length===1?'':'s')+'</span></span><span class="chev">›</span></button>'; }
function htmlVis(){ var l=cur, its=itensOrdenados(l), nmap=fotosNumeradas(l).map, nU=its.filter(function(i){ return i.prio==='U'; }).length;
  var html='<p class="resumo"><b>'+l.ambs.length+'</b> ambientes · <b>'+its.length+'</b> itens'+(nU?' · <b class="u">'+nU+' urgente'+(nU>1?'s':'')+'</b>':'')+' · <b>'+contaFotos(l)+'</b> fotos</p>';
  if(!l.ambs.length) html+='<div class="empty"><b>Por onde começar</b>Toque no cômodo onde você está. Depois, em cada cômodo, use 📷 para fotografar um problema ou + para escrever o que precisa ser feito.</div>';
  html+='<div class="chips scroll addambs">'+AMB_SUG.filter(function(s){ return !l.ambs.some(function(a){ return a.nome===s; }); }).map(function(s){ return '<button type="button" class="chip" data-addamb="'+h(s)+'">+ '+h(s)+'</button>'; }).join('')+'<button type="button" class="chip" data-act="novoAmb">+ Outro…</button></div>';
  l.ambs.forEach(function(a){ var c=ambCalc(a), li=its.filter(function(it){ return it.amb===a.id; });
    html+='<section class="amb" data-ambsec="'+a.id+'"><div class="amb-h"><button type="button" class="amb-t" data-editamb="'+a.id+'"><b>'+h(a.nome||'Ambiente')+'</b><span>'+(isNaN(c.piso)?'<span class="falta">✎ pôr medidas</span>':fmt(c.piso)+' m²'+(isNaN(c.paredes)?'':' · paredes '+fmt(c.paredes)+' m²')+' ✎')+'</span></button>'+
      '<button type="button" class="ab" data-cam="quick:'+a.id+'" aria-label="Foto de um problema em '+h(a.nome)+'">📷</button><button type="button" class="ab pri" data-act="novoItem" data-amb="'+a.id+'" aria-label="Novo item em '+h(a.nome)+'">+</button></div>'+
      ((a.fotos||[]).length? thumbsHTML(a.fotos,'a:'+a.id,nmap,true) : '')+
      (li.length? '<div class="list">'+li.map(itemRow).join('')+'</div>' : '<p class="note">Nenhum item. 📷 fotografa um problema, + escreve um serviço.</p>')+'</section>'; });
  var soltos=its.filter(function(it){ return !ambById(l,it.amb); });
  html+='<section class="amb"><div class="amb-h"><div class="amb-t"><b>Geral / fachada</b><span>Fotos gerais e itens sem cômodo</span></div><button type="button" class="ab pri" data-act="novoItem" data-amb="" aria-label="Novo item geral">+</button></div>'+
    thumbsHTML(l.fotos,'lev',nmap)+(soltos.length? '<div class="list">'+soltos.map(itemRow).join('')+'</div>' : '')+'</section>';
  return html; }
function calcHTML(c){ if(isNaN(c.piso)) return '<span>Informe comprimento e largura para calcular as áreas.</span>';
  return '<span>Piso <b>'+fmt(c.piso)+' m²</b></span><span>Perímetro <b>'+fmt(c.perim)+' m</b></span>'+(isNaN(c.paredes)?'<span>Paredes: falta o pé-direito</span>':'<span>Paredes <b>'+fmt(c.paredes)+' m²</b></span><span>Volume <b>'+fmt(c.vol)+' m³</b></span>'); }
// folha do ambiente (nome, medidas, observações, fotos do cômodo)
var ambAberto=null;
function abrirAmb(id){ ambAberto=id; renderAmbBox(); $('#ambOv').hidden=false; }
function renderAmbBox(){ var a=ambById(cur,ambAberto); if(!a){ $('#ambOv').hidden=true; return; } var nmap=fotosNumeradas(cur).map, i=cur.ambs.indexOf(a);
  $('#ambBox').innerHTML='<div class="row"><h2 class="grow">'+h(a.nome||'Ambiente')+'</h2><button type="button" class="btn pri sm" data-ambok>Pronto</button></div><div data-amb="'+a.id+'" style="display:flex;flex-direction:column;gap:12px">'+
    '<div class="grid2">'+fld('Nome', '<input type="text" data-a="nome" value="'+h(a.nome)+'">')+fld('Pavimento', '<input type="text" data-a="pav" value="'+h(a.pav)+'" placeholder="Térreo, 1º…">')+'</div>'+
    '<div class="grid4">'+fld('Compr. (m)', '<input type="text" inputmode="decimal" data-a="c" value="'+h(a.c)+'">')+fld('Larg. (m)', '<input type="text" inputmode="decimal" data-a="l" value="'+h(a.l)+'">')+fld('Pé-dir. (m)', '<input type="text" inputmode="decimal" data-a="pd" value="'+h(a.pd)+'">')+fld('Vãos (m²)', '<input type="text" inputmode="decimal" data-a="vaos" value="'+h(a.vaos)+'" placeholder="portas">')+'</div>'+
    '<div class="calc" data-calc="'+a.id+'">'+calcHTML(ambCalc(a))+'</div>'+
    fld('Observações do cômodo', '<textarea data-a="obs" rows="2" placeholder="Estado geral, acabamentos existentes">'+h(a.obs)+'</textarea>')+
    '<div class="field"><span class="lbl">Fotos gerais do cômodo</span>'+thumbsHTML(a.fotos,'a:'+a.id,nmap)+'</div>'+
    '<div class="row"><button type="button" class="btn sm" data-moveamb="'+a.id+'" data-dir="-1" '+(i===0?'disabled':'')+'>↑ Subir</button><button type="button" class="btn sm" data-moveamb="'+a.id+'" data-dir="1" '+(i===cur.ambs.length-1?'disabled':'')+'>↓ Descer</button><span class="grow"></span><button type="button" class="btn sm danger" data-delamb="'+a.id+'">Apagar</button></div></div>';
  loadThumbs($('#ambBox')); }
function fecharAmb(){ $('#ambOv').hidden=true; ambAberto=null; touch(); if(view==='lev') { var y=window.scrollY; renderLev(); window.scrollTo(0,y); } }
function htmlDadosVisita(){ var l=cur;
  var gps=l.gps? '<a class="btn sm" target="_blank" rel="noopener" href="https://maps.google.com/?q='+l.gps.lat+','+l.gps.lng+'">Ver no mapa</a>' : '';
  return fld('Obra / título', inp('titulo', l.titulo, 'Ex.: Reforma casa R. da Esperança, 1022'))+
    '<div class="grid2">'+fld('Cliente', inp('cliente', l.cliente))+fld('Contato', inp('contato', l.contato, 'Telefone', ' inputmode="tel"'))+'</div>'+
    fld('Endereço', inp('endereco', l.endereco, 'Rua, nº, bairro, cidade'))+
    '<div class="row"><button type="button" class="btn sm dark" data-gps>📍 '+(l.gps?'Atualizar localização':'Marcar localização')+'</button>'+gps+'</div>'+
    '<div class="field"><span class="lbl">Tipo de serviço</span>'+chipsK('tipoServ', TIPOS_SERV, l.tipoServ)+'</div>'+
    '<div class="grid3">'+fld('Data', '<input type="date" data-k="data" value="'+h(l.data)+'">')+fld('Chegada', '<input type="time" data-k="hIni" value="'+h(l.hIni)+'">')+fld('Saída', '<input type="time" data-k="hFim" value="'+h(l.hFim)+'">')+'</div>'+
    '<div class="field"><span class="lbl">Clima</span>'+chipsK('clima', CLIMAS, l.clima)+'</div>'+
    '<div class="field"><span class="lbl">Choveu nas últimas 48 h?</span>'+chipsK('chuva48', ['Sim','Não','Não sei'], l.chuva48)+'</div>'+
    '<div class="grid2">'+fld('Responsável técnico', inp('resp', l.resp))+fld('CREA / CAU', inp('crea', l.crea))+'</div>'+
    fld('Quem acompanhou', inp('acomp', l.acomp, 'Nome e função'))+
    '<div class="field"><span class="lbl">Tipo de imóvel</span>'+chipsK('imovel', IMOVEIS, l.imovel)+'</div>'+
    '<div class="grid3">'+fld('Idade (anos)', inp('idade', l.idade, '', ' inputmode="decimal"'))+fld('Pavimentos', inp('pavs', l.pavs, '', ' inputmode="decimal"'))+fld('Área (m²)', inp('area', l.area, '', ' inputmode="decimal"'))+'</div>'+
    '<div class="field"><span class="lbl">Ocupado durante a obra?</span>'+chipsK('ocupado', ['Sim','Não','Parcialmente'], l.ocupado)+'</div>'+
    fld('O que o cliente pediu', ta('objetivo', l.objetivo, 'Ex.: resolver infiltração no banheiro e trocar o piso da sala', 3)); }
// tela "novo levantamento": só o essencial
function abrirNovo(){ $('#nvTitulo').value=''; $('#nvCliente').value=''; $('#nvEnd').value=''; $('#novoOv').hidden=false; setTimeout(function(){ $('#nvTitulo').focus(); },80); }
$('#nvCancel').addEventListener('click',function(){ $('#novoOv').hidden=true; });
$('#nvOk').addEventListener('click',function(){ var tt=$('#nvTitulo').value.trim(); if(!tt){ toast('Dê um nome para a obra.'); $('#nvTitulo').focus(); return; }
  var l=novoLev(); l.titulo=tt; l.cliente=$('#nvCliente').value.trim(); l.endereco=$('#nvEnd').value.trim(); levs.push(l); cur=l; persist(l); $('#novoOv').hidden=true; tab='vis'; pushNav(); showView('lev');
  if($('#nvGps').checked) marcarGPS(true); toast('Toque no cômodo onde você está para começar.'); });
function htmlCk(){ var l=cur, tot=ckTodos(l).length, resp=ckRespondidos(l);
  var html='<h2 class="sheet-h">Checklist da visita</h2><p class="note">S = sim, N = não, N/A = não se aplica. Escreva o detalhe quando precisar (ex.: “energia só 127 V”). Vai para o relatório e para a planilha.</p>'+
    '<div class="prog"><i style="width:'+(tot?Math.round(resp/tot*100):0)+'%"></i></div><p class="note">'+resp+' de '+tot+' respondidos</p>';
  var grupos=CHECK.map(function(g){ return {g:g.g, i:g.i.map(function(q){ return {k:q[0], q:q[1]}; })}; });
  if((l.ckExtra||[]).length) grupos.push({g:'Outros pontos verificados', i:l.ckExtra, extra:true});
  html+=grupos.map(function(g){ var nr=g.i.filter(function(q){ return l.ck[q.k]&&l.ck[q.k].v; }).length;
    return '<details class="card"'+(nr<g.i.length?' open':'')+'><summary><span class="chev">›</span><h2>'+h(g.g)+'</h2><span class="sum">'+nr+'/'+g.i.length+'</span></summary><div class="body">'+g.i.map(function(q){ var r=l.ck[q.k]||{};
      return '<div class="ckrow"><span class="q">'+h(q.q)+'</span><div class="row"><div class="seg3" role="group">'+['S','N','NA'].map(function(v){ return '<button type="button" data-ck="'+q.k+'" data-v="'+v+'" aria-pressed="'+(r.v===v)+'">'+(v==='NA'?'N/A':v)+'</button>'; }).join('')+'</div>'+
        '<input type="text" class="grow" data-cko="'+q.k+'" value="'+h(r.o||'')+'" placeholder="Detalhe (opcional)">'+(g.extra?'<button type="button" class="btn sm danger" data-ckdel="'+q.k+'">×</button>':'')+'</div></div>'; }).join('')+'</div></details>'; }).join('');
  html+='<button type="button" class="btn ghost full" data-ckadd>+ Acrescentar ponto verificado</button>';
  return html; }

function pendencias(l){ var p=[], its=l.itens||[];
  if(!l.endereco) p.push('Endereço da obra (em Dados da visita, abaixo).');
  var semQ=its.filter(function(it){ return isNaN(qtdItem(it)); }); if(semQ.length) p.push(semQ.length+' item(ns) sem quantidade.');
  var semF=its.filter(function(it){ return !(it.fotos||[]).length; }); if(semF.length) p.push(semF.length+' item(ns) sem foto.');
  var falt=ckTodos(l).length-ckRespondidos(l); if(falt) p.push(falt+' pergunta(s) do checklist sem resposta.');
  return p; }
function htmlRel(){ var l=cur, c=l.concl, pend=pendencias(l);
  return (pend.length? '<div class="msg err"><b>Falta conferir:</b><ul style="margin:6px 0 0;padding-left:18px">'+pend.map(function(x){ return '<li>'+h(x)+'</li>'; }).join('')+'</ul></div>' : '<div class="msg">Tudo preenchido.</div>')+
    '<div class="exp">'+
      '<button type="button" class="btn pri" data-act="pdf"><span>📄 Relatório fotográfico (PDF)</span></button>'+
      '<button type="button" class="btn" data-xls><span>📊 Planilha de orçamento (Excel)</span></button>'+
      '<div class="grid2"><button type="button" class="btn" data-zip>🗂️ Fotos (ZIP)</button><button type="button" class="btn" data-txt>💬 Resumo</button></div>'+
    '</div>'+
    '<details class="card"'+(l.titulo&&l.endereco?'':' open')+'><summary><span class="chev">›</span><h2>Dados da visita</h2><span class="sum">'+h(br(l.data))+'</span></summary><div class="body">'+htmlDadosVisita()+'</div></details>'+
    '<details class="card"><summary><span class="chev">›</span><h2>Conclusões</h2><span class="sum">'+(c.diag?'preenchido':'opcional')+'</span></summary><div class="body">'+
      fld('Diagnóstico geral', '<textarea data-c="diag" rows="4" placeholder="Resumo do estado do imóvel e dos problemas principais">'+h(c.diag)+'</textarea>')+
      fld('Sequência de execução', '<textarea data-c="seq" rows="3" placeholder="Ex.: 1) demolir; 2) impermeabilizar; 3) revestir; 4) pintar">'+h(c.seq)+'</textarea>')+
      fld('Ensaios / projetos necessários', '<textarea data-c="ensaios" rows="2">'+h(c.ensaios)+'</textarea>')+
      fld('Confirmar com o cliente', '<textarea data-c="pend" rows="2" placeholder="Ex.: padrão de acabamento, prazo desejado">'+h(c.pend)+'</textarea>')+
      '<div class="grid2">'+fld('Prazo (dias úteis)', '<input type="text" inputmode="decimal" data-c="prazo" value="'+h(c.prazo)+'">')+fld('Equipe sugerida', '<input type="text" data-c="equipe" value="'+h(c.equipe)+'">')+'</div>'+
      fld('Observações finais', '<textarea data-c="obs" rows="2">'+h(c.obs)+'</textarea>')+
    '</div></details>'+
    '<details class="card"><summary><span class="chev">›</span><h2>Assinaturas</h2><span class="sum">'+((l.ass.resp.sig?1:0)+(l.ass.cli.sig?1:0))+'/2</span></summary><div class="body">'+
      '<div class="sig" data-s="resp"><div class="lbl">Responsável técnico</div><input type="text" data-sn="resp" value="'+h(l.ass.resp.nome||l.resp)+'" placeholder="Nome"><div class="sigimg" data-sign="resp">Toque para assinar</div></div>'+
      '<div class="sig" data-s="cli"><div class="lbl">Cliente / acompanhante</div><input type="text" data-sn="cli" value="'+h(l.ass.cli.nome||l.acomp||l.cliente)+'" placeholder="Nome"><div class="sigimg" data-sign="cli">Toque para assinar</div></div>'+
    '</div></details>'+
    '<button type="button" class="btn full '+(l.status==='ok'?'':'dark')+'" data-status>'+(l.status==='ok'?'Reabrir levantamento':'✓ Marcar como concluído')+'</button>'+
    '<button type="button" class="btn danger full" data-dellev>Apagar este levantamento</button>'; }

// ---------- eventos da aba ----------
var vl=$('#view-lev'), ab=$('#ambBox');
function onLevInput(e){ var t=e.target; if(!cur) return;
  if(t.dataset.k){ cur[t.dataset.k]=t.value; if(t.dataset.k==='titulo'||t.dataset.k==='cliente'||t.dataset.k==='data') setSub(); touch(); return; }
  if(t.dataset.c){ cur.concl[t.dataset.c]=t.value; touch(); return; }
  if(t.dataset.sn){ cur.ass[t.dataset.sn].nome=t.value; touch(); return; }
  if(t.dataset.cko){ var r=cur.ck[t.dataset.cko]||(cur.ck[t.dataset.cko]={}); r.o=t.value; touch(); return; }
  if(t.dataset.a){ var box=t.closest('[data-amb]'); var a=ambById(cur, box.dataset.amb); if(!a) return; a[t.dataset.a]=t.value; touch();
    if(t.dataset.a==='nome'){ var hh=$('#ambBox h2'); if(hh) hh.textContent=t.value||'Ambiente'; }
    var cc=box.querySelector('[data-calc]'); if(cc) cc.innerHTML=calcHTML(ambCalc(a)); }
}
vl.addEventListener('input',onLevInput); ab.addEventListener('input',onLevInput);
function onLevClick(e){ var t=e.target, b;
  if((b=t.closest('[data-chip]'))){ var k=b.dataset.chip, v=b.dataset.v; cur[k]= cur[k]===v? '' : v; $$('[data-chip="'+k+'"]',vl).forEach(function(x){ x.setAttribute('aria-pressed', String(cur[k]===x.dataset.v)); }); touch(); return; }
  if((b=t.closest('[data-ph]'))){ abrirFoto(b.dataset.owner, b.dataset.ph); return; }
  if((b=t.closest('[data-item]'))){ var it=cur.itens.find(function(x){ return x.id===b.dataset.item; }); if(it) abrirItem(it); return; }
  if((b=t.closest('[data-addamb]'))){ addAmb(b.dataset.addamb); return; }
  if((b=t.closest('[data-editamb]'))){ abrirAmb(b.dataset.editamb); return; }
  if(t.closest('[data-ambok]')){ fecharAmb(); return; }
  if((b=t.closest('[data-moveamb]'))){ var i=cur.ambs.findIndex(function(a){ return a.id===b.dataset.moveamb; }), j=i+(+b.dataset.dir); if(i<0||j<0||j>=cur.ambs.length) return; var tmp=cur.ambs[i]; cur.ambs[i]=cur.ambs[j]; cur.ambs[j]=tmp; touch(); renderAmbBox(); return; }
  if((b=t.closest('[data-delamb]'))){ var a1=ambById(cur,b.dataset.delamb); var nIt=cur.itens.filter(function(it){ return it.amb===a1.id; }).length;
    confirmar('Apagar ambiente?', '“'+(a1.nome||'Ambiente')+'” e suas '+(a1.fotos||[]).length+' fotos serão apagados.'+(nIt?' Os '+nIt+' itens dele continuam, como “Geral”.':''), 'Apagar', function(){ (a1.fotos||[]).forEach(function(p){ apagarBlobFoto(p); }); cur.itens.forEach(function(it){ if(it.amb===a1.id) it.amb=''; }); cur.ambs=cur.ambs.filter(function(a){ return a!==a1; }); touch(); fecharAmb(); }); return; }
  if((b=t.closest('[data-ck]'))){ var r=cur.ck[b.dataset.ck]||(cur.ck[b.dataset.ck]={}); r.v= r.v===b.dataset.v? '' : b.dataset.v; $$('[data-ck="'+b.dataset.ck+'"]',vl).forEach(function(x){ x.setAttribute('aria-pressed', String(r.v===x.dataset.v)); }); setSub(); touch(); return; }
  if(t.closest('[data-ckadd]')){ var q=prompt('O que foi verificado?'); if(q&&q.trim()){ cur.ckExtra=cur.ckExtra||[]; cur.ckExtra.push({k:uid('cx'), q:q.trim()}); touch(); renderLev(); } return; }
  if((b=t.closest('[data-ckdel]'))){ cur.ckExtra=cur.ckExtra.filter(function(x){ return x.k!==b.dataset.ckdel; }); delete cur.ck[b.dataset.ckdel]; touch(); renderLev(); return; }
  if(t.closest('[data-gps]')){ marcarGPS(); return; }
  if(t.closest('[data-dellev]')){ var l=cur; confirmar('Apagar levantamento?', 'Nº '+String(l.n).padStart(3,'0')+' “'+(l.titulo||'sem nome')+'”, com '+l.itens.length+' itens e '+contaFotos(l)+' fotos. Não dá para desfazer.', 'Apagar', async function(){ await apagarLev(l); }); return; }
  if((b=t.closest('[data-sign]'))){ openPad(b.dataset.sign); return; }
  if(t.closest('[data-xls]')){ gerarXLS(t.closest('[data-xls]')); return; }
  if(t.closest('[data-zip]')){ gerarZIP(t.closest('[data-zip]')); return; }
  if(t.closest('[data-txt]')){ resumoTexto(); return; }
  if(t.closest('[data-status]')){ cur.status= cur.status==='ok'? 'campo' : 'ok'; if(cur.status==='ok'&&!cur.hFim) cur.hFim=nowHM(); touch(); renderLev(); toast(cur.status==='ok'?'Levantamento concluído.':'Levantamento reaberto.'); return; }
}
vl.addEventListener('click',onLevClick); ab.addEventListener('click',onLevClick);
$('#ambOv').addEventListener('click',function(e){ if(e.target.id==='ambOv') fecharAmb(); });
$('#barIn').addEventListener('change',function(e){ var t=e.target;
  if(t.dataset.addph) addPhotos(t.dataset.addph, t.files).then(function(){ t.value=''; });
});
function addAmb(nome){ var base=nome, k=2; while(nome && cur.ambs.some(function(a){ return a.nome===nome; })){ nome=base+' '+(k++); }
  var a=novoAmb(nome); cur.ambs.push(a); touch(); tab='vis'; renderLev(); renderBar();
  setTimeout(function(){ var el=$('[data-ambsec="'+a.id+'"]'); if(el) el.scrollIntoView({block:'start',behavior:'smooth'}); },60); toast('“'+a.nome+'” criado. Toque no nome para pôr as medidas.'); }
async function apagarLev(l){
  var todas=[]; (l.fotos||[]).forEach(function(p){ todas.push(p); }); (l.ambs||[]).forEach(function(a){ (a.fotos||[]).forEach(function(p){ todas.push(p); }); }); (l.itens||[]).forEach(function(i){ (i.fotos||[]).forEach(function(p){ todas.push(p); }); });
  todas.forEach(apagarBlobFoto); ['resp','cli'].forEach(function(k){ if(l.ass[k].sig) DB.delB(l.ass[k].sig).catch(function(){}); });
  await DB.del(l.id); levs=levs.filter(function(x){ return x!==l; }); cur=null; showView('lista'); toast('Levantamento apagado.'); }
function marcarGPS(quieto){ if(!navigator.geolocation){ if(!quieto) toast('Este celular não liberou a localização.'); return; } if(!quieto) toast('Buscando a localização…'); var l=cur;
  navigator.geolocation.getCurrentPosition(function(p){ l.gps={lat:p.coords.latitude, lng:p.coords.longitude, acc:Math.round(p.coords.accuracy)}; touch(); if(view==='lev'&&tab==='rel') renderLev(); if(!quieto) toast('Localização marcada (precisão de '+l.gps.acc+' m).'); },
    function(){ toast('Não consegui a localização. Confira se o Safari tem permissão em Ajustes → Privacidade → Localização.'); }, {enableHighAccuracy:true, timeout:15000, maximumAge:60000}); }

// ---------- ITEM (essencial à mostra; detalhes recolhidos) ----------
function renderItem(){ var it=curItem, l=cur; if(!it||!l) return; setSub(); var nmap=fotosNumeradas(l).map;
  var d=discById(it.disc), q=qtdItem(it), temMed=(it.med||[]).length>0;
  var ambChips='<div class="chips scroll">'+l.ambs.map(function(a){ return '<button type="button" class="chip" data-iamb="'+a.id+'" aria-pressed="'+(it.amb===a.id)+'">'+h(a.nome||'Ambiente')+'</button>'; }).join('')+
    '<button type="button" class="chip" data-iamb="" aria-pressed="'+(!ambById(l,it.amb))+'">Geral</button><button type="button" class="chip" data-iambnovo>+ Novo</button></div>';
  var html=
  '<div class="card pad">'+
    thumbsHTML(it.fotos,'i',nmap)+
    '<div class="field"><span class="lbl">Onde</span>'+ambChips+'</div>'+
    '<label class="field"><span class="lbl">O que encontrou / o que precisa ser feito</span><textarea data-i="desc" rows="3" placeholder="Ex.: Infiltração no box com bolor até 1,20 m. Refazer impermeabilização.">'+h(it.desc)+'</textarea></label>'+
    '<div class="field"><span class="lbl">Prioridade</span><div class="chips">'+PRIO.map(function(p){ return '<button type="button" class="chip p-'+p.id+'" data-iprio="'+p.id+'" aria-pressed="'+(it.prio===p.id)+'">'+h(p.n)+'</button>'; }).join('')+'</div></div>'+
    '<div class="field"><span class="lbl">Quantidade</span><div class="qrow"><input type="text" inputmode="decimal" data-i="qtdMan" value="'+h(it.qtdMan)+'" placeholder="'+(temMed&&!isNaN(q)?'= '+fmtQ(q)+' pelas medidas':'Ex.: 12,5')+'"><select data-i="und" aria-label="Unidade">'+UND.map(function(u){ return '<option'+(it.und===u?' selected':'')+'>'+h(u)+'</option>'; }).join('')+'</select></div>'+
      (ambById(l,it.amb)? pullHTML(it,true) : '')+'</div>'+
  '</div>'+
  '<details class="card"'+(temMed?' open':'')+'><summary><span class="chev">›</span><h2>Medidas detalhadas</h2><span class="sum" id="qtdSum">'+(isNaN(q)?'':fmtQ(q)+' '+h(it.und))+'</span></summary><div class="body">'+
    '<div class="medhead"><span>Trecho</span><span>Compr.</span><span>Larg.</span><span>Alt.</span><span>Vezes</span><span></span></div>'+
    '<div class="med" id="medBox">'+(it.med||[]).map(medRowHTML).join('')+'</div>'+
    '<div class="row"><button type="button" class="btn sm" data-addmed>+ Linha</button><button type="button" class="btn sm" data-addmed="neg">− Desconto (portas, janelas)</button></div>'+
    '<div class="medtot"><span class="lbl">Total das medidas</span><span class="qtd" id="qtdTot">'+(isNaN(q)?'—':fmtQ(q))+' '+h(it.und)+'</span></div>'+
    '<p class="note">Cada linha multiplica as medidas preenchidas pelo nº de vezes. Se você digitar a quantidade lá em cima, ela vale no lugar destas medidas.</p>'+
  '</div></details>'+
  '<details class="card"'+(it.disc&&it.serv?'':'')+'><summary><span class="chev">›</span><h2>Serviço e como fazer</h2><span class="sum">'+(it.serv?h(discNome(it.disc)):'pode ser depois')+'</span></summary><div class="body">'+
    '<label class="field"><span class="lbl">Disciplina</span><select data-i="disc"><option value="">Escolha…</option>'+DISC.map(function(x){ return '<option value="'+x.id+'"'+(it.disc===x.id?' selected':'')+'>'+h(x.n)+'</option>'; }).join('')+'</select></label>'+
    (d&&d.t.length? '<div class="field"><span class="lbl">Toque num serviço para preencher</span><div class="list">'+d.t.map(function(s2,i){ return '<button type="button" class="tplc" data-tpl="'+i+'"><b>'+h(s2.s)+' <span class="badge">'+h(s2.u)+'</span></b></button>'; }).join('')+'</div></div>' : '')+
    '<label class="field"><span class="lbl">Serviço a executar</span><input type="text" data-i="serv" value="'+h(it.serv)+'" placeholder="Ex.: Impermeabilização do box"></label>'+
    '<label class="field"><span class="lbl">Como deve ser feito</span><textarea data-i="como" rows="4">'+h(it.como)+'</textarea></label>'+
    '<label class="field"><span class="lbl">Causa provável</span><input type="text" data-i="causa" value="'+h(it.causa)+'"></label>'+
    '<label class="field"><span class="lbl">Material / especificação</span><input type="text" data-i="mat" value="'+h(it.mat)+'"></label>'+
  '</div></details>'+
  '<details class="card"><summary><span class="chev">›</span><h2>Mais</h2><span class="sum">natureza, observações</span></summary><div class="body">'+
    '<div class="field"><span class="lbl">Natureza</span><div class="chips">'+TIPO.map(function(p){ return '<button type="button" class="chip" data-itipo="'+p.id+'" aria-pressed="'+(it.tipo===p.id)+'">'+h(p.n)+'</button>'; }).join('')+'</div></div>'+
    '<label class="field"><span class="lbl">Observações</span><textarea data-i="obs" rows="3" placeholder="Acesso difícil, precisa de andaime…">'+h(it.obs)+'</textarea></label>'+
    '<div class="row"><button type="button" class="btn grow" data-idup>Duplicar</button><button type="button" class="btn danger grow" data-idel>Apagar item</button></div>'+
  '</div></details>';
  var vw=$('#view-item'), abertos=(vw.dataset.it===it.id)? $$('details',vw).map(function(d){ return d.open; }) : null;
  vw.innerHTML=html; vw.dataset.it=it.id; if(abertos) $$('details',vw).forEach(function(d,i){ if(abertos[i]) d.open=true; }); loadThumbs(vw); }
function medRowHTML(m,i){ return '<div class="medrow'+(m.neg?' neg':'')+'" data-mi="'+i+'"><input type="text" data-m="d" value="'+h(m.d)+'" placeholder="'+(m.neg?'Desconto':'Trecho')+'">'+
  ['c','l','h','n'].map(function(k){ return '<input type="text" inputmode="decimal" data-m="'+k+'" value="'+h(m[k])+'"'+(k==='n'?' placeholder="1"':'')+'>'; }).join('')+'<button type="button" class="x" data-delmed="'+i+'" aria-label="Apagar linha">×</button></div>'; }
function pullHTML(it){ var a=ambById(cur,it.amb); if(!a) return ''; var c=ambCalc(a); if(isNaN(c.piso)) return '<p class="note">Dica: pondo as medidas de “'+h(a.nome)+'” (toque no nome dele na Vistoria), dá para puxar piso e paredes com um toque.</p>';
  var b=[['piso','Piso '+fmt(c.piso)+' m²'],['teto','Teto '+fmt(c.teto)+' m²'],['perim','Perímetro '+fmt(c.perim)+' m']]; if(!isNaN(c.paredes)) b.splice(1,0,['paredes','Paredes '+fmt(c.paredes)+' m²']);
  return '<div class="pull"><span class="note" style="width:100%">Usar a medida de “'+h(a.nome)+'”:</span>'+b.map(function(x){ return '<button type="button" class="chip" data-pull="'+x[0]+'">+ '+x[1]+'</button>'; }).join('')+'</div>'; }
function atualizaQtd(){ var it=curItem, q=qtdItem(it); var el=$('#qtdTot'); if(el) el.textContent=(isNaN(q)?'—':fmtQ(q))+' '+it.und; var sm=$('#qtdSum'); if(sm) sm.textContent=isNaN(q)?'':fmtQ(q)+' '+it.und;
  var qi=$('[data-i="qtdMan"]'); if(qi&&(it.med||[]).length){ var mq=0,ok=false; it.med.forEach(function(m){ var p=medParcial(m); if(p) ok=true; mq+=p; }); qi.placeholder= ok? '= '+fmtQ(mq)+' pelas medidas' : 'Ex.: 12,5'; } }
var vi=$('#view-item');
vi.addEventListener('input',function(e){ var t=e.target, it=curItem; if(!it) return;
  if(t.dataset.i){ if(t.dataset.i==='disc') return; it[t.dataset.i]=t.value; if(t.dataset.i==='serv') setSub(); if(t.dataset.i==='qtdMan'||t.dataset.i==='und') atualizaQtd(); touch(); return; }
  if(t.dataset.m){ var r=t.closest('[data-mi]'); var m=it.med[+r.dataset.mi]; if(!m) return; m[t.dataset.m]=t.value; atualizaQtd(); touch(); }
});
vi.addEventListener('change',function(e){ var t=e.target, it=curItem;
  if(t.dataset.i==='disc'){ it.disc=t.value; touch(); renderItem(); return; }
  if(t.dataset.addph) addPhotos(t.dataset.addph, t.files).then(function(){ t.value=''; });
});
vi.addEventListener('click',function(e){ var t=e.target, it=curItem, b; if(!it) return;
  if((b=t.closest('[data-iamb]'))){ it.amb=b.dataset.iamb; cur.lastAmb=it.amb; touch(); renderItem(); return; }
  if(t.closest('[data-iambnovo]')){ var n=prompt('Nome do ambiente (ex.: Banheiro social)'); if(n&&n.trim()){ var a=novoAmb(n.trim()); cur.ambs.push(a); it.amb=a.id; cur.lastAmb=a.id; touch(); renderItem(); toast('Ambiente criado.'); } return; }
  if((b=t.closest('[data-tpl]'))){ var d=discById(it.disc), s=d&&d.t[+b.dataset.tpl]; if(!s) return;
    var sobre= (it.como&&it.como!==s.c)? confirm('Trocar o texto de “Como deve ser feito” pelo método sugerido?') : true;
    it.serv=s.s; if(!it.qtdMan&&!(it.med||[]).length) it.und=s.u; if(sobre) it.como=s.c; touch(); renderItem(); var dd=$$('#view-item details')[1]; if(dd) dd.open=true; toast('Serviço preenchido.'); return; }
  if((b=t.closest('[data-iprio]'))){ it.prio=b.dataset.iprio; $$('[data-iprio]',vi).forEach(function(x){ x.setAttribute('aria-pressed', String(x.dataset.iprio===it.prio)); }); touch(); return; }
  if((b=t.closest('[data-itipo]'))){ it.tipo=b.dataset.itipo; $$('[data-itipo]',vi).forEach(function(x){ x.setAttribute('aria-pressed', String(x.dataset.itipo===it.tipo)); }); touch(); return; }
  if((b=t.closest('[data-addmed]'))){ it.med=it.med||[]; var neg=b.dataset.addmed==='neg'; it.med.push({d:neg?'Desconto':'', c:'', l:'', h:'', n:'', neg:neg}); if(it.qtdMan){ it.qtdMan=''; var qi=$('[data-i="qtdMan"]'); if(qi) qi.value=''; } touch(); redrawMed(true); return; }
  if((b=t.closest('[data-delmed]'))){ it.med.splice(+b.dataset.delmed,1); touch(); redrawMed(); return; }
  if((b=t.closest('[data-pull]'))){ var a=ambById(cur,it.amb), c=ambCalc(a), k=b.dataset.pull; it.med=it.med||[];
    if(k==='piso') it.med.push({d:'Piso – '+a.nome, c:a.c, l:a.l, h:'', n:'', neg:false});
    else if(k==='teto') it.med.push({d:'Teto – '+a.nome, c:a.c, l:a.l, h:'', n:'', neg:false});
    else if(k==='perim') it.med.push({d:'Perímetro – '+a.nome, c:fmt(c.perim).replace(/\./g,''), l:'', h:'', n:'', neg:false});
    else if(k==='paredes'){ it.med.push({d:'Paredes – '+a.nome, c:fmt(c.perim).replace(/\./g,''), l:'', h:a.pd, n:'', neg:false}); if(num(a.vaos)>0) it.med.push({d:'Vãos (portas/janelas)', c:a.vaos, l:'', h:'', n:'', neg:true}); }
    it.und= k==='perim'? 'm' : 'm²';
    it.qtdMan=''; touch(); renderItem(); toast('Medida do ambiente usada. Ajuste em “Medidas detalhadas” se precisar.'); return; }
  if((b=t.closest('[data-ph]'))){ abrirFoto('i', b.dataset.ph); return; }
  if(t.closest('[data-idup]')){ var c2=JSON.parse(JSON.stringify(it)); cur.seqItem=(cur.seqItem||0)+1; c2.id=uid('it'); c2.n=cur.seqItem; c2.fotos=[]; c2.criado=Date.now(); cur.itens.push(c2); curItem=c2; touch(); renderItem(); window.scrollTo(0,0); toast('Item duplicado como #'+pad2(c2.n)+' (sem as fotos).'); return; }
  if(t.closest('[data-idel]')){ confirmar('Apagar item?', '#'+pad2(it.n)+' '+(it.serv||'')+' e suas '+(it.fotos||[]).length+' fotos.', 'Apagar', function(){ (it.fotos||[]).forEach(apagarBlobFoto); cur.itens=cur.itens.filter(function(x){ return x!==it; }); touch(); curItem=null; if(history.state&&history.state.lev) history.back(); else voltar(); }); return; }
});
function redrawMed(focusLast){ var box=$('#medBox'); box.innerHTML=(curItem.med||[]).map(medRowHTML).join(''); atualizaQtd(); if(focusLast){ var rows=$$('.medrow',box); var r=rows[rows.length-1]; if(r){ var i=r.querySelector(r.classList.contains('neg')?'[data-m="c"]':'[data-m="d"]'); if(i) i.focus(); } } }

// ---------- câmera: tirar agora ou escolher da galeria (ex.: fotos do app Timestamp) ----------
var camOwner=null;
function camAbrir(owner){ camOwner=owner; var m=cfg.camModo||'perguntar';
  if(m==='camera') $('#camIn').click(); else if(m==='galeria') $('#galIn').click(); else if(m==='timestamp') abrirTimestamp();
  else { $('#camLembrar').checked=false; $('#camOv').hidden=false; } }
document.addEventListener('click',function(e){ var b=e.target.closest('[data-cam]'); if(b){ e.preventDefault(); camAbrir(b.dataset.cam); } });
['#camPick','#galPick'].forEach(function(sel){ $(sel).addEventListener('click',function(){ if($('#camLembrar').checked){ cfg.camModo= sel==='#camPick'? 'camera' : 'galeria'; saveCfg(); toast('Escolha guardada. Para voltar a perguntar: aba Empresa e app.'); } }); });
$('#camCancel').addEventListener('click',function(){ $('#camOv').hidden=true; });
$('#tsPick').addEventListener('click',function(){ if($('#camLembrar').checked){ cfg.camModo='timestamp'; saveCfg(); } $('#camOv').hidden=true; abrirTimestamp(); });
// abre o app de câmera (Timestamp) por um atalho do app Atalhos; ao voltar, oferece pegar as fotos recém-tiradas
var TS_PADRAO='shortcuts://run-shortcut?name=Timestamp';
function abrirTimestamp(){ if(!cur) return; flush();
  LS.set('tsPend',{owner:camOwner, lev:cur.id, item:curItem&&curItem.id, view:view, tab:tab, t:Date.now()});
  window.location.href=(cfg.tsUrl||TS_PADRAO); }
function tsPendente(){ var p=LS.get('tsPend'); if(!p) return null; if(Date.now()-p.t>30*60*1000){ LS.set('tsPend',null); return null; } return p; }
function tsVoltou(){ var p=tsPendente(); if(!p) return; if(Date.now()-p.t<1500) return;   // ainda saindo para o outro app
  if(!cur||cur.id!==p.lev){ var l=levs.find(function(x){ return x.id===p.lev; }); if(!l){ LS.set('tsPend',null); return; } cur=l; tab='vis'; showView('lev'); }
  if(p.view==='item'&&p.item&&(!curItem||curItem.id!==p.item)){ var it=cur.itens.find(function(x){ return x.id===p.item; }); if(it){ curItem=it; showView('item'); } }
  camOwner=p.owner; $('#retOv').hidden=false; }
$('#retPick').addEventListener('click',function(){ LS.set('tsPend',null); setTimeout(function(){ $('#retOv').hidden=true; },300); });
$('#retMais').addEventListener('click',function(){ $('#retOv').hidden=true; abrirTimestamp(); });
$('#retCancel').addEventListener('click',function(){ LS.set('tsPend',null); $('#retOv').hidden=true; });
$('#retIn').addEventListener('change',function(){ var t=this, files=t.files; $('#retOv').hidden=true; if(!files||!files.length||!cur) return; var lista=Array.prototype.slice.call(files); t.value=''; receberFotos(camOwner, lista); });
document.addEventListener('visibilitychange',function(){ if(!document.hidden) setTimeout(tsVoltou,400); });
window.addEventListener('pageshow',function(){ setTimeout(tsVoltou,600); });
$('#camOv').addEventListener('click',function(e){ if(e.target.id==='camOv') $('#camOv').hidden=true; });
['#camIn','#galIn'].forEach(function(sel){ $(sel).addEventListener('change',function(){ var t=this, files=t.files; $('#camOv').hidden=true; if(!files||!files.length||!cur) return;
  var lista=Array.prototype.slice.call(files); t.value=''; receberFotos(camOwner, lista); }); });
function receberFotos(owner, files){
  if(owner==='quick'||owner.indexOf('quick:')===0){ var aid= owner==='quick'? (cur.lastAmb||'') : owner.slice(6); if(aid&&!ambById(cur,aid)) aid=''; cur.lastAmb=aid; if(view==='lev'&&tab==='vis') cur._scrollVis=window.scrollY; var it=novoItem(cur,aid,''); cur.itens.push(it); curItem=it; return addPhotos('i', files).then(function(){ pushNav(); showView('item'); toast('Foto salva. Agora escreva o que é.'); setTimeout(function(){ var d=$('[data-i="desc"]'); if(d) d.focus(); },300); }); }
  return addPhotos(owner, files); }

// lê a data e o GPS gravados na foto (EXIF), antes de reduzir o tamanho
function lerExif(file){ return new Promise(function(res){ var vazio={data:null,gps:null};
  if(!file||!/jpe?g/i.test(file.type||file.name||'')){ res(vazio); return; }
  var rd=new FileReader(); rd.onerror=function(){ res(vazio); };
  rd.onload=function(){ try{ res(parseExif(new DataView(rd.result))||vazio); }catch(e){ res(vazio); } };
  rd.readAsArrayBuffer(file.slice(0,262144)); }); }
function parseExif(v){ if(v.getUint16(0)!==0xFFD8) return null; var off=2;
  while(off+4<v.byteLength){ var mk=v.getUint16(off); if((mk&0xFF00)!==0xFF00) return null; var len=v.getUint16(off+2);
    if(mk===0xFFE1 && v.getUint32(off+4)===0x45786966) return lerTiff(v, off+10); off+=2+len; }
  return null; }
function lerTiff(v, t){ var le=v.getUint16(t)===0x4949; var u16=function(o){ return v.getUint16(o,le); }, u32=function(o){ return v.getUint32(o,le); };
  function ifd(o){ var n=u16(o), tags={}; for(var i=0;i<n;i++){ var e=o+2+i*12; tags[u16(e)]={type:u16(e+2), count:u32(e+4), off:e+8}; } return tags; }
  function str(tg){ var p= tg.count>4? t+u32(tg.off) : tg.off, s=''; for(var i=0;i<tg.count-1;i++) s+=String.fromCharCode(v.getUint8(p+i)); return s; }
  function rats(tg){ var p=t+u32(tg.off), a=[]; for(var i=0;i<tg.count;i++) a.push(u32(p+i*8)/(u32(p+i*8+4)||1)); return a; }
  var ifd0=ifd(t+u32(t+4)), out={data:null,gps:null};
  if(ifd0[0x8769]){ var ex=ifd(t+u32(ifd0[0x8769].off)); var dt=ex[0x9003]||ex[0x9004]; if(dt){ var m=str(dt).match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/); if(m){ var d=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]); if(!isNaN(d)) out.data=d.toISOString(); } } }
  if(!out.data && ifd0[0x0132]){ var m2=str(ifd0[0x0132]).match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/); if(m2) out.data=new Date(+m2[1],+m2[2]-1,+m2[3],+m2[4],+m2[5],+m2[6]).toISOString(); }
  if(ifd0[0x8825]){ var g=ifd(t+u32(ifd0[0x8825].off));
    if(g[2]&&g[4]){ var la=rats(g[2]), lo=rats(g[4]); var lat=la[0]+la[1]/60+la[2]/3600, lng=lo[0]+lo[1]/60+lo[2]/3600;
      if(g[1]&&String.fromCharCode(v.getUint8(g[1].off))==='S') lat=-lat; if(g[3]&&String.fromCharCode(v.getUint8(g[3].off))==='W') lng=-lng;
      if(isFinite(lat)&&isFinite(lng)&&(lat||lng)) out.gps={lat:Math.round(lat*1e6)/1e6, lng:Math.round(lng*1e6)/1e6}; } }
  return out; }

// ---------- fotos ----------
var urlCache={};
async function blobURL(key){ if(urlCache[key]) return urlCache[key]; var b=await DB.getB(key); if(!b) return null; return (urlCache[key]=URL.createObjectURL(b)); }
async function loadThumbs(root){ var els=$$('.th',root); for(var i=0;i<els.length;i++){ var u=await blobURL(els[i].dataset.ph); if(u) els[i].style.backgroundImage='url("'+u+'")'; } }
function loadImg(blob){ return new Promise(function(res,rej){ var u=URL.createObjectURL(blob); var im=new Image(); im.onload=function(){ res(im); setTimeout(function(){ URL.revokeObjectURL(u); },1000); }; im.onerror=rej; im.src=u; }); }
async function shrink(file){ var im=await loadImg(file); var max=1800, s=Math.min(1, max/Math.max(im.naturalWidth,im.naturalHeight)); var c=document.createElement('canvas'); c.width=Math.round(im.naturalWidth*s); c.height=Math.round(im.naturalHeight*s); c.getContext('2d').drawImage(im,0,0,c.width,c.height); return new Promise(function(res){ c.toBlob(res,'image/jpeg',0.84); }); }
function ownerList(owner){ if(owner==='lev') return cur.fotos; if(owner==='i') return curItem.fotos; if(owner.indexOf('a:')===0){ var a=ambById(cur, owner.slice(2)); return a? a.fotos : null; } return null; }
async function addPhotos(owner, files){ if(!files||!files.length||!cur) return; var list=ownerList(owner); if(!list) return; setSync('salvando foto…'); var ok=0;
  for(var k=0;k<files.length;k++){ try{ var ex=await lerExif(files[k]); var b=await shrink(files[k]); var id=uid('ph'); await DB.putB(id,b); var rec={id:id, d:ex.data||new Date().toISOString(), leg:''}; if(ex.data) rec.exif=1; if(ex.gps) rec.gps=ex.gps; list.push(rec); ok++; } catch(e){ console.error(e); toast('Não consegui ler uma das fotos.'); } }
  touch(); await flush(); refreshAfterPhoto(); if(ok) toast(ok>1? ok+' fotos salvas.' : 'Foto salva. Toque nela para pôr legenda.'); }
function refreshAfterPhoto(){ var y=window.scrollY; if(!$('#ambOv').hidden) renderAmbBox(); if(view==='item') renderItem(); else if(view==='lev') renderLev(); window.scrollTo(0,y); }
function apagarBlobFoto(p){ DB.delB(p.id).catch(function(){}); if(p.orig) DB.delB(p.orig).catch(function(){}); delete urlCache[p.id]; }
var phSel={owner:null, p:null};
async function abrirFoto(owner, id){ var list=ownerList(owner); var p=list&&list.find(function(x){ return x.id===id; }); if(!p) return; phSel={owner:owner, p:p};
  var u=await blobURL(p.id); $('#phImg').src=u||''; var n=fotosNumeradas(cur).map[p.id];
  $('#phTit').textContent='Foto F'+pad2(n||0); $('#phLeg').value=p.leg||''; $('#phOrig').hidden=!p.orig; $('#phCapa').textContent= capaId(cur)===p.id? 'É a capa ✓' : 'Usar como capa';
  $('#phInfo').innerHTML=(p.exif?'Tirada em ':'Adicionada em ')+h(brDT(p.d))+(p.exif?' (data gravada na foto)':'')+'.'+(p.gps?' Localização: <a target="_blank" rel="noopener" href="https://maps.google.com/?q='+p.gps.lat+','+p.gps.lng+'">'+fmt(p.gps.lat,5)+', '+fmt(p.gps.lng,5)+'</a>.':''); $('#phOv').hidden=false; }
function fecharFoto(){ $('#phOv').hidden=true; touch(); refreshAfterPhoto(); }
$('#phClose').addEventListener('click',fecharFoto);
$('#phOv').addEventListener('click',function(e){ if(e.target.id==='phOv') fecharFoto(); });
$('#phLeg').addEventListener('input',function(){ if(phSel.p){ phSel.p.leg=this.value; touch(); } });
$('#phCapa').addEventListener('click',function(){ cur.capa=phSel.p.id; touch(); this.textContent='É a capa ✓'; toast('Essa foto vai na capa do relatório.'); });
$('#phDel').addEventListener('click',function(){ var s=phSel; confirmar('Remover foto?', 'A foto sai do levantamento e do relatório.', 'Remover', function(){ var list=ownerList(s.owner); var ix=list.indexOf(s.p); if(ix>=0) list.splice(ix,1); apagarBlobFoto(s.p); if(cur.capa===s.p.id) cur.capa=null; $('#phOv').hidden=true; touch(); refreshAfterPhoto(); }); });
$('#phOrig').addEventListener('click',function(){ var p=phSel.p; if(!p.orig) return; DB.delB(p.id).catch(function(){}); delete urlCache[p.id]; if(cur.capa===p.id) cur.capa=p.orig; p.id=p.orig; delete p.orig; touch(); abrirFoto(phSel.owner, p.id); toast('Marcações removidas.'); });
$('#phMark').addEventListener('click',function(){ abrirMarcacao(); });

// marcação: traço livre, seta e círculo
var mk={img:null, strokes:[], cor:'#e53935', modo:'livre', cur:null};
async function abrirMarcacao(){ var p=phSel.p; var blob=await DB.getB(p.orig||p.id); if(!blob) return; var im=await loadImg(blob); mk.img=im; mk.strokes=[]; mk.cur=null;
  // se a foto já tinha marcação, recomeça a partir da original (as marcações antigas são refeitas do zero)
  var c=$('#mkCanvas'); c.width=im.naturalWidth; c.height=im.naturalHeight; $('#phOv').hidden=true; $('#mkOv').hidden=false; mkFit(); mkDraw();
  if(p.orig) toast('Começando da foto original. As marcações anteriores serão substituídas.'); }
function mkFit(){ var c=$('#mkCanvas'), st=$('#mkStage'); var r=st.getBoundingClientRect(); var s=Math.min(r.width/c.width, r.height/c.height); c.style.width=Math.floor(c.width*s)+'px'; c.style.height=Math.floor(c.height*s)+'px'; }
window.addEventListener('resize',function(){ if(!$('#mkOv').hidden) mkFit(); });
function mkLW(){ var c=$('#mkCanvas'); return Math.max(4, Math.round(Math.max(c.width,c.height)*0.007)); }
function mkDraw(){ var c=$('#mkCanvas'), x=c.getContext('2d'); x.drawImage(mk.img,0,0); mk.strokes.concat(mk.cur?[mk.cur]:[]).forEach(function(s){ desenhaTraco(x,s); }); }
function desenhaTraco(x,s){ x.save(); x.strokeStyle=s.cor; x.fillStyle=s.cor; x.lineWidth=s.w; x.lineCap='round'; x.lineJoin='round'; x.shadowColor='rgba(0,0,0,.55)'; x.shadowBlur=s.w*0.8;
  var p=s.pts; if(!p.length){ x.restore(); return; }
  if(s.modo==='livre'){ x.beginPath(); x.moveTo(p[0].x,p[0].y); for(var i=1;i<p.length;i++) x.lineTo(p[i].x,p[i].y); x.stroke(); }
  else { var a=p[0], b=p[p.length-1];
    if(s.modo==='seta'){ var ang=Math.atan2(b.y-a.y,b.x-a.x), L=s.w*5; x.beginPath(); x.moveTo(a.x,a.y); x.lineTo(b.x-Math.cos(ang)*L*0.6,b.y-Math.sin(ang)*L*0.6); x.stroke();
      x.beginPath(); x.moveTo(b.x,b.y); x.lineTo(b.x-L*Math.cos(ang-0.45),b.y-L*Math.sin(ang-0.45)); x.lineTo(b.x-L*Math.cos(ang+0.45),b.y-L*Math.sin(ang+0.45)); x.closePath(); x.fill(); }
    else { var cx=(a.x+b.x)/2, cy=(a.y+b.y)/2, rx=Math.abs(b.x-a.x)/2, ry=Math.abs(b.y-a.y)/2; x.beginPath(); x.ellipse(cx,cy,Math.max(rx,2),Math.max(ry,2),0,0,Math.PI*2); x.stroke(); } }
  x.restore(); }
(function(){ var c=$('#mkCanvas');
  function pt(e){ var r=c.getBoundingClientRect(); return {x:(e.clientX-r.left)*c.width/r.width, y:(e.clientY-r.top)*c.height/r.height}; }
  c.addEventListener('pointerdown',function(e){ c.setPointerCapture(e.pointerId); mk.cur={modo:mk.modo, cor:mk.cor, w:mkLW(), pts:[pt(e)]}; mkDraw(); e.preventDefault(); });
  c.addEventListener('pointermove',function(e){ if(!mk.cur) return; var p=pt(e); if(mk.cur.modo==='livre') mk.cur.pts.push(p); else mk.cur.pts[1]=p; mkDraw(); e.preventDefault(); });
  function fim(){ if(!mk.cur) return; if(mk.cur.pts.length>1||mk.cur.modo==='livre') mk.strokes.push(mk.cur); mk.cur=null; mkDraw(); }
  c.addEventListener('pointerup',fim); c.addEventListener('pointercancel',fim);
})();
$$('#mkOv .sw').forEach(function(b){ b.addEventListener('click',function(){ mk.cor=b.dataset.cor; $$('#mkOv .sw').forEach(function(x){ x.setAttribute('aria-pressed', String(x===b)); }); }); });
$$('#mkOv [data-mk]').forEach(function(b){ b.addEventListener('click',function(){ mk.modo=b.dataset.mk; $$('#mkOv [data-mk]').forEach(function(x){ x.setAttribute('aria-pressed', String(x===b)); x.classList.toggle('pri', x===b); }); }); });
$('#mkOv [data-mk="livre"]').classList.add('pri');
$('#mkUndo').addEventListener('click',function(){ mk.strokes.pop(); mkDraw(); });
$('#mkCancel').addEventListener('click',function(){ $('#mkOv').hidden=true; $('#phOv').hidden=false; });
$('#mkOk').addEventListener('click',function(){ var p=phSel.p; if(!mk.strokes.length){ $('#mkOv').hidden=true; $('#phOv').hidden=false; return; }
  mk.cur=null; mkDraw(); $('#mkCanvas').toBlob(async function(b){ var novo=uid('ph'); await DB.putB(novo,b);
    if(p.orig){ DB.delB(p.id).catch(function(){}); delete urlCache[p.id]; } else p.orig=p.id;
    if(cur.capa===p.id) cur.capa=novo; p.id=novo; touch(); await flush(); $('#mkOv').hidden=true; abrirFoto(phSel.owner, p.id); toast('Marcação salva. A original fica guardada.'); },'image/jpeg',0.86); });

// ---------- assinatura ----------
var padSt={k:null, drawn:false};
function openPad(k){ padSt.k=k; padSt.drawn=false; $('#padTitle').textContent='Assinatura – '+(k==='resp'?'Responsável técnico':'Cliente / acompanhante'); $('#padOv').hidden=false;
  var c=$('#padCanvas'); var r=c.getBoundingClientRect(); var dpr=window.devicePixelRatio||1; c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr);
  var x=c.getContext('2d'); x.setTransform(dpr,0,0,dpr,0,0); x.fillStyle='#fff'; x.fillRect(0,0,r.width,r.height); x.lineWidth=2.4; x.lineCap='round'; x.lineJoin='round'; x.strokeStyle='#14223a'; }
(function(){ var c=$('#padCanvas'), drawing=false, last=null;
  function pt(e){ var r=c.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
  c.addEventListener('pointerdown',function(e){ drawing=true; last=pt(e); c.setPointerCapture(e.pointerId); var x=c.getContext('2d'); x.beginPath(); x.arc(last.x,last.y,1.1,0,7); x.fillStyle='#14223a'; x.fill(); padSt.drawn=true; e.preventDefault(); });
  c.addEventListener('pointermove',function(e){ if(!drawing) return; var p=pt(e), x=c.getContext('2d'); x.beginPath(); x.moveTo(last.x,last.y); x.lineTo(p.x,p.y); x.stroke(); last=p; padSt.drawn=true; e.preventDefault(); });
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){ c.addEventListener(ev,function(){ drawing=false; }); });
})();
$('#padClear').addEventListener('click',function(){ openPad(padSt.k); });
$('#padCancel').addEventListener('click',function(){ $('#padOv').hidden=true; });
$('#padOk').addEventListener('click',function(){ var k=padSt.k, l=cur; if(!padSt.drawn){ toast('Assine no quadro branco.'); return; }
  $('#padCanvas').toBlob(async function(b){ var id='sig'+uid(); await DB.putB(id,b); var old=l.ass[k].sig; l.ass[k].sig=id; if(old){ DB.delB(old).catch(function(){}); delete urlCache[old]; }
    if(!l.ass[k].nome){ var inp=$('[data-sn="'+k+'"]'); l.ass[k].nome=inp? inp.value : ''; }
    $('#padOv').hidden=true; loadSigs(); touch(); },'image/png'); });
async function loadSigs(){ var l=cur; for(var k of ['resp','cli']){ var el=$('[data-sign="'+k+'"]'); if(!el) continue; var id=l.ass[k].sig; if(id){ var u=await blobURL(id); if(u){ el.style.backgroundImage='url("'+u+'")'; el.textContent=''; } } } }

// ---------- confirmação ----------
var cfmAcao=null;
function confirmar(tit, txt, sim, acao){ cfmAcao=acao; $('#cfmTit').textContent=tit; $('#cfmTxt').textContent=txt; $('#cfmYes').textContent=sim||'Apagar'; $('#cfmBack').hidden=false; }
$('#cfmNo').addEventListener('click',function(){ $('#cfmBack').hidden=true; cfmAcao=null; });
$('#cfmYes').addEventListener('click',function(){ var a=cfmAcao; $('#cfmBack').hidden=true; cfmAcao=null; if(a) a(); });

// ---------- CONFIGURAÇÕES ----------
function renderCfg(){ var el=$('#view-cfg');
  el.innerHTML='<h2 class="sheet-h">Empresa</h2><p class="note">Aparece na capa e no rodapé do relatório e na planilha. Preencha uma vez.</p>'+
  '<div class="card pad">'+
    '<label class="field"><span class="lbl">Empresa</span><input type="text" data-cf="empresa" value="'+h(cfg.empresa)+'" placeholder="Ex.: Mantovany Engenharia e Construção"></label>'+
    '<div class="grid2"><label class="field"><span class="lbl">Responsável técnico</span><input type="text" data-cf="resp" value="'+h(cfg.resp)+'"></label><label class="field"><span class="lbl">CREA / CAU</span><input type="text" data-cf="crea" value="'+h(cfg.crea)+'"></label></div>'+
    '<div class="grid2"><label class="field"><span class="lbl">Telefone</span><input type="text" inputmode="tel" data-cf="tel" value="'+h(cfg.tel)+'"></label><label class="field"><span class="lbl">E-mail</span><input type="text" inputmode="email" autocapitalize="off" data-cf="email" value="'+h(cfg.email)+'"></label></div>'+
    '<div class="field"><span class="lbl">Logo da empresa</span><div class="logo-box">'+(cfg.logo?'<img src="'+cfg.logo+'" alt="Logo">':'Sem logo – o relatório sai só com o nome da empresa.')+'</div>'+
      '<div class="row"><label class="btn dark grow">Escolher logo<input type="file" id="logoFile" accept="image/*" hidden></label>'+(cfg.logo?'<button type="button" class="btn ghost" id="logoDel">Remover</button>':'')+'</div></div>'+
    '<div class="field"><span class="lbl">Fotos no PDF</span><div class="chips">'+[['normal','Qualidade normal'],['leve','Arquivo leve (WhatsApp)']].map(function(o){ return '<button type="button" class="chip" data-fq="'+o[0]+'" aria-pressed="'+(cfg.fotoPdf===o[0])+'">'+o[1]+'</button>'; }).join('')+'</div></div>'+
    '<div class="field"><span class="lbl">Ao tocar no botão da câmera</span><div class="chips">'+[['perguntar','Perguntar sempre'],['timestamp','Abrir o Timestamp'],['camera','Câmera do app'],['galeria','Galeria']].map(function(o){ return '<button type="button" class="chip" data-cm="'+o[0]+'" aria-pressed="'+((cfg.camModo||'perguntar')===o[0])+'">'+o[1]+'</button>'; }).join('')+'</div></div>'+
    '<details class="card" style="background:var(--surface-2)"'+(cfg.camModo==='timestamp'?' open':'')+'><summary><span class="chev">›</span><h2 style="font-size:1rem">Ligar ao Timestamp (uma vez só)</h2></summary><div class="body">'+
      '<ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:.92rem">'+
        '<li>Abra o app <b>Atalhos</b> do iPhone e toque em <b>+</b>.</li>'+
        '<li>Toque em <b>Adicionar Ação</b>, busque <b>Abrir App</b> e escolha o <b>Timestamp</b>.</li>'+
        '<li>Toque no nome do atalho no topo e chame de <b>Timestamp</b> (igual ao campo abaixo). Toque em OK.</li>'+
        '<li>Volte aqui e toque em <b>Testar</b>. Na primeira vez o iPhone pergunta se pode abrir o Atalhos: toque em Abrir.</li>'+
      '</ol>'+
      '<label class="field"><span class="lbl">Endereço que abre o app de câmera</span><input type="text" data-cf="tsUrl" value="'+h(cfg.tsUrl||TS_PADRAO)+'" autocapitalize="off" autocorrect="off" spellcheck="false"></label>'+
      '<span class="note">Se o seu atalho tiver outro nome, troque o final do endereço (espaço vira %20). Ex.: …?name=Camera%20Obra</span>'+
      '<button type="button" class="btn dark" id="tsTest">Testar: abrir o Timestamp</button>'+
      '<p class="note">Na obra: toque em 📷, tire as fotos no Timestamp e volte pelo “◀ Atalhos” no canto de cima (ou pela troca de apps). O app mostra o botão para pegar as fotos que você acabou de tirar.</p>'+
    '</div></details>'+
    '<p class="note">Salva sozinho enquanto você digita.</p>'+
  '</div>'+
  '<h2 class="sheet-h">Backup</h2><p class="note">Os levantamentos e as fotos ficam só neste celular. Depois de cada visita, exporte o backup e guarde no Arquivos, no Drive ou no e-mail. O backup leva as fotos junto.</p>'+
  '<div class="row"><button type="button" class="btn grow" id="expBk">Exportar backup</button><label class="btn grow">Importar backup<input type="file" id="impBk" accept="application/json,.json" hidden></label></div>'+
  '<p class="note" id="verInfo" style="text-align:center"></p>';
  verLine(); }
function saveCfgForm(){ $$('[data-cf]').forEach(function(i){ cfg[i.dataset.cf]=i.value.trim(); }); saveCfg(); }
var vc=$('#view-cfg'), cfgTimer=null;
vc.addEventListener('input',function(e){ if(e.target.dataset.cf){ cfg[e.target.dataset.cf]=e.target.value; clearTimeout(cfgTimer); cfgTimer=setTimeout(function(){ saveCfg(); setSync('salvo no celular'); },500); } });
vc.addEventListener('click',function(e){ var b=e.target.closest('[data-fq]'); if(b){ cfg.fotoPdf=b.dataset.fq; saveCfg(); renderCfg(); return; }
  var cm=e.target.closest('[data-cm]'); if(cm){ cfg.camModo=cm.dataset.cm; saveCfg(); renderCfg(); return; }
  if(e.target.id==='tsTest'){ saveCfgForm(); window.location.href=(cfg.tsUrl||TS_PADRAO); return; }
  if(e.target.id==='logoDel'){ delete cfg.logo; saveCfg(); renderCfg(); toast('Logo removido.'); return; }
  if(e.target.id==='expBk') exportarBackup(e.target); });
vc.addEventListener('change',async function(e){ var t=e.target;
  if(t.id==='logoFile'){ var f=t.files&&t.files[0]; t.value=''; if(!f) return; try{ cfg.logo=await prepararLogo(f); saveCfg(); renderCfg(); toast('Logo salvo. Vai aparecer no relatório.'); }catch(err){ toast('Não consegui ler essa imagem. Tente um PNG ou JPG.'); } }
  if(t.id==='impBk') importarBackup(t); });
// encaixa o logo numa faixa branca 4:1
function prepararLogo(file){ return new Promise(function(res,rej){ var url=URL.createObjectURL(file), img=new Image();
  img.onload=function(){ var W=1200,H=300,p=12, c=document.createElement('canvas'); c.width=W; c.height=H; var x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,W,H);
    var sc=Math.min((W-2*p)/img.naturalWidth,(H-2*p)/img.naturalHeight), w=img.naturalWidth*sc, hh=img.naturalHeight*sc; x.imageSmoothingQuality='high'; x.drawImage(img,(W-w)/2,(H-hh)/2,w,hh); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg',0.9)); };
  img.onerror=function(){ URL.revokeObjectURL(url); rej(new Error('img')); }; img.src=url; }); }

// ---------- arquivos ----------
var ready={file:null,url:null};
async function deliver(name, blob, mime, okMsg){ var file=null; try{ file=new File([blob],name,{type:mime}); }catch(e){}
  if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:name}); toast(okMsg); return; }
    catch(e){ if(e&&e.name==='AbortError'){ toast('Envio cancelado. Pode gerar de novo quando quiser.'); return; } }
    showReady(name, blob, file); return; }
  showReady(name, blob, file); }
function showReady(name, blob, file){ if(ready.url) URL.revokeObjectURL(ready.url); ready.file=file; ready.url=URL.createObjectURL(blob);
  $('#readyName').textContent=name+' ('+(blob.size<1048576? Math.max(1,Math.round(blob.size/1024))+' KB' : (blob.size/1048576).toFixed(1).replace('.',',')+' MB')+')'; var a=$('#readyOpen'); a.href=ready.url; a.setAttribute('download',name);
  $('#readyShare').hidden=!(file&&navigator.canShare&&navigator.canShare({files:[file]})); $('#readyOv').hidden=false; }
$('#readyShare').addEventListener('click',function(){ if(ready.file) navigator.share({files:[ready.file],title:ready.file.name}).then(function(){ $('#readyOv').hidden=true; }).catch(function(){}); });
$('#readyClose').addEventListener('click',function(){ $('#readyOv').hidden=true; });
function loadScript(src){ return new Promise(function(res,rej){ if(document.querySelector('script[src="'+src+'"]')){ res(); return; } var s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
function nomeArq(l, tipo){ return (tipo+' - Nº'+String(l.n).padStart(3,'0')+' - '+(l.titulo||'levantamento')+' - '+br(l.data).replace(/\//g,'-')).replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').slice(0,120); }
function dadosExport(){ return {lev:cur, cfg:cfg, fotos:fotosNumeradas(cur), itens:itensOrdenados(cur), getBlob:function(k){ return DB.getB(k); },
  util:{qtdItem:qtdItem, medParcial:medParcial, ambCalc:ambCalc, ambNome:function(id){ return ambNome(cur,id); }, ambById:function(id){ return ambById(cur,id); }, discNome:discNome, prioNome:prioNome, tipoNome:tipoNome, ckTodos:function(){ return ckTodos(cur); }, num:num, br:br, brDT:brDT, fmt:fmt, fmtQ:fmtQ, DISC:DISC}}; }
async function libsRelatorio(){ if(!window.jspdf) await loadScript('jspdf.umd.min.js'); if(!(window.jspdf&&window.jspdf.jsPDF&&window.jspdf.jsPDF.API.autoTable)) await loadScript('jspdf.plugin.autotable.min.js'); if(!window.LEVREL) await loadScript('relatorio.js'); }
async function gerarPDF(btn){ if(!cur) return; await flush(); var txt=btn.innerHTML; btn.disabled=true; btn.textContent='Montando o relatório…';
  try{ await libsRelatorio(); var blob=await window.LEVREL.pdf(dadosExport(), function(p){ btn.textContent='Montando o relatório… '+p+'%'; });
    await deliver(nomeArq(cur,'Relatorio fotografico')+'.pdf', blob, 'application/pdf', 'Relatório pronto.'); }
  catch(e){ console.error(e); toast('Erro ao montar o PDF. Abra o app uma vez com internet e tente de novo.'); }
  btn.disabled=false; btn.innerHTML=txt; }
async function gerarXLS(btn){ if(!cur) return; await flush(); var txt=btn.innerHTML; btn.disabled=true; btn.textContent='Montando a planilha…';
  try{ if(!window.JSZip) await loadScript('jszip.min.js'); await libsRelatorio(); var blob=await window.LEVREL.xlsx(dadosExport());
    await deliver(nomeArq(cur,'Orcamento e levantamento')+'.xlsx', blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Planilha pronta.'); }
  catch(e){ console.error(e); toast('Erro ao montar a planilha.'); }
  btn.disabled=false; btn.innerHTML=txt; }
async function gerarZIP(btn){ if(!cur) return; await flush(); var fl=fotosNumeradas(cur).list; if(!fl.length){ toast('Ainda não há fotos.'); return; } var txt=btn.innerHTML; btn.disabled=true; btn.textContent='Juntando as fotos…';
  try{ if(!window.JSZip) await loadScript('jszip.min.js'); var z=new window.JSZip();
    for(var i=0;i<fl.length;i++){ var f=fl[i], b=await DB.getB(f.id); if(!b) continue; var nome=('F'+pad2(f.num)+' - '+f.onde+(f.item?' - #'+pad2(f.item.n)+' '+(f.item.serv||''):'')+(f.leg?' - '+f.leg:'')).replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').slice(0,110)+'.jpg'; z.file(nome,b); }
    var blob=await z.generateAsync({type:'blob'}); await deliver(nomeArq(cur,'Fotos')+'.zip', blob, 'application/zip', 'Fotos prontas.'); }
  catch(e){ console.error(e); toast('Erro ao juntar as fotos.'); }
  btn.disabled=false; btn.innerHTML=txt; }
function resumoTexto(){ var l=cur, its=itensOrdenados(l), t=[];
  t.push('*LEVANTAMENTO Nº '+String(l.n).padStart(3,'0')+' – '+(l.titulo||'')+'*'); if(l.endereco) t.push(l.endereco); t.push(br(l.data)+(l.cliente?' · Cliente: '+l.cliente:'')+(l.resp?' · Resp.: '+l.resp:'')); t.push('');
  var cnt={}; its.forEach(function(it){ cnt[it.prio]=(cnt[it.prio]||0)+1; }); t.push(its.length+' itens ('+PRIO.filter(function(p){ return cnt[p.id]; }).map(function(p){ return cnt[p.id]+' '+p.n.toLowerCase(); }).join(', ')+') · '+contaFotos(l)+' fotos'); t.push('');
  var ga=null; its.forEach(function(it){ var a=ambNome(l,it.amb); if(a!==ga){ t.push('*'+a+'*'); ga=a; } var q=qtdItem(it); t.push('#'+pad2(it.n)+' '+(it.serv||it.desc||'')+(isNaN(q)?'':' – '+fmtQ(q)+' '+it.und)+(it.prio==='U'||it.prio==='A'?' ('+prioNome(it.prio)+')':'')); });
  if(l.concl.diag){ t.push(''); t.push('*Diagnóstico:* '+l.concl.diag); } if(l.concl.ensaios){ t.push('*Ensaios/projetos:* '+l.concl.ensaios); } if(l.concl.pend){ t.push('*A confirmar:* '+l.concl.pend); }
  var s=t.join('\n'); if(navigator.share){ navigator.share({text:s}).catch(function(){}); } else if(navigator.clipboard){ navigator.clipboard.writeText(s).then(function(){ toast('Resumo copiado.'); }); } }

// ---------- backup ----------
function blobToDataURL(b){ return new Promise(function(res){ var r=new FileReader(); r.onload=function(){ res(r.result); }; r.readAsDataURL(b); }); }
function dataURLToBlob(u){ var p=u.split(','), m=p[0].match(/:(.*?);/)[1], bin=atob(p[1]), a=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return new Blob([a],{type:m}); }
async function exportarBackup(b){ b.disabled=true; b.textContent='Preparando…';
  try{ await flush(); var keys=await DB.keysB(); var blobs={}; for(var i=0;i<keys.length;i++){ var bl=await DB.getB(keys[i]); if(bl) blobs[keys[i]]=await blobToDataURL(bl); }
    var data={app:'levantamento', versao:1, exportadoEm:new Date().toISOString(), cfg:cfg, levs:levs, blobs:blobs};
    await deliver('backup-levantamento-'+todayISO()+'.json', new Blob([JSON.stringify(data)],{type:'application/json'}), 'application/json', 'Backup exportado ('+levs.length+' levantamentos).'); }
  catch(e){ console.error(e); toast('Erro ao montar o backup.'); }
  b.disabled=false; b.textContent='Exportar backup'; }
function importarBackup(t){ var file=t.files[0]; t.value=''; if(!file) return; var rd=new FileReader();
  rd.onload=async function(){ try{ var d=JSON.parse(rd.result); if(!d||d.app!=='levantamento') throw 0;
      if(!confirm('Restaurar '+(d.levs||[]).length+' levantamentos desse backup? Os iguais serão substituídos pela versão do backup.')) return;
      var ks=Object.keys(d.blobs||{}); for(var i=0;i<ks.length;i++) await DB.putB(ks[i], dataURLToBlob(d.blobs[ks[i]]));
      for(var j=0;j<(d.levs||[]).length;j++) await DB.put(d.levs[j]);
      if(d.cfg){ var seq=Math.max(cfg.seq||0, d.cfg.seq||0); cfg=Object.assign({},DEFAULT_CFG,d.cfg); cfg.seq=seq; saveCfg(); }
      toast('Backup restaurado.'); setTimeout(function(){ location.reload(); },900);
    }catch(err){ toast('Esse arquivo não é um backup do app de levantamento.'); } };
  rd.readAsText(file); }

// ---------- versão e atualização ----------
var versaoNova=null;
function verLine(){ var el=$('#verInfo'); if(!el) return; el.textContent='Versão do app: '+APP_VER+(versaoNova&&String(versaoNova)!==String(APP_VER)?' (disponível: '+versaoNova+')':' · atualizada')+' · '+levs.length+' levantamentos neste celular'; }
async function forceUpdate(){ var b=$('#updBtn'); if(b){ b.disabled=true; b.textContent='Atualizando…'; } await flush();
  try{ if(window.caches){ var ks=await caches.keys(); await Promise.all(ks.filter(function(k){ return /^lev-/.test(k); }).map(function(k){ return caches.delete(k); })); } }catch(e){}
  try{ if(navigator.serviceWorker){ var rs=await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.filter(function(r){ return /\/levantamento\/$/.test(r.scope); }).map(function(r){ return r.update(); })); } }catch(e){}
  location.replace(location.pathname+'?v='+Date.now()); }
document.addEventListener('click',function(e){ if(e.target.id==='updBtn') forceUpdate(); });
var swReg=null, updating=false;
async function checkUpdate(){ if(updating || (location.protocol!=='https:' && location.hostname!=='localhost') || !navigator.onLine) return;
  try{ if(swReg) swReg.update().catch(function(){});
    var r=await fetch('version.json?t='+Date.now(),{cache:'no-store'}); if(!r.ok) return; var v=(await r.json()).v; versaoNova=v; verLine(); if(!v || String(v)===String(APP_VER)) return;
    try{ if(sessionStorage.getItem('lev:tried')===String(v)){ $('#updBar').hidden=false; return; } sessionStorage.setItem('lev:tried', String(v)); }catch(e){}
    updating=true; await flush(); try{ sessionStorage.setItem('lev:reopen', JSON.stringify({id:cur&&cur.id, tab:tab, item:curItem&&curItem.id, view:view})); sessionStorage.setItem('lev:updated', v); }catch(e){}
    setSync('atualizando o app…'); setTimeout(function(){ location.reload(); },600); }catch(e){} }
document.addEventListener('visibilitychange',function(){ if(document.hidden) flush(); else checkUpdate(); });
window.addEventListener('pagehide',function(){ flush(); });

// ---------- início ----------
if('serviceWorker' in navigator && location.protocol==='https:'){ window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(function(r){ swReg=r; }).catch(function(){}); }); }
try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist(); }catch(e){}
(async function boot(){
  var c=LS.get('cfg'); if(c) cfg=Object.assign({},DEFAULT_CFG,c);
  try{ levs=(await DB.all())||[]; }catch(e){ console.error(e); toast('Não consegui abrir os dados deste celular.'); }
  var maxN=levs.reduce(function(a,l){ return Math.max(a,l.n||0); },0); if(maxN>(cfg.seq||0)){ cfg.seq=maxN; saveCfg(); }
  setSync('salvo no celular');
  showView(cfg.empresa||levs.length? 'lista' : 'cfg');
  if(!cfg.empresa&&!levs.length) toast('Primeiro, preencha os dados da empresa. Depois é só abrir um levantamento.');
  try{ var ro=JSON.parse(sessionStorage.getItem('lev:reopen')||'null'); sessionStorage.removeItem('lev:reopen'); var upd=sessionStorage.getItem('lev:updated'); sessionStorage.removeItem('lev:updated');
    if(ro&&ro.id){ var l=levs.find(function(x){ return x.id===ro.id; }); if(l){ cur=l; tab=ro.tab||'vis'; showView('lev'); if(ro.view==='item'&&ro.item){ var it=l.itens.find(function(x){ return x.id===ro.item; }); if(it){ curItem=it; showView('item'); } } } }
    if(upd) setTimeout(function(){ toast('App atualizado para a versão nova.'); },400); }catch(e){}
  setTimeout(tsVoltou,700);
  setTimeout(checkUpdate,1500);
})();
window.__lev={get levs(){ return levs; }, get cur(){ return cur; }, cfg:function(){ return cfg; }, exp:function(){ return dadosExport(); }};
})();
