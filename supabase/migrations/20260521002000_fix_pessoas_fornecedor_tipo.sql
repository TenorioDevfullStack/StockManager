-- Garante que contatos de fornecedores continuam validos no banco.
-- Idempotente para projetos onde migrations anteriores nao foram aplicadas.

update public.pessoas
   set tipo = 'funcionario'
 where tipo is null
    or tipo = 'cliente';

alter table public.pessoas alter column tipo set default 'funcionario';
alter table public.pessoas drop constraint if exists pessoas_tipo_check;
alter table public.pessoas
  add constraint pessoas_tipo_check check (tipo in ('funcionario', 'fornecedor', 'ambos'));
