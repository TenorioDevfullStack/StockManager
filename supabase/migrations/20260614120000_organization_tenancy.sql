-- ============================================================
--  Multi-tenancy por ORGANIZACAO (equipe)
-- ------------------------------------------------------------
--  Antes: cada usuario (user_id) tinha um estoque isolado.
--  Agora: varios usuarios pertencem a uma organizacao e
--  compartilham o mesmo estoque. A coluna user_id passa a
--  indicar apenas QUEM criou o registro; o isolamento de
--  dados (RLS) passa a ser por org_id.
--
--  A migracao e idempotente e faz backfill: cada usuario
--  existente ganha uma organizacao pessoal (como admin) e
--  todos os seus registros recebem o org_id correspondente.
-- ============================================================

begin;

-- ============================================================
-- 1. Tabelas de organizacao e membros
-- ============================================================

create table if not exists public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.organizacao_membros (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'membro',
  criado_em timestamptz not null default now(),
  constraint organizacao_membros_papel_check check (papel in ('admin', 'membro')),
  constraint organizacao_membros_unique unique (org_id, user_id)
);

create index if not exists organizacao_membros_user_idx on public.organizacao_membros (user_id);
create index if not exists organizacao_membros_org_idx on public.organizacao_membros (org_id);

drop trigger if exists organizacoes_set_atualizado_em on public.organizacoes;
create trigger organizacoes_set_atualizado_em
before update on public.organizacoes
for each row execute function public.set_atualizado_em();

-- ============================================================
-- 2. Funcoes auxiliares
--    SECURITY DEFINER para evitar recursao infinita na RLS:
--    elas consultam organizacao_membros ignorando as policies.
-- ============================================================

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organizacao_membros
    where org_id = p_org_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organizacao_membros
    where org_id = p_org_id and user_id = auth.uid() and papel = 'admin'
  );
$$;

-- Organizacao "primaria" do usuario (a mais antiga). Usada como
-- default em inserts que nao informam org_id explicitamente.
create or replace function public.primary_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from public.organizacao_membros
  where user_id = auth.uid()
  order by criado_em asc
  limit 1;
$$;

