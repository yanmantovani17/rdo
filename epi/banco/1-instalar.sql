-- =====================================================================
--  CONTROLE DE EPI E FERRAMENTAS — banco de dados (Supabase / PostgreSQL)
--  Cole tudo no Supabase: SQL Editor → New query → Run.
--  Pode rodar de novo sem perder dados (atualiza funções e regras).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
--  TABELAS
-- ---------------------------------------------------------------------

-- Usuários do app (ligados ao login do Supabase)
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  email      text,
  papel      text not null default 'almoxarife' check (papel in ('admin','almoxarife')),
  ativo      boolean not null default false,
  criado_em  timestamptz not null default now()
);

create table if not exists public.funcoes (
  id         bigint generated always as identity primary key,
  nome       text not null check (length(trim(nome)) between 2 and 120),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
create unique index if not exists funcoes_nome_uk on public.funcoes (lower(trim(nome)));

create table if not exists public.itens (
  id              bigint generated always as identity primary key,
  tipo            text not null check (tipo in ('EPI','FERRAMENTA')),
  nome            text not null check (length(trim(nome)) between 2 and 160),
  ca              text check (ca is null or length(ca) <= 20),          -- Certificado de Aprovação (EPI)
  ca_validade     date,
  fabricante      text check (fabricante is null or length(fabricante) <= 120),
  fornecedor      text check (fornecedor is null or length(fornecedor) <= 120),
  unidade         text not null default 'un' check (length(unidade) <= 10),
  vida_util_dias  integer check (vida_util_dias is null or vida_util_dias between 1 and 7300), -- durabilidade informada pelo fornecedor
  devolve         boolean not null default false,                       -- ferramenta que volta para o almoxarifado
  estoque_minimo  numeric(12,2) not null default 0 check (estoque_minimo >= 0),
  custo_unitario  numeric(12,2) check (custo_unitario is null or custo_unitario >= 0),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- Kit de cada função: quais itens e quantos
create table if not exists public.funcao_itens (
  funcao_id   bigint not null references public.funcoes(id) on delete cascade,
  item_id     bigint not null references public.itens(id) on delete restrict,
  quantidade  numeric(12,2) not null default 1 check (quantidade > 0),
  primary key (funcao_id, item_id)
);

create table if not exists public.colaboradores (
  id         bigint generated always as identity primary key,
  nome       text not null check (length(trim(nome)) between 2 and 160),
  cpf        text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  matricula  text check (matricula is null or length(matricula) <= 30),
  funcao_id  bigint references public.funcoes(id) on delete restrict,
  setor      text check (setor is null or length(setor) <= 120),
  admissao   date,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
create unique index if not exists colaboradores_cpf_uk on public.colaboradores (cpf) where cpf is not null;

-- Ficha de entrega (assinada no celular). Não pode ser alterada depois de gravada.
create table if not exists public.entregas (
  id                      bigint generated always as identity primary key,
  colaborador_id          bigint not null references public.colaboradores(id) on delete restrict,
  colaborador_nome        text not null,
  colaborador_cpf         text,
  colaborador_matricula   text,
  funcao_nome             text,
  responsavel_id          uuid not null references public.perfis(id) on delete restrict,
  responsavel_nome        text not null,
  data_hora               timestamptz not null default now(),
  termo                   text not null,
  observacao              text check (observacao is null or length(observacao) <= 1000),
  assinatura_colaborador  text not null,
  assinatura_responsavel  text not null,
  dispositivo             text,
  hash                    text not null,
  cancelada               boolean not null default false,
  cancelada_motivo        text,
  cancelada_por           uuid references public.perfis(id),
  cancelada_em            timestamptz
);
create index if not exists entregas_colab_ix on public.entregas (colaborador_id, data_hora desc);

create table if not exists public.entrega_itens (
  id                  bigint generated always as identity primary key,
  entrega_id          bigint not null references public.entregas(id) on delete restrict,
  colaborador_id      bigint not null references public.colaboradores(id) on delete restrict,
  item_id             bigint not null references public.itens(id) on delete restrict,
  item_nome           text not null,
  item_tipo           text not null,
  ca                  text,
  quantidade          numeric(12,2) not null check (quantidade > 0),
  motivo              text not null check (motivo in ('PRIMEIRA_ENTREGA','ADICIONAL','TROCA_PERIODICA','DESGASTE_NATURAL','DANIFICADO','PERDA')),
  data                timestamptz not null,
  vida_util_dias      integer,
  -- troca: dados do item que este substituiu
  substitui_id        bigint references public.entrega_itens(id),
  dias_uso_anterior   integer,
  -- quando este item deixou de estar com o colaborador
  substituido_em      timestamptz,
  substituido_por     bigint references public.entrega_itens(id),
  devolvido_em        timestamptz,
  devolucao_estado    text check (devolucao_estado in ('BOM','DANIFICADO','PERDIDO')),
  devolucao_obs       text,
  devolucao_por       uuid references public.perfis(id),
  dias_uso            integer
);
create index if not exists entrega_itens_posse_ix on public.entrega_itens (colaborador_id, item_id, data desc);
create index if not exists entrega_itens_entrega_ix on public.entrega_itens (entrega_id);

-- Entradas e saídas do almoxarifado
create table if not exists public.movimentos (
  id               bigint generated always as identity primary key,
  item_id          bigint not null references public.itens(id) on delete restrict,
  tipo             text not null check (tipo in ('ENTRADA','SAIDA','DEVOLUCAO','AJUSTE','BAIXA','ESTORNO')),
  quantidade       numeric(12,2) not null check (quantidade <> 0),
  data             date not null default current_date,
  nota_fiscal      text check (nota_fiscal is null or length(nota_fiscal) <= 40),
  fornecedor       text check (fornecedor is null or length(fornecedor) <= 120),
  custo_unitario   numeric(12,2) check (custo_unitario is null or custo_unitario >= 0),
  entrega_item_id  bigint references public.entrega_itens(id),
  observacao       text check (observacao is null or length(observacao) <= 500),
  usuario_id       uuid not null default auth.uid() references public.perfis(id),
  criado_em        timestamptz not null default now(),
  check (tipo = 'AJUSTE' or quantidade > 0)
);
create index if not exists movimentos_item_ix on public.movimentos (item_id, data);

-- Dados da empresa que vão na ficha (nome, CNPJ, logo, termo)
create table if not exists public.configuracao (
  chave       text primary key check (chave in ('empresa_nome','empresa_cnpj','empresa_logo','obra','termo')),
  valor       text check (valor is null or length(valor) <= 400000),
  alterado_em timestamptz not null default now()
);

-- Registro de tudo o que foi criado, alterado ou apagado
create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  usuario_id  uuid,
  tabela      text not null,
  operacao    text not null,
  registro_id text,
  antes       jsonb,
  depois      jsonb
);

-- ---------------------------------------------------------------------
--  FUNÇÕES DE APOIO
-- ---------------------------------------------------------------------

create or replace function public.eh_ativo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and p.ativo);
$$;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and p.ativo and p.papel = 'admin');
$$;

