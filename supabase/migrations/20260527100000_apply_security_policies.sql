-- Reaplica as politicas de seguranca do Supabase de forma idempotente.
-- Execute depois das migrations de schema/tabelas.

begin;

alter table if exists public.produtos enable row level security;
alter table if exists public.pessoas enable row level security;
alter table if exists public.movimentacoes enable row level security;
alter table if exists public.app_config enable row level security;
alter table if exists public.documentos enable row level security;

revoke all on table public.produtos from public;
revoke all on table public.pessoas from public;
revoke all on table public.movimentacoes from public;
revoke all on table public.app_config from public;
revoke all on table public.documentos from public;

revoke all on table public.produtos from anon;
revoke all on table public.pessoas from anon;
revoke all on table public.movimentacoes from anon;
revoke all on table public.app_config from anon;
revoke all on table public.documentos from anon;

grant select, insert, update, delete on table public.produtos to authenticated;
grant select, insert, update, delete on table public.pessoas to authenticated;
grant select, insert, update, delete on table public.movimentacoes to authenticated;
grant select, insert, update, delete on table public.app_config to authenticated;
grant select, insert, update, delete on table public.documentos to authenticated;

grant select, insert, update, delete on table public.produtos to service_role;
grant select, insert, update, delete on table public.pessoas to service_role;
grant select, insert, update, delete on table public.movimentacoes to service_role;
grant select, insert, update, delete on table public.app_config to service_role;
grant select, insert, update, delete on table public.documentos to service_role;

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
with check (
  user_id = auth.uid()
  and (
    produto_id is null
    or exists (
      select 1
        from public.produtos p
       where p.id = produto_id
         and p.user_id = auth.uid()
    )
  )
  and (
    pessoa_id is null
    or exists (
      select 1
        from public.pessoas pe
       where pe.id = pessoa_id
         and pe.user_id = auth.uid()
    )
  )
);

create policy "movimentacoes_update_own" on public.movimentacoes
for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (
    produto_id is null
    or exists (
      select 1
        from public.produtos p
       where p.id = produto_id
         and p.user_id = auth.uid()
    )
  )
  and (
    pessoa_id is null
    or exists (
      select 1
        from public.pessoas pe
       where pe.id = pessoa_id
         and pe.user_id = auth.uid()
    )
  )
);

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

drop policy if exists "documentos_select_own" on public.documentos;
drop policy if exists "documentos_insert_own" on public.documentos;
drop policy if exists "documentos_update_own" on public.documentos;
drop policy if exists "documentos_delete_own" on public.documentos;
drop policy if exists "Usuários podem acessar seus próprios documentos" on public.documentos;
drop policy if exists "Usuários podem inserir seus próprios documentos" on public.documentos;
drop policy if exists "Usuários podem atualizar seus próprios documentos" on public.documentos;
drop policy if exists "Usuários podem deletar seus próprios documentos" on public.documentos;

create policy "documentos_select_own" on public.documentos
for select to authenticated
using (user_id = auth.uid());

create policy "documentos_insert_own" on public.documentos
for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    produto_id is null
    or exists (
      select 1
        from public.produtos p
       where p.id = produto_id
         and p.user_id = auth.uid()
    )
  )
);

create policy "documentos_update_own" on public.documentos
for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (
    produto_id is null
    or exists (
      select 1
        from public.produtos p
       where p.id = produto_id
         and p.user_id = auth.uid()
    )
  )
);

create policy "documentos_delete_own" on public.documentos
for delete to authenticated
using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 52428800, array['application/pdf'])
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documentos_insert_own" on storage.objects;
drop policy if exists "documentos_select_own" on storage.objects;
drop policy if exists "documentos_update_own" on storage.objects;
drop policy if exists "documentos_delete_own" on storage.objects;
drop policy if exists "Usuários podem fazer upload na sua pasta" on storage.objects;
drop policy if exists "Usuários podem visualizar seus arquivos" on storage.objects;
drop policy if exists "Usuários podem atualizar seus arquivos" on storage.objects;
drop policy if exists "Usuários podem deletar seus arquivos" on storage.objects;

create policy "documentos_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "documentos_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "documentos_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "documentos_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

do $$
begin
  if to_regprocedure('public.set_atualizado_em()') is not null then
    revoke execute on function public.set_atualizado_em() from public;
  end if;

  if to_regprocedure('public.registrar_movimentacao(uuid,text,numeric,text,text,uuid)') is not null then
    revoke execute on function public.registrar_movimentacao(uuid, text, numeric, text, text, uuid) from public;
    revoke execute on function public.registrar_movimentacao(uuid, text, numeric, text, text, uuid) from anon;
    grant execute on function public.registrar_movimentacao(uuid, text, numeric, text, text, uuid) to authenticated;
  end if;

  if to_regprocedure('public.registrar_movimentacao_api(uuid,uuid,text,numeric,text,text,uuid)') is not null then
    revoke execute on function public.registrar_movimentacao_api(uuid, uuid, text, numeric, text, text, uuid) from public;
    revoke execute on function public.registrar_movimentacao_api(uuid, uuid, text, numeric, text, text, uuid) from anon;
    revoke execute on function public.registrar_movimentacao_api(uuid, uuid, text, numeric, text, text, uuid) from authenticated;
    grant execute on function public.registrar_movimentacao_api(uuid, uuid, text, numeric, text, text, uuid) to service_role;
  end if;
end $$;

commit;