-- Valida o primeiro segmento do caminho de um arquivo no Storage:
-- aceita pasta nomeada por org (da qual o usuario e membro) ou,
-- por compatibilidade, pela uid do proprio usuario (arquivos antigos).
create or replace function public.is_member_folder(p_folder text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v uuid;
begin
  begin
    v := p_folder::uuid;
  exception when others then
    return false;
  end;
  return public.is_org_member(v) or v = auth.uid();
end;
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.primary_org_id() to authenticated;
grant execute on function public.is_member_folder(text) to authenticated;

-- ============================================================
-- 3. RPCs de gestao de organizacao / membros
-- ============================================================

-- Cria uma organizacao e adiciona o chamador como admin (atomico).
create or replace function public.criar_organizacao(p_nome text)
returns public.organizacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizacoes;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  insert into public.organizacoes (nome, criado_por)
  values (coalesce(nullif(btrim(p_nome), ''), 'Minha organizacao'), auth.uid())
  returning * into v_org;

  insert into public.organizacao_membros (org_id, user_id, papel)
  values (v_org.id, auth.uid(), 'admin');

  return v_org;
end;
$$;

-- Garante que o usuario pertenca a ao menos uma organizacao.
-- Retorna o org_id (cria uma organizacao pessoal se necessario).
create or replace function public.garantir_organizacao(p_nome text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select org_id into v_org_id
  from public.organizacao_membros
  where user_id = auth.uid()
  order by criado_em asc
  limit 1;

  if v_org_id is null then
    v_org_id := (public.criar_organizacao(coalesce(p_nome, 'Minha organizacao'))).id;
  end if;

  return v_org_id;
end;
$$;

-- Adiciona (ou atualiza o papel de) um membro por e-mail. So admin.
create or replace function public.adicionar_membro(
  p_org_id uuid,
  p_email text,
  p_papel text default 'membro'
)
returns public.organizacao_membros
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_membro public.organizacao_membros;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Apenas administradores podem gerenciar membros.';
  end if;

  if p_papel not in ('admin', 'membro') then
    raise exception 'Papel invalido.';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'Nenhum usuario encontrado com esse e-mail.';
  end if;

  -- Impede rebaixar o ultimo admin (organizacao ficaria sem administrador).
  if p_papel = 'membro'
     and (select papel from public.organizacao_membros
            where org_id = p_org_id and user_id = v_user_id) = 'admin'
     and (select count(*) from public.organizacao_membros
            where org_id = p_org_id and papel = 'admin') <= 1 then
    raise exception 'A organizacao precisa de ao menos um administrador.';
  end if;

  insert into public.organizacao_membros (org_id, user_id, papel)
  values (p_org_id, v_user_id, p_papel)
  on conflict (org_id, user_id) do update set papel = excluded.papel
  returning * into v_membro;

  return v_membro;
end;
$$;

-- Remove um membro. So admin; nao permite remover o ultimo admin.
create or replace function public.remover_membro(p_org_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Apenas administradores podem gerenciar membros.';
  end if;

  if (select papel from public.organizacao_membros
        where org_id = p_org_id and user_id = p_user_id) = 'admin'
     and (select count(*) from public.organizacao_membros
            where org_id = p_org_id and papel = 'admin') <= 1 then
    raise exception 'Nao e possivel remover o unico administrador da organizacao.';
  end if;

  delete from public.organizacao_membros
  where org_id = p_org_id and user_id = p_user_id;

  return true;
end;
$$;

-- Lista os membros da organizacao com e-mail (auth.users nao e exposta ao
-- cliente, por isso a leitura passa por esta funcao). So membros enxergam.
create or replace function public.listar_membros(p_org_id uuid)
returns table (user_id uuid, email text, papel text, criado_em timestamptz)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'Acesso negado.';
  end if;

  return query
    select m.user_id, u.email::text, m.papel, m.criado_em
    from public.organizacao_membros m
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org_id
    order by m.criado_em asc;
end;
$$;

grant execute on function public.criar_organizacao(text) to authenticated;
grant execute on function public.garantir_organizacao(text) to authenticated;
grant execute on function public.adicionar_membro(uuid, text, text) to authenticated;
grant execute on function public.remover_membro(uuid, uuid) to authenticated;
grant execute on function public.listar_membros(uuid) to authenticated;

-- ============================================================
-- 4. Coluna org_id nas tabelas de dados (app_config fica por usuario)
-- ============================================================

alter table public.produtos      add column if not exists org_id uuid references public.organizacoes(id) on delete cascade;
alter table public.pessoas       add column if not exists org_id uuid references public.organizacoes(id) on delete cascade;
alter table public.movimentacoes add column if not exists org_id uuid references public.organizacoes(id) on delete cascade;
alter table public.documentos    add column if not exists org_id uuid references public.organizacoes(id) on delete cascade;
alter table public.tarefas       add column if not exists org_id uuid references public.organizacoes(id) on delete cascade;

-- ============================================================
-- 5. Backfill: organizacao pessoal por usuario existente
-- ============================================================

do $$
declare
  r record;
  v_org_id uuid;
  v_email text;
begin
  for r in
    select distinct user_id
    from (
      select user_id from public.produtos
      union select user_id from public.pessoas
      union select user_id from public.movimentacoes
      union select user_id from public.documentos
      union select user_id from public.tarefas
    ) s
    where user_id is not null
  loop
    select org_id into v_org_id
    from public.organizacao_membros
    where user_id = r.user_id
    order by criado_em asc
    limit 1;

    if v_org_id is null then
      select email into v_email from auth.users where id = r.user_id;

      insert into public.organizacoes (nome, criado_por)
      values (coalesce('Organizacao de ' || v_email, 'Organizacao'), r.user_id)
      returning id into v_org_id;

      insert into public.organizacao_membros (org_id, user_id, papel)
      values (v_org_id, r.user_id, 'admin');
    end if;

    update public.produtos      set org_id = v_org_id where user_id = r.user_id and org_id is null;
    update public.pessoas       set org_id = v_org_id where user_id = r.user_id and org_id is null;
    update public.movimentacoes set org_id = v_org_id where user_id = r.user_id and org_id is null;
    update public.documentos    set org_id = v_org_id where user_id = r.user_id and org_id is null;
    update public.tarefas       set org_id = v_org_id where user_id = r.user_id and org_id is null;
  end loop;
end $$;

-- ============================================================
-- 6. Trigger: preenche org_id automaticamente quando ausente
--    (mantem o frontend funcionando sem enviar org_id no insert)
-- ============================================================

create or replace function public.set_default_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.org_id is null then
    new.org_id := public.primary_org_id();
  end if;
  if new.org_id is null then
    raise exception 'Usuario nao pertence a nenhuma organizacao.';
  end if;
  return new;
end;
$$;

drop trigger if exists produtos_set_org on public.produtos;
create trigger produtos_set_org
before insert on public.produtos
for each row execute function public.set_default_org_id();

drop trigger if exists pessoas_set_org on public.pessoas;
create trigger pessoas_set_org
before insert on public.pessoas
for each row execute function public.set_default_org_id();

drop trigger if exists movimentacoes_set_org on public.movimentacoes;
create trigger movimentacoes_set_org
before insert on public.movimentacoes
for each row execute function public.set_default_org_id();

drop trigger if exists documentos_set_org on public.documentos;
create trigger documentos_set_org
before insert on public.documentos
for each row execute function public.set_default_org_id();

drop trigger if exists tarefas_set_org on public.tarefas;
create trigger tarefas_set_org
before insert on public.tarefas
for each row execute function public.set_default_org_id();

-- ============================================================
-- 7. NOT NULL + indices + unicidade de SKU por organizacao
-- ============================================================

alter table public.produtos      alter column org_id set not null;
alter table public.pessoas       alter column org_id set not null;
alter table public.movimentacoes alter column org_id set not null;
alter table public.documentos    alter column org_id set not null;
alter table public.tarefas       alter column org_id set not null;

create index if not exists produtos_org_nome_idx      on public.produtos (org_id, nome);
create index if not exists produtos_org_categoria_idx  on public.produtos (org_id, categoria);
create index if not exists produtos_org_estoque_idx    on public.produtos (org_id, quantidade, qtd_minima);
create index if not exists pessoas_org_nome_idx        on public.pessoas (org_id, nome);
create index if not exists movimentacoes_org_data_idx  on public.movimentacoes (org_id, criado_em desc);
create index if not exists documentos_org_data_idx     on public.documentos (org_id, criado_em desc);
create index if not exists tarefas_org_data_idx        on public.tarefas (org_id, data);

-- SKU passa a ser unico por organizacao (antes era por usuario).
drop index if exists public.produtos_user_sku_unique;
create unique index if not exists produtos_org_sku_unique
  on public.produtos (org_id, lower(sku))
  where sku is not null and btrim(sku) <> '';

-- ============================================================
-- 8. RLS das novas tabelas
-- ============================================================

alter table public.organizacoes enable row level security;
alter table public.organizacao_membros enable row level security;

revoke all on table public.organizacoes from public, anon;
revoke all on table public.organizacao_membros from public, anon;
grant select, insert, update, delete on table public.organizacoes to authenticated;
grant select, insert, update, delete on table public.organizacao_membros to authenticated;
grant select, insert, update, delete on table public.organizacoes to service_role;
grant select, insert, update, delete on table public.organizacao_membros to service_role;

drop policy if exists "organizacoes_select_member" on public.organizacoes;
drop policy if exists "organizacoes_update_admin" on public.organizacoes;
drop policy if exists "organizacoes_delete_admin" on public.organizacoes;

create policy "organizacoes_select_member" on public.organizacoes
for select to authenticated
using (public.is_org_member(id));

create policy "organizacoes_update_admin" on public.organizacoes
for update to authenticated
using (public.is_org_admin(id))
with check (public.is_org_admin(id));

create policy "organizacoes_delete_admin" on public.organizacoes
for delete to authenticated
using (public.is_org_admin(id));

-- Criacao de organizacao acontece via RPC criar_organizacao (security definer),
-- por isso nao ha policy de INSERT direto para authenticated.

drop policy if exists "membros_select_same_org" on public.organizacao_membros;
create policy "membros_select_same_org" on public.organizacao_membros
for select to authenticated
using (public.is_org_member(org_id));

-- INSERT/UPDATE/DELETE de membros acontece via RPCs (security definer).

-- ============================================================
-- 9. RLS das tabelas de dados -> por organizacao
-- ============================================================

-- ---- produtos ----
drop policy if exists "produtos_select_own" on public.produtos;
drop policy if exists "produtos_insert_own" on public.produtos;
drop policy if exists "produtos_update_own" on public.produtos;
drop policy if exists "produtos_delete_own" on public.produtos;

create policy "produtos_select_org" on public.produtos
for select to authenticated
using (public.is_org_member(org_id));

create policy "produtos_insert_org" on public.produtos
for insert to authenticated
with check (public.is_org_member(org_id));

create policy "produtos_update_org" on public.produtos
for update to authenticated
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

create policy "produtos_delete_org" on public.produtos
for delete to authenticated
using (public.is_org_member(org_id));

-- ---- pessoas ----
drop policy if exists "pessoas_select_own" on public.pessoas;
drop policy if exists "pessoas_insert_own" on public.pessoas;
drop policy if exists "pessoas_update_own" on public.pessoas;
drop policy if exists "pessoas_delete_own" on public.pessoas;

create policy "pessoas_select_org" on public.pessoas
for select to authenticated
using (public.is_org_member(org_id));

create policy "pessoas_insert_org" on public.pessoas
for insert to authenticated
with check (public.is_org_member(org_id));

create policy "pessoas_update_org" on public.pessoas
for update to authenticated
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

create policy "pessoas_delete_org" on public.pessoas
for delete to authenticated
using (public.is_org_member(org_id));

-- ---- movimentacoes ----
drop policy if exists "movimentacoes_select_own" on public.movimentacoes;
drop policy if exists "movimentacoes_insert_own" on public.movimentacoes;
drop policy if exists "movimentacoes_update_own" on public.movimentacoes;
drop policy if exists "movimentacoes_delete_own" on public.movimentacoes;

create policy "movimentacoes_select_org" on public.movimentacoes
for select to authenticated
using (public.is_org_member(org_id));

create policy "movimentacoes_insert_org" on public.movimentacoes
for insert to authenticated
with check (
  public.is_org_member(org_id)
  and (
    produto_id is null
    or exists (select 1 from public.produtos p where p.id = produto_id and p.org_id = org_id)
  )
  and (
    pessoa_id is null
    or exists (select 1 from public.pessoas pe where pe.id = pessoa_id and pe.org_id = org_id)
  )
);

create policy "movimentacoes_update_org" on public.movimentacoes
for update to authenticated
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

create policy "movimentacoes_delete_org" on public.movimentacoes
for delete to authenticated
using (public.is_org_member(org_id));

-- ---- documentos ----
drop policy if exists "documentos_select_own" on public.documentos;
drop policy if exists "documentos_insert_own" on public.documentos;
drop policy if exists "documentos_update_own" on public.documentos;
drop policy if exists "documentos_delete_own" on public.documentos;

create policy "documentos_select_org" on public.documentos
for select to authenticated
using (public.is_org_member(org_id));

create policy "documentos_insert_org" on public.documentos
for insert to authenticated
with check (
  public.is_org_member(org_id)
  and (
    produto_id is null
    or exists (select 1 from public.produtos p where p.id = produto_id and p.org_id = org_id)
  )
);

create policy "documentos_update_org" on public.documentos
for update to authenticated
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

create policy "documentos_delete_org" on public.documentos
for delete to authenticated
using (public.is_org_member(org_id));

-- ---- tarefas ----
drop policy if exists "tarefas_select_own" on public.tarefas;
drop policy if exists "tarefas_insert_own" on public.tarefas;
drop policy if exists "tarefas_update_own" on public.tarefas;
drop policy if exists "tarefas_delete_own" on public.tarefas;

create policy "tarefas_select_org" on public.tarefas
for select to authenticated
using (public.is_org_member(org_id));

create policy "tarefas_insert_org" on public.tarefas
for insert to authenticated
with check (public.is_org_member(org_id));

create policy "tarefas_update_org" on public.tarefas
for update to authenticated
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

create policy "tarefas_delete_org" on public.tarefas
for delete to authenticated
using (public.is_org_member(org_id));

-- app_config permanece por usuario (preferencias individuais de UI).

-- ============================================================
-- 10. Storage: arquivos de documentos compartilhados por organizacao
--     Novos uploads vao para a pasta {org_id}/...; arquivos antigos
--     em {uid}/... continuam acessiveis ao proprio dono.
-- ============================================================

drop policy if exists "documentos_insert_own" on storage.objects;
drop policy if exists "documentos_select_own" on storage.objects;
drop policy if exists "documentos_update_own" on storage.objects;
drop policy if exists "documentos_delete_own" on storage.objects;

create policy "documentos_insert_member"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'documentos'
  and public.is_member_folder((storage.foldername(name))[1])
);

create policy "documentos_select_member"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documentos'
  and public.is_member_folder((storage.foldername(name))[1])
);

create policy "documentos_update_member"
on storage.objects for update
to authenticated
using (
  bucket_id = 'documentos'
  and public.is_member_folder((storage.foldername(name))[1])
)
with check (
  bucket_id = 'documentos'
  and public.is_member_folder((storage.foldername(name))[1])
);

create policy "documentos_delete_member"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'documentos'
  and public.is_member_folder((storage.foldername(name))[1])
);

