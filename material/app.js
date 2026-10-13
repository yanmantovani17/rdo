(function(){
'use strict';
var APP_VER = 1;   // troque junto com version.json a cada publicação
var $ = function(s, r){ return (r||document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
function h(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function br(iso){ if(!iso) return ''; var p=String(iso).split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function brShort(iso){ if(!iso) return ''; var p=String(iso).split('-'); return p[2]+'/'+p[1]; }
var MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
var MES3=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function mesNome(ym){ var p=String(ym).split('-'); return (MESES[+p[1]-1]||'?')+' '+p[0]; }
function uid(p){ return (p||'')+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function norm(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
var toastTimer; function toast(t,ms){ var el=$('#toast'); el.textContent=t; el.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(function(){ el.hidden=true; },ms||3400); }
function setSync(t){ $('#sync').textContent=t; }

// ---------- números (vírgula decimal) ----------
function num(v){ var n=Number(v); return isFinite(n)?n:0; }
function parseNum(s){ s=String(s==null?'':s).trim().replace(/\s/g,''); if(!s) return null; if(s.indexOf(',')>=0) s=s.replace(/\./g,'').replace(',','.'); var n=Number(s); return isFinite(n)?n:null; }
function inNum(v){ return (v==null||v==='')? '' : String(+(+v).toFixed(6)).replace('.',','); }
function fN(v,d){ if(v==null||v===''||!isFinite(v)) return '—'; return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:d==null?3:d}); }
function fV(v){ return fN(v, Math.abs(v)>=100?1:2); }
function fP(p,sinal){ if(p==null||p===''||!isFinite(p)) return '—'; var s=(p*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}); return (sinal!==false&&p>0.00049?'+':'')+s+'%'; }
function fD(v){ if(v==null||!isFinite(v)) return '—'; return (v>0.0005?'+':'')+fV(v); }

// ---------- modo teste: dados separados, nada vai para a planilha ----------
var TESTE=(function(){ try{ return localStorage.getItem('mat:modo')==='teste'; }catch(e){ return false; } })();
var PFX=TESTE?'matt:':'mat:';
var LS={get:function(k){ try{ var v=localStorage.getItem(PFX+k); return v?JSON.parse(v):null; }catch(e){ return null; } },
        set:function(k,v){ try{ if(v==null) localStorage.removeItem(PFX+k); else localStorage.setItem(PFX+k, JSON.stringify(v)); }catch(e){} }};
var DB=(function(){
  var dbp=null, NOME=TESTE?'mat-teste':'mat-app';
  function open(){ if(!dbp) dbp=new Promise(function(res,rej){ var q=indexedDB.open(NOME,1);
      q.onupgradeneeded=function(){ var d=q.result; if(!d.objectStoreNames.contains('recs')) d.createObjectStore('recs',{keyPath:'id'}); };
      q.onsuccess=function(){ res(q.result); }; q.onerror=function(){ rej(q.error); }; }); return dbp; }
  function tx(mode,fn){ return open().then(function(d){ return new Promise(function(res,rej){ var t=d.transaction('recs',mode); var r=fn(t.objectStore('recs')); t.oncomplete=function(){ res(r&&r.result); }; t.onerror=function(){ rej(t.error); }; t.onabort=function(){ rej(t.error); }; }); }); }
  return {
    all:function(){ return tx('readonly',function(s){ return s.getAll(); }); },
    put:function(r){ return tx('readwrite',function(s){ return s.put(r); }); },
    putMany:function(rs){ return tx('readwrite',function(s){ rs.forEach(function(r){ s.put(r); }); }); },
    del:function(id){ return tx('readwrite',function(s){ return s.delete(id); }); },
    delMany:function(ids){ return tx('readwrite',function(s){ ids.forEach(function(id){ s.delete(id); }); }); }
  };
})();

var DEFAULT_CFG={obra:'', gsUrl:'', ultMat:''};
var cfg=Object.assign({},DEFAULT_CFG);
var MATS={}, ITENS={}, LANCS={};
var view='painel', viewOpts={};
function mapa(k){ return k==='mat'?MATS:(k==='item'?ITENS:LANCS); }
function lista(o){ return Object.keys(o).map(function(k){ return o[k]; }); }
function saveCfg(){ LS.set('cfg',cfg); setTitle(); }
function setTitle(){ document.title=(cfg.obra||'').trim()? 'Material – '+cfg.obra : 'Material'; }
var GS_DEFAULT='';   // endereço /exec do script da planilha MATRIZ_CAJAMAR_MATERIAIS (preenchido na publicação)
function gsUrl(){ return (cfg.gsUrl&&/\/exec/.test(cfg.gsUrl))? cfg.gsUrl : GS_DEFAULT; }
var URL_RE=/^https:\/\/script\.google(usercontent)?\.com\/.+\/exec/;

// ---------- sessão / perfil ----------
function sessao(){ if(TESTE) return {usuario:'teste', nome:'Modo teste', perfil:'Engenharia', teste:true}; return LS.get('sessao'); }
function eng(){ var s=sessao(); return !!s && s.perfil==='Engenharia'; }
function eu(){ var s=sessao(); return s? String(s.usuario).toLowerCase() : ''; }
function podeEditarLanc(l){ return eng() || !l.por || l.por===eu(); }

// ---------- gravação ----------
function salvarRec(r){
  r.atualizado=Date.now(); if(!r.criado) r.criado=r.atualizado;
  var s=sessao(); if(s && !r.por){ r.por=eu(); r.porNome=s.nome; }
  mapa(r.k)[r.id]=r; setSync('salvando…');
  return DB.put(r).then(function(){ setSync(TESTE?'salvo no celular':'salvo no celular'); filaAdd(r.id); })
    .catch(function(e){ console.error(e); setSync('erro ao salvar'); toast('Não consegui salvar. Libere espaço no celular.'); throw e; });
}
function apagarRec(r){ delete mapa(r.k)[r.id]; return DB.del(r.id).then(function(){ filaRem(r); }); }

// ---------- contas (as mesmas do script da planilha) ----------
function qOf(p){ return p.q==null? 1 : num(p.q); }
function prevPeca(p){ var it=p.item&&ITENS[p.item]; return it? num(it.qu)*qOf(p) : num(p.prev); }
function calc(l){
  var prev=0, rec=0, perdaJ=0;
  (l.pecas||[]).forEach(function(p){ prev+=prevPeca(p); });
  (l.ent||[]).forEach(function(e){ rec+=num(e.q); });
  (l.perdas||[]).forEach(function(e){ perdaJ+=num(e.q); });
  var real=rec-num(l.dev);
  return {prev:prev, rec:rec, dev:num(l.dev), real:real, desvio:real-prev, perdaJ:perdaJ,
    pct: prev? real/prev-1 : null, pctSemJ: prev? (real-perdaJ)/prev-1 : null};
}
function stOf(pct, meta){ if(pct==null) return 'na'; return pct > num(meta)/100+1e-9 ? 'pend' : 'ok'; }
function itensDe(matId){ return lista(ITENS).filter(function(it){ return it.mat===matId; }).sort(ordItem); }
function lancsDe(matId){ return lista(LANCS).filter(function(l){ return l.mat===matId; }); }
function cmp(a,b){ return String(a).localeCompare(String(b),'pt-BR',{numeric:true}); }
function ordItem(a,b){ return cmp(a.grupo||'',b.grupo||'') || cmp(a.cod,b.cod); }
function agg(matId){
  var m=MATS[matId]||{}, A={prevProj:0, prev:0, real:0, perdaJ:0, semPeca:0, rec:0, n:0, itens:{}, meses:{}};
  itensDe(matId).forEach(function(it){ A.prevProj+=num(it.qu)*num(it.n); A.itens[it.id]={exec:0, prev:0, real:0}; });
  lancsDe(matId).forEach(function(l){ var c=calc(l); A.n++; A.rec+=c.rec;
    var ym=String(l.data||'').slice(0,7), M=A.meses[ym]=A.meses[ym]||{prev:0, real:0, semPeca:0, n:0}; M.n++;
    if(c.prev>0){ A.prev+=c.prev; A.real+=c.real; A.perdaJ+=c.perdaJ; M.prev+=c.prev; M.real+=c.real; }
    else { A.semPeca+=c.real; M.semPeca+=c.real; }
    (l.pecas||[]).forEach(function(p){ var x=p.item&&A.itens[p.item]; if(!x) return; var pp=prevPeca(p); x.exec+=qOf(p); x.prev+=pp; if(c.prev) x.real+=c.real*pp/c.prev; });
  });
  A.pct= A.prev? A.real/A.prev-1 : null;
  A.pctSemJ= A.prev? (A.real-A.perdaJ)/A.prev-1 : null;
  A.execPct= A.prevProj? A.prev/A.prevProj : null;
  A.saldo=Math.max(0, A.prevProj-A.prev);
  A.proj=A.real+A.semPeca+A.saldo*(1+(A.pct||0));
  A.st=stOf(A.pct, m.meta);
  return A;
}
// peças já lançadas: item+local -> [lançamentos]
function pecasLancadas(exceto){ var o={}; lista(LANCS).forEach(function(l){ if(l.id===exceto) return; (l.pecas||[]).forEach(function(p){ if(!p.item||!p.local) return; var k=p.item+'|'+norm(p.local).trim(); (o[k]=o[k]||[]).push(l); }); }); return o; }

// ---------- telas ----------
var MAIN=['painel','lancs','proj','obra'];
function showView(v, opts){
  if(cfgFormDirty && v!=='obra') saveCfgFromForm(true);
  view=v; viewOpts=opts=opts||{};
  ['painel','mat','lancs','form','proj','medit','obra'].forEach(function(x){ $('#view-'+x).hidden=x!==v; });
  var main=MAIN.indexOf(v)>=0;
  $('#brandMain').hidden=!main; $('#tabs').hidden=!main; $('#brandSub').hidden=main; $('#subGap').hidden=main;
  MAIN.forEach(function(x){ $('#tab-'+x).setAttribute('aria-selected',String(x===v)); });
  var bar=$('#bar'), bb=$('#barBtn'); $('#sumbar').hidden=true; bb.className='btn pri'; bar.hidden=false; bb.hidden=false;
  if(v==='painel'){ renderPainel(); bb.textContent='+ Lançar consumo'; }
  if(v==='mat'){ renderMat(); bb.textContent='+ Lançar consumo'; }
  if(v==='lancs'){ renderLancs(); bb.textContent='+ Lançar consumo'; }
  if(v==='form'){ renderForm(); bb.textContent='Salvar'; bb.className='btn pri fixed'; $('#sumbar').hidden=false; }
  if(v==='proj'){ renderProj(); if(eng()){ bb.textContent='+ Novo material'; } else bb.textContent='+ Lançar consumo'; }
  if(v==='medit'){ renderMedit(); bar.hidden=!(eng() && opts.id && MATS[opts.id]); bb.textContent='+ Item de projeto'; }
  if(v==='obra'){ renderCfg(); bar.hidden=true; }
  if(!opts.keepScroll) window.scrollTo(0,0);
}
function setSub(title, meta){ $('#subTitle').textContent=title; $('#subMeta').textContent=meta||''; }
var pilha=[];
function go(v, opts){ pilha.push({v:view, o:viewOpts}); try{ history.pushState({mat:1},''); }catch(e){} showView(v, opts); }
function voltar(){ var s=pilha.pop(); if(s) showView(s.v, Object.assign({}, s.o, {keepScroll:false})); else showView('painel'); }
function sairSub(){ if(history.state&&history.state.mat) history.back(); else voltar(); }
function rerender(){ if(view==='obra'){ gsShow(); verLine(); return; } if(view==='medit' && (mf || (document.activeElement && document.activeElement.closest && document.activeElement.closest('#view-medit')))) return; if(view==='form' || !$('#itOv').hidden || !$('#pasteOv').hidden || !$('#cfmBack').hidden) return; if(document.querySelector('.swipe.drag')) return; showView(view, Object.assign({}, viewOpts, {keepScroll:true})); }

// ---------- painel ----------
function renderPainel(){
  $('#obraName').innerHTML=h(cfg.obra||'Material')+'<small>Controle de Material</small>';
  var mats=lista(MATS).filter(function(m){ return m.ativo!==false || lancsDe(m.id).length; }).sort(function(a,b){ return cmp(a.nome,b.nome); });
  var el=$('#mcards');
  if(!mats.length){
    el.innerHTML='<div class="empty"><b>Nenhum material cadastrado</b>'+(eng()? 'Comece pela aba Projeto: cadastre o material, a unidade e quanto cada peça deveria levar.' : 'A engenharia ainda não cadastrou o projeto. Toque em Atualizar quando ela avisar.')+'</div>'+
      (eng()? '<button type="button" class="btn pri full" data-goproj>Ir para o Projeto</button>' : '');
    return;
  }
  el.innerHTML=mats.map(function(m){ var A=agg(m.id);
    var semDado=!A.n;
    return '<button type="button" class="mcard '+(semDado?'na':A.st)+'" data-mat="'+m.id+'"><span class="mtop"><span class="grow"><span class="nm">'+h(m.nome)+'</span>'+
      '<span class="sub">'+h(m.un)+' · perda aceitável '+fN(num(m.meta),1)+'% · '+A.n+' lançamento'+(A.n===1?'':'s')+'</span></span>'+
      '<span class="pct '+A.st+'">'+(A.pct==null?'—':fP(A.pct))+'<small>perda</small></span></span>'+
      '<span class="nums"><div><span>Previsto</span><b>'+fV(A.prev)+'</b></div><div><span>Real</span><b>'+fV(A.real)+'</b></div><div><span>Desvio</span><b class="c-'+A.st+'">'+(A.prev?fD(A.real-A.prev):'—')+'</b></div></span>'+
      (A.prevProj? '<span class="prog2"><span class="t"><span>'+fN((A.execPct||0)*100,0)+'% do projeto executado</span><span>'+fV(A.prev)+' de '+fV(A.prevProj)+' '+h(m.un)+'</span></span><span class="b"><i style="width:'+Math.min(100,(A.execPct||0)*100)+'%"></i></span></span>' : '<span class="sub">Sem itens de projeto cadastrados</span>')+
      (A.semPeca>0? '<span class="warnline">'+fV(A.semPeca)+' '+h(m.un)+' lançados sem peça vinculada (fora da conta de perda)</span>' : '')+
      '</button>'; }).join('');
}
$('#mcards').addEventListener('click',function(e){ if(e.target.closest('[data-goproj]')){ showView('proj'); return; } var b=e.target.closest('[data-mat]'); if(b) go('mat',{id:b.dataset.mat}); });

// ---------- detalhe do material ----------
function renderMat(){
  var m=MATS[viewOpts.id]; if(!m){ showView('painel'); return; }
  var A=agg(m.id), un=h(m.un);
  setSub(m.nome, m.un+' · perda aceitável '+fN(num(m.meta),1)+'%');
  var k='<div class="kpis">'+
    '<div class="kpi big '+A.st+'"><span>Perda nas peças executadas</span><b class="c-'+A.st+'">'+(A.pct==null?'—':fP(A.pct))+'</b>'+
      '<em>Aceitável: até '+fN(num(m.meta),1)+'%'+(A.perdaJ? ' · sem as justificadas: '+fP(A.pctSemJ) : '')+'</em></div>'+
    '<div class="kpi"><span>Previsto executado</span><b>'+fV(A.prev)+'</b><em>'+un+'</em></div>'+
    '<div class="kpi"><span>Real usado</span><b>'+fV(A.real)+'</b><em>'+un+(A.rec!==A.real+A.semPeca? ' · recebido '+fV(A.rec) : '')+'</em></div>'+
    '<div class="kpi"><span>Desvio</span><b class="c-'+A.st+'">'+(A.prev?fD(A.real-A.prev):'—')+'</b><em>'+un+'</em></div>'+
    '<div class="kpi"><span>Perdas justificadas</span><b>'+fV(A.perdaJ)+'</b><em>'+un+' (bomba, descarte…)</em></div>'+
    '<div class="kpi"><span>Projeto executado</span><b>'+(A.execPct==null?'—':fN(A.execPct*100,1)+'%')+'</b><em>'+fV(A.prev)+' de '+fV(A.prevProj)+' '+un+'</em></div>'+
    '<div class="kpi"><span>Saldo a executar</span><b>'+fV(A.saldo)+'</b><em>'+un+' previstos</em></div>'+
    '<div class="kpi" style="grid-column:1/-1"><span>Projeção de consumo até o fim</span><b>'+fV(A.proj)+' '+un+'</b><em>Real até hoje + saldo × (1 + perda atual)'+(A.prevProj? ' · projeto: '+fV(A.prevProj)+' '+un : '')+'</em></div>'+
    (A.semPeca>0? '<div class="kpi" style="grid-column:1/-1;border-color:var(--warn)"><span style="color:var(--warn)">Lançado sem peça vinculada</span><b>'+fV(A.semPeca)+' '+un+'</b><em>Não entra na % de perda porque não diz qual peça foi executada. Abra o lançamento e adicione as peças.</em></div>' : '')+
    '</div>';
  // por tipo de peça
  var its=itensDe(m.id), g=null, rows='';
  its.forEach(function(it){ var x=A.itens[it.id]; var pct=x.prev? x.real/x.prev-1 : null, st=stOf(pct,m.meta);
    if(it.grupo!==g){ g=it.grupo; rows+='<tr class="grp"><td colspan="5">'+h(g||'Sem grupo')+'</td></tr>'; }
    rows+='<tr data-it="'+it.id+'"><td><b>'+h(it.cod)+'</b><small>'+fN(it.qu,3)+' '+un+'/peça</small></td><td>'+fN(x.exec,1)+'/'+fN(num(it.n),0)+'</td><td>'+(x.exec?fV(x.prev):'—')+'</td><td>'+(x.exec?fV(x.real):'—')+'</td><td class="c-'+st+'">'+(pct==null?'—':fP(pct))+'</td></tr>'; });
  var t1= its.length? '<h2 class="sec-h">Por tipo de peça</h2><div class="tblwrap"><table class="tbl"><thead><tr><th>Peça</th><th>Feitas</th><th>Previsto</th><th>Real*</th><th>Perda</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<p class="note">*Real rateado: o volume de cada dia é dividido entre as peças do dia na proporção do previsto.</p>' : '<div class="empty"><b>Sem itens de projeto</b>'+(eng()?'Cadastre na aba Projeto.':'A engenharia ainda não cadastrou.')+'</div>';
  // por mês
  var ms=Object.keys(A.meses).sort().reverse();
  var t2= ms.length? '<h2 class="sec-h">Por mês</h2><div class="tblwrap"><table class="tbl"><thead><tr><th>Mês</th><th>Previsto</th><th>Real</th><th>Perda</th>'+(A.semPeca?'<th>Sem peça</th>':'')+'</tr></thead><tbody>'+
    ms.map(function(ym){ var x=A.meses[ym], pct=x.prev? x.real/x.prev-1 : null, st=stOf(pct,m.meta);
      return '<tr><td>'+h(mesNome(ym))+'<small>'+x.n+' lançamento'+(x.n===1?'':'s')+'</small></td><td>'+fV(x.prev)+'</td><td>'+fV(x.real)+'</td><td class="c-'+st+'">'+(pct==null?'—':fP(pct))+'</td>'+(A.semPeca?'<td>'+(x.semPeca?fV(x.semPeca):'—')+'</td>':'')+'</tr>'; }).join('')+'</tbody></table></div>' : '';
  var ult=lancsDe(m.id).sort(ordLanc).slice(0,8);
  var t3='<h2 class="sec-h">Últimos lançamentos</h2>'+(ult.length? '<div class="list">'+ult.map(lancRowHTML).join('')+'</div><button type="button" class="btn full" data-todos>Ver todos os lançamentos de '+h(m.nome)+'</button>' : '<div class="empty"><b>Nada lançado ainda</b>Toque em “+ Lançar consumo”.</div>');
  $('#view-mat').innerHTML=k+t1+t2+t3;
}
$('#view-mat').addEventListener('click',function(e){
  if(e.target.closest('[data-todos]')){ lFiltro=viewOpts.id; go('lancs'); return; }
  var r=e.target.closest('.lrow'); if(r){ abrirLanc(r.dataset.id); return; }
  var t=e.target.closest('tr[data-it]'); if(t && eng()){ abrirItem(ITENS[t.dataset.it]); }
});

// ---------- lista de lançamentos ----------
var lFiltro='', lLimite=120;
function ordLanc(a,b){ return cmp(b.data||'',a.data||'') || (num(b.criado)-num(a.criado)); }
function resumoPecas(l){
  var g={}, ordem=[];
  (l.pecas||[]).forEach(function(p){ var it=p.item&&ITENS[p.item], c=it? it.cod : (p.desc||'Avulso'); if(!g[c]){ g[c]={n:0, locs:[]}; ordem.push(c); } g[c].n+=qOf(p); if(p.local) g[c].locs.push(p.local); });
  return ordem.map(function(c){ var x=g[c]; return c+(x.n!==1?' ×'+fN(x.n,1):'')+(x.locs.length?' ('+x.locs.join(', ')+')':''); }).join(' · ');
}
function enviado(l){ if(TESTE) return true; return fila().indexOf(l.id)<0; }
function lancRowHTML(l){
  var m=MATS[l.mat]||{nome:'(material apagado)',un:''}, c=calc(l), st=c.prev? stOf(c.pct,m.meta) : 'na', p=String(l.data||'').split('-');
  var pc=resumoPecas(l);
  var docs=(l.ent||[]).length;
  return '<button type="button" class="lrow '+st+'" data-id="'+l.id+'"><span class="d"><b>'+(p[2]||'')+'</b>'+(MES3[+p[1]-1]||'')+'</span><span class="grow">'+
    '<span class="tt">'+h(m.nome)+(l.frente?' · <span style="font-weight:500">'+h(l.frente)+'</span>':'')+'</span>'+
    '<span class="pc">'+(pc? h(pc) : '<span style="color:var(--warn)">Sem peça vinculada</span>')+'</span>'+
    '<span class="meta">'+docs+' NF/caminh'+(docs===1?'ão':'ões')+(l.porNome?' · '+h(l.porNome):'')+'</span>'+
    (TESTE?'':'<span class="sent'+(enviado(l)?'':' wait')+'">'+(enviado(l)?'Na planilha':'Aguardando envio')+'</span>')+'</span>'+
    '<span class="r"><b class="c-'+st+'">'+(c.pct==null?'—':fP(c.pct))+'</b><span class="meta">'+(c.prev?fV(c.prev)+' → ':'')+fV(c.real)+' '+h(m.un)+'</span></span></button>';
}
var LIX='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
function renderLancs(){
  var mats=lista(MATS).filter(function(m){ return lancsDe(m.id).length; }).sort(function(a,b){ return cmp(a.nome,b.nome); });
  if(lFiltro && !MATS[lFiltro]) lFiltro='';
  $('#lfil').innerHTML='<button type="button" class="chip" data-f="" aria-pressed="'+(!lFiltro)+'">Todos</button>'+mats.map(function(m){ return '<button type="button" class="chip" data-f="'+m.id+'" aria-pressed="'+(lFiltro===m.id)+'">'+h(m.nome)+'</button>'; }).join('');
  renderLList();
}
function renderLList(){
  var q=norm($('#lq').value).trim();
  var all=lista(LANCS).sort(ordLanc).filter(function(l){
    if(lFiltro && l.mat!==lFiltro) return false; if(!q) return true;
    var m=MATS[l.mat]||{};
    var txt=[m.nome, l.frente, l.forn, l.obs, br(l.data), resumoPecas(l)].concat((l.ent||[]).map(function(e){ return e.doc+' '+e.veic; })).join(' ');
    return norm(txt).indexOf(q)>=0; });
  var el=$('#llist');
  if(!lista(LANCS).length){ el.innerHTML='<div class="empty"><b>Nenhum lançamento ainda</b>Toque em “+ Lançar consumo” e informe as peças executadas e o que chegou.</div>'; return; }
  if(!all.length){ el.innerHTML='<div class="empty"><b>Nada encontrado</b>Mude a busca ou o filtro.</div>'; return; }
  var mes='', out='<div class="hint">Arraste um lançamento para o lado para apagar.</div>';
  all.slice(0,lLimite).forEach(function(l){ var ym=String(l.data||'').slice(0,7); if(ym!==mes){ mes=ym; out+='<div class="mhead">'+h(mesNome(ym))+'</div>'; }
    var row=lancRowHTML(l);
    out+= podeEditarLanc(l)? '<div class="swipe"><button type="button" class="del del-l" data-del="'+l.id+'" tabindex="-1">'+LIX+'Apagar</button><button type="button" class="del del-r" data-del="'+l.id+'" tabindex="-1">'+LIX+'Apagar</button>'+row+'</div>' : row; });
  if(all.length>lLimite) out+='<button type="button" class="btn full" data-mais>Mostrar mais ('+(all.length-lLimite)+')</button>';
  el.innerHTML=out; ligarSwipe(el);
}
$('#lfil').addEventListener('click',function(e){ var b=e.target.closest('.chip'); if(!b) return; lFiltro=b.dataset.f; lLimite=120; renderLancs(); });
$('#lq').addEventListener('input',renderLList);
$('#llist').addEventListener('click',function(e){
  if(e.target.closest('[data-mais]')){ lLimite+=200; renderLList(); return; }
  var d=e.target.closest('[data-del]'); if(d){ var l=LANCS[d.dataset.del]; if(l) apagarLanc(l); return; }
  var b=e.target.closest('.lrow'); if(b) abrirLanc(b.dataset.id); });
function ligarSwipe(host){
  $$('.swipe',host).forEach(function(sw){
    var row=sw.querySelector('.lrow'), x0=0, y0=0, dx=0, ativo=false, horiz=null, aberto=0, arrastou=false;
    function pos(v){ row.style.transform= v? 'translateX('+v+'px)' : ''; }
    function fechar(){ aberto=0; pos(0); }
    row.addEventListener('pointerdown',function(e){ ativo=true; horiz=null; x0=e.clientX; y0=e.clientY; dx=0; });
    row.addEventListener('pointermove',function(e){ if(!ativo) return; var mx=e.clientX-x0, my=e.clientY-y0;
      if(horiz===null){ if(Math.abs(mx)<8&&Math.abs(my)<8) return; horiz=Math.abs(mx)>Math.abs(my); if(horiz){ sw.classList.add('drag'); try{ row.setPointerCapture(e.pointerId); }catch(x){} } }
      if(!horiz) return; e.preventDefault(); dx=Math.max(-140,Math.min(140,aberto+mx)); pos(dx); });
    function soltar(){ if(!ativo) return; ativo=false; sw.classList.remove('drag'); if(!horiz) return; arrastou=true; setTimeout(function(){ arrastou=false; },350);
      if(dx>60){ aberto=104; pos(104); } else if(dx<-60){ aberto=-104; pos(-104); } else fechar();
      $$('.swipe',host).forEach(function(o){ if(o!==sw){ o.querySelector('.lrow').style.transform=''; } }); }
    row.addEventListener('pointerup',soltar); row.addEventListener('pointercancel',soltar);
    row.addEventListener('click',function(e){ if(arrastou){ e.stopPropagation(); e.preventDefault(); arrastou=false; return; } if(aberto){ e.stopPropagation(); e.preventDefault(); fechar(); } },true);
  });
}
function apagarLanc(l){
  if(!podeEditarLanc(l)){ toast('Esse lançamento é de '+(l.porNome||'outra pessoa')+'. Só ela ou a engenharia podem apagar.'); return; }
  var m=MATS[l.mat]||{nome:''}, c=calc(l);
  confirmar('Apagar o lançamento de '+br(l.data)+'?', m.nome+': '+(resumoPecas(l)||'sem peças')+' · '+fV(c.real)+' '+(m.un||'')+'. Sai também da planilha do Google. Não dá para desfazer.', 'Apagar', function(){
    apagarRec(l).then(function(){ toast('Lançamento apagado.'); if(view==='form'){ fd=null; LS.set('rascunho',null); sairSub(); } else rerender(); });
  }, true);
}

// ---------- lançamento (formulário) ----------
var fd=null, fdBase='', fdNovo=false;
var MOTIVOS=['Bomba / escorvamento','Sobra no caminhão (descartada)','Descarte / contaminado','Corpo de prova','Vazamento de forma','Outro'];
function novoLanc(matId){
  var mats=matsAtivos(); matId=matId||(MATS[cfg.ultMat]&&MATS[cfg.ultMat].ativo!==false?cfg.ultMat:'')||(mats[0]&&mats[0].id)||'';
  var ult=lancsDe(matId).sort(ordLanc)[0];
  return {k:'lanc', id:uid('l'), data:todayISO(), mat:matId, frente:ult?ult.frente||'':'', forn:ult?ult.forn||'':'', pecas:[], ent:[{doc:'',veic:'',q:null}], dev:null, perdas:[], obs:''};
}
function matsAtivos(){ return lista(MATS).filter(function(m){ return m.ativo!==false; }).sort(function(a,b){ return cmp(a.nome,b.nome); }); }
function abrirLanc(id){ var l=LANCS[id]; if(!l) return; fd=clone(l); fdNovo=false; fdBase=JSON.stringify(fd); go('form'); }
function lancar(matId){
  if(!matsAtivos().length){ toast(eng()? 'Cadastre primeiro um material na aba Projeto.' : 'A engenharia ainda não cadastrou os materiais. Toque em Atualizar.'); if(eng()) showView('proj'); return; }
  fd=novoLanc(matId); fdNovo=true; fdBase=JSON.stringify(fd); go('form');
}
function fdSujo(){ return fd && JSON.stringify(fd)!==fdBase; }
function rascunho(){ if(!fd) return; if(fdSujo()) LS.set('rascunho',{fd:fd, novo:fdNovo, base:fdBase, em:Date.now()}); else LS.set('rascunho',null); }
function unMat(){ var m=MATS[fd&&fd.mat]; return m? m.un : ''; }
function renderForm(){
  if(!fd){ showView('painel'); return; }
  var ro=!fdNovo && !podeEditarLanc(LANCS[fd.id]||fd);
  setSub(fdNovo? 'Novo lançamento' : 'Lançamento de '+br(fd.data), fdNovo? 'Previsto × real' : (ro? 'Somente leitura · lançado por '+(fd.porNome||'outra pessoa') : (fd.porNome? 'Lançado por '+fd.porNome : '')));
  $('#fData').value=fd.data||'';
  var mats=matsAtivos(); if(fd.mat && MATS[fd.mat] && mats.indexOf(MATS[fd.mat])<0) mats.push(MATS[fd.mat]);
  $('#fMat').innerHTML=mats.map(function(m){ return '<option value="'+m.id+'"'+(m.id===fd.mat?' selected':'')+'>'+h(m.nome)+' ('+h(m.un)+')</option>'; }).join('');
  $('#fFrente').value=fd.frente||''; $('#fForn').value=fd.forn||'';
  var fr={}, fo={}; lista(LANCS).forEach(function(l){ if(l.frente) fr[l.frente]=1; if(l.forn) fo[l.forn]=1; });
  $('#dlFrente').innerHTML=Object.keys(fr).sort().map(function(x){ return '<option value="'+h(x)+'">'; }).join('');
  $('#dlForn').innerHTML=Object.keys(fo).sort().map(function(x){ return '<option value="'+h(x)+'">'; }).join('');
  $('#fDev').value=inNum(fd.dev); $('#fObs').value=fd.obs||'';
  $('#fLocais').value=''; $('#fQtdPeca').value='1';
  $('#fAvulso').hidden=true;
  renderItemSel(); renderPecas(); renderEnts(); renderPerdas(); unLabels();
  $('#fWho').textContent= (!fdNovo && fd.atualizado)? 'Última alteração: '+new Date(fd.atualizado).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+(fd.editadoPor?' por '+fd.editadoPor:'')+(TESTE?'':(enviado(fd)?' · na planilha':' · aguardando envio')) : '';
  $('#fDel').hidden=fdNovo||ro;
  $$('#view-form input, #view-form select, #view-form textarea, #view-form .btn, #view-form .linkbtn, #view-form .xbtn').forEach(function(x){ if(x.id!=='fDel') x.disabled=ro; });
  $('#barBtn').hidden=ro;
  atualizaTotais();
}
function unLabels(){ $$('.unl').forEach(function(x){ x.textContent=unMat()||'un'; }); }
function renderItemSel(){
  var its=itensDe(fd.mat), sel=$('#fItem'), box=$('#fAddPeca'), nota=$('#fSemItens');
  box.hidden=!its.length; nota.hidden=!!its.length;
  if(!its.length){ nota.textContent='Este material ainda não tem itens de projeto. '+(eng()?'Cadastre na aba Projeto, ou ':'Peça à engenharia para cadastrar, ou ')+'use o serviço avulso abaixo.'; return; }
  var A=agg(fd.mat), g=null, ultimo=sel.value, html='';
  its.forEach(function(it){ if(it.grupo!==g){ if(g!==null) html+='</optgroup>'; g=it.grupo; html+='<optgroup label="'+h(g||'Sem grupo')+'">'; }
    var x=A.itens[it.id]; html+='<option value="'+it.id+'">'+h(it.cod)+' – '+fN(it.qu,3)+' '+h(unMat())+' · '+fN(x.exec,1)+'/'+fN(num(it.n),0)+' feitas</option>'; });
  html+='</optgroup>';
  sel.innerHTML='<option value="">Escolha a peça…</option>'+html;
  if(ultimo && ITENS[ultimo] && ITENS[ultimo].mat===fd.mat) sel.value=ultimo;
}
function renderPecas(){
  var un=h(unMat()), feitas=pecasLancadas(fd.id), vistos={};
  $('#fPecas').innerHTML=(fd.pecas||[]).length? fd.pecas.map(function(p,i){ var it=p.item&&ITENS[p.item];
    var k=p.item&&p.local? p.item+'|'+norm(p.local).trim() : null, dup=k&&feitas[k], rep=k&&vistos[k]; if(k) vistos[k]=1;
    var cod=it? it.cod : (p.desc||'Avulso');
    return '<div class="pc-row"><span><span class="cod">'+h(cod)+'</span>'+h(p.local||'(sem local)')+(qOf(p)!==1?' <span class="meta">×'+fN(qOf(p),2)+'</span>':'')+(it||p.item? '' : ' <span class="meta">avulso</span>')+'</span>'+
      '<span class="v">'+fV(prevPeca(p))+' '+un+'</span><button type="button" class="xbtn" data-rmpc="'+i+'" aria-label="Remover peça">×</button>'+
      (p.item&&!it? '<span class="w">Item de projeto apagado: esta peça não entra no previsto.</span>' : '')+
      (dup? '<span class="w">Já lançada em '+dup.map(function(l){ return br(l.data); }).join(', ')+'. Confira se não é repetição.</span>' : '')+
      (rep? '<span class="w">Repetida neste lançamento.</span>' : '')+'</div>'; }).join('')
    : '<p class="note">Nenhuma peça ainda. Escolha o tipo, escreva o local e toque em “Adicionar peça”.</p>';
}
function renderEnts(){
  $('#fEnts').innerHTML=(fd.ent||[]).map(function(e,i){
    return '<div class="en-row"><input type="text" data-en="'+i+'" data-f="doc" value="'+h(e.doc||'')+'" placeholder="NF" inputmode="numeric" aria-label="Nota fiscal">'+
      '<input type="text" data-en="'+i+'" data-f="veic" value="'+h(e.veic||'')+'" placeholder="BT" aria-label="Caminhão">'+
      '<input type="text" class="num" data-en="'+i+'" data-f="q" value="'+inNum(e.q)+'" inputmode="decimal" placeholder="0" aria-label="Quantidade">'+
      '<button type="button" class="xbtn" data-rmen="'+i+'" aria-label="Remover">×</button></div>'; }).join('');
}
function renderPerdas(){
  $('#fPerdas').innerHTML=(fd.perdas||[]).map(function(p,i){
    return '<div class="pj-row"><select data-pj="'+i+'" data-f="mot" aria-label="Motivo">'+MOTIVOS.map(function(m){ return '<option'+(m===p.mot?' selected':'')+'>'+h(m)+'</option>'; }).join('')+'</select>'+
      '<input type="text" class="num" data-pj="'+i+'" data-f="q" value="'+inNum(p.q)+'" inputmode="decimal" placeholder="0" aria-label="Quantidade">'+
      '<button type="button" class="xbtn" data-rmpj="'+i+'" aria-label="Remover">×</button></div>'; }).join('');
}
function atualizaTotais(){
  var c=calc(fd), m=MATS[fd.mat]||{}, un=unMat(), st=c.prev? stOf(c.pct,m.meta) : 'na';
  $('#fPrevTot').textContent=fV(c.prev)+' '+un;
  $('#fRecTot').textContent=fV(c.rec)+' '+un+(c.dev? ' · real '+fV(c.real) : '');
  $('#sumbar').innerHTML='<div><span>Previsto</span><b>'+fV(c.prev)+'</b></div><div><span>Real</span><b>'+fV(c.real)+'</b></div><div><span>Perda</span><b class="c-'+st+'">'+(c.pct==null?'—':fP(c.pct))+'</b></div>';
  rascunho();
}
$('#fData').addEventListener('change',function(){ fd.data=this.value; atualizaTotais(); });
$('#fMat').addEventListener('change',function(){ var novo=this.value, comItem=(fd.pecas||[]).filter(function(p){ return p.item; }).length;
  fd.mat=novo; cfg.ultMat=novo; saveCfg();
  if(comItem){ fd.pecas=fd.pecas.filter(function(p){ return !p.item; }); toast('As peças do outro material foram retiradas.'); }
  renderItemSel(); renderPecas(); unLabels(); atualizaTotais(); });
$('#fFrente').addEventListener('input',function(){ fd.frente=this.value.trim(); rascunho(); });
$('#fForn').addEventListener('input',function(){ fd.forn=this.value.trim(); rascunho(); });
$('#fDev').addEventListener('input',function(){ fd.dev=parseNum(this.value); atualizaTotais(); });
$('#fObs').addEventListener('input',function(){ fd.obs=this.value; rascunho(); });
$('#view-form').addEventListener('click',function(e){
  var t;
  if(e.target.id==='fAddPecaBtn'){ addPecas(); return; }
  if((t=e.target.closest('[data-rmpc]'))){ fd.pecas.splice(+t.dataset.rmpc,1); renderPecas(); atualizaTotais(); return; }
  if((t=e.target.closest('[data-rmen]'))){ fd.ent.splice(+t.dataset.rmen,1); renderEnts(); atualizaTotais(); return; }
  if((t=e.target.closest('[data-rmpj]'))){ fd.perdas.splice(+t.dataset.rmpj,1); renderPerdas(); atualizaTotais(); return; }
  if(e.target.id==='fAddEnt'){ var u=fd.ent[fd.ent.length-1]; fd.ent.push({doc:'', veic:'', q: u&&u.q!=null? u.q : null}); renderEnts(); atualizaTotais(); var ins=$$('#fEnts input[data-f="doc"]'); if(ins.length) ins[ins.length-1].focus(); return; }
  if(e.target.id==='fAddPerda'){ fd.perdas=fd.perdas||[]; fd.perdas.push({mot:MOTIVOS[0], q:null}); renderPerdas(); atualizaTotais(); return; }
  if(e.target.id==='fAvulsoTgl'){ var a=$('#fAvulso'); a.hidden=!a.hidden; if(!a.hidden) $('#fAvDesc').focus(); return; }
  if(e.target.id==='fAvAdd'){ var d=$('#fAvDesc').value.trim(), pv=parseNum($('#fAvPrev').value);
    if(!d||pv==null){ toast('Escreva a descrição e quanto estava previsto.'); return; }
    fd.pecas.push({desc:d, local:$('#fAvLocal').value.trim(), prev:pv, q:1}); $('#fAvDesc').value=''; $('#fAvLocal').value=''; $('#fAvPrev').value=''; $('#fAvulso').hidden=true;
    renderPecas(); atualizaTotais(); return; }
  if(e.target.id==='fDel'){ var l=LANCS[fd.id]; if(l) apagarLanc(l); return; }
});
$('#view-form').addEventListener('input',function(e){ var t=e.target, i;
  if(t.dataset.en!=null){ i=+t.dataset.en; var en=fd.ent[i]; if(!en) return; if(t.dataset.f==='q') en.q=parseNum(t.value); else en[t.dataset.f]=t.value.trim(); atualizaTotais(); }
  if(t.dataset.pj!=null){ i=+t.dataset.pj; var pj=fd.perdas[i]; if(!pj) return; if(t.dataset.f==='q') pj.q=parseNum(t.value); else pj.mot=t.value; atualizaTotais(); }
});
$('#view-form').addEventListener('change',function(e){ var t=e.target; if(t.dataset.pj!=null && t.dataset.f==='mot'){ fd.perdas[+t.dataset.pj].mot=t.value; rascunho(); } });
function addPecas(){
  var id=$('#fItem').value; if(!id){ toast('Escolha o tipo de peça.'); $('#fItem').focus(); return; }
  var locs=$('#fLocais').value.split(/\n|;/).map(function(s){ return s.trim(); }).filter(Boolean), q=parseNum($('#fQtdPeca').value); if(q==null||q<=0) q=1;
  if(!locs.length) locs=[''];
  locs.forEach(function(lc){ fd.pecas.push({item:id, local:lc, q:q}); });
  $('#fLocais').value=''; $('#fQtdPeca').value='1';
  renderPecas(); atualizaTotais(); toast(locs.length>1? locs.length+' peças adicionadas.' : 'Peça adicionada.',1800);
}
async function salvarLanc(){
  if(!fd) return;
  // peça digitada mas não adicionada
  if($('#fLocais').value.trim() && $('#fItem').value){ addPecas(); }
  fd.ent=(fd.ent||[]).filter(function(e){ return e.doc||e.veic||e.q!=null; });
  fd.perdas=(fd.perdas||[]).filter(function(p){ return p.q!=null && p.q!==0; });
  if(!fd.data){ toast('Informe a data.'); return; }
  if(!fd.mat||!MATS[fd.mat]){ toast('Escolha o material.'); return; }
  var semQ=fd.ent.filter(function(e){ return e.q==null; });
  if(semQ.length){ toast('Falta a quantidade em '+semQ.length+' linha'+(semQ.length>1?'s':'')+' de NF/caminhão.'); if(!fd.ent.length) fd.ent.push({doc:'',veic:'',q:null}); renderEnts(); return; }
  if(!fd.pecas.length && !fd.ent.length){ toast('Adicione as peças executadas e/ou o que chegou.'); if(!fd.ent.length){ fd.ent.push({doc:'',veic:'',q:null}); renderEnts(); } return; }
  var faz=async function(){
    var b=$('#barBtn'); b.disabled=true;
    try{ var r=clone(fd); await salvarRec(r); cfg.ultMat=r.mat; saveCfg(); LS.set('rascunho',null); fd=null;
      var c=calc(r), m=MATS[r.mat];
      toast('Lançamento salvo'+(c.prev? ': perda '+fP(c.pct)+' ('+fD(c.desvio)+' '+m.un+')' : '')+(TESTE?'.':(navigator.onLine?'. Enviando para a planilha…':'. Vai para a planilha quando tiver internet.')), 4200);
      sairSub();
    }catch(e){} finally{ b.disabled=false; }
  };
  if(!fd.pecas.length){ confirmar('Salvar sem peças?', 'Sem as peças executadas, o app não sabe quanto estava previsto e esse consumo fica fora da % de perda. Dá para voltar e adicionar depois.', 'Salvar assim', faz); return; }
  if(!fd.ent.length){ confirmar('Salvar sem quantidade real?', 'Nenhuma NF ou caminhão lançado. As peças entram no previsto com consumo zero até você completar.', 'Salvar assim', faz); return; }
  faz();
}

// ---------- projeto ----------
function renderProj(){
  $('#projRO').hidden=eng();
  var mats=lista(MATS).sort(function(a,b){ return (a.ativo===false)-(b.ativo===false) || cmp(a.nome,b.nome); });
  $('#projSeed').hidden=!(!mats.length && eng());
  $('#plist').innerHTML=mats.length? mats.map(function(m){ var its=itensDe(m.id), tot=its.reduce(function(s,it){ return s+num(it.qu)*num(it.n); },0);
    return '<button type="button" class="it-card" data-m="'+m.id+'"'+(m.ativo===false?' style="opacity:.6"':'')+'><span class="code">'+h(m.un)+'</span><span class="grow"><span class="tt">'+h(m.nome)+(m.ativo===false?' (inativo)':'')+'</span>'+
      '<span class="meta">'+its.length+' ite'+(its.length===1?'m':'ns')+' de projeto · perda aceitável '+fN(num(m.meta),1)+'%'+(m.cat?' · '+h(m.cat):'')+'</span></span><span class="q">'+fV(tot)+'<br><span class="meta">'+h(m.un)+'</span></span></button>'; }).join('')
    : '<div class="empty"><b>Nenhum material</b>'+(eng()? 'Toque em “+ Novo material”. Exemplos: concreto (m³), aço (kg), forma (m²), bloco (un), argamassa (saco).' : 'A engenharia ainda não cadastrou o projeto.')+'</div>';
}
$('#plist').addEventListener('click',function(e){ var b=e.target.closest('[data-m]'); if(b) go('medit',{id:b.dataset.m}); });
var CATALOGO=[
  ['Concreto usinado','m³','Concreto',3],['Concreto magro','m³','Concreto',10],['Graute','m³','Concreto',5],['Aço CA-50','kg','Aço',5],['Aço CA-60','kg','Aço',5],['Tela soldada','kg','Aço',5],
  ['Forma de madeira','m²','Forma',10],['Bloco de concreto','un','Alvenaria',3],['Argamassa','sc','Alvenaria',10],['Cimento','sc','Agregados',5],['Areia','m³','Agregados',10],['Brita','m³','Agregados',10],
  ['CBUQ (asfalto)','t','Pavimentação',3],['Brita graduada','m³','Pavimentação',5],['Tubo de concreto','m','Drenagem',2],['Tubo PEAD','m','Drenagem',3]];
var UNIDADES=['m³','m²','m','kg','t','un','sc','L','vb'];
var mf=null;
function renderMedit(){
  var novo=!viewOpts.id || !MATS[viewOpts.id], m=novo? (mf&&!mf.id?mf:{nome:'',un:'m³',cat:'',meta:5,ativo:true}) : MATS[viewOpts.id], pode=eng();
  mf=novo? m : null;
  setSub(novo? 'Novo material' : m.nome, novo? 'Cadastro' : m.un+' · '+itensDe(m.id).length+' itens de projeto');
  var html='';
  if(novo) html+='<p class="note">Escolha um dos comuns ou escreva o seu:</p><div class="chips">'+CATALOGO.map(function(c,i){ return '<button type="button" class="chip" data-cat="'+i+'">'+h(c[0])+' ('+h(c[1])+')</button>'; }).join('')+'</div>';
  html+='<div class="card pad">'+
    '<label class="field"><span class="lbl">Material</span><input type="text" id="mNome" value="'+h(m.nome)+'" placeholder="Ex.: Concreto FCK 30 bombeável"'+(pode?'':' disabled')+'></label>'+
    '<div class="field"><span class="lbl">Unidade</span><div class="chips" id="mUns">'+UNIDADES.map(function(u){ return '<button type="button" class="chip" data-un="'+h(u)+'" aria-pressed="'+(m.un===u)+'"'+(pode?'':' disabled')+'>'+h(u)+'</button>'; }).join('')+'</div>'+
      '<input type="text" id="mUn" value="'+h(m.un)+'" placeholder="Outra unidade" style="max-width:12em"'+(pode?'':' disabled')+'></div>'+
    '<div class="grid2"><label class="field"><span class="lbl">Categoria</span><input type="text" id="mCat" value="'+h(m.cat||'')+'" placeholder="Ex.: Concreto"'+(pode?'':' disabled')+'></label>'+
      '<label class="field"><span class="lbl">Perda aceitável (%)</span><input type="text" class="num" inputmode="decimal" id="mMeta" value="'+inNum(m.meta)+'"'+(pode?'':' disabled')+'></label></div>'+
    (novo? '' : '<div class="field"><span class="lbl">Situação</span><div class="seg2" id="mAtivo"><button type="button" data-v="1" aria-pressed="'+(m.ativo!==false)+'"'+(pode?'':' disabled')+'>Ativo</button><button type="button" data-v="0" aria-pressed="'+(m.ativo===false)+'"'+(pode?'':' disabled')+'>Inativo (some do lançamento)</button></div></div>')+
    (pode? '<button type="button" class="btn dark full" id="mSalvar">'+(novo?'Criar material':'Salvar material')+'</button>' : '')+
    '</div>';
  if(!novo){
    var its=itensDe(m.id), A=agg(m.id), g=null, un=h(m.un), tot=0;
    html+='<h2 class="sec-h">Itens de projeto</h2>';
    if(pode) html+='<div class="row"><button type="button" class="btn grow" id="mNovoItem">+ Item</button><button type="button" class="btn grow" id="mColar">Colar do Excel</button></div>';
    html+= its.length? '<div class="list">'+its.map(function(it){ var x=A.itens[it.id], t=num(it.qu)*num(it.n); tot+=t; var s='';
      if(it.grupo!==g){ g=it.grupo; s+='<div class="mhead">'+h(g||'Sem grupo')+'</div>'; }
      return s+'<button type="button" class="it-card" data-item="'+it.id+'"><span class="code">'+h(it.cod)+'</span><span class="grow"><span class="tt">'+h(it.desc||it.cod)+'</span>'+
        '<span class="meta">'+fN(num(it.n),0)+' peças × '+fN(it.qu,3)+' '+un+(it.dims?' ('+fN(it.dims.c,2)+'×'+fN(it.dims.l,2)+'×'+fN(it.dims.h,3)+')':'')+' · '+fN(x.exec,1)+' executadas</span></span><span class="q">'+fV(t)+'</span></button>'; }).join('')+'</div>'+
      '<div class="tot"><span>Total previsto no projeto</span><b>'+fV(tot)+' '+un+'</b></div>'
      : '<div class="empty"><b>Sem itens</b>'+(pode?'Toque em “+ Item” ou cole a tabela do Excel (código, nº de peças, quantidade por peça).':'A engenharia ainda não cadastrou.')+'</div>';
    if(pode) html+='<button type="button" class="btn danger full" id="mDel">Apagar material</button>';
  }
  $('#view-medit').innerHTML=html;
}
function lerMf(){ var m=mf || clone(MATS[viewOpts.id]); m.nome=$('#mNome').value.trim(); m.un=$('#mUn').value.trim(); m.cat=$('#mCat').value.trim(); var mt=parseNum($('#mMeta').value); m.meta=mt==null?0:mt; return m; }
$('#view-medit').addEventListener('click',function(e){
  var t;
  if((t=e.target.closest('[data-cat]'))){ var c=CATALOGO[+t.dataset.cat]; $('#mNome').value=c[0]; $('#mUn').value=c[1]; $('#mCat').value=c[2]; $('#mMeta').value=inNum(c[3]); $$('#mUns .chip').forEach(function(x){ x.setAttribute('aria-pressed',String(x.dataset.un===c[1])); }); return; }
  if((t=e.target.closest('[data-un]'))){ $('#mUn').value=t.dataset.un; $$('#mUns .chip').forEach(function(x){ x.setAttribute('aria-pressed',String(x===t)); }); return; }
  if((t=e.target.closest('#mAtivo button'))){ if(!eng()) return; $$('#mAtivo button').forEach(function(x){ x.setAttribute('aria-pressed',String(x===t)); }); return; }
  if(e.target.id==='mSalvar'){
    var m=lerMf(); if(!m.nome){ toast('Escreva o nome do material.'); return; } if(!m.un){ toast('Escolha a unidade.'); return; }
    var dup=lista(MATS).filter(function(x){ return x.id!==m.id && norm(x.nome)===norm(m.nome); })[0]; if(dup){ toast('Já existe um material com esse nome.'); return; }
    var at=$('#mAtivo button[aria-pressed="true"]'); if(at) m.ativo=at.dataset.v==='1';
    var novo=!m.id; if(novo){ m.k='mat'; m.id=uid('m'); m.ativo=true; }
    salvarRec(m).then(function(){ mf=null; toast(novo? 'Material criado. Agora cadastre os itens de projeto.' : 'Material salvo.'); viewOpts.id=m.id; showView('medit',{id:m.id}); });
    return; }
  if(e.target.id==='mNovoItem'){ abrirItem({k:'item', mat:viewOpts.id, grupo:ultimoGrupo(viewOpts.id), cod:'', desc:'', n:null, qu:null}); return; }
  if(e.target.id==='mColar'){ abrirColar(); return; }
  if(e.target.id==='mDel'){ var mm=MATS[viewOpts.id], nl=lancsDe(mm.id).length;
    if(nl){ toast('Esse material tem '+nl+' lançamentos. Apague os lançamentos antes, ou marque como Inativo.',5000); return; }
    confirmar('Apagar '+mm.nome+'?','Apaga o material e os '+itensDe(mm.id).length+' itens de projeto dele, aqui e na planilha.','Apagar',async function(){
      for(var it of itensDe(mm.id)) await apagarRec(it); await apagarRec(mm); toast('Material apagado.'); sairSub(); },true); return; }
  if((t=e.target.closest('[data-item]'))){ if(eng()) abrirItem(ITENS[t.dataset.item]); return; }
});
function ultimoGrupo(matId){ var its=itensDe(matId).sort(function(a,b){ return num(b.atualizado)-num(a.atualizado); }); return its[0]? its[0].grupo||'' : ''; }

// editor de item
var itEd=null;
function grupos(matId){ var g={}; itensDe(matId).forEach(function(it){ if(it.grupo) g[it.grupo]=1; }); return Object.keys(g).sort(cmp); }
function abrirItem(it){
  if(!it||!eng()) return; itEd=clone(it);
  $('#itTit').textContent=it.id? 'Item '+it.cod : 'Novo item de projeto';
  $('#itCod').value=it.cod||''; $('#itGrupo').value=it.grupo||''; $('#itDesc').value=it.desc||''; $('#itN').value=inNum(it.n); $('#itQu').value=inNum(it.qu);
  $('#dlGrupo').innerHTML=grupos(it.mat).map(function(g){ return '<option value="'+h(g)+'">'; }).join('');
  var d=it.dims||{}; $('#itC').value=inNum(d.c); $('#itL').value=inNum(d.l); $('#itH').value=inNum(d.h); $('#itCalc').hidden=!it.dims;
  $('#itDel').hidden=!it.id; unLabelsIt(it.mat); itTot(); $('#itOv').hidden=false; setTimeout(function(){ (it.id? $('#itN') : $('#itCod')).focus(); },60);
}
function unLabelsIt(matId){ var m=MATS[matId]; $$('#itOv .unl').forEach(function(x){ x.textContent=m?m.un:''; }); }
function itTot(){ var n=parseNum($('#itN').value), q=parseNum($('#itQu').value), m=MATS[itEd&&itEd.mat]; $('#itTot').textContent=(n!=null&&q!=null)? fV(n*q)+' '+(m?m.un:'') : '—'; }
['#itN','#itQu'].forEach(function(s){ $(s).addEventListener('input',itTot); });
['#itC','#itL','#itH'].forEach(function(s){ $(s).addEventListener('input',function(){ var c=parseNum($('#itC').value), l=parseNum($('#itL').value), hh=parseNum($('#itH').value);
  if(c!=null&&l!=null&&hh!=null){ $('#itQu').value=inNum(+(c*l*hh).toFixed(4)); itTot(); } }); });
$('#itCalcTgl').addEventListener('click',function(){ $('#itCalc').hidden=!$('#itCalc').hidden; });
$('#itCancel').addEventListener('click',function(){ $('#itOv').hidden=true; itEd=null; });
$('#itOk').addEventListener('click',function(){
  var it=itEd; it.cod=$('#itCod').value.trim(); it.grupo=$('#itGrupo').value.trim(); it.desc=$('#itDesc').value.trim();
  it.n=parseNum($('#itN').value); it.qu=parseNum($('#itQu').value);
  if(!it.cod){ toast('Escreva o código da peça.'); return; } if(it.qu==null||it.qu<=0){ toast('Informe quanto cada peça leva.'); return; } if(it.n==null||it.n<0){ toast('Informe o nº de peças do projeto.'); return; }
  var c=parseNum($('#itC').value), l=parseNum($('#itL').value), hh=parseNum($('#itH').value);
  if(!$('#itCalc').hidden && c!=null&&l!=null&&hh!=null && Math.abs(c*l*hh-it.qu)<1e-6) it.dims={c:c,l:l,h:hh}; else delete it.dims;
  var dup=itensDe(it.mat).filter(function(x){ return x.id!==it.id && norm(x.cod)===norm(it.cod) && norm(x.grupo)===norm(it.grupo); })[0];
  if(dup){ toast('Já existe o código '+it.cod+' neste grupo.'); return; }
  if(!it.id) it.id=uid('i');
  salvarRec(it).then(function(){ $('#itOv').hidden=true; itEd=null; toast('Item '+it.cod+' salvo.',1800); rerender(); });
});
$('#itDel').addEventListener('click',function(){
  var it=ITENS[itEd&&itEd.id]; if(!it) return; var usos=lista(LANCS).filter(function(l){ return (l.pecas||[]).some(function(p){ return p.item===it.id; }); }).length;
  if(usos){ toast('O item '+it.cod+' está em '+usos+' lançamento'+(usos>1?'s':'')+'. Retire as peças desses lançamentos antes de apagar.',5000); return; }
  $('#itOv').hidden=true; confirmar('Apagar o item '+it.cod+'?','Sai do projeto aqui e na planilha.','Apagar',function(){ apagarRec(it).then(function(){ toast('Item apagado.'); rerender(); }); },true);
});

// colar do Excel
var psLinhas=[];
function abrirColar(){ $('#psTxt').value=''; $('#psGrupo').value=ultimoGrupo(viewOpts.id); $('#dlGrupo').innerHTML=grupos(viewOpts.id).map(function(g){ return '<option value="'+h(g)+'">'; }).join(''); psLer(); $('#pasteOv').hidden=false; setTimeout(function(){ $('#psTxt').focus(); },60); }
function psLer(){
  var m=MATS[viewOpts.id]; psLinhas=[]; var ign=0;
  $('#psTxt').value.split(/\r?\n/).forEach(function(l){ if(!l.trim()) return; var c=l.split(/\t|;/).map(function(s){ return s.trim(); });
    var n=parseNum(c[1]), q=parseNum(c[2]); if(!c[0]||n==null||q==null||q<=0){ ign++; return; } psLinhas.push({cod:c[0], n:n, qu:q, desc:c[3]||''}); });
  var ex=itensDe(viewOpts.id), g=$('#psGrupo').value.trim();
  $('#psPrev').textContent= psLinhas.length? psLinhas.map(function(x){ var ja=ex.some(function(it){ return norm(it.cod)===norm(x.cod) && norm(it.grupo)===norm(g); });
    return (ja?'atualiza ':'novo     ')+x.cod+'  '+fN(x.n,0)+' × '+fN(x.qu,3)+' = '+fV(x.n*x.qu)+' '+(m?m.un:''); }).join('\n')+(ign?'\n('+ign+' linha'+(ign>1?'s':'')+' ignorada'+(ign>1?'s':'')+': sem código ou números)':'') : (ign? 'Nenhuma linha válida. Precisa de 3 colunas: código, nº de peças, quantidade por peça.' : 'Nada colado ainda.');
  $('#psOk').disabled=!psLinhas.length; $('#psOk').textContent=psLinhas.length? 'Importar '+psLinhas.length+' ite'+(psLinhas.length===1?'m':'ns') : 'Importar';
}
$('#psTxt').addEventListener('input',psLer); $('#psGrupo').addEventListener('input',psLer);
$('#psCancel').addEventListener('click',function(){ $('#pasteOv').hidden=true; });
$('#psOk').addEventListener('click',async function(){
  var g=$('#psGrupo').value.trim(), ex=itensDe(viewOpts.id), n=0, b=this; b.disabled=true;
  for(var x of psLinhas){ var it=ex.filter(function(i){ return norm(i.cod)===norm(x.cod) && norm(i.grupo)===norm(g); })[0];
    it= it? clone(it) : {k:'item', id:uid('i'), mat:viewOpts.id, grupo:g, cod:x.cod};
    it.n=x.n; it.qu=x.qu; if(x.desc) it.desc=x.desc; await salvarRec(it); n++; }
  $('#pasteOv').hidden=true; b.disabled=false; toast(n+' itens importados.'); rerender();
});

// carga da planilha de perda de concreto
$('#seedBtn').addEventListener('click',async function(){
  var b=this; b.disabled=true; b.textContent='Carregando…';
  try{ if(!window.MAT_CARGA) await loadScript('carga.js'); var C=window.MAT_CARGA, agora=Date.now(), s=sessao(), todos=[];
    ['materiais','itens','lancamentos'].forEach(function(k){ (C[k]||[]).forEach(function(r){ r=clone(r); r.atualizado=agora; r.criado=r.criado||agora; if(r.k==='lanc'){ r.por=eu(); r.porNome=r.porNome||s.nome; } todos.push(r); }); });
    await DB.putMany(todos); todos.forEach(function(r){ mapa(r.k)[r.id]=r; }); var q=fila(); todos.forEach(function(r){ if(q.indexOf(r.id)<0) q.push(r.id); }); LS.set('fila',q); agendar(1500);
    toast('Planilha carregada: '+C.materiais.length+' materiais, '+C.itens.length+' itens de projeto e '+C.lancamentos.length+' lançamentos.',5000); showView('painel');
  }catch(e){ console.error(e); toast('Não consegui carregar. Abra o app com internet e tente de novo.'); }
  finally{ b.disabled=false; b.textContent='Carregar planilha de perda de concreto'; }
});

// ---------- confirmação ----------
var cfmAcao=null, cfmNao=null;
function confirmar(tit, txt, sim, acao, perigo, nao){ cfmAcao=acao; cfmNao=nao||null; $('#cfmTit').textContent=tit; $('#cfmTxt').textContent=txt; var y=$('#cfmYes'); y.textContent=sim||'Confirmar'; y.className='btn grow '+(perigo?'danger':'pri'); $('#cfmBack').hidden=false; $('#cfmNo').focus(); }
function fecharConfirma(){ $('#cfmBack').hidden=true; cfmAcao=null; cfmNao=null; }
function naoConfirma(){ var n=cfmNao; fecharConfirma(); if(n) n(); }
$('#cfmNo').addEventListener('click',naoConfirma);
$('#cfmBack').addEventListener('click',function(e){ if(e.target.id==='cfmBack') naoConfirma(); });
$('#cfmYes').addEventListener('click',function(){ var a=cfmAcao; fecharConfirma(); if(a) a(); });

// ---------- Google Sheets: fila de envio + baixar o que os outros lançaram ----------
function fila(){ return LS.get('fila')||[]; }
function filaRemList(){ return LS.get('rem')||[]; }
var gsTimer=null, gsBusy=false;
function agendar(ms){ if(TESTE) return; clearTimeout(gsTimer); gsTimer=setTimeout(sincronizar,ms||3000); }
function filaAdd(id){ if(TESTE) return; var q=fila(); if(q.indexOf(id)<0){ q.push(id); LS.set('fila',q); } agendar(2500); }
function filaRem(r){ if(TESTE) return; LS.set('fila',fila().filter(function(x){ return x!==r.id; })); var rm=filaRemList(); if(!rm.some(function(x){ return x.id===r.id; })){ rm.push({id:r.id,k:r.k}); LS.set('rem',rm); } agendar(1500); }
async function gsPost(payload, semResposta){
  var s=sessao(); if(!s||s.teste) throw new Error('sem login'); payload.token=s.token;
  var body=JSON.stringify(payload);
  try{
    var res=await fetch(gsUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:body,redirect:'follow'});
    var j=await res.json(); if(naoAutorizado(j)) throw new Error('login'); if(!j.ok) throw new Error(j.erro||'erro no script'); return j;
  }catch(e){
    if(e&&e.message==='login') throw e;
    if(e&&e.message&&!/Failed to fetch|Load failed|NetworkError|JSON|Unexpected/.test(e.message)) throw e;
    if(!navigator.onLine) throw new Error('sem internet');
    if(!semResposta) throw new Error('não consegui ler a resposta da planilha');
    await fetch(gsUrl(),{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:body}); return {ok:true, cego:true};
  }
}
async function sincronizar(manual){
  if(TESTE){ if(manual) toast('Modo teste: nada é enviado para a planilha.'); return; }
  if(gsBusy||!sessao()||!gsUrl()) return;
  if(!navigator.onLine){ gsShow(); if(manual) toast('Sem internet. Os lançamentos ficam guardados e vão depois.'); return; }
  gsBusy=true; gsShow(); var avisos=[];
  try{
    var rem=filaRemList(), q=fila();
    for(var i=0; i<Math.max(q.length,1) && (q.length||rem.length); i+=30){
      var part=q.slice(i,i+30), regs=[], stamp={};
      part.forEach(function(id){ var r=MATS[id]||ITENS[id]||LANCS[id]; if(r){ regs.push(r); stamp[id]=r.atualizado; } });
      var remPart= i===0? rem : [];
      var j=await gsPost({acao:'enviar', registros:regs, remover:remPart}, true);
      (j.rejeitados||[]).forEach(function(x){ if(!x.velho) avisos.push(x.motivo); });
      // tira da fila só o que não mudou durante o envio
      LS.set('fila',fila().filter(function(id){ if(part.indexOf(id)<0) return true; var r=MATS[id]||ITENS[id]||LANCS[id]; return r && r.atualizado!==stamp[id]; }));
      if(remPart.length) LS.set('rem',filaRemList().filter(function(x){ return !remPart.some(function(y){ return y.id===x.id; }); }));
    }
    var d=await gsPost({acao:'baixar'});
    if(d && d.materiais) await aplicarServidor(d);
    LS.set('ultimo',Date.now()); LS.set('erro',null);
    if(avisos.length) toast('A planilha recusou '+avisos.length+' alteração'+(avisos.length>1?'ões':'')+': '+avisos[0],6000);
    else if(manual) toast('Tudo em dia com a planilha.');
  }catch(e){ LS.set('erro',String(e&&e.message||e)); if(manual) toast('Não consegui falar com a planilha: '+String(e&&e.message||e)); }
  finally{ gsBusy=false; gsShow(); rerender(); }
}
async function aplicarServidor(d){
  var pend={}; fila().forEach(function(id){ pend[id]=1; }); filaRemList().forEach(function(x){ pend[x.id]=1; });
  var srv={}, por=[], apagar=[];
  [['mat',d.materiais],['item',d.itens],['lanc',d.lancamentos]].forEach(function(p){ (p[1]||[]).forEach(function(r){ r.k=p[0]; srv[r.id]=1; if(pend[r.id]) return;
    var loc=mapa(r.k)[r.id]; if(!loc || loc.atualizado!==r.atualizado || JSON.stringify(loc)!==JSON.stringify(r)){ mapa(r.k)[r.id]=r; por.push(r); } }); });
  [MATS,ITENS,LANCS].forEach(function(mp){ Object.keys(mp).forEach(function(id){ if(!srv[id] && !pend[id]){ apagar.push(id); delete mp[id]; } }); });
  if(por.length) await DB.putMany(por); if(apagar.length) await DB.delMany(apagar);
  var s=LS.get('sessao'); if(s && d.perfil && (s.perfil!==d.perfil || (d.nome&&s.nome!==d.nome))){ s.perfil=d.perfil; if(d.nome) s.nome=d.nome; LS.set('sessao',s); }
}
function gsShow(){
  if(TESTE){ setSync('modo teste'); return; }
  var q=fila().length+filaRemList().length, last=LS.get('ultimo'), err=LS.get('erro'), t;
  if(gsBusy) t='sincronizando…'; else if(q) t=q+' aguardando envio'; else t=last? 'em dia '+new Date(last).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : 'salvo no celular';
  setSync(t);
  var el=$('#gsInfo'); if(!el) return;
  if(gsBusy) el.textContent='Sincronizando com a planilha…';
  else if(q) el.textContent=q+' alteração'+(q>1?'ões':'')+' aguardando envio'+(navigator.onLine?(err?' (último erro: '+err+')':'…'):' (sem internet; envia quando voltar).');
  else el.textContent='Planilha em dia'+(last?' · última sincronização '+new Date(last).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'')+'.';
}
$('#hdrSync').addEventListener('click',async function(){ var b=this; b.disabled=true; b.textContent='…'; await sincronizar(true); b.disabled=false; b.textContent='Atualizar'; });
$('#gsPull').addEventListener('click',function(){ sincronizar(true); });
$('#gsSendAll').addEventListener('click',async function(){
  if(TESTE){ toast('Modo teste: nada é enviado.'); return; }
  var ids=lista(MATS).concat(lista(ITENS),lista(LANCS)).map(function(r){ return r.id; }); LS.set('fila',ids);
  var b=this; b.disabled=true; b.textContent='Enviando '+ids.length+'…'; await sincronizar(true); b.disabled=false; b.textContent='Reenviar tudo'; });
async function gsSaveTest(){
  var url=$('#gsUrl').value.trim(), st=$('#gsStatus'); st.hidden=false; st.className='msg';
  if(!url||!URL_RE.test(url)){ st.className='msg err'; st.textContent='Esse endereço não parece do Apps Script. Ele começa com https://script.google.com/macros/s/ e termina com /exec.'; return; }
  var novo=url!==gsUrl(); cfg.gsUrl=url; saveCfg();
  if(novo){ forceLogout('Endereço da planilha trocado. Entre com um usuário cadastrado nessa planilha.'); return; }
  st.textContent='Testando a conexão…';
  try{ var j=await gsPost({acao:'teste'}); st.textContent='Conectado à planilha "'+j.planilha+'". Seu perfil: '+j.perfil+'.'; sincronizar(); }
  catch(e){ st.className='msg err'; st.textContent='A planilha não respondeu certo: '+(e&&e.message||e)+'. Confira se o código Materiais.gs está colado e publicado como nova versão.'; }
}
$('#gsSave').addEventListener('click',gsSaveTest);
window.addEventListener('online',function(){ sincronizar(); });
setInterval(function(){ if(!document.hidden) sincronizar(); },120000);

// ---------- login ----------
var desbloqueado=false;
function lockApp(msg){ if(TESTE){ unlockApp(); return; } desbloqueado=false; document.body.classList.add('locked'); $('#login').hidden=false; $('#loginObra').textContent=cfg.obra? 'Material · '+cfg.obra : 'Controle de Material';
  var s=sessao(); if(s&&!$('#lgUser').value) $('#lgUser').value=s.usuario||''; $('#lgPass').value='';
  $('#lgUrlBox').hidden=!!gsUrl(); if(!gsUrl() && !$('#lgUrl').value) $('#lgUrl').value=cfg.gsUrl||'';
  var e=$('#lgErr'); e.hidden=!msg; e.textContent=msg||'';
  setTimeout(function(){ try{ (!gsUrl()? $('#lgUrl') : ($('#lgUser').value? $('#lgPass') : $('#lgUser'))).focus(); }catch(x){} },50); }
function unlockApp(){ desbloqueado=true; document.body.classList.remove('locked'); $('#login').hidden=true; $('#lgPass').value=''; }
function forceLogout(msg){ LS.set('sessao',null); LS.set('cred',null); lockApp(msg||'Sua sessão terminou. Entre de novo.'); }
function hexOf(buf){ return Array.prototype.map.call(new Uint8Array(buf),function(b){ return ('0'+b.toString(16)).slice(-2); }).join(''); }
async function derivar(senha, sal){
  var k=await crypto.subtle.importKey('raw',new TextEncoder().encode(senha),'PBKDF2',false,['deriveBits']);
  return hexOf(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(sal),iterations:150000},k,256));
}
async function guardarCred(usuario, senha){ try{ var sal=hexOf(crypto.getRandomValues(new Uint8Array(16))); LS.set('cred',{u:usuario.toLowerCase(),sal:sal,h:await derivar(senha,sal)}); }catch(e){} }
async function confereLocal(usuario, senha){ var c=LS.get('cred'); if(!c||c.u!==usuario.toLowerCase()) return false; try{ return (await derivar(senha,c.sal))===c.h; }catch(e){ return false; } }
var tentativasLocais=0;
function naoAutorizado(j){ if(j&&j.codigo==='nao_autorizado'){ forceLogout('Seu acesso expirou ou foi removido pelo responsável da obra. Entre de novo.'); return true; } return false; }
async function doLogin(ev){
  ev.preventDefault();
  var u=$('#lgUser').value.trim(), p=$('#lgPass').value, btn=$('#lgBtn'), err=$('#lgErr');
  var boxOn=!$('#lgUrlBox').hidden;
  if(!gsUrl()||boxOn){ var nu=$('#lgUrl').value.trim();
    if(boxOn && gsUrl() && (!nu || nu===gsUrl())){ /* mantém */ }
    else if(!URL_RE.test(nu)){ err.hidden=false; err.textContent='Cole o endereço do script da planilha de materiais. Ele começa com https://script.google.com/macros/s/ e termina com /exec. Ainda não tem a planilha? Use “Testar sem planilha”.'; return; }
    else { cfg.gsUrl=nu; saveCfg(); } }
  if(!u||!p){ err.hidden=false; err.textContent='Digite usuário e senha.'; return; }
  btn.disabled=true; btn.textContent='Entrando…'; err.hidden=true;
  var s0=sessao();
  if(s0 && LS.get('cred') && String(s0.usuario).toLowerCase()===u.toLowerCase()){
    if(tentativasLocais>=5){ err.hidden=false; err.textContent='Muitas tentativas erradas. Feche o app e tente de novo mais tarde.'; btn.disabled=false; btn.textContent='Entrar'; return; }
    if(await confereLocal(u,p)){ tentativasLocais=0; unlockApp(); toast('Bem-vindo, '+(s0.nome||u)+'!'); showView(view,Object.assign({},viewOpts,{keepScroll:true})); verificarSessao(); sincronizar(); btn.disabled=false; btn.textContent='Entrar'; perguntaRascunho(); return; }
    if(!navigator.onLine){ tentativasLocais++; err.hidden=false; err.textContent='Senha incorreta.'; btn.disabled=false; btn.textContent='Entrar'; return; }
  }
  if(!navigator.onLine){ err.hidden=false; err.textContent='Sem internet. Para entrar pela primeira vez neste celular, conecte-se a uma rede.'; btn.disabled=false; btn.textContent='Entrar'; return; }
  try{
    var res=await fetch(gsUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({acao:'login',usuario:u,senha:p}),redirect:'follow'});
    var j=await res.json();
    if(!j.ok){ err.hidden=false; err.textContent=j.erro||'Usuário ou senha incorretos.'; return; }
    if(!j.token||!j.perfil){ err.hidden=false; err.textContent='Esse endereço não é o do script de materiais. Confira se colou o endereço da planilha MATRIZ_CAJAMAR_MATERIAIS (e não o do RDO ou do FVS).'; return; }
    if(s0&&s0.token&&s0.token!==j.token){ try{ fetch(gsUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({acao:'sair',token:s0.token}),redirect:'follow'}); }catch(x){} }
    if(s0 && String(s0.usuario).toLowerCase()!==String(j.usuario).toLowerCase()){ /* outra pessoa no mesmo celular: mantém os dados, a planilha é a fonte */ }
    LS.set('sessao',{token:j.token,usuario:j.usuario,nome:j.nome,perfil:j.perfil,desde:Date.now()});
    await guardarCred(j.usuario,p); tentativasLocais=0;
    unlockApp(); toast('Bem-vindo, '+j.nome+'! Perfil: '+j.perfil+'.'); showView('painel');
    sincronizar(); perguntaRascunho();
  }catch(e){ err.hidden=false; err.textContent='Não consegui falar com a planilha. Confira a internet. Se estiver boa, o endereço do script pode estar errado: cole abaixo o endereço /exec e tente de novo.';
    $('#lgUrlBox').hidden=false; if(!$('#lgUrl').value) $('#lgUrl').value=gsUrl(); }
  finally{ btn.disabled=false; btn.textContent='Entrar'; }
}
async function verificarSessao(){
  var s=sessao(); if(!s||s.teste||!navigator.onLine||!gsUrl()) return;
  try{ var res=await fetch(gsUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({acao:'sessao',token:s.token}),redirect:'follow'});
    var j=await res.json(); if(!naoAutorizado(j)&&j.ok&&(j.nome!==s.nome||j.perfil!==s.perfil)){ s.nome=j.nome; s.perfil=j.perfil; LS.set('sessao',s); rerender(); } }catch(e){}
}
async function sair(){
  if(TESTE){ confirmar('Sair do modo teste?','Os dados de teste continuam guardados neste celular, separados. Você volta para a tela de login da planilha.','Sair do teste',function(){ try{ localStorage.removeItem('mat:modo'); }catch(e){} location.reload(); }); return; }
  var s=sessao(); if(s){ try{ await fetch(gsUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({acao:'sair',token:s.token}),redirect:'follow'}); }catch(e){} }
  LS.set('sessao',null); LS.set('cred',null); $('#lgUser').value=''; lockApp('');
}
$('#lgTeste').addEventListener('click',function(){
  confirmar('Testar sem planilha?','Os dados ficam só neste celular, separados do uso real, e nada vai para a planilha. Você entra com perfil Engenharia. Para sair do teste: aba Obra › Sair.','Entrar no teste',function(){ try{ localStorage.setItem('mat:modo','teste'); }catch(e){} location.reload(); });
});
var saiuEm=0;
document.addEventListener('visibilitychange',function(){
  if(document.hidden){ saiuEm=Date.now(); if(cfgFormDirty) saveCfgFromForm(true); rascunho(); return; }
  if(!TESTE && desbloqueado && saiuEm && Date.now()-saiuEm>5*60*1000) lockApp('Por segurança, confirme sua senha para continuar.');
  else sincronizar();
  checkUpdate();
});
$('#loginForm').addEventListener('submit',doLogin);
$('#acSair').addEventListener('click',sair);
function perguntaRascunho(){
  var r=LS.get('rascunho'); if(!r||!r.fd||view==='form') return;
  if(Date.now()-num(r.em)>7*864e5){ LS.set('rascunho',null); return; }
  var m=MATS[r.fd.mat]||{nome:''};
  confirmar('Continuar o lançamento?','Tem um lançamento de '+br(r.fd.data)+' ('+m.nome+') que não foi salvo.','Continuar',function(){ fd=r.fd; fdNovo=!!r.novo; fdBase=r.base||''; go('form'); },false,function(){ LS.set('rascunho',null); });
}

