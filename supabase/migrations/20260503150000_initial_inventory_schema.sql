create extension if not exists pgcrypto;

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  sku text,
  categoria text not null default 'Outros',
  unidade text not null default 'un',
  quantidade numeric(14, 3) not null default 0,
  qtd_minima numeric(14, 3) not null default 0,
  localizacao text,
  descricao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint produtos_quantidade_check check (quantidade >= 0),
  constraint produtos_qtd_minima_check check (qtd_minima >= 0)
);

create unique index produtos_user_sku_unique
  on public.produtos (user_id, lower(sku))
  where sku is not null and btrim(sku) <> '';

create index produtos_user_nome_idx on public.produtos (user_id, nome);
create index produtos_user_categoria_idx on public.produtos (user_id, categoria);
create index produtos_user_estoque_idx on public.produtos (user_id, quantidade, qtd_minima);

create table public.pessoas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  documento text,
  tipo text not null default 'funcionario',
  telefone text,
  email text,
  endereco text,
  obs text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pessoas_tipo_check check (tipo in ('funcionario', 'fornecedor', 'ambos'))
);

create index pessoas_user_nome_idx on public.pessoas (user_id, nome);
create index pessoas_user_tipo_idx on public.pessoas (user_id, tipo);
create index pessoas_user_documento_idx on public.pessoas (user_id, documento);

create table public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  produto_id uuid references public.produtos(id) on delete set null,
  pessoa_id uuid references public.pessoas(id) on delete set null,
  tipo text not null,
  quantidade numeric(14, 3) not null,
  motivo text,
  responsavel text,
  produto_snapshot jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  constraint movimentacoes_tipo_check check (tipo in ('entrada', 'saida', 'ajuste')),
  constraint movimentacoes_quantidade_check check (quantidade > 0)
);

create index movimentacoes_user_data_idx on public.movimentacoes (user_id, criado_em desc);
create index movimentacoes_user_tipo_idx on public.movimentacoes (user_id, tipo);
create index movimentacoes_produto_idx on public.movimentacoes (produto_id);
create index movimentacoes_pessoa_idx on public.movimentacoes (pessoa_id);

create table public.app_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger produtos_set_atualizado_em
before update on public.produtos
for each row execute function public.set_atualizado_em();

create trigger pessoas_set_atualizado_em
before update on public.pessoas
for each row execute function public.set_atualizado_em();

create trigger app_config_set_atualizado_em
before update on public.app_config
for each row execute function public.set_atualizado_em();

alter table public.produtos enable row level security;
alter table public.pessoas enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.app_config enable row level security;

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

create policy "movimentacoes_select_own" on public.movimentacoes
for select to authenticated
using (user_id = auth.uid());

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
