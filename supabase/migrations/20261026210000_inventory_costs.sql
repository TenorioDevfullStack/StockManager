begin;

-- Custos desconhecidos continuam NULL: não reavaliar retroativamente o histórico.
alter table public.produtos add column custo_medio numeric(18,6)
  check (custo_medio >= 0 and custo_medio <> 'NaN'::numeric);
alter table public.movimentacoes
  add column custo_unitario numeric(18,6) check (custo_unitario >= 0 and custo_unitario <> 'NaN'::numeric),
  add column custo_total numeric(18,2) check (custo_total >= 0 and custo_total <> 'NaN'::numeric),
  add column setor text,
  add column documento_referencia text,
  add column fornecedor_id uuid references public.pessoas(id),
  add column operacao_id uuid;
create unique index movimentacoes_org_operacao_unique
  on public.movimentacoes(org_id, operacao_id) where operacao_id is not null;
create index movimentacoes_org_periodo_idx on public.movimentacoes(org_id, criado_em, id);

-- Ajuste é um saldo absoluto, inclusive zero. Entradas/saídas são sempre positivas.
alter table public.movimentacoes drop constraint movimentacoes_quantidade_check;
alter table public.movimentacoes add constraint movimentacoes_quantidade_check check (
  quantidade <> 'NaN'::numeric and
  ((tipo = 'ajuste' and quantidade >= 0) or (tipo <> 'ajuste' and quantidade > 0))
);

-- Clientes não podem regravar saldos, custos ou apagar o livro de movimentações.
revoke insert, update, delete on public.movimentacoes from authenticated;
revoke insert, update, delete on public.produtos from authenticated;
grant insert (id,user_id,org_id,nome,sku,categoria,unidade,qtd_minima,localizacao,descricao,criado_em,atualizado_em)
  on public.produtos to authenticated;
grant update (nome,sku,categoria,unidade,qtd_minima,localizacao,descricao,atualizado_em,excluido_em)
  on public.produtos to authenticated;

create function public.proteger_identidade_material() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.unidade is distinct from old.unidade and (
    old.quantidade <> 0 or exists(select 1 from public.movimentacoes where produto_id = old.id)
  ) then
    raise exception 'Unidade de material com saldo ou histórico não pode ser alterada. Cadastre outro material.';
  end if;
  if new.excluido_em is not null and old.excluido_em is null and old.quantidade <> 0 then
    raise exception 'Zere o saldo com uma movimentação justificada antes de excluir o material.';
  end if;
  return new;
end;
$$;
create trigger produtos_proteger_identidade before update on public.produtos
  for each row execute function public.proteger_identidade_material();

-- Núcleo único, privado, compartilhado pelo app e pela API do bot.
create function public._movimentar_com_custo(
  p_org_id uuid, p_user_id uuid, p_produto_id uuid, p_tipo text, p_quantidade numeric,
  p_motivo text, p_responsavel text, p_pessoa_id uuid,
  p_custo_unitario numeric, p_setor text, p_documento_referencia text,
  p_fornecedor_id uuid, p_operacao_id uuid
) returns public.movimentacoes language plpgsql security definer set search_path = public as $$
declare
  p public.produtos%rowtype;
  m public.movimentacoes%rowtype;
  nova_qtd numeric(14,3);
  novo_custo numeric(18,6);
  custo_mov numeric(18,6);
  payload jsonb;
