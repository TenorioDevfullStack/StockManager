-- ============================================================
--  Soft-delete sincronizado (corrige "registros zumbis")
-- ------------------------------------------------------------
--  Antes: excluir um registro fazia DELETE no servidor. Outros
--  dispositivos ainda tinham o registro em cache e, ao sincronizar
--  (upsert de tudo), ressuscitavam o registro.
--
--  Agora: excluir marca excluido_em = now(). A marcacao propaga
--  pela mesma logica de merge/sync (vence por atualizado_em), entao
--  os demais dispositivos passam a "enxergar" a exclusao e somem
--  com o registro do cache. Aplica-se a produtos, pessoas e tarefas
--  (movimentacoes nao tem exclusao; documentos usam replace total).
-- ============================================================

begin;

alter table public.produtos add column if not exists excluido_em timestamptz;
alter table public.pessoas  add column if not exists excluido_em timestamptz;
alter table public.tarefas  add column if not exists excluido_em timestamptz;

-- Indices para listar apenas registros ativos rapidamente.
create index if not exists produtos_org_ativos_idx on public.produtos (org_id, nome) where excluido_em is null;
create index if not exists pessoas_org_ativos_idx  on public.pessoas (org_id, nome) where excluido_em is null;
create index if not exists tarefas_org_ativos_idx  on public.tarefas (org_id, data) where excluido_em is null;

-- SKU unico apenas entre produtos ATIVOS: ao excluir um material,
-- o SKU dele volta a ficar disponivel para reuso.
drop index if exists public.produtos_org_sku_unique;
create unique index if not exists produtos_org_sku_unique
  on public.produtos (org_id, lower(sku))
  where sku is not null and btrim(sku) <> '' and excluido_em is null;

-- ============================================================
-- RPCs de movimentacao: nao permitem movimentar material excluido,
-- nem referenciar pessoa excluida.
-- ============================================================

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
     and excluido_em is null
   for update;

  if not found then
    raise exception 'Material nao encontrado.';
  end if;

  if p_pessoa_id is not null and not exists (
    select 1 from public.pessoas
     where id = p_pessoa_id and org_id = v_produto.org_id and excluido_em is null
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
     and excluido_em is null
   for update;

  if not found then
    raise exception 'Material nao encontrado.';
  end if;

  if p_pessoa_id is not null and not exists (
    select 1 from public.pessoas
     where id = p_pessoa_id and org_id = p_org_id and excluido_em is null
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

commit;
