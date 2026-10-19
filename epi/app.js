// EPI e Ferramentas — controle de entregas com assinatura, estoque e durabilidade.
// Os dados ficam no Supabase; as regras de acesso estão no próprio banco (banco/1-instalar.sql).
(function () {
  'use strict';
  var VERSAO = '2026.10.19-1';
  var INATIVO_MIN = 15;                 // sai sozinho depois de 15 min sem uso

  // ---------- utilidades ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function hojeISO() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function soData(v) { if (!v) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { var p = v.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); } var d = new Date(v); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function fData(v) { var d = soData(v); return d ? pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() : '—'; }
  function fDH(v) { var d = new Date(v); return fData(v) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function dias(a, b) { return Math.round((soData(b || new Date()) - soData(a)) / 864e5); }
  function fNum(n, c) { return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: c == null ? 2 : c }); }
  function fMoeda(n) { return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function fCPF(v) { v = String(v || ''); return v.length === 11 ? v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9) : '—'; }
  function soDig(v) { return String(v || '').replace(/\D/g, ''); }
  function cpfValido(c) {
    if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
    for (var t = 9; t < 11; t++) { var s = 0; for (var i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +c[t]) return false; }
    return true;
  }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function numero(id) { return String(id).padStart(6, '0'); }
  var toastT; function toast(t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 3800); }

  var MOTIVO = { PRIMEIRA_ENTREGA: '1ª entrega', ADICIONAL: 'Adicional', TROCA_PERIODICA: 'Troca no prazo', DESGASTE_NATURAL: 'Desgaste', DANIFICADO: 'Danificado', PERDA: 'Perda' };
  var MOTIVO_TROCA = ['TROCA_PERIODICA', 'DESGASTE_NATURAL', 'DANIFICADO', 'PERDA', 'ADICIONAL'];
  var MOTIVO_NOVO = ['PRIMEIRA_ENTREGA', 'ADICIONAL'];
  var TERMO_PADRAO = 'Declaro que recebi da empresa, gratuitamente e em perfeito estado, os equipamentos de proteção individual (EPI) e as ferramentas relacionados nesta ficha, e que fui orientado(a) sobre o uso correto, a guarda e a conservação de cada um.\n\n' +
    'Comprometo-me a: usar os EPIs somente para a finalidade a que se destinam, durante todo o trabalho em que forem exigidos; responsabilizar-me pela guarda e conservação dos itens recebidos; comunicar imediatamente qualquer dano, perda ou alteração que os torne impróprios para uso; e devolver as ferramentas e os EPIs quando solicitado, na troca ou no desligamento.\n\n' +
    'Estou ciente de que a recusa injustificada ao uso do EPI fornecido constitui ato faltoso, conforme a NR-6 e o art. 158 da CLT.';

  var IC = {
    painel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    equipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/></svg>',
    entregar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    itens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a8 8 0 0 1 16 0"/><path d="M2.5 14h19v2.5h-19z"/><path d="M10 6.3V4h4v2.3"/></svg>',
    analise: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    voltar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
  };

  // ---------- conexão com o banco ----------
  var sb = null, perfil = null;
  var D = { funcoes: [], itens: [], kit: [], colab: [], saldo: {}, posse: [], cfg: {} };
  var S = { tela: 'painel', params: {}, pilha: [], f: {}, ent: null };

  function urlValida(u) {
    if (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(u)) return true;
    return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /^http:\/\/localhost:\d+$/.test(u);
  }
  function lerConfig() {
    var f = window.EPI_CONFIG || {};
    if (f.url && f.chave) return { url: f.url, chave: f.chave, fixo: true };
    try { var c = JSON.parse(localStorage.getItem('epi.banco') || 'null'); if (c && urlValida(c.url) && c.chave) return c; } catch (e) { }
    return null;
  }
  function conectar(c) {
    sb = window.supabase.createClient(c.url, c.chave, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'epi-sessao' } });
    sb.__url = c.url;
  }
  function msgErro(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'Sem conexão com o banco. Confira a internet e tente de novo.';
    if ((e && e.code === '42501') || /row-level security|permission denied/i.test(m)) return 'Você não tem permissão para isso.';
    if (/JWT|token/i.test(m)) return 'Sua sessão expirou. Entre de novo.';
    if (e && e.code === '23505') return 'Já existe um cadastro com esses dados (nome ou CPF repetido).';
    if (e && e.code === '23503') return 'Este cadastro está em uso e não pode ser apagado. Desative em vez de apagar.';
    return m.replace(/^.*?ERROR:\s*/, '');
  }
  async function todos(fn) {
    var out = [], i = 0;
    for (; ;) { var r = await fn().range(i, i + 999); if (r.error) throw r.error; out = out.concat(r.data); if (r.data.length < 1000) return out; i += 1000; }
  }
  async function rpc(nome, args) { var r = await sb.rpc(nome, args); if (r.error) throw r.error; return r.data; }
  async function q(p) { var r = await p; if (r.error) throw r.error; return r.data; }

  async function carregar() {
    var eu = await q(sb.from('perfis').select('*').eq('id', perfil.id).maybeSingle());
    if (!eu || !eu.ativo) { sair('Seu acesso foi desativado pelo administrador.'); throw new Error('Acesso desativado.'); }
    perfil = eu;
    var r = await Promise.all([
      todos(function () { return sb.from('funcoes').select('*').order('nome'); }),
      todos(function () { return sb.from('itens').select('*').order('nome'); }),
      todos(function () { return sb.from('funcao_itens').select('*').order('funcao_id').order('item_id'); }),
      todos(function () { return sb.from('colaboradores').select('*').order('nome'); }),
      todos(function () { return sb.from('v_saldos').select('*').order('item_id'); }),
      todos(function () { return sb.from('v_posse').select('*').order('id'); }),
      todos(function () { return sb.from('configuracao').select('chave,valor').order('chave'); })
    ]);
    D.funcoes = r[0]; D.itens = r[1]; D.kit = r[2]; D.colab = r[3];
    D.saldo = {}; r[4].forEach(function (s) { D.saldo[s.item_id] = s; });
    D.posse = r[5]; D.cfg = {}; r[6].forEach(function (c) { D.cfg[c.chave] = c.valor; });
    try { if (D.cfg.empresa_logo) localStorage.setItem('epi.logo', D.cfg.empresa_logo); else localStorage.removeItem('epi.logo'); } catch (e) { }
  }
  function admin() { return perfil && perfil.papel === 'admin'; }
  function funcao(id) { return D.funcoes.find(function (f) { return f.id === id; }); }
  function item(id) { return D.itens.find(function (i) { return i.id === id; }); }
  function colab(id) { return D.colab.find(function (c) { return c.id === id; }); }
  function saldo(id) { return D.saldo[id] ? Number(D.saldo[id].saldo) : 0; }
  function kitDe(funcaoId) { return D.kit.filter(function (k) { return k.funcao_id === funcaoId; }); }
  function posseDe(colabId) { return D.posse.filter(function (p) { return p.colaborador_id === colabId; }); }
  function empresa() { return { nome: D.cfg.empresa_nome || '', cnpj: D.cfg.empresa_cnpj || '', obra: D.cfg.obra || '', logo: D.cfg.empresa_logo || '' }; }
  function termoAtual() { return D.cfg.termo || TERMO_PADRAO; }
  function caSit(i) {
    if (i.tipo !== 'EPI' || !i.ca_validade) return null;
    var d = dias(hojeISO(), i.ca_validade);
    return d < 0 ? 'vencido' : d <= 30 ? 'vence' : null;
  }
  function trocaVencida(p) { return p.troca_prevista && dias(hojeISO(), p.troca_prevista) < 0; }
  function faltaKit(c) {
    var tem = {}; posseDe(c.id).forEach(function (p) { tem[p.item_id] = true; });
    return kitDe(c.funcao_id).filter(function (k) { var it = item(k.item_id); return it && it.ativo && !tem[k.item_id]; });
  }

  // ---------- inatividade ----------
  var ultimoUso = Date.now();
  var gravouUso = 0;
  function usou() { ultimoUso = Date.now(); if (ultimoUso - gravouUso > 20000) { gravouUso = ultimoUso; try { localStorage.setItem('epi.uso', String(ultimoUso)); } catch (e) { } } }
  ['pointerdown', 'keydown', 'scroll'].forEach(function (ev) { document.addEventListener(ev, usou, { passive: true }); });
  setInterval(function () { if (perfil && Date.now() - ultimoUso > INATIVO_MIN * 60000) sair('Você saiu por segurança depois de ' + INATIVO_MIN + ' minutos sem usar o app.'); }, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && perfil && Date.now() - ultimoUso > INATIVO_MIN * 60000) sair('Você saiu por segurança depois de ' + INATIVO_MIN + ' minutos sem usar o app.'); });

  async function sair(msg) {
    perfil = null; S.ent = null; D.colab = []; D.posse = [];
    try { await sb.auth.signOut(); } catch (e) { }
    try { localStorage.removeItem('epi-sessao'); } catch (e) { }
    telaLogin(msg);
  }

  // ---------- login ----------
  function telaLogin(msg, erro) {
    fecharOv();
    var c = lerConfig(), logo = null; try { logo = localStorage.getItem('epi.logo'); } catch (e) { }
    $('#app').innerHTML = '<div class="login"><div class="stripe"></div><form class="login-in" id="fLogin" novalidate>' +
      (logo && /^data:image\//.test(logo) ? '<img class="logo" alt="" src="' + esc(logo) + '">' : '') +
      '<h1>EPI e Ferramentas<small>Entregas, estoque e durabilidade</small></h1>' +
      (msg ? '<p class="msg ' + (erro ? 'err' : 'info') + '">' + esc(msg) + '</p>' : '') +
      (c ? '' : '<p class="note">Primeiro acesso neste aparelho: informe o endereço do banco e a chave pública (anon), que estão no Supabase em Project Settings → API.</p>' +
        '<label class="field"><span class="lbl">Endereço do banco</span><input type="url" id="lgUrl" placeholder="https://xxxx.supabase.co" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' +
        '<label class="field"><span class="lbl">Chave pública (anon)</span><input type="text" id="lgKey" autocomplete="off" autocapitalize="none" spellcheck="false"></label>') +
      '<label class="field"><span class="lbl">E-mail</span><input type="email" id="lgEmail" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>' +
      '<label class="field"><span class="lbl">Senha</span><input type="password" id="lgSenha" autocomplete="current-password" required></label>' +
      '<button class="btn pri full" id="lgBtn" type="submit">Entrar</button>' +
      '<p class="note">Só entra quem tem login cadastrado e liberado pelo administrador. Depois de ' + INATIVO_MIN + ' minutos sem uso, o app sai sozinho.</p>' +
      (c && !c.fixo ? '<button type="button" class="linkbtn" id="lgTroca" style="color:inherit;opacity:.7">Trocar endereço do banco</button>' : '') +
      '<p class="note" style="margin-top:8px">Versão ' + VERSAO + '</p></form></div>';
    var t = $('#lgTroca'); if (t) t.onclick = function () { try { localStorage.removeItem('epi.banco'); } catch (e) { } sb = null; telaLogin(); };
    $('#fLogin').onsubmit = async function (ev) {
      ev.preventDefault();
      var b = $('#lgBtn'), cfg = lerConfig();
      if (!cfg) {
        var u = ($('#lgUrl').value || '').trim().replace(/\/+$/, ''), k = ($('#lgKey').value || '').trim();
        if (!urlValida(u)) return telaLogin('O endereço precisa ser do tipo https://xxxx.supabase.co', true);
        if (k.length < 20) return telaLogin('Cole a chave pública (anon) completa.', true);
        cfg = { url: u, chave: k };
      }
      var email = $('#lgEmail').value.trim(), senha = $('#lgSenha').value;
      if (!email || !senha) { toast('Informe e-mail e senha.'); return; }
      b.disabled = true; b.innerHTML = '<span class="spin"></span> Entrando…';
      try {
        if (!sb || sb.__url !== cfg.url) conectar(cfg);
        var r = await sb.auth.signInWithPassword({ email: email, password: senha });
        if (r.error) {
          b.disabled = false; b.textContent = 'Entrar';
          var m = /invalid/i.test(r.error.message) ? 'E-mail ou senha incorretos.' : /rate|too many/i.test(r.error.message) ? 'Muitas tentativas. Espere alguns minutos.' : msgErro(r.error);
          $('#lgSenha').value = ''; toast(m); return;
        }
        if (!cfg.fixo) { try { localStorage.setItem('epi.banco', JSON.stringify({ url: cfg.url, chave: cfg.chave })); } catch (e) { } }
        await entrar();
      } catch (e) { b.disabled = false; b.textContent = 'Entrar'; toast(msgErro(e)); }
    };
  }

  async function entrar() {
    var u = await sb.auth.getUser();
    if (u.error || !u.data.user) return telaLogin();
    var p = await sb.from('perfis').select('*').eq('id', u.data.user.id).maybeSingle();
    if (p.error) return telaLogin(msgErro(p.error), true);
    if (!p.data || !p.data.ativo) {
      await sb.auth.signOut();
      return telaLogin('Seu login ainda não foi liberado. Peça para o administrador ativar o seu acesso no app (Ajustes → Usuários).', true);
    }
    perfil = p.data; usou(); gravouUso = 0; usou();
    $('#app').innerHTML = '<div style="padding:40px;text-align:center"><span class="spin"></span></div>';
    try { await carregar(); } catch (e) { return telaLogin(msgErro(e), true); }
    S.pilha = []; S.tela = 'painel'; S.params = {};
    render();
  }

  // ---------- navegação e casca ----------
  function ir(tela, params) { S.pilha.push({ tela: S.tela, params: S.params }); S.tela = tela; S.params = params || {}; render(); window.scrollTo(0, 0); }
  function aba(tela) { S.pilha = []; S.tela = tela; S.params = {}; render(); window.scrollTo(0, 0); }
  function voltar() { var p = S.pilha.pop(); if (p) { S.tela = p.tela; S.params = p.params; } else S.tela = 'painel'; render(); }
  var ABAS = [['painel', 'Painel'], ['equipe', 'Equipe'], ['entregar', 'Entregar'], ['itens', 'Itens'], ['analise', 'Análise']];
  var ABA_DE = { colab: 'equipe', funcoes: 'equipe', funcao: 'equipe', item: 'itens', ajustes: '', usuarios: '', conta: '', empresa: '', powerbi: '' };

  function render() {
    if (!perfil) return telaLogin();
    var t = TELAS[S.tela] || TELAS.painel, v = t();
    var ativa = ABA_DE[S.tela] != null ? ABA_DE[S.tela] : S.tela;
    $('#app').innerHTML =
      '<header class="top"><div class="top-in">' +
      (S.pilha.length ? '<button class="hbtn" data-act="voltar" aria-label="Voltar">' + IC.voltar + '</button>' : '') +
      '<h1>' + esc(v.titulo) + '<small>' + esc(v.sub || (D.cfg.obra || D.cfg.empresa_nome || perfil.nome)) + '</small></h1>' +
      (S.tela !== 'ajustes' ? '<button class="hbtn" data-act="ajustes" aria-label="Ajustes">' + IC.ajustes + '</button>' : '') +
      '</div><div class="stripe"></div></header>' +
      '<main class="wrap" id="main">' + v.html + '</main>' +
      '<nav class="tabs" aria-label="Seções"><div class="tabs-in">' + ABAS.map(function (a) {
        return '<button class="tab' + (a[0] === 'entregar' ? ' pri' : '') + '" data-aba="' + a[0] + '"' + (ativa === a[0] ? ' aria-current="page"' : '') + '>' + IC[a[0]] + a[1] + '</button>';
      }).join('') + '</div></nav>';
    if (v.depois) v.depois();
  }

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest('[data-aba]'); if (a) { aba(a.dataset.aba); return; }
    var b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
    var f = ACOES[b.dataset.act]; if (f) { ev.preventDefault(); f(b.dataset, b); }
  });
  document.addEventListener('input', function (ev) {
    var el = ev.target; if (!el.dataset || !el.dataset.filtro) return;
    S.f[el.dataset.filtro] = el.value; var fn = FILTRO[el.dataset.filtro]; if (fn) fn();
  });

  // ---------- janelas ----------
  function abrirOv(html, depois) { $('#ovBox').innerHTML = html; $('#ov').hidden = false; if (depois) depois($('#ovBox')); var f = $('#ovBox input, #ovBox select, #ovBox textarea'); if (f && !('ontouchstart' in window)) f.focus(); }
  function fecharOv() { var o = $('#ov'); if (o) { o.hidden = true; $('#ovBox').innerHTML = ''; } }
  $('#ov').addEventListener('click', function (ev) { if (ev.target.id === 'ov' && !$('#padCanvas')) fecharOv(); });
  function confirmar(titulo, texto, sim, perigo) {
    return new Promise(function (res) {
      abrirOv('<h2>' + esc(titulo) + '</h2><p class="note">' + esc(texto) + '</p><div class="grid2"><button class="btn" id="cNao">Voltar</button><button class="btn ' + (perigo ? 'danger' : 'pri') + '" id="cSim">' + esc(sim) + '</button></div>', function (box) {
        $('#cNao', box).onclick = function () { fecharOv(); res(false); };
        $('#cSim', box).onclick = function () { fecharOv(); res(true); };
      });
    });
  }
  async function ocupado(btn, fn) {
    var txt = btn ? btn.innerHTML : ''; if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
    try { return await fn(); }
    catch (e) { toast(msgErro(e)); return undefined; }
    finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = txt; } }
  }
  var pronto = { url: null, file: null };
  async function entregarArquivo(nome, blob) {
    var file = null; try { file = new File([blob], nome, { type: blob.type }); } catch (e) { }
    if (pronto.url) URL.revokeObjectURL(pronto.url);
    pronto.url = URL.createObjectURL(blob); pronto.file = file;
    var share = file && navigator.canShare && navigator.canShare({ files: [file] });
    abrirOv('<h2>Arquivo pronto</h2><p class="note">' + esc(nome) + '</p><div class="grid2">' +
      (share ? '<button class="btn pri" id="arqShare">Compartilhar</button>' : '') +
      '<a class="btn' + (share ? '' : ' pri') + '" id="arqOpen" href="' + pronto.url + '" download="' + esc(nome) + '" target="_blank" rel="noopener">Abrir</a></div><button class="btn" id="arqFechar">Fechar</button>', function (box) {
      $('#arqFechar', box).onclick = fecharOv;
      var s = $('#arqShare', box); if (s) s.onclick = function () { navigator.share({ files: [pronto.file], title: nome }).then(fecharOv).catch(function () { }); };
    });
  }
  function nomeArq(s) { return String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 110); }

  // ---------- assinatura ----------
  function assinar(titulo, nome) {
    return new Promise(function (res) {
      abrirOv('<h2>' + esc(titulo) + '</h2><p class="note">' + esc(nome) + ' — assine com o dedo dentro do quadro.</p><canvas id="padCanvas"></canvas>' +
        '<div class="row"><button class="btn" id="pLimpa">Limpar</button><span class="grow"></span><button class="btn" id="pCanc">Cancelar</button><button class="btn pri" id="pOk" disabled>Confirmar</button></div>', function (box) {
        var cv = $('#padCanvas', box), ctx, dpr = Math.max(1, window.devicePixelRatio || 1), tinta = 0, ult = null, bb = null, des = false;
        function prep() { var r = cv.getBoundingClientRect(); cv.width = r.width * dpr; cv.height = r.height * dpr; ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111'; tinta = 0; bb = null; $('#pOk', box).disabled = true; }
        prep();
        function pt(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
        function marca(p) { if (!bb) bb = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; bb.x0 = Math.min(bb.x0, p.x); bb.y0 = Math.min(bb.y0, p.y); bb.x1 = Math.max(bb.x1, p.x); bb.y1 = Math.max(bb.y1, p.y); }
        cv.addEventListener('pointerdown', function (e) { e.preventDefault(); cv.setPointerCapture(e.pointerId); des = true; ult = pt(e); marca(ult); ctx.beginPath(); ctx.arc(ult.x, ult.y, 1.2, 0, 7); ctx.fillStyle = '#111'; ctx.fill(); });
        cv.addEventListener('pointermove', function (e) { if (!des) return; var p = pt(e); ctx.beginPath(); ctx.moveTo(ult.x, ult.y); ctx.lineTo(p.x, p.y); ctx.stroke(); tinta += Math.hypot(p.x - ult.x, p.y - ult.y); ult = p; marca(p); if (tinta > 40) $('#pOk', box).disabled = false; });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { cv.addEventListener(n, function () { des = false; }); });
        $('#pLimpa', box).onclick = function () { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); prep(); };
        $('#pCanc', box).onclick = function () { fecharOv(); res(null); };
        $('#pOk', box).onclick = function () {
          var m = 8, x = Math.max(0, bb.x0 - m), y = Math.max(0, bb.y0 - m), w = Math.min(cv.width / dpr, bb.x1 + m) - x, h = Math.min(cv.height / dpr, bb.y1 + m) - y;
          var esc2 = Math.min(1, 600 / w, 220 / h), o = document.createElement('canvas');
          o.width = Math.max(10, Math.round(w * esc2)); o.height = Math.max(10, Math.round(h * esc2));
          o.getContext('2d').drawImage(cv, x * dpr, y * dpr, w * dpr, h * dpr, 0, 0, o.width, o.height);
          fecharOv(); res(o.toDataURL('image/png'));
        };
      });
    });
  }

  // =====================================================================
  //  TELAS
  // =====================================================================
  var TELAS = {}, ACOES = {}, FILTRO = {};
  ACOES.voltar = voltar;
  ACOES.ajustes = function () { ir('ajustes'); };
  ACOES.fechar = fecharOv;

  // ---------- Painel ----------
  TELAS.painel = function () {
    var ativos = D.colab.filter(function (c) { return c.ativo; });
    var vencidas = D.posse.filter(trocaVencida);
    var baixos = D.itens.filter(function (i) { return i.ativo && Number(i.estoque_minimo) > 0 && saldo(i.id) < Number(i.estoque_minimo); });
    var cas = D.itens.filter(function (i) { return i.ativo && caSit(i); });
    var ferr = D.posse.filter(function (p) { return p.item_tipo === 'FERRAMENTA'; });
    var semKit = ativos.filter(function (c) { return faltaKit(c).length; });
    function tile(n, txt, cls, act, extra) { return '<button class="tile ' + (n ? cls : 'ok') + '" data-act="' + act + '"' + (extra || '') + '><b>' + n + '</b><span>' + txt + '</span></button>'; }
    var h = '<div class="tiles">' +
      tile(ativos.length, 'Colaboradores ativos', 'sig', 'irEquipe', ' data-f=""') +
      tile(semKit.length, 'Com kit incompleto', 'warn', 'irEquipe', ' data-f="kit"') +
      tile(vencidas.length, 'Trocas vencidas', 'bad', 'irEquipe', ' data-f="troca"') +
      tile(baixos.length, 'Itens abaixo do mínimo', 'bad', 'irItens', ' data-f="baixo"') +
      tile(cas.length, 'CA vencido ou vencendo', 'warn', 'irItens', ' data-f="ca"') +
      tile(ferr.length, 'Ferramentas com a equipe', 'sig', 'irItens', ' data-f="FERRAMENTA"') + '</div>';
    if (!D.itens.length || !D.funcoes.length || !D.colab.length) {
      h += '<div class="card pad"><h2 class="h2">Comece por aqui</h2><ol class="note" style="margin:0;padding-left:18px;line-height:1.7">' +
        '<li>' + (D.itens.length ? '✓ ' : '') + 'Cadastre os EPIs e ferramentas, com o CA e a durabilidade informada pelo fornecedor (aba Itens).</li>' +
        '<li>' + (D.funcoes.length ? '✓ ' : '') + 'Cadastre as funções e o kit de cada uma (Equipe → Funções e kits).</li>' +
        '<li>' + (D.colab.length ? '✓ ' : '') + 'Cadastre os colaboradores ou importe da planilha (aba Equipe).</li>' +
        '<li>Lance a entrada do estoque (nota fiscal) de cada item.</li><li>Faça as entregas com assinatura (botão Entregar).</li></ol>' +
        (admin() ? '' : '<p class="note">Os cadastros são feitos pelo administrador.</p>') + '</div>';
    }
    if (baixos.length || cas.length) {
      h += '<div class="sec-h">Atenção no almoxarifado</div><div class="list">' +
        baixos.map(function (i) { return '<button class="lrow bad" data-act="verItem" data-id="' + i.id + '"><span class="grow"><span class="tt">' + esc(i.nome) + '</span><span class="meta">Saldo ' + fNum(saldo(i.id)) + ' ' + esc(i.unidade) + ' · mínimo ' + fNum(i.estoque_minimo) + '</span></span><span class="badge bad">Comprar</span></button>'; }).join('') +
        cas.map(function (i) { var s = caSit(i); return '<button class="lrow ' + (s === 'vencido' ? 'bad' : 'warn') + '" data-act="verItem" data-id="' + i.id + '"><span class="grow"><span class="tt">' + esc(i.nome) + '</span><span class="meta">CA ' + esc(i.ca || '') + ' · validade ' + fData(i.ca_validade) + '</span></span><span class="badge ' + (s === 'vencido' ? 'bad">CA vencido' : 'warn">CA vence logo') + '</span></button>'; }).join('') + '</div>';
    }
    if (vencidas.length) {
      vencidas.sort(function (a, b) { return a.troca_prevista < b.troca_prevista ? -1 : 1; });
      h += '<div class="sec-h">Trocas vencidas</div><div class="list">' + vencidas.slice(0, 12).map(function (p) {
        var c = colab(p.colaborador_id) || {};
        return '<button class="lrow warn" data-act="verColab" data-id="' + p.colaborador_id + '"><span class="grow"><span class="tt">' + esc(c.nome) + '</span><span class="meta">' + esc(p.item_nome) + ' · entregue em ' + fData(p.data) + ' · troca prevista ' + fData(p.troca_prevista) + '</span></span><span class="badge warn">' + dias(p.troca_prevista) + ' dias</span></button>';
      }).join('') + (vencidas.length > 12 ? '<button class="linkbtn" data-act="irEquipe" data-f="troca">Ver todas (' + vencidas.length + ')</button>' : '') + '</div>';
    }
    h += '<div class="sec-h">Últimas entregas</div><div class="list" id="ultimas"><div class="empty"><span class="spin"></span></div></div>';
    return {
      titulo: 'EPI e Ferramentas', html: h, depois: async function () {
        try {
          var r = await q(sb.from('entregas').select('id,colaborador_id,colaborador_nome,data_hora,responsavel_nome,cancelada').order('id', { ascending: false }).limit(8));
          var el = $('#ultimas'); if (!el) return;
          el.innerHTML = r.length ? r.map(linhaFicha).join('') : '<div class="empty"><b>Nenhuma entrega ainda</b>Use o botão Entregar para registrar a primeira.</div>';
        } catch (e) { var el2 = $('#ultimas'); if (el2) el2.innerHTML = '<p class="msg err">' + esc(msgErro(e)) + '</p>'; }
      }
    };
  };
  function linhaFicha(f) {
    return '<button class="lrow ' + (f.cancelada ? 'off' : 'ok') + '" data-act="verFicha" data-id="' + f.id + '"><span class="num" style="color:var(--muted);font-size:.85rem">' + numero(f.id) + '</span><span class="grow"><span class="tt">' + esc(f.colaborador_nome) + '</span><span class="meta">' + fDH(f.data_hora) + ' · ' + esc(f.responsavel_nome) + '</span></span>' + (f.cancelada ? '<span class="badge bad">Cancelada</span>' : '') + '</button>';
  }
  ACOES.irEquipe = function (d) { S.f.eqSit = d.f || ''; aba('equipe'); };
  ACOES.irItens = function (d) { S.f.itSit = d.f || ''; aba('itens'); };

  // ---------- Equipe ----------
  TELAS.equipe = function () {
    var sit = S.f.eqSit || '';
    var chips = [['', 'Ativos'], ['kit', 'Kit incompleto'], ['troca', 'Troca vencida'], ['inativos', 'Inativos']];
    var h = '<div class="row"><input type="search" placeholder="Buscar nome, matrícula ou CPF" data-filtro="eqBusca" value="' + esc(S.f.eqBusca || '') + '" class="grow" style="flex:1"></div>' +
      '<div class="chips scroll">' + chips.map(function (c) { return '<button class="chip" data-act="eqSit" data-f="' + c[0] + '" aria-pressed="' + (sit === c[0]) + '">' + c[1] + '</button>'; }).join('') +
      '<select data-filtro="eqFuncao" style="width:auto;min-height:36px;padding:4px 10px;border-radius:999px;flex:none"><option value="">Todas as funções</option>' + D.funcoes.map(function (f) { return '<option value="' + f.id + '"' + (String(S.f.eqFuncao) === String(f.id) ? ' selected' : '') + '>' + esc(f.nome) + '</option>'; }).join('') + '</select></div>' +
      '<div class="list" id="eqLista"></div>' +
      '<div class="grid2">' + (admin() ? '<button class="btn" data-act="novoColab">+ Colaborador</button><button class="btn" data-act="importar">Importar planilha</button>' : '') + '</div>' +
      '<button class="btn ghost full" data-act="funcoes">Funções e kits</button>';
    return { titulo: 'Equipe', html: h, depois: FILTRO.eqBusca };
  };
  FILTRO.eqBusca = FILTRO.eqFuncao = function () {
    var el = $('#eqLista'); if (!el) return;
    var b = norm(S.f.eqBusca), sit = S.f.eqSit || '', fn = S.f.eqFuncao ? Number(S.f.eqFuncao) : null;
    var lista = D.colab.filter(function (c) {
      if (sit === 'inativos' ? c.ativo : !c.ativo) return false;
      if (fn && c.funcao_id !== fn) return false;
      if (b && norm(c.nome + ' ' + (c.matricula || '') + ' ' + (c.cpf || '')).indexOf(b) < 0 && soDig(S.f.eqBusca) !== (c.cpf || '-')) return false;
      if (sit === 'kit' && !faltaKit(c).length) return false;
      if (sit === 'troca' && !posseDe(c.id).some(trocaVencida)) return false;
      return true;
    });
    el.innerHTML = lista.length ? lista.slice(0, 300).map(function (c) {
      var falta = c.ativo ? faltaKit(c).length : 0, venc = posseDe(c.id).filter(trocaVencida).length, f = funcao(c.funcao_id);
      return '<button class="lrow ' + (!c.ativo ? 'off' : venc ? 'warn' : falta ? 'sig' : 'ok') + '" data-act="verColab" data-id="' + c.id + '"><span class="grow"><span class="tt">' + esc(c.nome) + '</span><span class="meta">' + esc(f ? f.nome : 'Sem função') + (c.matricula ? ' · ' + esc(c.matricula) : '') + '</span></span><span class="side">' +
        (venc ? '<span class="badge warn">' + venc + ' troca' + (venc > 1 ? 's' : '') + '</span>' : '') + (falta ? '<span class="badge sig">Falta ' + falta + '</span>' : '') + (!c.ativo ? '<span class="badge">Inativo</span>' : '') + '</span></button>';
    }).join('') + (lista.length > 300 ? '<p class="note">Mostrando 300 de ' + lista.length + '. Use a busca.</p>' : '') : '<div class="empty"><b>Ninguém aqui</b>' + (D.colab.length ? 'Nenhum colaborador com esse filtro.' : 'Cadastre os colaboradores ou importe da planilha.') + '</div>';
  };
  ACOES.eqSit = function (d) { S.f.eqSit = d.f; render(); };
  ACOES.verColab = function (d) { ir('colab', { id: Number(d.id) }); };

  // ---------- Colaborador ----------
  TELAS.colab = function () {
    var c = colab(S.params.id); if (!c) return { titulo: 'Colaborador', html: '<div class="empty"><b>Não encontrado</b></div>' };
    var f = funcao(c.funcao_id), posse = posseDe(c.id), falta = faltaKit(c);
    var h = '<div class="card pad"><dl class="kv"><dt>Função</dt><dd>' + esc(f ? f.nome : '—') + '</dd><dt>Matrícula</dt><dd>' + esc(c.matricula || '—') + '</dd><dt>CPF</dt><dd>' + fCPF(c.cpf) + '</dd>' +
      (c.setor ? '<dt>Setor</dt><dd>' + esc(c.setor) + '</dd>' : '') + '<dt>Admissão</dt><dd>' + fData(c.admissao) + '</dd><dt>Situação</dt><dd>' + (c.ativo ? 'Ativo' : 'Inativo') + '</dd></dl>' +
      '<div class="grid2">' + (c.ativo ? '<button class="btn pri" data-act="entregarPara" data-id="' + c.id + '">Nova entrega</button>' : '') + '<button class="btn" data-act="pdfColab" data-id="' + c.id + '">Ficha completa (PDF)</button>' +
      (admin() ? '<button class="btn" data-act="editColab" data-id="' + c.id + '">Editar cadastro</button>' : '') + '</div></div>';
    h += '<div class="sec-h">Com o colaborador</div><div class="list">' + (posse.length ? posse.map(function (p) {
      var venc = trocaVencida(p), it = item(p.item_id) || {};
      return '<div class="lrow ' + (venc ? 'warn' : 'ok') + '" style="cursor:default"><span class="grow"><span class="tt">' + esc(p.item_nome) + (Number(p.quantidade) !== 1 ? ' × ' + fNum(p.quantidade) : '') + '</span><span class="meta">Entregue em ' + fData(p.data) + ' (' + p.dias_em_uso + ' dias)' + (p.troca_prevista ? ' · troca prevista ' + fData(p.troca_prevista) : '') + ' · ficha ' + numero(p.entrega_id) + '</span></span><span class="side">' +
        (venc ? '<span class="badge warn">Troca vencida</span>' : '') + (it.devolve || p.item_tipo === 'FERRAMENTA' ? '<button class="btn sm" data-act="devolver" data-id="' + p.id + '">Devolver</button>' : '') + '</span></div>';
    }).join('') : '<div class="empty">Nenhum item com ele no momento.</div>') + '</div>';
    if (falta.length && c.ativo) h += '<div class="sec-h">Falta do kit da função</div><div class="list">' + falta.map(function (k) { var it = item(k.item_id); return '<div class="lrow sig" style="cursor:default"><span class="grow"><span class="tt">' + esc(it.nome) + '</span><span class="meta">' + (it.tipo === 'EPI' ? 'EPI' : 'Ferramenta') + ' · ' + fNum(k.quantidade) + ' ' + esc(it.unidade) + '</span></span></div>'; }).join('') + '</div>';
    h += '<div class="sec-h">Fichas assinadas</div><div class="list" id="cFichas"><div class="empty"><span class="spin"></span></div></div>';
    return {
      titulo: c.nome, sub: f ? f.nome : '', html: h, depois: async function () {
        try {
          var r = await q(sb.from('entregas').select('id,colaborador_id,colaborador_nome,data_hora,responsavel_nome,cancelada').eq('colaborador_id', c.id).order('id', { ascending: false }).limit(200));
          var el = $('#cFichas'); if (el) el.innerHTML = r.length ? r.map(linhaFicha).join('') : '<div class="empty">Nenhuma ficha ainda.</div>';
        } catch (e) { var el2 = $('#cFichas'); if (el2) el2.innerHTML = '<p class="msg err">' + esc(msgErro(e)) + '</p>'; }
      }
    };
  };

  ACOES.devolver = function (d) {
    var p = D.posse.find(function (x) { return x.id === Number(d.id); }); if (!p) return;
    var est = 'BOM';
    abrirOv('<h2>Devolução</h2><p class="note">' + esc(p.item_nome) + ' · entregue em ' + fData(p.data) + ' (' + p.dias_em_uso + ' dias de uso)</p><span class="lbl">Como voltou?</span>' +
      '<div class="chips" id="dvEst"><button class="chip" data-e="BOM" aria-pressed="true">Em bom estado (volta ao estoque)</button><button class="chip" data-e="DANIFICADO" aria-pressed="false">Danificado</button><button class="chip" data-e="PERDIDO" aria-pressed="false">Perdido / não devolvido</button></div>' +
      '<label class="field"><span class="lbl">Observação</span><textarea id="dvObs" maxlength="500"></textarea></label><div class="grid2"><button class="btn" data-act="fechar">Cancelar</button><button class="btn pri" id="dvOk">Registrar</button></div>', function (box) {
      $$('#dvEst .chip', box).forEach(function (b) { b.onclick = function () { est = b.dataset.e; $$('#dvEst .chip', box).forEach(function (o) { o.setAttribute('aria-pressed', o === b); }); }; });
      $('#dvOk', box).onclick = function () {
        ocupado($('#dvOk', box), async function () {
          await rpc('registrar_devolucao', { p_entrega_item: p.id, p_estado: est, p_obs: $('#dvObs', box).value.trim() || null });
          fecharOv(); await carregar(); render(); toast(est === 'BOM' ? 'Devolução registrada. O item voltou ao estoque.' : 'Devolução registrada.');
        });
      };
    });
  };

  function formColab(c) {
    c = c || { ativo: true };
    abrirOv('<h2>' + (c.id ? 'Editar colaborador' : 'Novo colaborador') + '</h2>' +
      '<label class="field"><span class="lbl">Nome completo</span><input type="text" id="fcNome" maxlength="160" value="' + esc(c.nome || '') + '"></label>' +
      '<div class="grid2"><label class="field"><span class="lbl">CPF</span><input type="text" id="fcCpf" inputmode="numeric" maxlength="14" value="' + esc(c.cpf ? fCPF(c.cpf) : '') + '"></label>' +
      '<label class="field"><span class="lbl">Matrícula</span><input type="text" id="fcMat" maxlength="30" value="' + esc(c.matricula || '') + '"></label></div>' +
      '<label class="field"><span class="lbl">Função</span><select id="fcFun"><option value="">Selecione</option>' + D.funcoes.filter(function (f) { return f.ativo || f.id === c.funcao_id; }).map(function (f) { return '<option value="' + f.id + '"' + (f.id === c.funcao_id ? ' selected' : '') + '>' + esc(f.nome) + '</option>'; }).join('') + '</select></label>' +
      '<div class="grid2"><label class="field"><span class="lbl">Setor / equipe</span><input type="text" id="fcSet" maxlength="120" value="' + esc(c.setor || '') + '"></label>' +
      '<label class="field"><span class="lbl">Admissão</span><input type="date" id="fcAdm" value="' + esc(c.admissao || '') + '"></label></div>' +
      '<label class="chk"><input type="checkbox" id="fcAtivo"' + (c.ativo ? ' checked' : '') + '> Ativo (desmarque no desligamento)</label>' +
      '<div class="grid2"><button class="btn" data-act="fechar">Cancelar</button><button class="btn pri" id="fcOk">Salvar</button></div>', function (box) {
      $('#fcOk', box).onclick = function () {
        var cpf = soDig($('#fcCpf', box).value), nome = $('#fcNome', box).value.trim().replace(/\s+/g, ' ');
        if (nome.length < 2) return toast('Informe o nome.');
        if (cpf && !cpfValido(cpf)) return toast('CPF inválido. Confira os números.');
        if (!$('#fcFun', box).value) return toast('Escolha a função.');
        var dados = { nome: nome, cpf: cpf || null, matricula: $('#fcMat', box).value.trim() || null, funcao_id: Number($('#fcFun', box).value), setor: $('#fcSet', box).value.trim() || null, admissao: $('#fcAdm', box).value || null, ativo: $('#fcAtivo', box).checked };
        ocupado($('#fcOk', box), async function () {
          var r = c.id ? await q(sb.from('colaboradores').update(dados).eq('id', c.id).select()) : await q(sb.from('colaboradores').insert(dados).select());
          if (!r.length) throw new Error('Você não tem permissão para isso.');
          fecharOv(); await carregar(); if (c.id) render(); else ir('colab', { id: r[0].id }); toast('Colaborador salvo.');
        });
      };
    });
  }
  ACOES.novoColab = function () { if (!D.funcoes.length) return toast('Cadastre as funções primeiro (Funções e kits).'); formColab(); };
  ACOES.editColab = function (d) { formColab(colab(Number(d.id))); };

  // importação de planilha
  ACOES.importar = function () {
    abrirOv('<h2>Importar colaboradores</h2><p class="note">Planilha Excel ou CSV com uma linha de cabeçalho. Colunas reconhecidas: <b>Nome</b>, <b>CPF</b>, <b>Matrícula</b>, <b>Função</b>, <b>Setor</b>, <b>Admissão</b>. Funções que não existem são criadas. Quem já está cadastrado (mesmo CPF ou mesmo nome) é ignorado.</p>' +
      '<input type="file" id="imArq" accept=".xlsx,.xls,.csv"><div id="imRes"></div><div class="grid2"><button class="btn" data-act="fechar">Fechar</button><button class="btn pri" id="imOk" disabled>Importar</button></div>', function (box) {
      var linhas = [];
      $('#imArq', box).onchange = async function (e) {
        var f = e.target.files[0]; if (!f) return;
        try {
          var wb;
          if (/\.csv$/i.test(f.name)) {
            var txt = await f.text(), l1 = txt.split(/\r?\n/)[0] || '';
            wb = XLSX.read(txt, { type: 'string', raw: true, FS: (l1.split(';').length > l1.split(',').length ? ';' : ',') });
          } else wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
          function col(r, nomes) { for (var k in r) { if (nomes.indexOf(norm(k).replace(/[^a-z]/g, '')) >= 0) return r[k]; } return ''; }
          var jaCpf = {}, jaNome = {}; D.colab.forEach(function (c) { if (c.cpf) jaCpf[c.cpf] = 1; jaNome[norm(c.nome)] = 1; });
          var erros = 0, rep = 0; linhas = [];
          rows.forEach(function (r) {
            var nome = String(col(r, ['nome', 'colaborador', 'nomecompleto'])).trim().replace(/\s+/g, ' '); if (nome.length < 2) return;
            var cpf = soDig(col(r, ['cpf'])); if (cpf && cpf.length < 11) cpf = cpf.padStart(11, '0');
            if (cpf && !cpfValido(cpf)) { erros++; cpf = null; }
            if ((cpf && jaCpf[cpf]) || jaNome[norm(nome)]) { rep++; return; }
            var adm = col(r, ['admissao', 'dataadmissao']), ad = null;
            if (adm instanceof Date) ad = adm.getFullYear() + '-' + pad2(adm.getMonth() + 1) + '-' + pad2(adm.getDate());
            else if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(adm).trim())) { var p = String(adm).trim().split('/'); ad = p[2] + '-' + p[1] + '-' + p[0]; }
            linhas.push({ nome: nome.slice(0, 160), cpf: cpf || null, matricula: String(col(r, ['matricula', 'registro', 'chapa'])).trim().slice(0, 30) || null, funcao: String(col(r, ['funcao', 'cargo'])).trim().slice(0, 120), setor: String(col(r, ['setor', 'equipe', 'obra'])).trim().slice(0, 120) || null, admissao: ad });
            if (cpf) jaCpf[cpf] = 1; jaNome[norm(nome)] = 1;
          });
          $('#imRes', box).innerHTML = '<p class="msg ' + (linhas.length ? '' : 'warn') + '">' + linhas.length + ' novos para importar' + (rep ? ' · ' + rep + ' já cadastrados' : '') + (erros ? ' · ' + erros + ' com CPF inválido (entram sem CPF)' : '') + '.</p>';
          $('#imOk', box).disabled = !linhas.length;
        } catch (err) { $('#imRes', box).innerHTML = '<p class="msg err">Não consegui ler a planilha.</p>'; }
      };
      $('#imOk', box).onclick = function () {
        ocupado($('#imOk', box), async function () {
          var porNome = {}; D.funcoes.forEach(function (f) { porNome[norm(f.nome)] = f.id; });
          var novas = []; linhas.forEach(function (l) { if (l.funcao && !porNome[norm(l.funcao)] && novas.every(function (n) { return norm(n) !== norm(l.funcao); })) novas.push(l.funcao); });
          if (novas.length) { var fs = await q(sb.from('funcoes').insert(novas.map(function (n) { return { nome: n }; })).select()); fs.forEach(function (f) { porNome[norm(f.nome)] = f.id; }); }
          var dados = linhas.map(function (l) { return { nome: l.nome, cpf: l.cpf, matricula: l.matricula, funcao_id: l.funcao ? porNome[norm(l.funcao)] : null, setor: l.setor, admissao: l.admissao }; });
          for (var i = 0; i < dados.length; i += 200) await q(sb.from('colaboradores').insert(dados.slice(i, i + 200)));
          fecharOv(); await carregar(); render(); toast(dados.length + ' colaboradores importados' + (novas.length ? ' e ' + novas.length + ' funções criadas' : '') + '.');
        });
      };
    });
  };

  // ---------- Fichas ----------
  async function buscarFicha(id) {
    var r = await Promise.all([q(sb.from('entregas').select('*').eq('id', id).single()), q(sb.from('entrega_itens').select('*').eq('entrega_id', id).order('id'))]);
    return { entrega: r[0], itens: r[1] };
  }
  ACOES.verFicha = function (d) {
    var id = Number(d.id);
    abrirOv('<div class="empty"><span class="spin"></span></div>');
    buscarFicha(id).then(function (f) {
      var e = f.entrega;
      $('#ovBox').innerHTML = '<h2>Ficha nº ' + numero(e.id) + '</h2>' + (e.cancelada ? '<p class="msg err">Cancelada em ' + fDH(e.cancelada_em) + ': ' + esc(e.cancelada_motivo) + '</p>' : '') +
        '<dl class="kv"><dt>Colaborador</dt><dd>' + esc(e.colaborador_nome) + '</dd><dt>Data</dt><dd>' + fDH(e.data_hora) + '</dd><dt>Entregou</dt><dd>' + esc(e.responsavel_nome) + '</dd>' + (e.observacao ? '<dt>Obs.</dt><dd>' + esc(e.observacao) + '</dd>' : '') + '</dl>' +
        '<div class="list">' + f.itens.map(function (i) { return '<div class="lrow" style="cursor:default"><span class="grow"><span class="tt">' + esc(i.item_nome) + ' × ' + fNum(i.quantidade) + '</span><span class="meta">' + (i.ca ? 'CA ' + esc(i.ca) + ' · ' : '') + MOTIVO[i.motivo] + (i.dias_uso_anterior != null ? ' · o anterior durou ' + i.dias_uso_anterior + ' dias' + (i.vida_util_dias ? ' de ' + i.vida_util_dias : '') : '') + '</span></span></div>'; }).join('') + '</div>' +
        '<div class="grid2"><div class="assin"><h3>Colaborador</h3><div class="sigimg on" style="background-image:url(' + esc(e.assinatura_colaborador) + ')"></div></div><div class="assin"><h3>Responsável</h3><div class="sigimg on" style="background-image:url(' + esc(e.assinatura_responsavel) + ')"></div></div></div>' +
        '<p class="note" style="font-family:var(--f-mono);font-size:.7rem;overflow-wrap:anywhere">SHA-256 ' + esc(e.hash) + '</p>' +
        '<div class="grid2"><button class="btn pri" id="fPdf">PDF da ficha</button><button class="btn" data-act="fechar">Fechar</button></div>' +
        (admin() && !e.cancelada ? '<button class="btn danger" id="fCanc">Cancelar esta ficha</button>' : '');
      $('#fPdf').onclick = function () { gerarPdfFicha(f); };
      var cb = $('#fCanc'); if (cb) cb.onclick = function () { cancelarFicha(e); };
    }).catch(function (err) { fecharOv(); toast(msgErro(err)); });
  };
  function gerarPdfFicha(f) {
    try { entregarArquivo(nomeArq('Ficha EPI ' + numero(f.entrega.id) + ' - ' + f.entrega.colaborador_nome) + '.pdf', EPIPDF.ficha({ empresa: empresa(), entrega: f.entrega, itens: f.itens })); }
    catch (e) { toast('Não consegui gerar o PDF.'); }
  }
  function cancelarFicha(e) {
    abrirOv('<h2>Cancelar ficha nº ' + numero(e.id) + '</h2><p class="note">Use só para ficha lançada errada. Os itens voltam ao estoque e a ficha fica marcada como cancelada (não é apagada).</p><label class="field"><span class="lbl">Motivo</span><textarea id="cnMot" maxlength="500"></textarea></label><div class="grid2"><button class="btn" data-act="fechar">Voltar</button><button class="btn danger" id="cnOk">Cancelar ficha</button></div>', function (box) {
      $('#cnOk', box).onclick = function () {
        ocupado($('#cnOk', box), async function () { await rpc('cancelar_entrega', { p_entrega: e.id, p_motivo: $('#cnMot', box).value.trim() }); fecharOv(); await carregar(); render(); toast('Ficha cancelada.'); });
      };
    });
  }
  ACOES.pdfColab = function (d, btn) {
    var c = colab(Number(d.id)); if (!c) return;
    ocupado(btn, async function () {
      var r = await Promise.all([
        todos(function () { return sb.from('entregas').select('id,cancelada,assinatura_colaborador').eq('colaborador_id', c.id).order('id'); }),
        todos(function () { return sb.from('entrega_itens').select('*').eq('colaborador_id', c.id).order('id'); })]);
      var f = funcao(c.funcao_id);
      entregarArquivo(nomeArq('Ficha de EPI - ' + c.nome) + '.pdf', EPIPDF.fichaColaborador({ empresa: empresa(), termo: termoAtual(), colaborador: { nome: c.nome, cpf: c.cpf, matricula: c.matricula, funcao: f ? f.nome : '', admissao: c.admissao }, fichas: r[0], itens: r[1] }));
    });
  };

  // ---------- Entregar ----------
  ACOES.entregarPara = function (d) { S.ent = { colab: Number(d.id), linhas: [], assC: null, assR: null, obs: '' }; aba('entregar'); };
  TELAS.entregar = function () {
    var e = S.ent;
    if (!e || !colab(e.colab)) {
      var h = '<input type="search" placeholder="Buscar colaborador (nome, matrícula ou CPF)" data-filtro="entBusca" value="' + esc(S.f.entBusca || '') + '"><div class="list" id="entLista"></div>';
      return { titulo: 'Nova entrega', sub: 'Escolha o colaborador', html: h, depois: FILTRO.entBusca };
    }
    var c = colab(e.colab), f = funcao(c.funcao_id), posse = posseDe(c.id), kit = kitDe(c.funcao_id);
    var naFicha = {}; e.linhas.forEach(function (l) { naFicha[l.item_id] = l; });
    var h = '<div class="lrow ok" style="cursor:default"><span class="grow"><span class="tt">' + esc(c.nome) + '</span><span class="meta">' + esc(f ? f.nome : 'Sem função') + (c.matricula ? ' · ' + esc(c.matricula) : '') + '</span></span><button class="btn sm" data-act="entTroca">Trocar</button></div>';
    // kit
    h += '<div class="sec-h">Kit da função</div><div class="card pad">' + (kit.length ? kit.map(function (k) {
      var it = item(k.item_id); if (!it || !it.ativo) return '';
      var p = posse.filter(function (x) { return x.item_id === it.id; })[0];
      var st = p ? (trocaVencida(p) ? '<span class="badge warn">Troca vencida</span> ' : '<span class="badge ok">Com ele</span> ') + 'desde ' + fData(p.data) + ' (' + p.dias_em_uso + ' dias' + (it.vida_util_dias ? ' de ' + it.vida_util_dias : '') + ')' : '<span class="badge sig">Não recebeu</span>';
      return '<div class="row" style="padding:6px 0;border-top:1px dashed var(--line)"><span class="grow" style="flex:1"><b style="display:block">' + esc(it.nome) + '</b><span class="note">' + st + '</span></span>' +
        (naFicha[it.id] ? '<span class="badge ok">Na ficha</span>' : '<button class="btn sm" data-act="entAdd" data-id="' + it.id + '" data-q="' + k.quantidade + '">Adicionar</button>') + '</div>';
    }).join('') : '<p class="note">A função não tem kit cadastrado. Use "Outro item" abaixo' + (admin() ? ' ou cadastre o kit em Equipe → Funções e kits' : '') + '.</p>') +
      '<button class="btn ghost" data-act="entOutro">+ Outro item</button></div>';
    // linhas
    h += '<div class="sec-h">Itens desta ficha</div><div class="card pad">' + (e.linhas.length ? e.linhas.map(function (l, ix) {
      var it = item(l.item_id), p = posse.filter(function (x) { return x.item_id === it.id; })[0], sl = saldo(it.id), ca = caSit(it);
      var ops = p ? MOTIVO_TROCA : MOTIVO_NOVO, aviso = '';
      if (ca === 'vencido') aviso += '<p class="msg err">CA ' + esc(it.ca) + ' vencido em ' + fData(it.ca_validade) + '. Não é possível entregar este EPI.</p>';
      if (sl < l.qtd) aviso += '<p class="msg err">Estoque insuficiente: saldo ' + fNum(sl) + ' ' + esc(it.unidade) + '. Lance a entrada na aba Itens.</p>';
      if (p && it.vida_util_dias && (l.motivo === 'DANIFICADO' || l.motivo === 'PERDA' || l.motivo === 'DESGASTE_NATURAL') && p.dias_em_uso < it.vida_util_dias)
        aviso += '<p class="msg warn">Troca antes do prazo: o atual está em uso há ' + p.dias_em_uso + ' dias, e o fornecedor informa ' + it.vida_util_dias + ' dias. Fica registrado na análise de durabilidade.</p>';
      return '<div class="ln"><div class="ln-h"><span class="grow"><b>' + esc(it.nome) + '</b><span class="note">' + (it.ca ? 'CA ' + esc(it.ca) + ' · ' : '') + 'saldo ' + fNum(sl) + ' ' + esc(it.unidade) + (p ? ' · substitui o de ' + fData(p.data) : '') + '</span></span>' +
        '<div class="qty"><button data-act="entQ" data-ix="' + ix + '" data-d="-1" aria-label="Menos">−</button><input type="number" inputmode="decimal" min="1" value="' + l.qtd + '" data-ixq="' + ix + '" aria-label="Quantidade"><button data-act="entQ" data-ix="' + ix + '" data-d="1" aria-label="Mais">+</button></div></div>' +
        '<div class="chips">' + ops.map(function (m) { return '<button class="chip" data-act="entMot" data-ix="' + ix + '" data-m="' + m + '" aria-pressed="' + (l.motivo === m) + '">' + MOTIVO[m] + '</button>'; }).join('') + '</div>' + aviso +
        '<button class="linkbtn" data-act="entDel" data-ix="' + ix + '" style="color:var(--bad)">Tirar da ficha</button></div>';
    }).join('') : '<p class="note">Toque em Adicionar nos itens do kit ou em Outro item.</p>') + '</div>';
    // termo e assinaturas
    var bloqueio = e.linhas.some(function (l) { var it = item(l.item_id); return caSit(it) === 'vencido' || saldo(it.id) < l.qtd; });
    h += '<label class="field"><span class="lbl">Observação (opcional)</span><textarea id="entObs" maxlength="1000">' + esc(e.obs) + '</textarea></label>' +
      '<div class="sec-h">Termo e assinaturas</div><p class="termo">' + esc(termoAtual()) + '</p>' +
      '<div class="assin"><h3>Colaborador</h3><button class="sigimg' + (e.assC ? ' on" style="background-image:url(' + e.assC + ')"' : '"') + ' data-act="entAssC">' + (e.assC ? '' : 'Toque para ' + esc(c.nome.split(' ')[0]) + ' assinar') + '</button></div>' +
      '<div class="assin"><h3>Responsável pela entrega</h3><button class="sigimg' + (e.assR ? ' on" style="background-image:url(' + e.assR + ')"' : '"') + ' data-act="entAssR">' + (e.assR ? '' : 'Toque para ' + esc(perfil.nome) + ' assinar') + '</button></div>' +
      '<button class="btn pri full" data-act="entGravar"' + (!e.linhas.length || !e.assC || !e.assR || bloqueio ? ' disabled' : '') + '>Gravar ficha assinada</button>' +
      '<p class="note">Depois de gravada, a ficha não pode ser alterada. Se algo mudar nos itens, as assinaturas são pedidas de novo.</p>';
    return {
      titulo: 'Nova entrega', sub: c.nome, html: h, depois: function () {
        $$('[data-ixq]').forEach(function (inp) { inp.onchange = function () { var v = Math.max(1, Math.min(1000, Number(inp.value) || 1)); mudouFicha(); e.linhas[Number(inp.dataset.ixq)].qtd = v; render(); }; });
        var o = $('#entObs'); if (o) o.oninput = function () { e.obs = o.value; };
      }
    };
  };
  FILTRO.entBusca = function () {
    var el = $('#entLista'); if (!el) return; var b = norm(S.f.entBusca);
    var l = D.colab.filter(function (c) { return c.ativo && (!b || norm(c.nome + ' ' + (c.matricula || '') + ' ' + (c.cpf || '')).indexOf(b) >= 0); });
    el.innerHTML = l.length ? l.slice(0, 100).map(function (c) { var f = funcao(c.funcao_id), falta = faltaKit(c).length; return '<button class="lrow ' + (falta ? 'sig' : 'ok') + '" data-act="entColab" data-id="' + c.id + '"><span class="grow"><span class="tt">' + esc(c.nome) + '</span><span class="meta">' + esc(f ? f.nome : '') + (c.matricula ? ' · ' + esc(c.matricula) : '') + '</span></span>' + (falta ? '<span class="badge sig">Falta ' + falta + '</span>' : '') + '</button>'; }).join('') : '<div class="empty"><b>Nenhum colaborador</b>' + (D.colab.length ? 'Ninguém com esse nome.' : 'Cadastre a equipe primeiro.') + '</div>';
  };
  ACOES.entColab = function (d) { S.ent = { colab: Number(d.id), linhas: [], assC: null, assR: null, obs: '' }; render(); window.scrollTo(0, 0); };
  ACOES.entTroca = function () { if (S.ent && S.ent.linhas.length) { confirmar('Trocar colaborador?', 'Os itens e as assinaturas desta ficha serão descartados.', 'Trocar', true).then(function (ok) { if (ok) { S.ent = null; render(); } }); } else { S.ent = null; render(); } };
  function mudouFicha() { if (S.ent && (S.ent.assC || S.ent.assR)) { S.ent.assC = S.ent.assR = null; toast('Os itens mudaram: as assinaturas precisam ser feitas de novo.'); } }
  function addLinha(itemId, qtd) {
    var e = S.ent, it = item(itemId); if (!it) return;
    if (e.linhas.some(function (l) { return l.item_id === itemId; })) return toast('Este item já está na ficha.');
    var p = posseDe(e.colab).filter(function (x) { return x.item_id === itemId; })[0];
    var mot = p ? (trocaVencida(p) ? 'TROCA_PERIODICA' : 'DESGASTE_NATURAL') : 'PRIMEIRA_ENTREGA';
    mudouFicha(); e.linhas.push({ item_id: itemId, qtd: Number(qtd) || 1, motivo: mot }); render();
  }
  ACOES.entAdd = function (d) { addLinha(Number(d.id), d.q); };
  ACOES.entOutro = function () {
    abrirOv('<h2>Outro item</h2><input type="search" id="oiB" placeholder="Buscar item"><div class="list" id="oiL" style="max-height:55vh;overflow:auto"></div><button class="btn" data-act="fechar">Fechar</button>', function (box) {
      function lista() {
        var b = norm($('#oiB', box).value);
        $('#oiL', box).innerHTML = D.itens.filter(function (i) { return i.ativo && (!b || norm(i.nome + ' ' + (i.ca || '')).indexOf(b) >= 0); }).slice(0, 80).map(function (i) {
          return '<button class="lrow" data-oi="' + i.id + '"><span class="grow"><span class="tt">' + esc(i.nome) + '</span><span class="meta">' + (i.tipo === 'EPI' ? 'EPI' : 'Ferramenta') + (i.ca ? ' · CA ' + esc(i.ca) : '') + ' · saldo ' + fNum(saldo(i.id)) + '</span></span></button>';
        }).join('') || '<div class="empty">Nenhum item.</div>';
        $$('[data-oi]', box).forEach(function (b2) { b2.onclick = function () { fecharOv(); addLinha(Number(b2.dataset.oi), 1); }; });
      }
      $('#oiB', box).oninput = lista; lista();
    });
  };
  ACOES.entQ = function (d) { var l = S.ent.linhas[Number(d.ix)]; mudouFicha(); l.qtd = Math.max(1, Math.min(1000, l.qtd + Number(d.d))); render(); };
  ACOES.entMot = function (d) { var l = S.ent.linhas[Number(d.ix)]; if (l.motivo !== d.m) { mudouFicha(); l.motivo = d.m; } render(); };
  ACOES.entDel = function (d) { mudouFicha(); S.ent.linhas.splice(Number(d.ix), 1); render(); };
  ACOES.entAssC = async function () { if (!S.ent.linhas.length) return toast('Inclua os itens antes de assinar.'); var c = colab(S.ent.colab); var a = await assinar('Assinatura do colaborador', c.nome); if (a) { S.ent.assC = a; render(); } };
  ACOES.entAssR = async function () { if (!S.ent.linhas.length) return toast('Inclua os itens antes de assinar.'); var a = await assinar('Assinatura do responsável', perfil.nome); if (a) { S.ent.assR = a; render(); } };
  ACOES.entGravar = function (d, btn) {
    var e = S.ent; var o = $('#entObs'); if (o) e.obs = o.value;
    ocupado(btn, async function () {
      var r = await rpc('registrar_entrega', { p: { colaborador_id: e.colab, itens: e.linhas.map(function (l) { return { item_id: l.item_id, quantidade: l.qtd, motivo: l.motivo }; }), assinatura_colaborador: e.assC, assinatura_responsavel: e.assR, termo: termoAtual(), observacao: e.obs.trim() || null, dispositivo: navigator.userAgent } });
      var cid = e.colab; S.ent = null; await carregar(); render();
      abrirOv('<h2>Ficha nº ' + numero(r.id) + ' gravada</h2><p class="msg">Entrega registrada com as duas assinaturas e baixada do estoque.</p><button class="btn pri" id="okPdf">PDF da ficha</button><div class="grid2"><button class="btn" id="okColab">Ver colaborador</button><button class="btn" data-act="fechar">Fechar</button></div>', function (box) {
        $('#okPdf', box).onclick = function () { ocupado($('#okPdf', box), async function () { gerarPdfFicha(await buscarFicha(r.id)); }); };
        $('#okColab', box).onclick = function () { fecharOv(); S.pilha = []; S.tela = 'equipe'; ir('colab', { id: cid }); };
      });
    });
  };

  // ---------- Itens ----------
  TELAS.itens = function () {
    var sit = S.f.itSit || '';
    var chips = [['', 'Todos'], ['EPI', 'EPI'], ['FERRAMENTA', 'Ferramentas'], ['baixo', 'Abaixo do mínimo'], ['ca', 'CA vencendo'], ['inativos', 'Inativos']];
    var h = '<input type="search" placeholder="Buscar item ou CA" data-filtro="itBusca" value="' + esc(S.f.itBusca || '') + '">' +
      '<div class="chips scroll">' + chips.map(function (c) { return '<button class="chip" data-act="itSit" data-f="' + c[0] + '" aria-pressed="' + (sit === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="list" id="itLista"></div>' + (admin() ? '<button class="btn full" data-act="novoItem">+ Cadastrar item</button>' : '');
    return { titulo: 'Itens e estoque', html: h, depois: FILTRO.itBusca };
  };
  FILTRO.itBusca = function () {
    var el = $('#itLista'); if (!el) return; var b = norm(S.f.itBusca), sit = S.f.itSit || '';
    var emPosse = {}; D.posse.forEach(function (p) { emPosse[p.item_id] = (emPosse[p.item_id] || 0) + Number(p.quantidade); });
    var l = D.itens.filter(function (i) {
      if (sit === 'inativos' ? i.ativo : !i.ativo) return false;
      if ((sit === 'EPI' || sit === 'FERRAMENTA') && i.tipo !== sit) return false;
      if (sit === 'baixo' && !(Number(i.estoque_minimo) > 0 && saldo(i.id) < Number(i.estoque_minimo))) return false;
      if (sit === 'ca' && !caSit(i)) return false;
      return !b || norm(i.nome + ' ' + (i.ca || '') + ' ' + (i.fabricante || '')).indexOf(b) >= 0;
    });
    el.innerHTML = l.length ? l.map(function (i) {
      var s = saldo(i.id), baixo = Number(i.estoque_minimo) > 0 && s < Number(i.estoque_minimo), ca = caSit(i);
      return '<button class="lrow ' + (!i.ativo ? 'off' : baixo || ca === 'vencido' ? 'bad' : ca ? 'warn' : 'ok') + '" data-act="verItem" data-id="' + i.id + '"><span class="grow"><span class="tt">' + esc(i.nome) + '</span><span class="meta">' + (i.tipo === 'EPI' ? 'EPI' : 'Ferramenta') + (i.ca ? ' · CA ' + esc(i.ca) : '') + (i.vida_util_dias ? ' · dura ' + i.vida_util_dias + ' dias' : ' · sem durabilidade') + (emPosse[i.id] ? ' · ' + fNum(emPosse[i.id]) + ' com a equipe' : '') + '</span></span><span class="side"><span class="num">' + fNum(s) + ' <small style="color:var(--muted)">' + esc(i.unidade) + '</small></span>' +
        (baixo ? '<span class="badge bad">Abaixo do mínimo</span>' : '') + (ca ? '<span class="badge ' + (ca === 'vencido' ? 'bad">CA vencido' : 'warn">CA vence') + '</span>' : '') + '</span></button>';
    }).join('') : '<div class="empty"><b>Nenhum item</b>' + (D.itens.length ? 'Nada com esse filtro.' : 'Cadastre os EPIs e ferramentas.') + '</div>';
  };
  ACOES.itSit = function (d) { S.f.itSit = d.f; render(); };
  ACOES.verItem = function (d) { ir('item', { id: Number(d.id) }); };

  TELAS.item = function () {
    var i = item(S.params.id); if (!i) return { titulo: 'Item', html: '<div class="empty"><b>Não encontrado</b></div>' };
    var s = D.saldo[i.id] || { saldo: 0, entradas: 0, saidas: 0 }, ca = caSit(i);
    var com = D.posse.filter(function (p) { return p.item_id === i.id; });
    var h = '<div class="tiles"><div class="tile ' + (Number(i.estoque_minimo) > 0 && Number(s.saldo) < Number(i.estoque_minimo) ? 'bad' : 'ok') + '"><b>' + fNum(s.saldo) + '</b><span>Saldo (' + esc(i.unidade) + ')</span></div><div class="tile sig"><b>' + fNum(s.entradas) + '</b><span>Entradas</span></div><div class="tile sig"><b>' + fNum(s.saidas) + '</b><span>Saídas</span></div></div>' +
      (ca ? '<p class="msg ' + (ca === 'vencido' ? 'err' : 'warn') + '">CA ' + esc(i.ca) + (ca === 'vencido' ? ' vencido em ' : ' vence em ') + fData(i.ca_validade) + '.' + (ca === 'vencido' ? ' Não é possível entregar até atualizar o cadastro.' : '') + '</p>' : '') +
      '<div class="card pad"><dl class="kv"><dt>Tipo</dt><dd>' + (i.tipo === 'EPI' ? 'EPI' : 'Ferramenta') + (i.devolve ? ' (devolve ao almoxarifado)' : '') + '</dd>' + (i.tipo === 'EPI' ? '<dt>CA</dt><dd>' + esc(i.ca || '—') + (i.ca_validade ? ' · validade ' + fData(i.ca_validade) : '') + '</dd>' : '') +
      '<dt>Durabilidade</dt><dd>' + (i.vida_util_dias ? i.vida_util_dias + ' dias (informado pelo fornecedor)' : 'Não cadastrada') + '</dd><dt>Fabricante</dt><dd>' + esc(i.fabricante || '—') + '</dd><dt>Fornecedor</dt><dd>' + esc(i.fornecedor || '—') + '</dd>' +
      '<dt>Mínimo</dt><dd>' + fNum(i.estoque_minimo) + ' ' + esc(i.unidade) + '</dd><dt>Custo</dt><dd>' + (i.custo_unitario != null ? fMoeda(i.custo_unitario) : '—') + '</dd><dt>Com a equipe</dt><dd>' + fNum(com.reduce(function (a, p) { return a + Number(p.quantidade); }, 0)) + ' ' + esc(i.unidade) + '</dd></dl>' +
      '<div class="grid2"><button class="btn pri" data-act="movItem" data-id="' + i.id + '" data-t="ENTRADA">Entrada (nota fiscal)</button><button class="btn" data-act="movItem" data-id="' + i.id + '" data-t="AJUSTE">Ajuste / baixa</button>' + (admin() ? '<button class="btn" data-act="editItem" data-id="' + i.id + '">Editar cadastro</button>' : '') + '</div></div>' +
      '<div class="sec-h">Durabilidade real</div><div id="iDur"><div class="empty"><span class="spin"></span></div></div>' +
      '<div class="sec-h">Movimentos</div><div class="list" id="iMov"><div class="empty"><span class="spin"></span></div></div>';
    return {
      titulo: i.nome, sub: i.tipo === 'EPI' ? 'EPI' + (i.ca ? ' · CA ' + i.ca : '') : 'Ferramenta', html: h, depois: async function () {
        try {
          var r = await Promise.all([q(sb.from('movimentos').select('*').eq('item_id', i.id).order('id', { ascending: false }).limit(60)), todos(function () { return sb.from('v_durabilidade').select('*').eq('item_id', i.id).order('id'); })]);
          var el = $('#iMov'); if (!el) return;
          var NOME = { ENTRADA: 'Entrada', SAIDA: 'Entrega', DEVOLUCAO: 'Devolução', AJUSTE: 'Ajuste', BAIXA: 'Baixa', ESTORNO: 'Estorno (ficha cancelada)' };
          el.innerHTML = r[0].length ? r[0].map(function (m) {
            var neg = m.tipo === 'SAIDA' || m.tipo === 'BAIXA' || (m.tipo === 'AJUSTE' && m.quantidade < 0);
            return '<div class="lrow ' + (neg ? 'warn' : 'ok') + '" style="cursor:default"><span class="grow"><span class="tt">' + NOME[m.tipo] + (m.nota_fiscal ? ' · NF ' + esc(m.nota_fiscal) : '') + '</span><span class="meta">' + fData(m.data) + (m.fornecedor ? ' · ' + esc(m.fornecedor) : '') + (m.observacao ? ' · ' + esc(m.observacao) : '') + '</span></span><span class="num">' + (neg ? '−' : '+') + fNum(Math.abs(m.quantidade)) + '</span></div>';
          }).join('') : '<div class="empty">Nenhum movimento. Lance a entrada do estoque.</div>';
          $('#iDur').innerHTML = cartaoDurabilidade(resumoItem(i, r[1]), true);
        } catch (e) { var e2 = $('#iMov'); if (e2) e2.innerHTML = '<p class="msg err">' + esc(msgErro(e)) + '</p>'; }
      }
    };
  };

  function formItem(i) {
    i = i || { tipo: 'EPI', ativo: true, unidade: 'un', estoque_minimo: 0, devolve: false };
    var tipo = i.tipo;
    abrirOv('<h2>' + (i.id ? 'Editar item' : 'Novo item') + '</h2><div class="chips" id="fiTipo"><button class="chip" data-t="EPI" aria-pressed="' + (tipo === 'EPI') + '">EPI</button><button class="chip" data-t="FERRAMENTA" aria-pressed="' + (tipo === 'FERRAMENTA') + '">Ferramenta</button></div>' +
      '<label class="field"><span class="lbl">Nome / descrição</span><input type="text" id="fiNome" maxlength="160" value="' + esc(i.nome || '') + '" placeholder="Ex.: Bota de segurança bico PVC nº 42"></label>' +
      '<div class="grid2 soEpi"><label class="field"><span class="lbl">Nº do CA</span><input type="text" id="fiCa" inputmode="numeric" maxlength="20" value="' + esc(i.ca || '') + '"></label><label class="field"><span class="lbl">Validade do CA</span><input type="date" id="fiCaVal" value="' + esc(i.ca_validade || '') + '"></label></div>' +
      '<label class="field"><span class="lbl">Durabilidade informada pelo fornecedor (dias)</span><input type="number" inputmode="numeric" id="fiVida" min="1" max="7300" value="' + esc(i.vida_util_dias || '') + '" placeholder="Ex.: 180"><span class="note">É com esse prazo que o app compara quanto cada unidade durou de verdade.</span></label>' +
      '<div class="grid2"><label class="field"><span class="lbl">Fabricante</span><input type="text" id="fiFab" maxlength="120" value="' + esc(i.fabricante || '') + '"></label><label class="field"><span class="lbl">Fornecedor</span><input type="text" id="fiFor" maxlength="120" value="' + esc(i.fornecedor || '') + '"></label></div>' +
      '<div class="grid2"><label class="field"><span class="lbl">Unidade</span><input type="text" id="fiUn" maxlength="10" value="' + esc(i.unidade || 'un') + '"></label><label class="field"><span class="lbl">Estoque mínimo</span><input type="number" inputmode="decimal" id="fiMin" min="0" value="' + esc(i.estoque_minimo || 0) + '"></label></div>' +
      '<label class="field"><span class="lbl">Custo unitário (R$)</span><input type="number" inputmode="decimal" id="fiCusto" min="0" step="0.01" value="' + esc(i.custo_unitario == null ? '' : i.custo_unitario) + '"></label>' +
      '<label class="chk"><input type="checkbox" id="fiDev"' + (i.devolve ? ' checked' : '') + '> Volta para o almoxarifado (ferramenta emprestada)</label>' +
      '<label class="chk"><input type="checkbox" id="fiAtivo"' + (i.ativo ? ' checked' : '') + '> Ativo</label>' +
      '<div class="grid2"><button class="btn" data-act="fechar">Cancelar</button><button class="btn pri" id="fiOk">Salvar</button></div>', function (box) {
      function tp() { $$('.soEpi', box).forEach(function (el) { el.hidden = tipo !== 'EPI'; }); }
      $$('#fiTipo .chip', box).forEach(function (b) { b.onclick = function () { tipo = b.dataset.t; $$('#fiTipo .chip', box).forEach(function (o) { o.setAttribute('aria-pressed', o === b); }); if (!i.id) $('#fiDev', box).checked = tipo === 'FERRAMENTA'; tp(); }; });
      tp();
      $('#fiOk', box).onclick = async function () {
        var nome = $('#fiNome', box).value.trim(); if (nome.length < 2) return toast('Informe o nome do item.');
        var vida = $('#fiVida', box).value ? Math.round(Number($('#fiVida', box).value)) : null;
        if (vida != null && (vida < 1 || vida > 7300)) return toast('Durabilidade entre 1 e 7300 dias.');
        var custo = $('#fiCusto', box).value === '' ? null : Number($('#fiCusto', box).value);
        var dados = { tipo: tipo, nome: nome, ca: tipo === 'EPI' ? ($('#fiCa', box).value.trim() || null) : null, ca_validade: tipo === 'EPI' ? ($('#fiCaVal', box).value || null) : null, vida_util_dias: vida, fabricante: $('#fiFab', box).value.trim() || null, fornecedor: $('#fiFor', box).value.trim() || null, unidade: $('#fiUn', box).value.trim() || 'un', estoque_minimo: Math.max(0, Number($('#fiMin', box).value) || 0), custo_unitario: custo, devolve: $('#fiDev', box).checked, ativo: $('#fiAtivo', box).checked };
        async function salvar(btn) {
          var r = i.id ? await q(sb.from('itens').update(dados).eq('id', i.id).select()) : await q(sb.from('itens').insert(dados).select());
          if (!r.length) throw new Error('Você não tem permissão para isso.');
          fecharOv(); await carregar(); if (i.id) render(); else ir('item', { id: r[0].id }); toast('Item salvo.');
        }
        if (tipo === 'EPI' && !dados.ca) {
          if (!await confirmar('EPI sem número de CA', 'A NR-6 exige Certificado de Aprovação para EPI, e a ficha sai sem o número. Salvar mesmo assim?', 'Salvar sem CA')) return;
          return ocupado(null, salvar);
        }
        ocupado($('#fiOk', box), salvar);
      };
    });
  }
  ACOES.novoItem = function () { formItem(); };
  ACOES.editItem = function (d) { formItem(item(Number(d.id))); };
  ACOES.movItem = function (d) {
    var i = item(Number(d.id)), tipo = d.t;
    abrirOv('<h2>' + esc(i.nome) + '</h2>' + (tipo === 'ENTRADA' ? '<p class="note">Entrada de material comprado.</p>' :
      '<div class="chips" id="mvT"><button class="chip" data-t="AJUSTE" aria-pressed="true">Ajuste de inventário</button><button class="chip" data-t="BAIXA" aria-pressed="false">Baixa (descarte, vencido)</button></div><p class="note" id="mvDica">Ajuste: use quantidade negativa para tirar e positiva para pôr. Bom para o saldo inicial.</p>') +
      '<div class="grid2"><label class="field"><span class="lbl">Quantidade (' + esc(i.unidade) + ')</span><input type="number" inputmode="decimal" id="mvQ" step="any"></label><label class="field"><span class="lbl">Data</span><input type="date" id="mvD" value="' + hojeISO() + '" max="' + hojeISO() + '"></label></div>' +
      (tipo === 'ENTRADA' ? '<div class="grid2"><label class="field"><span class="lbl">Nota fiscal</span><input type="text" id="mvNF" maxlength="40"></label><label class="field"><span class="lbl">Custo unitário (R$)</span><input type="number" inputmode="decimal" id="mvC" step="0.01" min="0" value="' + esc(i.custo_unitario == null ? '' : i.custo_unitario) + '"></label></div><label class="field"><span class="lbl">Fornecedor</span><input type="text" id="mvF" maxlength="120" value="' + esc(i.fornecedor || '') + '"></label>' : '') +
      '<label class="field"><span class="lbl">Observação</span><input type="text" id="mvO" maxlength="500"></label><div class="grid2"><button class="btn" data-act="fechar">Cancelar</button><button class="btn pri" id="mvOk">Lançar</button></div>', function (box) {
      $$('#mvT .chip', box).forEach(function (b) { b.onclick = function () { tipo = b.dataset.t; $$('#mvT .chip', box).forEach(function (o) { o.setAttribute('aria-pressed', o === b); }); $('#mvDica', box).textContent = tipo === 'BAIXA' ? 'Baixa: tira do estoque o que foi descartado, venceu ou se perdeu no almoxarifado.' : 'Ajuste: use quantidade negativa para tirar e positiva para pôr. Bom para o saldo inicial.'; }; });
      $('#mvOk', box).onclick = function () {
        var qt = Number($('#mvQ', box).value);
        if (!qt || (tipo !== 'AJUSTE' && qt < 0)) return toast('Informe a quantidade.');
        var obs = $('#mvO', box).value.trim();
        if (tipo !== 'ENTRADA' && obs.length < 3) return toast('Explique o motivo do ajuste ou da baixa na observação.');
        var dados = { item_id: i.id, tipo: tipo, quantidade: qt, data: $('#mvD', box).value || hojeISO(), observacao: obs || null, usuario_id: perfil.id };
        if (tipo === 'ENTRADA') { dados.nota_fiscal = $('#mvNF', box).value.trim() || null; dados.fornecedor = $('#mvF', box).value.trim() || null; dados.custo_unitario = $('#mvC', box).value === '' ? null : Number($('#mvC', box).value); }
        ocupado($('#mvOk', box), async function () { await q(sb.from('movimentos').insert(dados)); fecharOv(); await carregar(); render(); toast('Lançado no estoque.'); });
      };
    });
  };

  // ---------- Análise de durabilidade ----------
  function mediana(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function resumoItem(i, linhas) {
    var l = linhas.filter(function (x) { return x.item_id === i.id && x.indice != null; });
    var ind = l.map(function (x) { return Number(x.indice); }), diasU = l.map(function (x) { return x.dias_uso; });
    var antes = l.filter(function (x) { return Number(x.indice) < 0.7; }).length;
    var dano = l.filter(function (x) { return (x.motivo_saida === 'DANIFICADO' || x.motivo_saida === 'PERDA') && Number(x.indice) < 1; }).length;
    var desg = l.filter(function (x) { return x.motivo_saida === 'DESGASTE_NATURAL' && Number(x.indice) < 0.7; }).length;
    var pessoas = {}; l.forEach(function (x) { pessoas[x.colaborador_id] = 1; });
    var np = Object.keys(pessoas).length, med = mediana(ind), v;
    if (!i.vida_util_dias) v = ['', 'Cadastre a durabilidade do fornecedor para comparar.'];
    else if (l.length < 3) v = ['', 'Poucas trocas ainda para concluir (' + l.length + ').'];
    else if (med < 0.8 && np >= 3 && desg >= dano) v = ['bad', 'Dura menos do que o fornecedor informa: o desgaste antes do prazo acontece com várias pessoas. Cobre o fornecedor ou reveja o produto.'];
    else if (dano > l.length * 0.3) v = ['warn', 'Muita troca por dano ou perda antes do prazo. Indício de mau uso ou de guarda inadequada; veja quem mais troca.'];
    else if (med < 0.8) v = ['warn', 'Durabilidade abaixo do informado, concentrada em poucas pessoas. Veja os colaboradores abaixo.'];
    else v = ['ok', 'Dentro do informado pelo fornecedor.'];
    return { item: i, n: l.length, pessoas: np, mediana: med, mediaDias: diasU.length ? diasU.reduce(function (a, b) { return a + b; }, 0) / diasU.length : null, antes: antes, dano: dano, veredito: v };
  }
  function cartaoDurabilidade(r, solo) {
    var i = r.item, pct = r.mediana != null ? Math.min(1.5, r.mediana) / 1.5 * 100 : 0;
    var cls = r.mediana == null ? '' : r.mediana < 0.7 ? 'bad' : r.mediana < 0.9 ? 'warn' : '';
    return '<div class="card pad"' + (solo ? '' : ' data-act="verItem" data-id="' + i.id + '" style="cursor:pointer"') + '>' + (solo ? '' : '<b>' + esc(i.nome) + '</b>') +
      '<div class="row" style="justify-content:space-between"><span class="note">Fornecedor: <b>' + (i.vida_util_dias ? i.vida_util_dias + ' dias' : '—') + '</b></span><span class="note">Real (média): <b>' + (r.mediaDias != null ? fNum(r.mediaDias, 0) + ' dias' : '—') + '</b></span></div>' +
      (r.mediana != null ? '<div class="meter" title="Mediana ' + fNum(r.mediana * 100, 0) + '% do prazo"><i class="' + cls + '" style="width:' + pct + '%"></i><span class="mark" style="left:' + (100 / 1.5) + '%"></span></div><span class="note">Na mediana, dura <b>' + fNum(r.mediana * 100, 0) + '%</b> do prazo do fornecedor · ' + r.n + ' troca' + (r.n !== 1 ? 's' : '') + ' de ' + r.pessoas + ' pessoa' + (r.pessoas !== 1 ? 's' : '') + ' · ' + r.antes + ' antes de 70% do prazo · ' + r.dano + ' por dano ou perda</span>' : '') +
      '<p class="msg ' + (r.veredito[0] === 'bad' ? 'err' : r.veredito[0] === 'warn' ? 'warn' : r.veredito[0] === 'ok' ? '' : 'info') + '">' + esc(r.veredito[1]) + '</p></div>';
  }
  TELAS.analise = function () {
    var per = S.f.anPer || '365';
    var h = '<div class="chips scroll">' + [['90', '90 dias'], ['180', '6 meses'], ['365', '12 meses'], ['0', 'Tudo']].map(function (p) { return '<button class="chip" data-act="anPer" data-f="' + p[0] + '" aria-pressed="' + (per === p[0]) + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<p class="note">Cada vez que um item é trocado ou devolvido, o app mede quantos dias ele durou e compara com a durabilidade do fornecedor. Se vários colaboradores trocam cedo por desgaste, o problema é do produto. Se só alguns trocam cedo, ou trocam muito por dano e perda, é sinal de mau uso.</p>' +
      '<div id="anCont"><div class="empty"><span class="spin"></span></div></div>';
    return {
      titulo: 'Durabilidade', html: h, depois: async function () {
        try {
          var linhas = await todos(function () { var b = sb.from('v_durabilidade').select('*').order('id'); if (per !== '0') { var d = new Date(Date.now() - Number(per) * 864e5); b = b.gte('saiu_em', d.toISOString()); } return b; });
          var el = $('#anCont'); if (!el) return;
          if (!linhas.length) { el.innerHTML = '<div class="empty"><b>Sem trocas no período</b>A análise aparece quando os itens começarem a ser trocados ou devolvidos.</div>'; return; }
          var porItem = {}; linhas.forEach(function (l) { (porItem[l.item_id] = porItem[l.item_id] || []).push(l); });
          var res = Object.keys(porItem).map(function (id) { var it = item(Number(id)); return it ? resumoItem(it, porItem[id]) : null; }).filter(Boolean)
            .sort(function (a, b) { var o = { bad: 0, warn: 1, '': 2, ok: 3 }; return (o[a.veredito[0]] - o[b.veredito[0]]) || ((a.mediana || 9) - (b.mediana || 9)); });
          // colaboradores que trocam bem mais cedo que os colegas
          var alertas = [];
          var porColab = {}; linhas.forEach(function (l) { if (l.indice == null) return; var k = l.colaborador_id; (porColab[k] = porColab[k] || []).push(l); });
          Object.keys(porColab).forEach(function (cid) {
            var ls = porColab[cid], motivos = [], c = colab(Number(cid)); if (!c) return;
            var danos = ls.filter(function (l) { return (l.motivo_saida === 'DANIFICADO' || l.motivo_saida === 'PERDA') && Number(l.indice) < 1; });
            if (danos.length >= 2) motivos.push(danos.length + ' trocas por dano ou perda antes do prazo');
            var itensC = {}; ls.forEach(function (l) { (itensC[l.item_id] = itensC[l.item_id] || []).push(Number(l.indice)); });
            Object.keys(itensC).forEach(function (iid) {
              var outros = porItem[iid].filter(function (l) { return String(l.colaborador_id) !== cid && l.indice != null; }).map(function (l) { return Number(l.indice); });
              var meu = mediana(itensC[iid]), deles = mediana(outros);
              if (outros.length >= 2 && deles > 0 && meu < deles * 0.6) { var it = item(Number(iid)); motivos.push((it ? it.nome : 'Item') + ': dura ' + fNum(meu * 100, 0) + '% do prazo, os colegas ' + fNum(deles * 100, 0) + '%'); }
            });
            if (motivos.length) alertas.push({ c: c, m: motivos, n: danos.length });
          });
          alertas.sort(function (a, b) { return b.m.length - a.m.length || b.n - a.n; });
          el.innerHTML = '<div class="sec-h">Colaboradores para conversar</div><div class="list">' + (alertas.length ? alertas.map(function (a) { return '<button class="lrow warn" data-act="verColab" data-id="' + a.c.id + '"><span class="grow"><span class="tt">' + esc(a.c.nome) + '</span><span class="meta">' + a.m.map(esc).join(' · ') + '</span></span></button>'; }).join('') : '<div class="empty">Ninguém fora do padrão no período.</div>') + '</div>' +
            '<div class="sec-h">Por item</div><div class="list">' + res.map(function (r) { return cartaoDurabilidade(r); }).join('') + '</div>';
        } catch (e) { var e2 = $('#anCont'); if (e2) e2.innerHTML = '<p class="msg err">' + esc(msgErro(e)) + '</p>'; }
      }
    };
  };
  ACOES.anPer = function (d) { S.f.anPer = d.f; render(); };

  // ---------- Funções e kits ----------
  ACOES.funcoes = function () { ir('funcoes'); };
  TELAS.funcoes = function () {
    var h = '<div class="list">' + (D.funcoes.length ? D.funcoes.map(function (f) {
      var n = D.colab.filter(function (c) { return c.ativo && c.funcao_id === f.id; }).length, k = kitDe(f.id).length;
      return '<button class="lrow ' + (!f.ativo ? 'off' : k ? 'ok' : 'sig') + '" data-act="verFuncao" data-id="' + f.id + '"><span class="grow"><span class="tt">' + esc(f.nome) + '</span><span class="meta">' + n + ' colaborador' + (n !== 1 ? 'es' : '') + ' · ' + k + ' ite' + (k !== 1 ? 'ns' : 'm') + ' no kit</span></span>' + (!k ? '<span class="badge sig">Sem kit</span>' : '') + '</button>';
    }).join('') : '<div class="empty"><b>Nenhuma função</b>Cadastre as funções da obra (pedreiro, carpinteiro, armador…).</div>') + '</div>' +
      (admin() ? '<button class="btn full" data-act="novaFuncao">+ Função</button>' : '');
    return { titulo: 'Funções e kits', html: h };
  };
  ACOES.verFuncao = function (d) { ir('funcao', { id: Number(d.id) }); };
  ACOES.novaFuncao = function () { formFuncao(); };
  function formFuncao(f) {
    f = f || { ativo: true };
    abrirOv('<h2>' + (f.id ? 'Editar função' : 'Nova função') + '</h2><label class="field"><span class="lbl">Nome</span><input type="text" id="ffN" maxlength="120" value="' + esc(f.nome || '') + '"></label>' + (f.id ? '<label class="chk"><input type="checkbox" id="ffA"' + (f.ativo ? ' checked' : '') + '> Ativa</label>' : '') +
      '<div class="grid2"><button class="btn" data-act="fechar">Cancelar</button><button class="btn pri" id="ffOk">Salvar</button></div>', function (box) {
      $('#ffOk', box).onclick = function () {
        var n = $('#ffN', box).value.trim(); if (n.length < 2) return toast('Informe o nome.');
        ocupado($('#ffOk', box), async function () {
          var r = f.id ? await q(sb.from('funcoes').update({ nome: n, ativo: $('#ffA', box).checked }).eq('id', f.id).select()) : await q(sb.from('funcoes').insert({ nome: n }).select());
          if (!r.length) throw new Error('Você não tem permissão para isso.');
          fecharOv(); await carregar(); if (f.id) render(); else ir('funcao', { id: r[0].id });
        });
      };
    });
  }
  TELAS.funcao = function () {
    var f = funcao(S.params.id); if (!f) return { titulo: 'Função', html: '' };
    var kit = kitDe(f.id), ad = admin();
    var h = '<p class="note">O kit é o que cada colaborador desta função deve ter. O app avisa quando falta algum item e já sugere esses itens na entrega.</p><div class="card pad">' + (kit.length ? kit.map(function (k) {
      var it = item(k.item_id);
      return '<div class="row" style="border-top:1px dashed var(--line);padding-top:8px"><span class="grow" style="flex:1"><b style="display:block">' + esc(it ? it.nome : '?') + '</b><span class="note">' + (it && it.tipo === 'EPI' ? 'EPI' : 'Ferramenta') + (it && it.vida_util_dias ? ' · troca a cada ' + it.vida_util_dias + ' dias' : '') + '</span></span>' +
        (ad ? '<div class="qty"><button data-act="kitQ" data-i="' + k.item_id + '" data-d="-1" aria-label="Menos">−</button><input type="number" value="' + k.quantidade + '" readonly aria-label="Quantidade"><button data-act="kitQ" data-i="' + k.item_id + '" data-d="1" aria-label="Mais">+</button></div><button class="btn sm danger" data-act="kitDel" data-i="' + k.item_id + '" aria-label="Tirar">✕</button>' : '<span class="num">' + fNum(k.quantidade) + '</span>') + '</div>';
    }).join('') : '<p class="note">Nenhum item no kit.</p>') + (ad ? '<button class="btn ghost" data-act="kitAdd">+ Item no kit</button>' : '') + '</div>' +
      (ad ? '<button class="btn" data-act="editFuncao">Renomear / desativar função</button>' : '');
    return { titulo: f.nome, sub: 'Kit da função', html: h };
  };
  ACOES.editFuncao = function () { formFuncao(funcao(S.params.id)); };
  ACOES.kitAdd = function () {
    var fid = S.params.id, ja = {}; kitDe(fid).forEach(function (k) { ja[k.item_id] = 1; });
    abrirOv('<h2>Item no kit</h2><input type="search" id="kaB" placeholder="Buscar item"><div class="list" id="kaL" style="max-height:55vh;overflow:auto"></div><button class="btn" data-act="fechar">Fechar</button>', function (box) {
      function lista() {
        var b = norm($('#kaB', box).value);
        $('#kaL', box).innerHTML = D.itens.filter(function (i) { return i.ativo && !ja[i.id] && (!b || norm(i.nome).indexOf(b) >= 0); }).map(function (i) { return '<button class="lrow" data-ka="' + i.id + '"><span class="grow"><span class="tt">' + esc(i.nome) + '</span><span class="meta">' + (i.tipo === 'EPI' ? 'EPI' : 'Ferramenta') + '</span></span></button>'; }).join('') || '<div class="empty">Nenhum item disponível. Cadastre na aba Itens.</div>';
        $$('[data-ka]', box).forEach(function (b2) { b2.onclick = function () { ocupado(b2, async function () { await q(sb.from('funcao_itens').insert({ funcao_id: fid, item_id: Number(b2.dataset.ka), quantidade: 1 })); fecharOv(); await carregar(); render(); }); }; });
      }
      $('#kaB', box).oninput = lista; lista();
    });
  };
  ACOES.kitQ = function (d, b) {
    var k = D.kit.find(function (x) { return x.funcao_id === S.params.id && x.item_id === Number(d.i); }); var nq = Math.max(1, Number(k.quantidade) + Number(d.d));
    if (nq === Number(k.quantidade)) return;
    ocupado(b, async function () { await q(sb.from('funcao_itens').update({ quantidade: nq }).eq('funcao_id', k.funcao_id).eq('item_id', k.item_id)); await carregar(); render(); });
  };
  ACOES.kitDel = function (d, b) { ocupado(b, async function () { await q(sb.from('funcao_itens').delete().eq('funcao_id', S.params.id).eq('item_id', Number(d.i))); await carregar(); render(); }); };

  // ---------- Ajustes ----------
  TELAS.ajustes = function () {
    var ad = admin();
    function l(act, t, m) { return '<button class="lrow" data-act="' + act + '"><span class="grow"><span class="tt">' + t + '</span><span class="meta">' + m + '</span></span></button>'; }
    var h = '<div class="card pad"><dl class="kv"><dt>Usuário</dt><dd>' + esc(perfil.nome) + '</dd><dt>E-mail</dt><dd>' + esc(perfil.email || '') + '</dd><dt>Perfil</dt><dd>' + (ad ? 'Administrador' : 'Almoxarife / técnico de segurança') + '</dd></dl></div><div class="list">' +
      l('conta', 'Minha conta', 'Nome que vai na ficha e troca de senha') +
      (ad ? l('empresa', 'Empresa e ficha', 'Nome, CNPJ, obra, logo e texto do termo') + l('usuarios', 'Usuários', 'Liberar acessos e definir perfis') : '') +
      l('funcoes', 'Funções e kits', 'O que cada função deve receber') +
      l('exportar', 'Exportar para Excel', 'Entregas, estoque, movimentos e durabilidade') +
      l('powerbi', 'Power BI', 'Como ligar o painel de indicadores') + '</div>' +
      '<button class="btn danger full" data-act="sair">Sair</button><p class="note" style="text-align:center">Versão ' + VERSAO + '</p>';
    return { titulo: 'Ajustes', html: h };
  };
  ACOES.sair = function () { sair('Você saiu.'); };
  ACOES.conta = function () { ir('conta'); };
  TELAS.conta = function () {
    return {
      titulo: 'Minha conta', html: '<div class="card pad"><label class="field"><span class="lbl">Seu nome (vai na ficha)</span><input type="text" id="mcN" maxlength="120" value="' + esc(perfil.nome) + '"></label><button class="btn" id="mcNOk">Salvar nome</button></div>' +
        '<div class="card pad"><span class="lbl">Trocar senha</span><input type="password" id="mcS1" autocomplete="new-password" placeholder="Nova senha (mínimo 10 caracteres)"><input type="password" id="mcS2" autocomplete="new-password" placeholder="Repita a nova senha"><button class="btn pri" id="mcSOk">Trocar senha</button></div>',
      depois: function () {
        $('#mcNOk').onclick = function () { var n = $('#mcN').value.trim(); ocupado($('#mcNOk'), async function () { await rpc('meu_nome', { p_nome: n }); perfil.nome = n; toast('Nome salvo.'); }); };
        $('#mcSOk').onclick = function () {
          var a = $('#mcS1').value, b = $('#mcS2').value;
          if (a.length < 10) return toast('Use pelo menos 10 caracteres.'); if (!/[a-zA-Z]/.test(a) || !/\d/.test(a)) return toast('Misture letras e números.'); if (a !== b) return toast('As senhas não conferem.');
          ocupado($('#mcSOk'), async function () { var r = await sb.auth.updateUser({ password: a }); if (r.error) throw r.error; $('#mcS1').value = $('#mcS2').value = ''; toast('Senha trocada.'); });
        };
      }
    };
  };
  ACOES.empresa = function () { ir('empresa'); };
  TELAS.empresa = function () {
    var c = D.cfg;
    return {
      titulo: 'Empresa e ficha', html: '<div class="card pad"><label class="field"><span class="lbl">Empresa</span><input type="text" id="emN" maxlength="160" value="' + esc(c.empresa_nome || '') + '"></label><div class="grid2"><label class="field"><span class="lbl">CNPJ</span><input type="text" id="emC" maxlength="20" value="' + esc(c.empresa_cnpj || '') + '"></label><label class="field"><span class="lbl">Obra</span><input type="text" id="emO" maxlength="160" value="' + esc(c.obra || '') + '"></label></div>' +
        '<span class="lbl">Logo</span><div class="row">' + (c.empresa_logo ? '<img alt="Logo" src="' + esc(c.empresa_logo) + '" style="max-height:56px;max-width:160px;background:#fff;border-radius:6px;padding:4px">' : '<span class="note">Sem logo</span>') + '<label class="btn sm">Escolher<input type="file" id="emL" accept="image/png,image/jpeg" hidden></label>' + (c.empresa_logo ? '<button class="btn sm danger" id="emLx">Tirar</button>' : '') + '</div></div>' +
        '<div class="card pad"><label class="field"><span class="lbl">Termo de responsabilidade</span><textarea id="emT" rows="10" maxlength="3000">' + esc(termoAtual()) + '</textarea></label><button class="linkbtn" id="emTp">Voltar ao texto padrão</button></div><button class="btn pri full" id="emOk">Salvar</button>',
      depois: function () {
        var logo = c.empresa_logo || null;
        $('#emL').onchange = function (e) {
          var f = e.target.files[0]; if (!f) return; var img = new Image(), u = URL.createObjectURL(f);
          img.onload = function () { var r = Math.min(1, 400 / img.width, 200 / img.height), cv = document.createElement('canvas'); cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r); var x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(img, 0, 0, cv.width, cv.height); logo = cv.toDataURL('image/png'); URL.revokeObjectURL(u); toast('Logo pronta. Toque em Salvar.'); };
          img.src = u;
        };
        var lx = $('#emLx'); if (lx) lx.onclick = function () { logo = null; toast('Logo será retirada ao salvar.'); };
        $('#emTp').onclick = function () { $('#emT').value = TERMO_PADRAO; };
        $('#emOk').onclick = function () {
          var t = $('#emT').value.trim(); if (t.length < 40) return toast('O termo está curto demais.');
          var linhas = [['empresa_nome', $('#emN').value.trim()], ['empresa_cnpj', $('#emC').value.trim()], ['obra', $('#emO').value.trim()], ['empresa_logo', logo], ['termo', t === TERMO_PADRAO ? null : t]];
          ocupado($('#emOk'), async function () {
            await q(sb.from('configuracao').upsert(linhas.filter(function (l) { return l[1]; }).map(function (l) { return { chave: l[0], valor: l[1], alterado_em: new Date().toISOString() }; })));
            var vaz = linhas.filter(function (l) { return !l[1]; }).map(function (l) { return l[0]; });
            if (vaz.length) await q(sb.from('configuracao').delete().in('chave', vaz));
            await carregar(); voltar(); toast('Dados da empresa salvos.');
          });
        };
      }
    };
  };
  ACOES.usuarios = function () { ir('usuarios'); };
  TELAS.usuarios = function () {
    return {
      titulo: 'Usuários', html: '<div class="card pad"><b>Como criar um login</b><ol class="note" style="margin:0;padding-left:18px;line-height:1.6"><li>No Supabase, abra Authentication → Users → Add user → Create new user.</li><li>Digite o e-mail e uma senha provisória, marque <b>Auto Confirm User</b> e crie.</li><li>Volte aqui: a pessoa aparece como bloqueada. Toque nela, confira o nome, escolha o perfil e libere.</li></ol></div><div class="list" id="usL"><div class="empty"><span class="spin"></span></div></div>',
      depois: async function () {
        try {
          var us = await q(sb.from('perfis').select('*').order('criado_em'));
          $('#usL').innerHTML = us.map(function (u) { return '<button class="lrow ' + (u.ativo ? 'ok' : 'warn') + '" data-act="editUser" data-u="' + esc(JSON.stringify(u)) + '"><span class="grow"><span class="tt">' + esc(u.nome || u.email) + '</span><span class="meta">' + esc(u.email || '') + '</span></span><span class="side"><span class="badge ' + (u.papel === 'admin' ? 'sig">Administrador' : '">Almoxarife') + '</span>' + (u.ativo ? '' : '<span class="badge warn">Bloqueado</span>') + '</span></button>'; }).join('');
        } catch (e) { $('#usL').innerHTML = '<p class="msg err">' + esc(msgErro(e)) + '</p>'; }
      }
    };
  };
  ACOES.editUser = function (d) {
    var u = JSON.parse(d.u), pap = u.papel;
    abrirOv('<h2>' + esc(u.email || '') + '</h2><label class="field"><span class="lbl">Nome (vai na ficha)</span><input type="text" id="euN" maxlength="120" value="' + esc(u.nome || '') + '"></label><span class="lbl">Perfil</span><div class="chips" id="euP"><button class="chip" data-p="almoxarife" aria-pressed="' + (pap === 'almoxarife') + '">Almoxarife / técnico</button><button class="chip" data-p="admin" aria-pressed="' + (pap === 'admin') + '">Administrador</button></div>' +
      '<p class="note">Almoxarife: faz entregas, devoluções e lança estoque. Administrador: também cadastra itens, colaboradores, funções e usuários, e cancela fichas.</p><label class="chk"><input type="checkbox" id="euA"' + (u.ativo ? ' checked' : '') + '> Acesso liberado</label>' +
      '<div class="grid2"><button class="btn" data-act="fechar">Cancelar</button><button class="btn pri" id="euOk">Salvar</button></div>', function (box) {
      $$('#euP .chip', box).forEach(function (b) { b.onclick = function () { pap = b.dataset.p; $$('#euP .chip', box).forEach(function (o) { o.setAttribute('aria-pressed', o === b); }); }; });
      $('#euOk', box).onclick = function () { ocupado($('#euOk', box), async function () { await rpc('atualizar_usuario', { p_id: u.id, p_nome: $('#euN', box).value.trim(), p_papel: pap, p_ativo: $('#euA', box).checked }); fecharOv(); render(); toast('Usuário atualizado.'); }); };
    });
  };
  ACOES.powerbi = function () { ir('powerbi'); };
  TELAS.powerbi = function () {
    var ref = ''; try { ref = new URL(lerConfig().url).hostname.split('.')[0]; } catch (e) { }
    return {
      titulo: 'Power BI', html: '<div class="card pad"><p class="note">O Power BI lê o banco direto, com um usuário próprio que só enxerga as visões de indicadores (sem assinaturas, CPF mascarado) e não altera nada.</p><dl class="kv"><dt>Conector</dt><dd>Banco de dados PostgreSQL</dd><dt>Servidor</dt><dd>O "Host" do Session pooler (Supabase → Connect)</dd><dt>Banco</dt><dd>postgres</dd><dt>Usuário</dt><dd style="font-family:var(--f-mono)">powerbi_leitura' + (ref ? '.' + esc(ref) : '.&lt;id do projeto&gt;') + '</dd><dt>Senha</dt><dd>A do arquivo 2-powerbi.sql</dd><dt>Tabelas</dt><dd>bi.entregas, bi.estoque, bi.movimentos, bi.durabilidade, bi.em_posse, bi.colaboradores, bi.itens, bi.kit_funcao</dd></dl></div>'
    };
  };
  ACOES.exportar = function (d, btn) {
    ocupado(btn, async function () {
      var r = await Promise.all([
        todos(function () { return sb.from('entrega_itens').select('id,entrega_id,colaborador_id,item_nome,item_tipo,ca,quantidade,motivo,data,vida_util_dias,dias_uso_anterior,substituido_em,devolvido_em,devolucao_estado').order('id'); }),
        todos(function () { return sb.from('entregas').select('id,colaborador_nome,funcao_nome,responsavel_nome,cancelada').order('id'); }),
        todos(function () { return sb.from('movimentos').select('*').order('id'); }),
        todos(function () { return sb.from('v_durabilidade').select('*').order('id'); })]);
      var fic = {}; r[1].forEach(function (f) { fic[f.id] = f; });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r[0].map(function (i) { var f = fic[i.entrega_id] || {}; return { Ficha: i.entrega_id, Data: fData(i.data), Colaborador: f.colaborador_nome, 'Função': f.funcao_nome, Item: i.item_nome, Tipo: i.item_tipo, CA: i.ca, Quantidade: Number(i.quantidade), Motivo: MOTIVO[i.motivo], 'Durou (anterior)': i.dias_uso_anterior, 'Vida útil fornecedor': i.vida_util_dias, 'Situação': f.cancelada ? 'Cancelada' : i.devolvido_em ? 'Devolvido' : i.substituido_em ? 'Trocado' : 'Em uso', Entregou: f.responsavel_nome }; })), 'Entregas');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(D.itens.map(function (i) { var s = D.saldo[i.id] || {}; return { Item: i.nome, Tipo: i.tipo, CA: i.ca, 'Validade CA': fData(i.ca_validade), 'Vida útil (dias)': i.vida_util_dias, Saldo: Number(s.saldo || 0), Entradas: Number(s.entradas || 0), 'Saídas': Number(s.saidas || 0), 'Mínimo': Number(i.estoque_minimo), Custo: i.custo_unitario == null ? null : Number(i.custo_unitario) }; })), 'Estoque');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r[2].map(function (m) { var it = item(m.item_id) || {}; return { Data: fData(m.data), Item: it.nome, Movimento: m.tipo, Quantidade: Number(m.quantidade), 'Nota fiscal': m.nota_fiscal, Fornecedor: m.fornecedor, Custo: m.custo_unitario == null ? null : Number(m.custo_unitario), 'Observação': m.observacao }; })), 'Movimentos');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r[3].map(function (x) { var c = colab(x.colaborador_id) || {}; return { Colaborador: c.nome, Item: x.item_nome, Entregue: fData(x.entregue_em), Saiu: fData(x.saiu_em), 'Dias de uso': x.dias_uso, 'Vida útil fornecedor': x.vida_util_dias, '% do prazo': x.indice == null ? null : Math.round(Number(x.indice) * 100), Motivo: MOTIVO[x.motivo_saida] || x.motivo_saida }; })), 'Durabilidade');
      var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      entregarArquivo('EPI e Ferramentas ' + hojeISO() + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    });
  };

  // ---------- início ----------
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { });
  (async function () {
    var c = lerConfig(); if (!c) return telaLogin();
    conectar(c);
    try {
      var s = await sb.auth.getSession();
      if (s.data && s.data.session) {
        var u = Number(localStorage.getItem('epi.uso') || 0);
        if (Date.now() - u > INATIVO_MIN * 60000) return sair('Por segurança, entre de novo.');
        return await entrar();
      }
    } catch (e) { }
    telaLogin();
  })();
})();