// ---------- obra ----------
function renderCfg(){
  $('#c-obra').value=cfg.obra||''; $('#gsUrl').value=gsUrl(); gsShow();
  $('#gsCard').hidden=TESTE; $('#gsNote').textContent= TESTE? 'Modo teste: nada vai para a planilha. Para usar de verdade, toque em Sair (abaixo) e entre com seu usuário da planilha de materiais.' : 'Cada lançamento salvo vai para a planilha de materiais (abas Lancamentos, Entregas, Pecas e Indicadores). O app também baixa de lá o projeto e os lançamentos das outras pessoas. Sem internet, guarda e envia depois.';
  var s=sessao(); $('#acNome').textContent= s? (s.nome+(s.teste?'':' ('+s.usuario+')')+' · '+s.perfil) : '—';
  $('#acSair').textContent= TESTE? 'Sair do teste' : 'Sair';
  verLine();
}
var cfgFormDirty=false, cfgTimer=null;
function saveCfgFromForm(quiet){ cfg.obra=$('#c-obra').value.trim(); saveCfg(); cfgFormDirty=false; clearTimeout(cfgTimer); if(!quiet) toast('Salvo.'); }
['input','change'].forEach(function(ev){ $('#c-obra').addEventListener(ev,function(){ cfgFormDirty=true; clearTimeout(cfgTimer); cfgTimer=setTimeout(function(){ saveCfgFromForm(true); },700); }); });