-- Novo login criado no painel do Supabase → perfil. O primeiro vira administrador;
-- os demais ficam bloqueados até o administrador liberar no app.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_primeiro boolean;
begin
  perform pg_advisory_xact_lock(4242);
  select not exists (select 1 from public.perfis) into v_primeiro;
  insert into public.perfis (id, email, nome, papel, ativo)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nome', split_part(coalesce(new.email,''), '@', 1)),
          case when v_primeiro then 'admin' else 'almoxarife' end,
          v_primeiro)
  on conflict (id) do nothing;
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'epi_novo_usuario' and tgrelid = 'auth.users'::regclass) then
    create trigger epi_novo_usuario after insert on auth.users for each row execute function public.novo_usuario();
  end if;
end $$;

-- usuários que já existiam antes de instalar
insert into public.perfis (id, email, nome, papel, ativo)
select u.id, u.email, split_part(coalesce(u.email,''),'@',1), 'almoxarife', false
from auth.users u on conflict (id) do nothing;
update public.perfis set papel = 'admin', ativo = true
where id = (select id from public.perfis order by criado_em limit 1)
  and not exists (select 1 from public.perfis where papel = 'admin');

-- Auditoria (sem copiar as imagens das assinaturas)
create or replace function public.auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a jsonb; d jsonb;
begin
  if tg_op <> 'INSERT' then a := to_jsonb(old) - 'assinatura_colaborador' - 'assinatura_responsavel'; end if;
  if tg_op <> 'DELETE' then d := to_jsonb(new) - 'assinatura_colaborador' - 'assinatura_responsavel'; end if;
  insert into public.auditoria (usuario_id, tabela, operacao, registro_id, antes, depois)
  values (auth.uid(), tg_table_name, tg_op, coalesce(d, a)->>'id', a, d);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['perfis','funcoes','itens','funcao_itens','colaboradores','entregas','entrega_itens','movimentos','configuracao'] loop
    execute format('drop trigger if exists epi_auditoria on public.%I', t);
    execute format('create trigger epi_auditoria after insert or update or delete on public.%I for each row execute function public.auditar()', t);
  end loop;