begin
  if p_tipo is null or p_tipo not in ('entrada','saida','ajuste') then
    raise exception 'Tipo de movimentação inválido.';
  end if;
  if p_quantidade is null or p_quantidade::text in ('NaN','Infinity','-Infinity')
    or p_quantidade < 0 or (p_tipo <> 'ajuste' and p_quantidade = 0)
    or p_quantidade <> round(p_quantidade,3) then
    raise exception 'Quantidade inválida. Use até três casas decimais; zero somente em ajuste.';
  end if;
  if p_custo_unitario is not null and (p_tipo <> 'entrada' or p_custo_unitario < 0
    or p_custo_unitario::text in ('NaN','Infinity','-Infinity')
    or p_custo_unitario <> round(p_custo_unitario,6)) then
    raise exception 'Custo unitário inválido. Informe-o somente em entradas, com até seis casas decimais.';
  end if;
  if p_tipo = 'ajuste' and nullif(btrim(p_motivo),'') is null then
    raise exception 'Informe o motivo do ajuste.';
  end if;
  if p_tipo = 'saida' and nullif(btrim(p_responsavel),'') is null then
    raise exception 'Informe quem retirou o material.';
  end if;
  if length(coalesce(p_setor,'')) > 120 or length(coalesce(p_documento_referencia,'')) > 120 then
    raise exception 'Setor e referência devem ter até 120 caracteres.';
  end if;

  payload := jsonb_build_object('produto',p_produto_id,'tipo',p_tipo,'quantidade',p_quantidade,
    'custo',p_custo_unitario,'motivo',p_motivo,'responsavel',p_responsavel,
    'pessoa',p_pessoa_id,'setor',p_setor,'documento',p_documento_referencia,'fornecedor',p_fornecedor_id);
  -- O bloqueio também serializa o cálculo da média e as retiradas simultâneas.
  select * into p from public.produtos where id=p_produto_id and org_id=p_org_id for update;
  if not found then raise exception 'Material não encontrado.'; end if;
  if p_operacao_id is not null then
    select * into m from public.movimentacoes where org_id=p_org_id and operacao_id=p_operacao_id;
    if found then
      if m.produto_snapshot->'requisicao' is distinct from payload then
        raise exception 'Identificador de operação já utilizado com outros dados.';
      end if;
      return m;
    end if;
  end if;
  if p.excluido_em is not null then raise exception 'Material excluído.'; end if;
  if p_pessoa_id is not null and not exists(select 1 from public.pessoas
    where id=p_pessoa_id and org_id=p_org_id and excluido_em is null) then
    raise exception 'Responsável não encontrado na organização.';
  end if;
  if p_fornecedor_id is not null and not exists(select 1 from public.pessoas
    where id=p_fornecedor_id and org_id=p_org_id and excluido_em is null and tipo in ('fornecedor','ambos')) then
    raise exception 'Fornecedor não encontrado na organização.';
  end if;
  novo_custo := p.custo_medio;
  if p_tipo = 'entrada' then
    nova_qtd := p.quantidade + p_quantidade;
    custo_mov := p_custo_unitario;
    if p.quantidade = 0 then
      novo_custo := p_custo_unitario;
    elsif p.custo_medio is null or p_custo_unitario is null then
      novo_custo := null;
    else
      novo_custo := round((p.quantidade*p.custo_medio+p_quantidade*p_custo_unitario)/nova_qtd,6);
    end if;
  elsif p_tipo = 'saida' then
    if p_quantidade > p.quantidade then raise exception 'Estoque insuficiente. Disponível: %.',p.quantidade; end if;
    nova_qtd := p.quantidade-p_quantidade;
    custo_mov := p.custo_medio;
  else
    nova_qtd := p_quantidade;
    -- Ganho de inventário sem origem/custo não deve receber um preço inventado.
    if nova_qtd > p.quantidade then novo_custo := null; end if;
    custo_mov := null;
  end if;
  update public.produtos set quantidade=nova_qtd,custo_medio=novo_custo where id=p.id;
  insert into public.movimentacoes(user_id,org_id,produto_id,pessoa_id,tipo,quantidade,motivo,responsavel,
    custo_unitario,custo_total,setor,documento_referencia,fornecedor_id,operacao_id,produto_snapshot)
  values(p_user_id,p_org_id,p.id,p_pessoa_id,p_tipo,p_quantidade,nullif(btrim(p_motivo),''),
    nullif(btrim(p_responsavel),''),custo_mov,round(custo_mov*p_quantidade,2),nullif(btrim(p_setor),''),
    nullif(btrim(p_documento_referencia),''),p_fornecedor_id,p_operacao_id,
    jsonb_build_object('nome',p.nome,'sku',p.sku,'unidade',p.unidade,
      'quantidade_anterior',p.quantidade,'quantidade_atual',nova_qtd,
      'custo_medio_anterior',p.custo_medio,'custo_medio_atual',novo_custo,'requisicao',payload)) returning * into m;
  return m;
