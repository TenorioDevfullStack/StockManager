-- Bucket e politicas do Supabase Storage para PDFs.
-- Mantem o upload em /{user_id}/{tipo}/{arquivo}.pdf, alinhado ao frontend.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', true, 52428800, array['application/pdf'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documentos_insert_own" on storage.objects;
drop policy if exists "documentos_select_own" on storage.objects;
drop policy if exists "documentos_delete_own" on storage.objects;

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

create policy "documentos_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