end $$;

-- A ficha assinada não muda: só o servidor pode marcar troca, devolução ou cancelamento.
create or replace function public.proteger_ficha() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('epi.servidor', true) is distinct from 'sim' then
    raise exception 'Ficha de entrega assinada não pode ser alterada';
  end if;
  if tg_op = 'DELETE' then raise exception 'Ficha de entrega assinada não pode ser apagada'; end if;
  if tg_table_name = 'entregas' then
   if (new.colaborador_id, new.responsavel_id, new.data_hora, new.termo, new.assinatura_colaborador,
       new.assinatura_responsavel, new.colaborador_nome, new.colaborador_cpf
     ) is distinct from (
       old.colaborador_id, old.responsavel_id, old.data_hora, old.termo, old.assinatura_colaborador,
       old.assinatura_responsavel, old.colaborador_nome, old.colaborador_cpf)
     or (old.hash <> 'pendente' and new.hash is distinct from old.hash) then
    raise exception 'Dados assinados da ficha não podem ser alterados';
   end if;
  else
   if (new.entrega_id, new.item_id, new.quantidade, new.motivo, new.data)
       is distinct from (old.entrega_id, old.item_id, old.quantidade, old.motivo, old.data) then
    raise exception 'Itens assinados da ficha não podem ser alterados';
   end if;
  end if;
  return new;
end $$;
drop trigger if exists epi_protege on public.entregas;
create trigger epi_protege before update or delete on public.entregas for each row execute function public.proteger_ficha();
drop trigger if exists epi_protege on public.entrega_itens;
create trigger epi_protege before update or delete on public.entrega_itens for each row execute function public.proteger_ficha();

create or replace function public.proteger_movimento() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Movimento de estoque não pode ser alterado nem apagado. Lance um ajuste.'; end $$;
drop trigger if exists epi_protege on public.movimentos;
create trigger epi_protege before update or delete on public.movimentos for each row execute function public.proteger_movimento();

-- ---------------------------------------------------------------------
--  VISÕES USADAS PELO APP (respeitam as permissões de quem consulta)
-- ---------------------------------------------------------------------

create or replace view public.v_saldos with (security_invoker = true) as
select i.id as item_id,
       coalesce(sum(case m.tipo when 'SAIDA' then -m.quantidade when 'BAIXA' then -m.quantidade else m.quantidade end), 0)::numeric(12,2) as saldo,
       coalesce(sum(m.quantidade) filter (where m.tipo = 'ENTRADA'), 0)::numeric(12,2) as entradas,
       coalesce(sum(m.quantidade) filter (where m.tipo = 'SAIDA'), 0)::numeric(12,2) as saidas,
       max(m.data) filter (where m.tipo = 'ENTRADA') as ultima_entrada
from public.itens i left join public.movimentos m on m.item_id = i.id
group by i.id;

-- O que cada colaborador tem com ele agora
create or replace view public.v_posse with (security_invoker = true) as
select ei.id, ei.entrega_id, ei.colaborador_id, ei.item_id, ei.item_nome, ei.item_tipo, ei.ca, ei.quantidade,
       ei.motivo, ei.data, ei.vida_util_dias,
       case when ei.vida_util_dias is not null then (ei.data + make_interval(days => ei.vida_util_dias))::date end as troca_prevista,
       (current_date - ei.data::date) as dias_em_uso
from public.entrega_itens ei join public.entregas e on e.id = ei.entrega_id
where not e.cancelada and ei.substituido_em is null and ei.devolvido_em is null;

-- Cada unidade que saiu de uso: quanto durou × o que o fornecedor informou
create or replace view public.v_durabilidade with (security_invoker = true) as
select ei.id, ei.colaborador_id, ei.item_id, ei.item_nome, ei.item_tipo, ei.data as entregue_em,
       coalesce(ei.substituido_em, ei.devolvido_em) as saiu_em,
       ei.dias_uso, ei.vida_util_dias,
       case when ei.vida_util_dias > 0 and ei.dias_uso is not null then round(ei.dias_uso::numeric / ei.vida_util_dias, 3) end as indice,
       coalesce(n.motivo, case ei.devolucao_estado when 'DANIFICADO' then 'DANIFICADO' when 'PERDIDO' then 'PERDA' when 'BOM' then 'DEVOLVIDO' end) as motivo_saida