-- ============================================================
-- 11. RPCs de movimentacao com escopo por organizacao
-- ============================================================

-- App autenticado: encontra o produto pela organizacao do usuario.
create or replace function public.registrar_movimentacao(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_motivo text default null,
  p_responsavel text default null,
  p_pessoa_id uuid default null
)
returns public.movimentacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto public.produtos%rowtype;
  v_movimentacao public.movimentacoes%rowtype;
  v_nova_quantidade numeric(14, 3);
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if p_tipo not in ('entrada', 'saida', 'ajuste') then
    raise exception 'Tipo de movimentacao invalido.';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select *
    into v_produto
    from public.produtos
   where id = p_produto_id
     and public.is_org_member(org_id)
   for update;

  if not found then
    raise exception 'Material nao encontrado.';
  end if;

  if p_pessoa_id is not null and not exists (
    select 1 from public.pessoas
     where id = p_pessoa_id and org_id = v_produto.org_id
  ) then
    raise exception 'Cadastro nao encontrado.';
  end if;

  if p_tipo = 'entrada' then
    v_nova_quantidade := v_produto.quantidade + p_quantidade;
  elsif p_tipo = 'saida' then
    if p_quantidade > v_produto.quantidade then
      raise exception 'Estoque insuficiente. Disponivel: %.', v_produto.quantidade;
    end if;
    v_nova_quantidade := v_produto.quantidade - p_quantidade;
  else
    v_nova_quantidade := p_quantidade;
  end if;

  update public.produtos
     set quantidade = v_nova_quantidade
   where id = v_produto.id;

  insert into public.movimentacoes (
    user_id, org_id, produto_id, pessoa_id, tipo, quantidade,
    motivo, responsavel, produto_snapshot
  )
  values (
    auth.uid(), v_produto.org_id, v_produto.id, p_pessoa_id, p_tipo, p_quantidade,
    nullif(btrim(p_motivo), ''), nullif(btrim(p_responsavel), ''),
    jsonb_build_object(
      'nome', v_produto.nome,
      'sku', v_produto.sku,
      'unidade', v_produto.unidade,
      'quantidade_anterior', v_produto.quantidade,
      'quantidade_atual', v_nova_quantidade
    )
  )
  returning * into v_movimentacao;

  return v_movimentacao;
