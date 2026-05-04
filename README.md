# StockManager

Sistema interno de controle de estoque para equipes de manutenção. O projeto é uma SPA estática em HTML, CSS e JavaScript, com autenticação e persistência remota via Supabase.

## Recursos

- Dashboard com indicadores de estoque.
- Cadastro de materiais com SKU, categoria, unidade, quantidade mínima e localização.
- Controle de entradas, saídas e ajustes de estoque.
- Cadastro de equipe e fornecedores.
- Relatórios e histórico de movimentações.
- Exportação e importação de backup em JSON.
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
│   └── migrations/
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

As migrations criam as tabelas:

- `produtos`
- `pessoas`
- `movimentacoes`
- `app_config`

Também ativam RLS e criam políticas para que cada usuário autenticado acesse apenas os próprios dados.

## Segurança

- Não publique o arquivo `.env`.
- Não use `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Use apenas a chave `anon` pública no navegador.
- Mantenha RLS ativo nas tabelas do Supabase.
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
6. Entre com outro usuário e confirme que os dados anteriores não aparecem.

## Repositório

```text
https://github.com/TenorioDevfullStack/StockManager.git
```
