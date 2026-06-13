-- Agenda: tarefas, eventos e lembretes por usuario.

begin;

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text not null,
  descricao text,
  tipo text not null default 'tarefa',
  prioridade text not null default 'media',
  data timestamptz,
  concluida boolean not null default false,
  concluida_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint tarefas_tipo_check check (tipo in ('tarefa', 'evento', 'lembrete')),
  constraint tarefas_prioridade_check check (prioridade in ('baixa', 'media', 'alta'))
);

create index if not exists tarefas_user_data_idx on public.tarefas (user_id, data);
create index if not exists tarefas_user_concluida_idx on public.tarefas (user_id, concluida);

drop trigger if exists tarefas_set_atualizado_em on public.tarefas;
create trigger tarefas_set_atualizado_em
before update on public.tarefas
for each row execute function public.set_atualizado_em();

alter table public.tarefas enable row level security;

revoke all on table public.tarefas from public;
revoke all on table public.tarefas from anon;
grant select, insert, update, delete on table public.tarefas to authenticated;
grant select, insert, update, delete on table public.tarefas to service_role;

drop policy if exists "tarefas_select_own" on public.tarefas;
drop policy if exists "tarefas_insert_own" on public.tarefas;
drop policy if exists "tarefas_update_own" on public.tarefas;
drop policy if exists "tarefas_delete_own" on public.tarefas;

create policy "tarefas_select_own" on public.tarefas
for select to authenticated
using (user_id = auth.uid());

create policy "tarefas_insert_own" on public.tarefas
for insert to authenticated
with check (user_id = auth.uid());

create policy "tarefas_update_own" on public.tarefas
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "tarefas_delete_own" on public.tarefas
for delete to authenticated
using (user_id = auth.uid());

commit;
