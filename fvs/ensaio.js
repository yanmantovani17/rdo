// Dados de campo dos ensaios de sondagem (SPT e CPTU) dentro da FVS.
// O app chama FVSEnsaio.* para montar a tela, guardar o que é digitado e mandar para a planilha.
(function(){
'use strict';
function h(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
var MOTIVOS={
  spt:['Critério de paralisação da NBR 6484','Profundidade do programa','Impenetrável ao trépano','Ordem do projetista','Outro'],
  cptu:['Profundidade do programa','Carga máxima (reação ou células)','Inclinação acima do limite','Ordem do projetista','Outro']
};
var AVANCO=[['TC','Trado concha'],['TH','Trado helicoidal'],['CA','Lavagem']];

function tipo(f, modelo){ return (f.ensaio&&f.ensaio.tipo) || (modelo&&modelo.ensaio) || null; }
function init(f, t){
  if(f.ensaio || !t) return f.ensaio;
  f.ensaio = t==='spt'
    ? {tipo:'spt', cota:'', sondador:'', revest:'', prof:'', motivo:'', naIni:'', na12:'', seco:false, linhas:[{p:1,g1:'',g2:'',g3:'',av:'TC',solo:''}]}
    : {tipo:'cptu', cota:'', operador:'', ponteira:'', prefuro:'', velocidade:'20', na:'', prof:'', motivo:'', deriva:'', diss:[]};
  return f.ensaio;
}
function num(x){ var m=String(x==null?'':x).replace(',','.').match(/^\s*(\d+(\.\d+)?)/); return m? +m[1] : null; }
// N-SPT = golpes do 2º + 3º segmento; "*" quando houve penetração incompleta (ex.: 30/12)
function nspt(r){ var a=num(r.g2), b=num(r.g3); if(a==null||b==null) return ''; return String(Math.round(a+b))+(/\//.test(String(r.g2)+String(r.g3))?'*':''); }
function fmt(v){ return v===''||v==null? '—' : String(v).replace('.',','); }
function resumo(e){
  if(!e) return '';
  if(e.tipo==='spt'){ var n=e.linhas.filter(function(r){ return nspt(r)!==''; }).length;
    return n+' metro(s)'+(e.prof?' · final '+fmt(e.prof)+' m':'')+(e.seco?' · seco':(e.naIni?' · NA '+fmt(e.naIni)+' m':'')); }
  return (e.diss.length? e.diss.length+' dissipação(ões)' : 'sem dissipação')+(e.prof?' · final '+fmt(e.prof)+' m':'')+(e.na?' · NA '+fmt(e.na)+' m':'');
}
function campo(lbl, key, val, extra){ return '<label class="field"><span class="lbl">'+lbl+'</span><input type="text" inputmode="'+((extra&&extra.texto)?'text':'decimal')+'" data-e="'+key+'" value="'+h(val)+'"'+((extra&&extra.ph)?' placeholder="'+h(extra.ph)+'"':'')+'></label>'; }
function motivo(t, val){ return '<label class="field"><span class="lbl">Motivo da paralisação</span><select data-e="motivo"><option value="">—</option>'+MOTIVOS[t].map(function(m){ return '<option'+(m===val?' selected':'')+'>'+h(m)+'</option>'; }).join('')+'</select></label>'; }

function linhaSPT(r,i){
  return '<div class="spt-row" data-row="'+i+'">'+
    '<input class="c-p" type="text" inputmode="decimal" data-er="'+i+'" data-ec="p" value="'+h(r.p)+'" aria-label="Profundidade (m)">'+
    '<input type="text" inputmode="numeric" data-er="'+i+'" data-ec="g1" value="'+h(r.g1)+'" aria-label="Golpes 1º 15 cm" placeholder="1º">'+
    '<input type="text" inputmode="numeric" data-er="'+i+'" data-ec="g2" value="'+h(r.g2)+'" aria-label="Golpes 2º 15 cm" placeholder="2º">'+
    '<input type="text" inputmode="numeric" data-er="'+i+'" data-ec="g3" value="'+h(r.g3)+'" aria-label="Golpes 3º 15 cm" placeholder="3º">'+
    '<output class="c-n" data-n="'+i+'">'+(nspt(r)||'—')+'</output>'+
    '<select data-er="'+i+'" data-ec="av" aria-label="Avanço">'+AVANCO.map(function(a){ return '<option value="'+a[0]+'"'+(a[0]===r.av?' selected':'')+'>'+a[0]+'</option>'; }).join('')+'</select>'+
    '<input class="c-solo" type="text" data-er="'+i+'" data-ec="solo" value="'+h(r.solo)+'" placeholder="Solo (ex.: argila siltosa mole, cinza)" aria-label="Descrição do solo">'+
    '<button type="button" class="x" data-edel="'+i+'" aria-label="Apagar metro">×</button></div>';
}
function linhaDiss(d,i){
  return '<div class="diss-row">'+
    '<label><span>Prof. (m)</span><input type="text" inputmode="decimal" data-ed="'+i+'" data-edc="p" value="'+h(d.p)+'"></label>'+
    '<label><span>u inicial (kPa)</span><input type="text" inputmode="decimal" data-ed="'+i+'" data-edc="u0" value="'+h(d.u0)+'"></label>'+
    '<label><span>t50 (min)</span><input type="text" inputmode="decimal" data-ed="'+i+'" data-edc="t50" value="'+h(d.t50)+'"></label>'+
    '<label><span>Duração (min)</span><input type="text" inputmode="decimal" data-ed="'+i+'" data-edc="dur" value="'+h(d.dur)+'"></label>'+
    '<input class="c-solo" type="text" data-ed="'+i+'" data-edc="obs" value="'+h(d.obs)+'" placeholder="Observação (ex.: parado a 40% por tempo)">'+
    '<button type="button" class="x" data-ddel="'+i+'" aria-label="Apagar dissipação">×</button></div>';
}
function html(f){
  var e=f.ensaio; if(!e) return '';
  var s='<details class="card" id="c-ens" open><summary><span class="dot'+(e.prof?' on':'')+'" id="ensDot"></span><h2>Dados do ensaio</h2><span class="sum" id="ensSum">'+h(resumo(e))+'</span><span class="chev">›</span></summary><div class="body">';
  if(e.tipo==='spt'){
    s+='<p class="note">Boletim do furo. Anote os golpes de cada 15 cm; o N-SPT (2º + 3º) é calculado sozinho. Penetração incompleta: escreva golpes/cm, ex.: 30/12.</p>'+
      '<div class="grid2">'+campo('Cota da boca (m)','cota',e.cota)+campo('Sondador','sondador',e.sondador,{texto:1})+'</div>'+
      '<div class="spt-head"><span>Prof. (m)</span><span>1º</span><span>2º</span><span>3º</span><span>N</span><span>Avanço</span></div>'+
      '<div id="sptRows">'+e.linhas.map(linhaSPT).join('')+'</div>'+
      '<button type="button" class="btn dark full" data-eadd="spt">+ Próximo metro</button>'+
      '<p class="note">Avanço: TC = trado concha · TH = trado helicoidal · CA = lavagem</p>'+
      '<div class="grid2">'+campo('Revestimento até (m)','revest',e.revest)+campo('Profundidade final (m)','prof',e.prof)+'</div>'+
      motivo('spt',e.motivo)+
      '<div class="grid2">'+campo('NA inicial (m)','naIni',e.naIni)+campo('NA após 12 h (m)','na12',e.na12)+'</div>'+
      '<label class="ck"><input type="checkbox" data-e="seco"'+(e.seco?' checked':'')+'><span>Furo seco (sem nível d\'água)</span></label>';
  } else {
    s+='<p class="note">Dados do ponto de CPTU. Os gráficos de qc, fs e u2 vêm no arquivo do equipamento; aqui ficam o controle de campo e as dissipações.</p>'+
      '<div class="grid2">'+campo('Cota da boca (m)','cota',e.cota)+campo('Operador','operador',e.operador,{texto:1})+'</div>'+
      '<div class="grid2">'+campo('Nº de série da ponteira','ponteira',e.ponteira,{texto:1})+campo('Velocidade média (mm/s)','velocidade',e.velocidade)+'</div>'+
      '<div class="grid2">'+campo('Pré-furo até (m)','prefuro',e.prefuro)+campo('NA (m)','na',e.na)+'</div>'+
      '<div class="grid2">'+campo('Profundidade final (m)','prof',e.prof)+campo('Deriva do zero (kPa)','deriva',e.deriva,{ph:'diferença início × fim'})+'</div>'+
      motivo('cptu',e.motivo)+
      '<h3 class="sec-h" style="margin:4px 0 0">Ensaios de dissipação</h3><div id="dissRows">'+e.diss.map(linhaDiss).join('')+'</div>'+
      '<button type="button" class="btn dark full" data-eadd="cptu">+ Dissipação</button>';
  }
  return s+'</div></details>';
}
// trata digitação/cliques dentro do bloco; devolve true se mexeu no ensaio
function handle(ev, f, root){
  var e=f.ensaio, t=ev.target; if(!e) return false;
  if(ev.type==='click'){
    var add=t.closest('[data-eadd]'), del=t.closest('[data-edel]'), dd=t.closest('[data-ddel]');
    if(add){
      if(e.tipo==='spt'){ var last=e.linhas[e.linhas.length-1]; var p=last&&num(last.p)!=null? Math.round((num(last.p)+1)*100)/100 : 1;
        e.linhas.push({p:p,g1:'',g2:'',g3:'',av:(last&&last.av)||'TH',solo:''}); root.querySelector('#sptRows').innerHTML=e.linhas.map(linhaSPT).join('');
        var ins=root.querySelectorAll('#sptRows .spt-row:last-child input'); if(ins[1]) ins[1].focus(); }
      else { e.diss.push({p:'',u0:'',t50:'',dur:'',obs:''}); root.querySelector('#dissRows').innerHTML=e.diss.map(linhaDiss).join(''); }
      refresh(f,root); return true; }
    if(del){ e.linhas.splice(+del.dataset.edel,1); root.querySelector('#sptRows').innerHTML=e.linhas.map(linhaSPT).join(''); refresh(f,root); return true; }
    if(dd){ e.diss.splice(+dd.dataset.ddel,1); root.querySelector('#dissRows').innerHTML=e.diss.map(linhaDiss).join(''); refresh(f,root); return true; }
    return false;
  }
  if(t.dataset.e){ e[t.dataset.e]= t.type==='checkbox'? t.checked : t.value; refresh(f,root); return true; }
  if(t.dataset.er!=null){ var r=e.linhas[+t.dataset.er]; r[t.dataset.ec]=t.value; var o=root.querySelector('[data-n="'+t.dataset.er+'"]'); if(o) o.textContent=nspt(r)||'—'; refresh(f,root); return true; }
  if(t.dataset.ed!=null){ e.diss[+t.dataset.ed][t.dataset.edc]=t.value; refresh(f,root); return true; }
  return false;
}
function refresh(f, root){ var s=root.querySelector('#ensSum'); if(s) s.textContent=resumo(f.ensaio); var d=root.querySelector('#ensDot'); if(d) d.className='dot'+(f.ensaio.prof?' on':''); }

// linhas para a planilha (abas SPT e CPTU)
function planilha(f, obra){
  var e=f.ensaio, out={spt:[], cptu:[]}; if(!e) return out;
  var base=[obra, f.n, f.local, num(e.cota)];
  if(e.tipo==='spt'){
    e.linhas.forEach(function(r){ if(r.g1===''&&r.g2===''&&r.g3===''&&!r.solo) return;
      var n=nspt(r);
      out.spt.push(base.concat([num(r.p), r.g1, r.g2, r.g3, n===''?'':(/\*/.test(n)? n : +n), r.av, r.solo, e.seco?'seco':num(e.naIni), e.seco?'':num(e.na12), num(e.prof), e.motivo, e.sondador, f.inicio||''])); });
  } else {
    var cab=base.concat([num(e.prefuro), num(e.na), num(e.prof), e.motivo, e.ponteira, num(e.velocidade), num(e.deriva), e.operador]);
    if(!e.diss.length) out.cptu.push(cab.concat(['','','','','',f.inicio||'']));
    e.diss.forEach(function(d){ out.cptu.push(cab.concat([num(d.p), num(d.u0), num(d.t50), num(d.dur), d.obs, f.inicio||''])); });
  }
  return out;
}
window.FVSEnsaio={tipo:tipo, init:init, html:html, handle:handle, planilha:planilha, nspt:nspt, num:num, fmt:fmt, resumo:resumo, AVANCO:AVANCO};
})();
