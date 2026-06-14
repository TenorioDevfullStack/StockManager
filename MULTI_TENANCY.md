# Multi-tenancy por organização (equipe)

Antes, cada usuário tinha um estoque **isolado** (RLS por `user_id`). Agora o
StockManager agrupa usuários em **organizações**: todos os membros de uma
organização compartilham o mesmo estoque, equipe, documentos, movimentações e
agenda. O isolamento de dados passou a ser por `org_id`.

A coluna `user_id` continua existindo nas tabelas, mas agora indica apenas
**quem criou/editou** o registro — ela não controla mais o acesso.

## Tabelas novas

| Tabela | Função |
| --- | --- |
| `organizacoes` | A equipe/empresa. |
| `organizacao_membros` | Liga `user_id` ↔ `org_id` com um `papel` (`admin` ou `membro`). |

Todas as tabelas de dados (`produtos`, `pessoas`, `movimentacoes`,
`documentos`, `tarefas`) ganharam a coluna `org_id`. A `app_config` continua
**por usuário** (preferências individuais de interface).

## Como o acesso funciona (RLS)

As políticas usam a função `is_org_member(org_id)`, que verifica se o usuário
atual pertence àquela organização. Resumindo: *"você enxerga as linhas das
organizações às quais pertence"*.

Um **trigger** preenche `org_id` automaticamente em cada `INSERT` quando o valor
não é informado, usando a organização do usuário. Por isso o app continua
funcionando mesmo nos pontos onde o `org_id` não é enviado explicitamente.

## Migração de dados existentes

A migration `20260614120000_organization_tenancy.sql` faz o *backfill*
automaticamente: para cada usuário que já tinha dados, cria uma **organização
pessoal** (nome `Organizacao de <email>`), adiciona o usuário como `admin` e
carimba todos os registros dele com o `org_id` correspondente. Nada é perdido.

## Operações comuns (RPCs)

Chame via `supabase.rpc(...)` autenticado:

```js
// Garante que o usuário tem uma organização (chamado no login).
await supabase.rpc('garantir_organizacao');

// Cria uma nova organização (o chamador vira admin).
await supabase.rpc('criar_organizacao', { p_nome: 'Manutenção Predial' });

// Adiciona/atualiza um membro por e-mail (apenas admin).
await supabase.rpc('adicionar_membro', {
  p_org_id: orgId,
  p_email: 'colega@empresa.com',
  p_papel: 'membro', // ou 'admin'
});

// Remove um membro (apenas admin; não remove o último admin).
await supabase.rpc('remover_membro', { p_org_id: orgId, p_user_id: userId });
```

No frontend isso já está encapsulado em [`storage.js`](js/storage.js):
`DB.ensureOrg()`, `DB.getMembros()`, `DB.adicionarMembro(email, papel)` e
`DB.removerMembro(userId)`.

## Documentos no Storage

Novos PDFs são enviados para a pasta `{org_id}/...` (em vez de `{uid}/...`),
para que todos os membros consigam abrir e baixar via URLs assinadas. As
políticas do bucket aceitam tanto a pasta da organização quanto, por
compatibilidade, a pasta antiga do próprio usuário.

> **Atenção:** arquivos enviados **antes** desta migração permanecem na pasta
> `{uid}/...` do autor original e continuam acessíveis apenas a ele. Os
> metadados (linha em `documentos`) ficam visíveis para a equipe, mas o
> download do arquivo antigo só funciona para quem o enviou. Para compartilhar
> arquivos antigos, reenvie-os.

## Bot API

A Edge Function passou a escopar por organização. Configure o secret
`BOT_ORG_ID` (UUID da organização) além de `BOT_USER_ID`. Veja
[`BOT_API.md`](BOT_API.md).

## Como aplicar com segurança

1. **Teste em staging primeiro.** Esta migration altera RLS, políticas de
   Storage e RPCs de todas as tabelas.
2. Faça backup do banco (a migration é idempotente, mas backup é prudente).
3. Rode `supabase db push` (ou cole o SQL no SQL Editor).
4. Faça **deploy da Edge Function** atualizada e configure `BOT_ORG_ID`:
   ```bash
   supabase functions deploy bot-api
   supabase secrets set BOT_ORG_ID="uuid-da-organizacao"
   ```
5. Publique o frontend atualizado.

A ordem importa: o frontend novo espera as RPCs e a coluna `org_id`; aplique a
migration **antes** de publicar o frontend.