from public.entrega_itens ei
join public.entregas e on e.id = ei.entrega_id and not e.cancelada
left join public.entrega_itens n on n.id = ei.substituido_por
where ei.dias_uso is not null and ei.devolucao_estado is distinct from 'BOM';  -- devolvido em bom estado não é fim de vida

-- ---------------------------------------------------------------------
--  OPERAÇÕES (rodam no servidor, com todas as conferências)
-- ---------------------------------------------------------------------

create or replace function public.registrar_entrega(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_resp public.perfis;
  v_col public.colaboradores;
  v_funcao text;
  v_ent bigint;
  v_agora timestamptz := now();
  v_it jsonb; v_item public.itens; v_qtd numeric; v_motivo text; v_saldo numeric;
  v_ant public.entrega_itens; v_novo bigint; v_dias integer;
  v_ass_c text := p->>'assinatura_colaborador';
  v_ass_r text := p->>'assinatura_responsavel';
  v_lista jsonb := '[]'::jsonb;
  v_termo text := coalesce(nullif(trim(p->>'termo'),''), '');
  v_obs text := nullif(trim(coalesce(p->>'observacao','')), '');
begin
  select * into v_resp from public.perfis where id = v_uid and ativo;
  if not found then raise exception 'Acesso negado'; end if;

  select * into v_col from public.colaboradores where id = (p->>'colaborador_id')::bigint for update;
  if not found then raise exception 'Colaborador não encontrado'; end if;
  if not v_col.ativo then raise exception 'Colaborador inativo'; end if;
  select nome into v_funcao from public.funcoes where id = v_col.funcao_id;

  if v_ass_c is null or v_ass_r is null
     or v_ass_c !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or v_ass_r !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'
     or length(v_ass_c) < 200 or length(v_ass_r) < 200 then
    raise exception 'As duas assinaturas são obrigatórias';
  end if;
  if length(v_ass_c) > 400000 or length(v_ass_r) > 400000 then raise exception 'Assinatura muito grande'; end if;
  if length(v_termo) < 20 or length(v_termo) > 3000 then raise exception 'Termo de responsabilidade inválido'; end if;
  if v_obs is not null and length(v_obs) > 1000 then raise exception 'Observação muito longa'; end if;
  if jsonb_typeof(p->'itens') <> 'array' or jsonb_array_length(p->'itens') = 0 then raise exception 'Inclua pelo menos um item'; end if;
  if jsonb_array_length(p->'itens') > 50 then raise exception 'Itens demais numa ficha'; end if;

  insert into public.entregas (colaborador_id, colaborador_nome, colaborador_cpf, colaborador_matricula, funcao_nome,
      responsavel_id, responsavel_nome, data_hora, termo, observacao, assinatura_colaborador, assinatura_responsavel, dispositivo, hash)
  values (v_col.id, v_col.nome, v_col.cpf, v_col.matricula, v_funcao, v_uid, v_resp.nome, v_agora, v_termo, v_obs,
      v_ass_c, v_ass_r, left(p->>'dispositivo', 300), 'pendente')
  returning id into v_ent;

  perform set_config('epi.servidor', 'sim', true);

  for v_it in select * from jsonb_array_elements(p->'itens') loop
    v_qtd := (v_it->>'quantidade')::numeric;
    v_motivo := v_it->>'motivo';
    if v_qtd is null or v_qtd <= 0 or v_qtd > 1000 then raise exception 'Quantidade inválida'; end if;
    if v_motivo is null or v_motivo not in ('PRIMEIRA_ENTREGA','ADICIONAL','TROCA_PERIODICA','DESGASTE_NATURAL','DANIFICADO','PERDA') then
      raise exception 'Motivo da entrega inválido';
    end if;
    select * into v_item from public.itens where id = (v_it->>'item_id')::bigint for update;
    if not found or not v_item.ativo then raise exception 'Item não encontrado ou inativo'; end if;
    if v_item.tipo = 'EPI' and v_item.ca_validade is not null and v_item.ca_validade < current_date then
      raise exception 'O CA % de "%" venceu em %. Atualize o cadastro antes de entregar.', v_item.ca, v_item.nome, to_char(v_item.ca_validade,'DD/MM/YYYY');
    end if;
    select coalesce(sum(case tipo when 'SAIDA' then -quantidade when 'BAIXA' then -quantidade else quantidade end),0)
      into v_saldo from public.movimentos where item_id = v_item.id;
    if v_saldo < v_qtd then
      raise exception 'Estoque insuficiente de "%": saldo %, pedido %. Lance a entrada primeiro.', v_item.nome, v_saldo, v_qtd;
    end if;

    v_ant := null; v_dias := null;
    if v_motivo not in ('PRIMEIRA_ENTREGA','ADICIONAL') then
      select ei.* into v_ant from public.entrega_itens ei join public.entregas e on e.id = ei.entrega_id
       where ei.colaborador_id = v_col.id and ei.item_id = v_item.id and not e.cancelada
         and ei.substituido_em is null and ei.devolvido_em is null and ei.entrega_id <> v_ent
       order by ei.data desc limit 1 for update of ei;
      if v_ant.id is not null then v_dias := greatest(0, v_agora::date - v_ant.data::date); end if;
    end if;

    insert into public.entrega_itens (entrega_id, colaborador_id, item_id, item_nome, item_tipo, ca, quantidade, motivo, data,
        vida_util_dias, substitui_id, dias_uso_anterior)
    values (v_ent, v_col.id, v_item.id, v_item.nome, v_item.tipo, v_item.ca, v_qtd, v_motivo, v_agora,
        v_item.vida_util_dias, v_ant.id, v_dias)
    returning id into v_novo;

    if v_ant.id is not null then
      update public.entrega_itens set substituido_em = v_agora, substituido_por = v_novo, dias_uso = v_dias where id = v_ant.id;
    end if;

    insert into public.movimentos (item_id, tipo, quantidade, data, entrega_item_id, usuario_id, observacao)
    values (v_item.id, 'SAIDA', v_qtd, v_agora::date, v_novo, v_uid, 'Ficha nº ' || v_ent || ' — ' || v_col.nome);

    v_lista := v_lista || jsonb_build_object('item_id', v_item.id, 'item', v_item.nome, 'ca', v_item.ca, 'quantidade', v_qtd, 'motivo', v_motivo);
  end loop;

  update public.entregas set hash = encode(extensions.digest(
      jsonb_build_object('ficha', v_ent, 'data_hora', v_agora, 'colaborador', v_col.id, 'cpf', v_col.cpf,
                         'responsavel', v_uid, 'itens', v_lista, 'termo', v_termo)::text
      || v_ass_c || v_ass_r, 'sha256'), 'hex')
  where id = v_ent;

  return jsonb_build_object('id', v_ent, 'data_hora', v_agora);
end $$;

create or replace function public.registrar_devolucao(p_entrega_item bigint, p_estado text, p_obs text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ei public.entrega_itens; v_canc boolean;
begin
  if not public.eh_ativo() then raise exception 'Acesso negado'; end if;
  if p_estado not in ('BOM','DANIFICADO','PERDIDO') then raise exception 'Estado inválido'; end if;
  if p_obs is not null and length(p_obs) > 500 then raise exception 'Observação muito longa'; end if;
  select * into v_ei from public.entrega_itens where id = p_entrega_item for update;
  if not found then raise exception 'Item não encontrado'; end if;
  select cancelada into v_canc from public.entregas where id = v_ei.entrega_id;
  if v_canc or v_ei.devolvido_em is not null or v_ei.substituido_em is not null then raise exception 'Este item já não está com o colaborador'; end if;
  perform set_config('epi.servidor', 'sim', true);
  update public.entrega_itens set devolvido_em = now(), devolucao_estado = p_estado, devolucao_obs = nullif(trim(p_obs),''),
         devolucao_por = auth.uid(), dias_uso = greatest(0, current_date - v_ei.data::date)
   where id = v_ei.id;
  if p_estado = 'BOM' then
    insert into public.movimentos (item_id, tipo, quantidade, entrega_item_id, usuario_id, observacao)
    values (v_ei.item_id, 'DEVOLUCAO', v_ei.quantidade, v_ei.id, auth.uid(), 'Devolução ficha nº ' || v_ei.entrega_id);
  end if;
end $$;

create or replace function public.cancelar_entrega(p_entrega bigint, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_e public.entregas; r record;
begin
  if not public.eh_admin() then raise exception 'Só o administrador pode cancelar uma ficha'; end if;
  if p_motivo is null or length(trim(p_motivo)) < 5 then raise exception 'Informe o motivo do cancelamento'; end if;
  select * into v_e from public.entregas where id = p_entrega for update;
  if not found then raise exception 'Ficha não encontrada'; end if;
  if v_e.cancelada then raise exception 'Ficha já cancelada'; end if;
  if exists (select 1 from public.entrega_itens where entrega_id = p_entrega and (substituido_em is not null or devolvido_em is not null)) then
    raise exception 'Algum item desta ficha já foi trocado ou devolvido; cancele as fichas mais novas primeiro';
  end if;
  perform set_config('epi.servidor', 'sim', true);
  update public.entregas set cancelada = true, cancelada_motivo = left(trim(p_motivo), 500), cancelada_por = auth.uid(), cancelada_em = now()
   where id = p_entrega;
  for r in select * from public.entrega_itens where entrega_id = p_entrega loop
    insert into public.movimentos (item_id, tipo, quantidade, entrega_item_id, usuario_id, observacao)
    values (r.item_id, 'ESTORNO', r.quantidade, r.id, auth.uid(), 'Cancelamento da ficha nº ' || p_entrega);
    -- o item que ele tinha substituído volta a ficar com o colaborador
    if r.substitui_id is not null then
      update public.entrega_itens set substituido_em = null, substituido_por = null, dias_uso = null where id = r.substitui_id;
    end if;
  end loop;
end $$;

create or replace function public.atualizar_usuario(p_id uuid, p_nome text, p_papel text, p_ativo boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Só o administrador pode alterar usuários'; end if;
  if p_papel not in ('admin','almoxarife') then raise exception 'Perfil inválido'; end if;
  if p_nome is null or length(trim(p_nome)) < 2 or length(p_nome) > 120 then raise exception 'Informe o nome'; end if;
  perform pg_advisory_xact_lock(4242);
  update public.perfis set nome = trim(p_nome), papel = p_papel, ativo = p_ativo where id = p_id;
  if not found then raise exception 'Usuário não encontrado'; end if;
  if not exists (select 1 from public.perfis where papel = 'admin' and ativo) then
    raise exception 'Precisa ficar pelo menos um administrador ativo';
  end if;
end $$;

-- o próprio usuário pode corrigir o nome que vai na ficha
create or replace function public.meu_nome(p_nome text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_ativo() then raise exception 'Acesso negado'; end if;
  if p_nome is null or length(trim(p_nome)) < 2 or length(p_nome) > 120 then raise exception 'Informe o nome'; end if;
  update public.perfis set nome = trim(p_nome) where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
--  SEGURANÇA: ninguém sem login enxerga nada; cada perfil só faz o que pode
-- ---------------------------------------------------------------------

do $$ declare t text; begin
  foreach t in array array['perfis','funcoes','itens','funcao_itens','colaboradores','entregas','entrega_itens','movimentos','auditoria','configuracao'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
  end loop;
end $$;
revoke all on public.v_saldos, public.v_posse, public.v_durabilidade from anon, public;

-- só leitura direta; gravação pelas operações acima
revoke insert, update, delete, truncate on public.perfis, public.entregas, public.entrega_itens, public.auditoria from authenticated;
revoke update, delete, truncate on public.movimentos from authenticated;
grant select on public.configuracao, public.perfis, public.funcoes, public.itens, public.funcao_itens, public.colaboradores,
                public.entregas, public.entrega_itens, public.movimentos, public.auditoria,
                public.v_saldos, public.v_posse, public.v_durabilidade to authenticated;
grant insert, update, delete on public.configuracao, public.funcoes, public.itens, public.funcao_itens, public.colaboradores to authenticated;
grant insert on public.movimentos to authenticated;

drop policy if exists ler on public.perfis;
create policy ler on public.perfis for select to authenticated using (id = auth.uid() or public.eh_admin());

do $$ declare t text; begin
  foreach t in array array['funcoes','itens','funcao_itens','colaboradores','configuracao'] loop
    execute format('drop policy if exists ler on public.%I', t);
    execute format('drop policy if exists criar on public.%I', t);
    execute format('drop policy if exists alterar on public.%I', t);
    execute format('drop policy if exists apagar on public.%I', t);
    execute format('create policy ler on public.%I for select to authenticated using (public.eh_ativo())', t);
    execute format('create policy criar on public.%I for insert to authenticated with check (public.eh_admin())', t);
    execute format('create policy alterar on public.%I for update to authenticated using (public.eh_admin()) with check (public.eh_admin())', t);
    execute format('create policy apagar on public.%I for delete to authenticated using (public.eh_admin())', t);
  end loop;
  foreach t in array array['entregas','entrega_itens','movimentos'] loop
    execute format('drop policy if exists ler on public.%I', t);
    execute format('create policy ler on public.%I for select to authenticated using (public.eh_ativo())', t);
  end loop;
end $$;

drop policy if exists lancar on public.movimentos;
create policy lancar on public.movimentos for insert to authenticated
  with check (public.eh_ativo() and usuario_id = auth.uid() and tipo in ('ENTRADA','AJUSTE','BAIXA') and entrega_item_id is null);

drop policy if exists ler on public.auditoria;
create policy ler on public.auditoria for select to authenticated using (public.eh_admin());

-- funções: só usuários logados podem chamar
do $$ declare f text; begin
  foreach f in array array['registrar_entrega(jsonb)','registrar_devolucao(bigint,text,text)','cancelar_entrega(bigint,text)',
                           'atualizar_usuario(uuid,text,text,boolean)','meu_nome(text)','eh_ativo()','eh_admin()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['novo_usuario()','auditar()','proteger_ficha()','proteger_movimento()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  POWER BI: visões prontas para os indicadores (esquema "bi")
--  Quem lê é o usuário powerbi_leitura (arquivo 2-powerbi.sql).
--  Não incluem assinaturas e mostram o CPF mascarado.
-- ---------------------------------------------------------------------

create schema if not exists bi;
revoke all on schema bi from public, anon, authenticated;

-- bases calculadas (mesma conta das visões do app)
create or replace view bi.base_saldos as
select i.id as item_id,
       coalesce(sum(case m.tipo when 'SAIDA' then -m.quantidade when 'BAIXA' then -m.quantidade else m.quantidade end), 0)::numeric(12,2) as saldo,
       coalesce(sum(m.quantidade) filter (where m.tipo = 'ENTRADA'), 0)::numeric(12,2) as entradas,
       coalesce(sum(m.quantidade) filter (where m.tipo = 'SAIDA'), 0)::numeric(12,2) as saidas,
       max(m.data) filter (where m.tipo = 'ENTRADA') as ultima_entrada
from public.itens i left join public.movimentos m on m.item_id = i.id
group by i.id;

create or replace view bi.base_posse as
select ei.id, ei.entrega_id, ei.colaborador_id, ei.item_id, ei.item_nome, ei.item_tipo, ei.ca, ei.quantidade,
       ei.motivo, ei.data, ei.vida_util_dias,
       case when ei.vida_util_dias is not null then (ei.data + make_interval(days => ei.vida_util_dias))::date end as troca_prevista,
       (current_date - ei.data::date) as dias_em_uso
from public.entrega_itens ei join public.entregas e on e.id = ei.entrega_id
where not e.cancelada and ei.substituido_em is null and ei.devolvido_em is null;

create or replace view bi.base_durabilidade as
select ei.id, ei.colaborador_id, ei.item_id, ei.item_nome, ei.item_tipo, ei.data as entregue_em,
       coalesce(ei.substituido_em, ei.devolvido_em) as saiu_em,
       ei.dias_uso, ei.vida_util_dias,
       case when ei.vida_util_dias > 0 and ei.dias_uso is not null then round(ei.dias_uso::numeric / ei.vida_util_dias, 3) end as indice,
       coalesce(n.motivo, case ei.devolucao_estado when 'DANIFICADO' then 'DANIFICADO' when 'PERDIDO' then 'PERDA' when 'BOM' then 'DEVOLVIDO' end) as motivo_saida
from public.entrega_itens ei
join public.entregas e on e.id = ei.entrega_id and not e.cancelada
left join public.entrega_itens n on n.id = ei.substituido_por
where ei.dias_uso is not null and ei.devolucao_estado is distinct from 'BOM';  -- devolvido em bom estado não é fim de vida

create or replace view bi.colaboradores as
select c.id as colaborador_id, c.nome, c.matricula,
       case when c.cpf is not null then '***.' || substr(c.cpf,4,3) || '.' || substr(c.cpf,7,3) || '-**' end as cpf_mascarado,
       f.nome as funcao, c.setor, c.admissao, c.ativo
from public.colaboradores c left join public.funcoes f on f.id = c.funcao_id;

create or replace view bi.itens as
select i.id as item_id, i.tipo, i.nome as item, i.ca, i.ca_validade,
       case when i.ca_validade is null then null when i.ca_validade < current_date then 'Vencido'
            when i.ca_validade < current_date + 30 then 'Vence em 30 dias' else 'Válido' end as situacao_ca,
       i.fabricante, i.fornecedor, i.unidade, i.vida_util_dias as vida_util_fornecedor_dias,
       i.devolve, i.estoque_minimo, i.custo_unitario, i.ativo
from public.itens i;

create or replace view bi.kit_funcao as
select f.id as funcao_id, f.nome as funcao, fi.item_id, i.nome as item, i.tipo, fi.quantidade
from public.funcao_itens fi join public.funcoes f on f.id = fi.funcao_id join public.itens i on i.id = fi.item_id;

create or replace view bi.entregas as
select ei.id as entrega_item_id, e.id as ficha, e.data_hora, (e.data_hora at time zone 'America/Sao_Paulo')::date as data,
       to_char(e.data_hora at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
       e.colaborador_id, e.colaborador_nome as colaborador, e.colaborador_matricula as matricula, e.funcao_nome as funcao,
       ei.item_id, ei.item_nome as item, ei.item_tipo as tipo, ei.ca, ei.quantidade, ei.motivo,
       i.custo_unitario, (ei.quantidade * coalesce(i.custo_unitario,0))::numeric(14,2) as valor,
       e.responsavel_nome as responsavel, ei.vida_util_dias, ei.dias_uso_anterior,
       case when ei.vida_util_dias > 0 and ei.dias_uso_anterior is not null then round(ei.dias_uso_anterior::numeric / ei.vida_util_dias, 3) end as indice_durabilidade,
       e.cancelada
from public.entrega_itens ei join public.entregas e on e.id = ei.entrega_id join public.itens i on i.id = ei.item_id;

create or replace view bi.movimentos as
select m.id, m.data, to_char(m.data,'YYYY-MM') as mes, m.item_id, i.nome as item, i.tipo, m.tipo as movimento,
       case m.tipo when 'SAIDA' then -m.quantidade when 'BAIXA' then -m.quantidade else m.quantidade end as quantidade_com_sinal,
       m.quantidade, m.nota_fiscal, m.fornecedor, coalesce(m.custo_unitario, i.custo_unitario) as custo_unitario, m.observacao
from public.movimentos m join public.itens i on i.id = m.item_id;

create or replace view bi.estoque as
select i.id as item_id, i.tipo, i.nome as item, s.saldo, s.entradas, s.saidas, i.estoque_minimo,
       (s.saldo < i.estoque_minimo) as abaixo_do_minimo, (s.saldo * coalesce(i.custo_unitario,0))::numeric(14,2) as valor_em_estoque,
       s.ultima_entrada
from public.itens i join bi.base_saldos s on s.item_id = i.id;

create or replace view bi.durabilidade as
select d.id as entrega_item_id, d.colaborador_id, c.nome as colaborador, f.nome as funcao, d.item_id, d.item_nome as item, d.item_tipo as tipo,
       d.entregue_em::date as entregue_em, d.saiu_em::date as saiu_em, d.dias_uso, d.vida_util_dias as vida_util_fornecedor_dias,
       d.indice, d.motivo_saida,
       case when d.indice is null then 'Sem vida útil cadastrada'
            when d.motivo_saida in ('DANIFICADO','PERDA') and d.indice < 1 then 'Dano ou perda antes do prazo'
            when d.indice < 0.7 then 'Durou menos que o informado'
            else 'Dentro do previsto' end as classificacao
from bi.base_durabilidade d join public.colaboradores c on c.id = d.colaborador_id left join public.funcoes f on f.id = c.funcao_id;

create or replace view bi.em_posse as
select p.id as entrega_item_id, p.entrega_id as ficha, p.colaborador_id, c.nome as colaborador, f.nome as funcao,
       p.item_id, p.item_nome as item, p.item_tipo as tipo, p.quantidade, p.data::date as entregue_em,
       p.troca_prevista, p.dias_em_uso, (p.troca_prevista is not null and p.troca_prevista < current_date) as troca_vencida
from bi.base_posse p join public.colaboradores c on c.id = p.colaborador_id left join public.funcoes f on f.id = c.funcao_id;

revoke all on all tables in schema bi from public, anon, authenticated;
