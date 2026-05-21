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

grant execute on function public.registrar_movimentacao(uuid, text, numeric, text, text, uuid) to authenticated;