end;
$$;

revoke execute on function public.registrar_movimentacao(uuid, text, numeric, text, text, uuid) from public, anon;
grant execute on function public.registrar_movimentacao(uuid, text, numeric, text, text, uuid) to authenticated;

-- Bot API (service_role): recebe a organizacao alvo explicitamente.
create or replace function public.registrar_movimentacao_api(
  p_org_id uuid,
  p_produto_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_motivo text default null,
  p_responsavel text default null,
  p_pessoa_id uuid default null,
  p_user_id uuid default null
)
returns public.movimentacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto public.produtos%rowtype;
  v_movimentacao public.movimentacoes%rowtype;
  v_nova_quantidade numeric(14, 3);
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Acesso negado.';
  end if;

  if p_org_id is null then
    raise exception 'Organizacao da API nao configurada.';
  end if;

  if p_tipo not in ('entrada', 'saida', 'ajuste') then
    raise exception 'Tipo de movimentacao invalido.';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select *
    into v_produto
    from public.produtos
   where id = p_produto_id
     and org_id = p_org_id
   for update;

  if not found then
    raise exception 'Material nao encontrado.';
  end if;

  if p_pessoa_id is not null and not exists (
    select 1 from public.pessoas
     where id = p_pessoa_id and org_id = p_org_id
  ) then
    raise exception 'Cadastro nao encontrado.';
  end if;

  if p_tipo = 'entrada' then
    v_nova_quantidade := v_produto.quantidade + p_quantidade;
  elsif p_tipo = 'saida' then
    if p_quantidade > v_produto.quantidade then
      raise exception 'Estoque insuficiente. Disponivel: %.', v_produto.quantidade;
    end if;
    v_nova_quantidade := v_produto.quantidade - p_quantidade;
  else
    v_nova_quantidade := p_quantidade;
  end if;

  update public.produtos
     set quantidade = v_nova_quantidade
   where id = v_produto.id;

  insert into public.movimentacoes (
    user_id, org_id, produto_id, pessoa_id, tipo, quantidade,
    motivo, responsavel, produto_snapshot
  )
  values (
    p_user_id, p_org_id, v_produto.id, p_pessoa_id, p_tipo, p_quantidade,
    nullif(btrim(p_motivo), ''), nullif(btrim(p_responsavel), ''),
    jsonb_build_object(
      'nome', v_produto.nome,
      'sku', v_produto.sku,
      'unidade', v_produto.unidade,
      'quantidade_anterior', v_produto.quantidade,
      'quantidade_atual', v_nova_quantidade
    )
  )
  returning * into v_movimentacao;

  return v_movimentacao;
end;
$$;

-- Remove a versao antiga (assinatura sem p_org_id) se existir.
drop function if exists public.registrar_movimentacao_api(uuid, uuid, text, numeric, text, text, uuid);

revoke execute on function public.registrar_movimentacao_api(uuid, uuid, text, numeric, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.registrar_movimentacao_api(uuid, uuid, text, numeric, text, text, uuid, uuid) to service_role;

commit;
