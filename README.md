# StockManager

Sistema interno de controle de estoque para equipes de manutenção. O projeto é uma SPA estática em HTML, CSS e JavaScript, com autenticação e persistência remota via Supabase.

## Recursos

- Dashboard com indicadores de estoque.
- Cadastro de materiais com SKU, categoria, unidade, quantidade mínima e localização.
- Controle de entradas, saídas e ajustes de estoque com histórico protegido.
- Custo de entrada, custo médio ponderado e custo histórico de consumo.
- Balanço por período, posição atual valorizada, CSV e impressão/PDF.
- Saldos separados por unidade e avisos de custo não informado.
- Cadastro de equipe e fornecedores.
- Relatórios e histórico de movimentações.
- Exportação de dados em JSON; restauração exige rotina validada no servidor.
- Autenticação com Supabase Auth.
- Row Level Security por usuário autenticado.

## Tecnologias

- HTML5
- CSS3
- JavaScript puro
- Supabase Auth
- Supabase Database/Postgres

## Estrutura

```text
.
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── dashboard.js
│   ├── movimentacoes.js
│   ├── pessoas.js
│   ├── produtos.js
│   ├── relatorios.js
│   ├── storage.js
│   ├── supabase.config.js
│   └── supabase.config.example.js
├── supabase/
│   ├── functions/
│   │   └── bot-api/
│   └── migrations/
├── BOT_API.md
├── DEPLOY_SECURITY_LGPD.md
└── index.html
```

## Como executar localmente

Por ser uma aplicação estática, basta servir a pasta do projeto com um servidor local.

Exemplo com Python:

```bash
python -m http.server 8000
```

Depois acesse:

```text
http://localhost:8000
```

Também é possível publicar diretamente em serviços de hosting estático, como Vercel, Netlify ou GitHub Pages.

## Configuração do Supabase

1. Crie um projeto no Supabase.
2. Acesse `Project Settings > API`.
3. Copie a URL do projeto e a chave `anon public`.
4. Configure o arquivo `js/supabase.config.js`:

```javascript
window.SUPABASE_CONFIG = {
  url: 'https://seu-project-ref.supabase.co',
  anonKey: 'sua-chave-anon-public',
  allowSignUp: false,
};
```

Em produção interna, mantenha `allowSignUp: false` e crie os usuários manualmente no painel do Supabase Auth.

## Banco de dados

Execute as migrations SQL no Supabase SQL Editor, nesta ordem:

1. `supabase/migrations/20260503150000_initial_inventory_schema.sql`
2. `supabase/migrations/20260503151000_inventory_movement_rpc.sql`
3. `supabase/migrations/20260503193000_enable_authenticated_access.sql`
4. `supabase/migrations/20260521000000_add_documents_table.sql`
5. `supabase/migrations/20260521001000_create_documents_storage_bucket.sql`
6. `supabase/migrations/20260521002000_fix_pessoas_fornecedor_tipo.sql`
7. `supabase/migrations/20260525090000_bot_api_access.sql`
8. `supabase/migrations/20260527100000_apply_security_policies.sql`
9. `supabase/migrations/20260612090000_add_tarefas_table.sql`
10. `supabase/migrations/20260614120000_organization_tenancy.sql`
11. `supabase/migrations/20260614130000_soft_delete.sql`
12. `supabase/migrations/20261026210000_inventory_costs.sql`

As migrations criam as tabelas:

- `organizacoes`
- `organizacao_membros`
- `produtos`
- `pessoas`
- `movimentacoes`
- `app_config`
- `documentos`
- `tarefas`

Também ativam RLS. A partir da migration `20260614120000_organization_tenancy.sql`, o isolamento de dados passa a ser por **organização (equipe)**: vários usuários compartilham o mesmo estoque. Cada usuário existente recebe automaticamente uma organização pessoal (como admin) e pode convidar outros. Veja os detalhes em [`MULTI_TENANCY.md`](MULTI_TENANCY.md).

A migration `20260614130000_soft_delete.sql` adiciona **exclusão lógica** (`excluido_em`) a materiais, equipe e tarefas: ao excluir, o registro é marcado em vez de apagado, e a exclusão se propaga corretamente entre dispositivos na sincronização (evita "registros zumbis"). Os getters da aplicação e a Bot API ignoram registros excluídos.

## Custos e balanço

Veja o [guia de custos e balanço](docs/CUSTOS_BALANCO.md) para o fluxo de uso, os critérios de valorização, limitações, testes e implantação coordenada. Novos materiais iniciam zerados; toda alteração de saldo exige uma movimentação online confirmada. O saldo atual é independente do período de consumo escolhido. Custos antigos desconhecidos não são estimados.

**Atualização de uma instalação existente:** aplique a migração de custos e publique a Edge Function e o frontend na mesma janela de atualização. Faça backup e confira operações antigas apenas locais antes de trocar de versão. Não publique somente o frontend sobre o banco antigo.

## API para bot

O projeto inclui a Supabase Edge Function `bot-api`, criada para bots e integrações acessarem o estoque por HTTP sem expor a `SUPABASE_SERVICE_ROLE_KEY`.

Veja endpoints, configuração dos secrets e exemplos de `curl` em `BOT_API.md`.

## Segurança

- Não publique o arquivo `.env`.
- Não use `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Use apenas a chave `anon` pública no navegador.
- Mantenha RLS ativo nas tabelas do Supabase.
- Mantenha o bucket `documentos` privado; o app gera URLs assinadas para visualização e download.
- Revise o arquivo `DEPLOY_SECURITY_LGPD.md` antes de publicar em produção.

## Deploy

O projeto não exige build. Para publicar, envie os arquivos estáticos para o provedor escolhido.

Arquivos sensíveis e artefatos locais já são bloqueados por:

- `.gitignore`
- `.vercelignore`
- `.netlifyignore`

## Validação após deploy

1. Crie ou configure um usuário no Supabase Auth.
2. Faça login na aplicação.
3. Cadastre um material.
4. Registre uma entrada ou saída.
5. Saia da conta.
6. Entre com um usuário de **outra** organização e confirme que os dados anteriores **não** aparecem.
7. Adicione um segundo usuário à **mesma** organização (via `adicionar_membro`) e confirme que ele **vê e edita** o mesmo estoque.

## Repositório

```text
https://github.com/TenorioDevfullStack/StockManager.git
```
