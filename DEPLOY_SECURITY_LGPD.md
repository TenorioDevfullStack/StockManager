# Deploy, Segurança e LGPD

Este projeto é um sistema interno de controle de estoque para equipe de manutenção. Ele trata dados pessoais comuns, como nome, e-mail, telefone, matrícula/ID interno, setor/empresa e histórico de retirada de materiais.

## Antes do deploy

- Não publique o arquivo `.env`.
- Não use `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Publique apenas a chave `anon` do Supabase em `js/supabase.config.js`. Essa chave é pública por natureza e depende de RLS ativo no banco.
- Execute a migration `supabase/migrations/20260527100000_apply_security_policies.sql` no Supabase SQL Editor depois das migrations de schema.
- Não execute migrations que desabilitem RLS.
- No Supabase Auth, revise se a confirmação de e-mail deve ficar ativa para novos acessos.
- Em produção interna, mantenha `allowSignUp: false` em `js/supabase.config.js` e crie usuários pelo painel do Supabase Auth.
- No Supabase, mantenha RLS ativo nas tabelas `produtos`, `pessoas`, `movimentacoes`, `app_config` e `documentos`.
- Mantenha o bucket `documentos` privado. O app gera URLs assinadas temporárias para visualizar e baixar PDFs.

## Arquivos que não devem ir para o hosting

- `.env`
- `.env.*`
- arquivos de log
- chaves `service_role`

Os arquivos `.gitignore`, `.vercelignore` e `.netlifyignore` já bloqueiam esses itens.

## Controles LGPD implementados no sistema

- Acesso autenticado via Supabase Auth.
- Separação de dados por `user_id`.
- RLS por usuário autenticado.
- Bucket privado para PDFs, com acesso por pasta `{user_id}`.
- Botão de logout.
- Limpeza do cache local do usuário ao sair.
- Redução de coleta: a interface usa matrícula/ID interno em vez de CPF/CNPJ e setor/empresa em vez de endereço pessoal.
- Sanitização de HTML em dados exibidos na tela.

## Pontos LGPD que dependem da operação

- Definir a base legal do tratamento dos dados pessoais, como execução de contrato, legítimo interesse ou cumprimento de obrigação legal, conforme o caso concreto.
- Informar os usuários sobre finalidade, retenção, compartilhamento e canal de contato.
- Definir um encarregado ou canal interno para solicitações dos titulares.
- Manter política de retenção: apagar ou anonimizar cadastros e movimentações quando não forem mais necessários.
- Controlar quem pode criar contas. Se qualquer pessoa puder se cadastrar, restrinja o cadastro no Supabase Auth ou aprove usuários manualmente.
- Revisar logs, backups e exportações CSV, pois podem conter dados pessoais.

## Validação recomendada após deploy

1. Criar um usuário A e cadastrar um material.
2. Sair.
3. Criar/entrar com usuário B.
4. Confirmar que o usuário B não vê dados do usuário A.
5. Confirmar no Supabase que os registros têm `user_id` preenchido.
6. Confirmar que inserts anônimos sem login são negados.