end;
$$;
revoke all on function public._movimentar_com_custo(uuid,uuid,uuid,text,numeric,text,text,uuid,numeric,text,text,uuid,uuid)
  from public,anon,authenticated,service_role;

create function public.registrar_movimentacao_custeada(
  p_produto_id uuid,p_tipo text,p_quantidade numeric,p_motivo text default null,
  p_responsavel text default null,p_pessoa_id uuid default null,p_custo_unitario numeric default null,
  p_setor text default null,p_documento_referencia text default null,p_fornecedor_id uuid default null,
  p_operacao_id uuid default null
) returns public.movimentacoes language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  select org_id into v_org from public.produtos where id=p_produto_id and public.is_org_member(org_id);
  if not found then raise exception 'Material não encontrado.'; end if;
  return public._movimentar_com_custo(v_org,auth.uid(),p_produto_id,p_tipo,p_quantidade,
    p_motivo,p_responsavel,p_pessoa_id,p_custo_unitario,p_setor,p_documento_referencia,p_fornecedor_id,p_operacao_id);
end;
$$;
revoke all on function public.registrar_movimentacao_custeada(uuid,text,numeric,text,text,uuid,numeric,text,text,uuid,uuid) from public,anon;
grant execute on function public.registrar_movimentacao_custeada(uuid,text,numeric,text,text,uuid,numeric,text,text,uuid,uuid) to authenticated;

-- Clientes antigos continuam registrando, mas entradas sem preço ficam explicitamente sem custo.
create or replace function public.registrar_movimentacao(p_produto_id uuid,p_tipo text,p_quantidade numeric,
  p_motivo text default null,p_responsavel text default null,p_pessoa_id uuid default null)
returns public.movimentacoes language sql security definer set search_path = public as $$
  select public.registrar_movimentacao_custeada(p_produto_id,p_tipo,p_quantidade,p_motivo,p_responsavel,p_pessoa_id);
$$;

drop function public.registrar_movimentacao_api(uuid,uuid,text,numeric,text,text,uuid,uuid);
create function public.registrar_movimentacao_api(p_org_id uuid,p_produto_id uuid,p_tipo text,p_quantidade numeric,
  p_motivo text default null,p_responsavel text default null,p_pessoa_id uuid default null,p_user_id uuid default null,
  p_custo_unitario numeric default null,p_setor text default null,p_documento_referencia text default null,
  p_fornecedor_id uuid default null,p_operacao_id uuid default null)
returns public.movimentacoes language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Acesso negado.'; end if;
  if p_org_id is null or p_user_id is null or not exists(select 1 from public.organizacao_membros
    where org_id=p_org_id and user_id=p_user_id) then raise exception 'Usuário não pertence à organização.'; end if;
  return public._movimentar_com_custo(p_org_id,p_user_id,p_produto_id,p_tipo,p_quantidade,
    p_motivo,p_responsavel,p_pessoa_id,p_custo_unitario,p_setor,p_documento_referencia,p_fornecedor_id,p_operacao_id);
end;
$$;
revoke all on function public.registrar_movimentacao_api(uuid,uuid,text,numeric,text,text,uuid,uuid,numeric,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.registrar_movimentacao_api(uuid,uuid,text,numeric,text,text,uuid,uuid,numeric,text,text,uuid,uuid) to service_role;

commit;