// ---------- arquivos ----------
var ready={file:null,url:null};
async function deliver(name, blob, mime, okMsg){
  var file=null; try{ file=new File([blob],name,{type:mime}); }catch(e){}
  if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:name}); toast(okMsg); return; }
    catch(e){ if(e&&e.name==='AbortError'){ toast('Envio cancelado. O arquivo pode ser gerado de novo quando quiser.'); return; } }
    showReady(name, blob, file); return;
  }
  showReady(name, blob, file);
}
function showReady(name, blob, file){ if(ready.url) URL.revokeObjectURL(ready.url); ready.file=file; ready.url=URL.createObjectURL(blob);
  $('#readyName').textContent=name; var a=$('#readyOpen'); a.href=ready.url; a.setAttribute('download',name);
  $('#readyShare').hidden=!(file&&navigator.canShare&&navigator.canShare({files:[file]})); $('#readyOv').hidden=false; }
$('#readyShare').addEventListener('click',function(){ if(ready.file) navigator.share({files:[ready.file],title:ready.file.name}).then(function(){ $('#readyOv').hidden=true; }).catch(function(){}); });
$('#readyClose').addEventListener('click',function(){ $('#readyOv').hidden=true; });
function loadScript(src){ return new Promise(function(res,rej){ var s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }

function excel(X){
  var wb=X.utils.book_new();
  function aba(nome, linhas, fmts, larg){ var ws=X.utils.aoa_to_sheet(linhas); var R=X.utils.decode_range(ws['!ref']);
    Object.keys(fmts||{}).forEach(function(c){ for(var r=1;r<=R.e.r;r++){ var a=X.utils.encode_cell({r:r,c:+c}); if(ws[a]&&ws[a].t==='n') ws[a].z=fmts[c]; } });
    ws['!cols']=(larg||[]).map(function(w){ return {wch:w}; }); X.utils.book_append_sheet(wb, ws, nome); }
  var P='0.0%', Q='#,##0.000', D='dd/mm/yyyy';
  function dt(iso){ if(!iso) return ''; var p=iso.split('-'); return (Date.UTC(+p[0],+p[1]-1,+p[2])-Date.UTC(1899,11,30))/864e5; }   // nº de série do Excel (sem fuso)
  var mats=lista(MATS).sort(function(a,b){ return cmp(a.nome,b.nome); });
  var res=[['Material','Un','Previsto do projeto','Previsto executado','% executado','Real (peças executadas)','Desvio','Perda %','Perda aceitável','Perda % sem justificadas','Perdas justificadas','Consumo sem peça','Saldo a executar','Projeção até o fim','Lançamentos']];
  mats.forEach(function(m){ var A=agg(m.id); res.push([m.nome,m.un,A.prevProj,A.prev,A.execPct==null?'':A.execPct,A.real,A.real-A.prev,A.pct==null?'':A.pct,num(m.meta)/100,A.pctSemJ==null?'':A.pctSemJ,A.perdaJ,A.semPeca,A.saldo,A.proj,A.n]); });
  aba('Resumo',res,{2:Q,3:Q,4:P,5:Q,6:Q,7:P,8:P,9:P,10:Q,11:Q,12:Q,13:Q},[30,6,14,14,10,14,12,10,10,12,12,12,12,14,10]);
  var pt=[['Material','Grupo','Código','Descrição','Peças projeto','Peças executadas','% executado','Qtd por peça','Previsto executado','Real rateado','Perda %','Un']];
  mats.forEach(function(m){ var A=agg(m.id); itensDe(m.id).forEach(function(it){ var x=A.itens[it.id]; pt.push([m.nome,it.grupo||'',it.cod,it.desc||'',num(it.n),x.exec,num(it.n)?x.exec/num(it.n):'',num(it.qu),x.prev,x.real,x.prev?x.real/x.prev-1:'',m.un]); }); });
  aba('Por tipo de peça',pt,{6:P,7:Q,8:Q,9:Q,10:P},[26,26,10,28,10,10,10,10,12,12,9,5]);
  var me=[['Mês','Material','Un','Previsto executado','Real','Perda %','Consumo sem peça','Lançamentos']];
  mats.forEach(function(m){ var A=agg(m.id); Object.keys(A.meses).sort().forEach(function(ym){ var x=A.meses[ym]; me.push([ym,m.nome,m.un,x.prev,x.real,x.prev?x.real/x.prev-1:'',x.semPeca,x.n]); }); });
  aba('Por mês',me,{3:Q,4:Q,5:P,6:Q},[9,28,5,14,12,9,12,10]);
  var la=[['Data','Material','Un','Frente','Fornecedor','Peças','Previsto','Recebido','Devolvido','Real','Desvio','Perda %','Perdas justificadas','Perda % sem justificadas','NFs','Observação','Lançado por']];
  var en=[['Data','Material','Un','NF / documento','Caminhão / BT','Fornecedor','Quantidade','Obs']], pc=[['Data','Material','Un','Grupo','Código','Local','Qtd','Previsto','Real rateado']];
  lista(LANCS).sort(function(a,b){ return cmp(a.data,b.data); }).forEach(function(l){ var m=MATS[l.mat]||{nome:'?',un:''}, c=calc(l);
    la.push([dt(l.data),m.nome,m.un,l.frente||'',l.forn||'',resumoPecas(l),c.prev,c.rec,c.dev,c.real,c.desvio,c.pct==null?'':c.pct,c.perdaJ,c.pctSemJ==null?'':c.pctSemJ,(l.ent||[]).map(function(e){ return e.doc; }).filter(Boolean).join(', '),l.obs||'',l.porNome||'']);
    (l.ent||[]).forEach(function(e){ en.push([dt(l.data),m.nome,m.un,e.doc||'',e.veic||'',l.forn||'',num(e.q),e.obs||'']); });
    (l.pecas||[]).forEach(function(p){ var it=p.item&&ITENS[p.item], pp=prevPeca(p); pc.push([dt(l.data),m.nome,m.un,it?it.grupo||'':'Avulso',it?it.cod:(p.desc||''),p.local||'',qOf(p),pp,c.prev?c.real*pp/c.prev:'']); });
  });
  aba('Lançamentos',la,{0:D,6:Q,7:Q,8:Q,9:Q,10:Q,11:P,12:Q,13:P},[11,26,5,18,16,40,11,11,10,11,10,9,11,11,30,30,18]);
  aba('Entregas (NF)',en,{0:D,6:Q},[11,26,5,14,12,16,11,24]);
  aba('Peças executadas',pc,{0:D,7:Q,8:Q},[11,26,5,26,10,12,6,11,11]);
  var pj=[['Material','Un','Grupo','Código','Descrição','Nº de peças','Qtd por peça','Total previsto','C','L','H']];
  mats.forEach(function(m){ itensDe(m.id).forEach(function(it){ var d=it.dims||{}; pj.push([m.nome,m.un,it.grupo||'',it.cod,it.desc||'',num(it.n),num(it.qu),num(it.n)*num(it.qu),d.c==null?'':d.c,d.l==null?'':d.l,d.h==null?'':d.h]); }); });
  aba('Projeto',pj,{6:Q,7:Q},[26,5,26,10,30,10,11,12,6,6,6]);
  var out=X.write(wb,{bookType:'xlsx',type:'array'});
  return new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
$('#xlsBtn').addEventListener('click',async function(){
  if(!lista(MATS).length){ toast('Ainda não há materiais para exportar.'); return; }
  var b=this; b.disabled=true; b.textContent='Montando a planilha…';
  try{ if(!window.XLSX) await loadScript('xlsx.mini.min.js');
    await deliver('Controle de Material - '+(cfg.obra||'obra').replace(/[\\/:*?"<>|]+/g,'-')+' - '+br(todayISO()).replace(/\//g,'-')+'.xlsx', excel(window.XLSX), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Planilha de controle pronta.'); }
  catch(e){ console.error(e); toast('Erro ao montar a planilha.'); }
  b.disabled=false; b.textContent='Exportar controle em Excel';
});

// ---------- backup ----------
$('#expBk').addEventListener('click',async function(){
  var data={app:'material', versao:1, exportadoEm:new Date().toISOString(), cfg:cfg, materiais:lista(MATS), itens:lista(ITENS), lancamentos:lista(LANCS)};
  await deliver('backup-material-'+todayISO()+'.json', new Blob([JSON.stringify(data)],{type:'application/json'}), 'application/json', 'Backup exportado.');
});
$('#impBk').addEventListener('change',function(e){ var file=e.target.files[0]; e.target.value=''; if(!file) return;
  var rd=new FileReader(); rd.onload=function(){
    try{ var d=JSON.parse(rd.result); if(!d||d.app!=='material') throw 0;
      var regs=[].concat(d.materiais||[],d.itens||[],d.lancamentos||[]);
      if(!eng()) regs=regs.filter(function(r){ return r.k==='lanc'; });
      confirmar('Restaurar o backup?', regs.length+' registros. Registros iguais serão substituídos pela versão do backup e enviados para a planilha.', 'Restaurar', async function(){
        regs.forEach(function(r){ r.atualizado=Date.now(); mapa(r.k)[r.id]=r; }); await DB.putMany(regs); var q=fila(); regs.forEach(function(r){ if(q.indexOf(r.id)<0) q.push(r.id); }); LS.set('fila',q);
        toast('Backup restaurado.'); agendar(1000); showView('painel'); });
    }catch(err){ toast('Esse arquivo não é um backup do Controle de Material.'); } };
  rd.readAsText(file);
});

// ---------- navegação ----------
window.addEventListener('popstate',function(){
  if(!$('#itOv').hidden){ $('#itOv').hidden=true; return; }
  if(!$('#pasteOv').hidden){ $('#pasteOv').hidden=true; return; }
  if(MAIN.indexOf(view)>=0) return;
  if(view==='form' && fdSujo()){
    try{ history.pushState({mat:1},''); }catch(e){}
    confirmar('Sair sem salvar?','As alterações deste lançamento serão descartadas.','Descartar',function(){ fd=null; LS.set('rascunho',null); try{ history.back(); }catch(e){ voltar(); } }, true);
    return;
  }
  if(view==='form'){ fd=null; LS.set('rascunho',null); }
  voltar();
});
$('#backBtn').addEventListener('click',function(){ if(history.state&&history.state.mat) history.back(); else { if(view==='form'){ fd=null; LS.set('rascunho',null); } voltar(); } });
$$('.tabs button').forEach(function(b){ b.addEventListener('click',function(){ pilha=[]; showView(b.dataset.view); }); });
$('#barBtn').addEventListener('click',function(){
  if(view==='form'){ salvarLanc(); return; }
  if(view==='proj' && eng()){ mf=null; go('medit',{}); return; }
  if(view==='medit'){ abrirItem({k:'item', mat:viewOpts.id, grupo:ultimoGrupo(viewOpts.id), cod:'', desc:'', n:null, qu:null}); return; }
  lancar(view==='mat'? viewOpts.id : (view==='lancs'&&lFiltro? lFiltro : ''));
});

// ---------- versão e atualização automática ----------
var versaoNova=null;
function verLine(){ var el=$('#verInfo'); if(!el) return; el.textContent='Versão do app: '+APP_VER+(versaoNova&&versaoNova!==APP_VER?' (disponível: '+versaoNova+')':'')+' · '+lista(MATS).length+' materiais · '+lista(ITENS).length+' itens · '+lista(LANCS).length+' lançamentos'; }
async function forceUpdate(){
  var b=$('#updBtn'); if(b){ b.disabled=true; b.textContent='Atualizando…'; } rascunho();
  try{ if(window.caches){ var ks=await caches.keys(); await Promise.all(ks.filter(function(k){ return /^mat-/.test(k); }).map(function(k){ return caches.delete(k); })); } }catch(e){}
  try{ if(navigator.serviceWorker){ var rs=await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.filter(function(r){ return /\/material\/$/.test(r.scope); }).map(function(r){ return r.update(); })); } }catch(e){}
  location.replace(location.pathname+'?v='+Date.now());
}
document.addEventListener('click',function(e){ if(e.target.id==='updBtn') forceUpdate(); });
var swReg=null, updating=false;
async function checkUpdate(){
  if(updating || (location.protocol!=='https:' && location.hostname!=='localhost') || !navigator.onLine) return;
  try{
    if(swReg) swReg.update().catch(function(){});
    var r=await fetch('version.json?t='+Date.now(),{cache:'no-store'}); if(!r.ok) return;
    var v=(await r.json()).v; versaoNova=v; verLine(); if(!v || String(v)===String(APP_VER)) return;
    if(view==='form'){ $('#updBar').hidden=false; return; }   // não recarrega no meio de um lançamento
    try{ if(sessionStorage.getItem('mat:tried')===String(v)){ $('#updBar').hidden=false; return; } sessionStorage.setItem('mat:tried', String(v)); }catch(e){}
    updating=true; try{ sessionStorage.setItem('mat:updated', v); }catch(e){}
    setSync('atualizando o app…'); setTimeout(function(){ location.reload(); },600);
  }catch(e){}
}
window.addEventListener('pagehide',rascunho);

// ---------- início ----------
if('serviceWorker' in navigator && location.protocol==='https:'){ window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(function(r){ swReg=r; }).catch(function(){}); }); }
try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist(); }catch(e){}
(async function boot(){
  var c=LS.get('cfg'); if(c) cfg=Object.assign({},DEFAULT_CFG,c);
  $('#testBand').hidden=!TESTE;
  try{ (await DB.all()||[]).forEach(function(r){ if(r&&r.k) mapa(r.k)[r.id]=r; }); }catch(e){ console.error(e); toast('Não consegui abrir os dados deste celular.'); }
  setTitle(); gsShow();
  showView('painel');
  if(TESTE){ unlockApp(); perguntaRascunho(); }
  else lockApp(sessao()? 'Confirme sua senha para entrar.' : '');
  try{ if(sessionStorage.getItem('mat:updated')){ sessionStorage.removeItem('mat:updated'); setTimeout(function(){ toast('App atualizado para a versão nova.'); },400); } }catch(e){}
  setTimeout(checkUpdate,1500);
  if(sessao() && !TESTE){ verificarSessao(); setTimeout(sincronizar,2500); }
})();
window.__mat={get MATS(){return MATS;}, get ITENS(){return ITENS;}, get LANCS(){return LANCS;}, agg:agg, calc:calc, get fd(){return fd;}};
})();
