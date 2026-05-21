-- Tabela para gerenciar documentos/PDFs
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  descricao text,
  arquivo_url text not null,
  arquivo_caminho text not null,
  tipo_documento text not null default 'geral',
  produto_id uuid references public.produtos(id) on delete set null,
  tags text[] default array[]::text[],
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Índices para otimizar buscas
create index documentos_user_idx on public.documentos (user_id);
create index documentos_user_data_idx on public.documentos (user_id, criado_em desc);
create index documentos_tipo_idx on public.documentos (user_id, tipo_documento);
create index documentos_produto_idx on public.documentos (produto_id);
create index documentos_tags_idx on public.documentos using gin(tags);

-- Trigger para atualizar data de modificação
create trigger documentos_set_atualizado_em
before update on public.documentos
for each row execute function public.set_atualizado_em();

-- Row Level Security
alter table public.documentos enable row level security;

-- Políticas de acesso
create policy "Usuários podem acessar seus próprios documentos"
  on public.documentos for select
  using (auth.uid() = user_id);

create policy "Usuários podem inserir seus próprios documentos"
  on public.documentos for insert
  with check (auth.uid() = user_id);

create policy "Usuários podem atualizar seus próprios documentos"
  on public.documentos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Usuários podem deletar seus próprios documentos"
  on public.documentos for delete
  using (auth.uid() = user_id);
