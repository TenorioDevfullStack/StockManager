-- Acesso por login Supabase Auth.
-- Execute esta migration depois de criar a tela de acesso no frontend.

alter table public.produtos alter column user_id set default auth.uid();
alter table public.pessoas alter column user_id set default auth.uid();
alter table public.movimentacoes alter column user_id set default auth.uid();
alter table public.app_config alter column user_id set default auth.uid();

alter table public.produtos drop column if exists preco_custo;
alter table public.produtos drop column if exists preco_venda;

update public.pessoas
   set tipo = 'funcionario'
 where tipo = 'cliente';

alter table public.pessoas drop constraint if exists pessoas_tipo_check;
alter table public.pessoas alter column tipo set default 'funcionario';
alter table public.pessoas
  add constraint pessoas_tipo_check check (tipo in ('funcionario', 'fornecedor', 'ambos'));

alter table public.produtos enable row level security;
alter table public.pessoas enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.app_config enable row level security;

drop policy if exists "produtos_select_own" on public.produtos;
drop policy if exists "produtos_insert_own" on public.produtos;
drop policy if exists "produtos_update_own" on public.produtos;
drop policy if exists "produtos_delete_own" on public.produtos;

create policy "produtos_select_own" on public.produtos
for select to authenticated
using (user_id = auth.uid());

create policy "produtos_insert_own" on public.produtos
for insert to authenticated
with check (user_id = auth.uid());

create policy "produtos_update_own" on public.produtos
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "produtos_delete_own" on public.produtos
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "pessoas_select_own" on public.pessoas;
drop policy if exists "pessoas_insert_own" on public.pessoas;
drop policy if exists "pessoas_update_own" on public.pessoas;
drop policy if exists "pessoas_delete_own" on public.pessoas;

create policy "pessoas_select_own" on public.pessoas
for select to authenticated
using (user_id = auth.uid());

create policy "pessoas_insert_own" on public.pessoas
for insert to authenticated
with check (user_id = auth.uid());

create policy "pessoas_update_own" on public.pessoas
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "pessoas_delete_own" on public.pessoas
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "movimentacoes_select_own" on public.movimentacoes;
drop policy if exists "movimentacoes_insert_own" on public.movimentacoes;
drop policy if exists "movimentacoes_update_own" on public.movimentacoes;
drop policy if exists "movimentacoes_delete_own" on public.movimentacoes;

create policy "movimentacoes_select_own" on public.movimentacoes
for select to authenticated
using (user_id = auth.uid());

create policy "movimentacoes_insert_own" on public.movimentacoes
for insert to authenticated
with check (user_id = auth.uid());

create policy "movimentacoes_update_own" on public.movimentacoes
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "movimentacoes_delete_own" on public.movimentacoes
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "app_config_select_own" on public.app_config;
drop policy if exists "app_config_insert_own" on public.app_config;
drop policy if exists "app_config_update_own" on public.app_config;
drop policy if exists "app_config_delete_own" on public.app_config;

create policy "app_config_select_own" on public.app_config
for select to authenticated
using (user_id = auth.uid());

create policy "app_config_insert_own" on public.app_config
for insert to authenticated
with check (user_id = auth.uid());

create policy "app_config_update_own" on public.app_config
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "app_config_delete_own" on public.app_config
for delete to authenticated
using (user_id = auth.uid());

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
    raise exception 'Usuário não autenticado.';
  end if;

  if p_tipo not in ('entrada', 'saida', 'ajuste') then
    raise exception 'Tipo de movimentação inválido.';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  select *
    into v_produto
    from public.produtos
   where id = p_produto_id
     and user_id = auth.uid()
   for update;

  if not found then
    raise exception 'Material não encontrado.';
  end if;

  if p_pessoa_id is not null and not exists (
    select 1
      from public.pessoas
     where id = p_pessoa_id
       and user_id = auth.uid()
  ) then
    raise exception 'Cadastro não encontrado.';
  end if;

  if p_tipo = 'entrada' then
    v_nova_quantidade := v_produto.quantidade + p_quantidade;
  elsif p_tipo = 'saida' then
    if p_quantidade > v_produto.quantidade then
      raise exception 'Estoque insuficiente. Disponível: %.', v_produto.quantidade;
    end if;
    v_nova_quantidade := v_produto.quantidade - p_quantidade;
  else
    v_nova_quantidade := p_quantidade;
  end if;

  update public.produtos
     set quantidade = v_nova_quantidade
   where id = v_produto.id
     and user_id = auth.uid();

  insert into public.movimentacoes (
    user_id,
    produto_id,
    pessoa_id,
    tipo,
    quantidade,
    motivo,
    responsavel,
    produto_snapshot
  )
  values (
    auth.uid(),
    v_produto.id,
    p_pessoa_id,
    p_tipo,
    p_quantidade,
    nullif(btrim(p_motivo), ''),
    nullif(btrim(p_responsavel), ''),
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

revoke execute on function public.registrar_movimentacao(uuid, text, numeric, text, text, uuid) from anon;
grant execute on function public.registrar_movimentacao(uuid, text, numeric, text, text, uuid) to authenticated;
