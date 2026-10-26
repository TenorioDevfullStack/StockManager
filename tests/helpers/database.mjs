import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';

export const userA = '10000000-0000-4000-8000-000000000001';
export const userB = '10000000-0000-4000-8000-000000000002';
export const orgA = '20000000-0000-4000-8000-000000000001';
export const orgB = '20000000-0000-4000-8000-000000000002';
export const legacyId = '30000000-0000-4000-8000-000000000001';

export async function database() {
  const db = new PGlite();
  // Simula somente os schemas gerenciados pelo Supabase. As migrations da aplicação são reais.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql as $$
      select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
  `);
  for (const filename of (await readdir('supabase/migrations')).sort()) {
    if (filename.startsWith('20261026')) continue;
    const source = (await readFile(`supabase/migrations/${filename}`, 'utf8'))
      .replace('create extension if not exists pgcrypto;', ''); // UUID nativo no Postgres do PGlite.
    try { await db.exec(source); } catch (error) { throw new Error(`${filename}: ${error.message}`); }
  }
  await db.exec(`
    insert into auth.users values ('${userA}','gestor@example.test'),('${userB}','outra@example.test');
    insert into public.organizacoes(id,nome,criado_por) values ('${orgA}','Equipe teste','${userA}'),('${orgB}','Outra equipe','${userB}');
    insert into public.organizacao_membros(org_id,user_id,papel) values ('${orgA}','${userA}','admin'),('${orgB}','${userB}','admin');
    insert into public.produtos(id,user_id,org_id,nome,unidade,quantidade) values ('${legacyId}','${userA}','${orgA}','Material legado','un',10);
  `);
  await db.exec(await readFile('supabase/migrations/20261026210000_inventory_costs.sql', 'utf8'));
  await asUser(db, userA);
  return db;
}
export async function asUser(db, user = userA, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [user,role]);
  await db.exec(`set role ${role}`);
}
export async function createProduct(db, nome, unidade = 'un') {
  return (await db.query('insert into produtos(nome,unidade,org_id) values ($1,$2,$3) returning *', [nome,unidade,orgA])).rows[0];
}
export async function move(db, p, tipo, quantidade, custo = null, extra = {}) {
  return (await db.query(`select * from public.registrar_movimentacao_custeada(
    p_produto_id=>$1,p_tipo=>$2,p_quantidade=>$3,p_custo_unitario=>$4,p_responsavel=>$5,p_motivo=>$6,
    p_setor=>$7,p_documento_referencia=>$8,p_fornecedor_id=>$9,p_operacao_id=>$10)`,
    [p,tipo,quantidade,custo,extra.responsavel ?? 'Leandro',extra.motivo ?? 'Teste de manutenção',
      extra.setor ?? null,extra.referencia ?? null,extra.fornecedor ?? null,extra.operacao ?? null])).rows[0];
}
