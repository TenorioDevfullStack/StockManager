# Bot API

API HTTP para bots e integracoes acessarem o estoque do StockManager via Supabase Edge Function.

## Seguranca

A funcao `bot-api` usa uma chave propria (`BOT_API_KEY`) e executa consultas com `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente seguro da Edge Function. O bot nunca deve receber a service role key.

A API sempre filtra e grava dados usando `BOT_ORG_ID`, que deve ser o UUID da organizacao (equipe) cujo estoque o bot pode acessar. O `BOT_USER_ID` e usado apenas para registrar o autor das movimentacoes; ele precisa ser membro dessa organizacao.

## Configuracao

1. Aplique a migration nova no banco:

```bash
supabase db push
```

Ou execute manualmente no SQL Editor:

```text
supabase/migrations/20260525090000_bot_api_access.sql
```

2. Configure os secrets da funcao:

```bash
supabase secrets set BOT_API_KEY="uma-chave-longa-e-aleatoria"
supabase secrets set BOT_USER_ID="uuid-do-usuario-dono-do-estoque"
supabase secrets set BOT_ORG_ID="uuid-da-organizacao"
```

> Para descobrir o `BOT_ORG_ID`, consulte a tabela `organizacao_membros` (coluna `org_id`) do usuario indicado em `BOT_USER_ID`.

O Supabase ja fornece `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente da Edge Function. Para execucao local, defina tambem essas variaveis no seu `.env`.

3. Publique a funcao:

```bash
supabase functions deploy bot-api
```

O arquivo `supabase/config.toml` define `verify_jwt = false` para esta funcao, porque a autenticacao e feita pela propria API com `BOT_API_KEY`.

## URL base

```text
https://SEU_PROJECT_REF.supabase.co/functions/v1/bot-api
```

## Autenticacao

Envie uma das opcoes:

```http
Authorization: Bearer SUA_BOT_API_KEY
```

ou:

```http
x-api-key: SUA_BOT_API_KEY
```

## Endpoints

### Status

```http
GET /health
```

### Resumo do estoque

```http
GET /resumo
```

Retorna totais de materiais, itens, movimentacoes e alertas de estoque baixo/sem estoque.

### Materiais

```http
GET /produtos?search=lampada&categoria=Eletrica&limit=50&offset=0
GET /produtos/:id
POST /produtos
PATCH /produtos/:id
DELETE /produtos/:id
```

Corpo para criar material:

```json
{
  "nome": "Lampada LED 12W",
  "sku": "LED-12W",
  "categoria": "Eletrica",
  "unidade": "un",
  "quantidade": 10,
  "qtd_minima": 3,
  "localizacao": "Prateleira A1",
  "descricao": "Lampada branca fria"
}
```

### Pessoas

```http
GET /pessoas?search=joao&tipo=funcionario
GET /pessoas/:id
POST /pessoas
PATCH /pessoas/:id
DELETE /pessoas/:id
```

`tipo` aceita `funcionario`, `fornecedor` ou `ambos`.

### Movimentacoes

```http
GET /movimentacoes?tipo=saida&produto_id=UUID_DO_PRODUTO
POST /movimentacoes
```

Corpo para registrar entrada, saida ou ajuste:

```json
{
  "produto_id": "uuid-do-produto",
  "tipo": "saida",
  "quantidade": 2,
  "motivo": "OS 1234",
  "responsavel": "Joao"
}
```

O endpoint usa uma RPC atomica, atualizando o estoque e criando o historico na mesma operacao.

### Documentos

```http
GET /documentos
GET /documentos/:id
```

## Exemplos com curl

```bash
curl "$BOT_API_URL/resumo" \
  -H "Authorization: Bearer $BOT_API_KEY"
```

```bash
curl -X POST "$BOT_API_URL/movimentacoes" \
  -H "Authorization: Bearer $BOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "produto_id": "uuid-do-produto",
    "tipo": "entrada",
    "quantidade": 5,
    "motivo": "Reposicao",
    "responsavel": "Bot"
  }'
```

## Respostas de erro

Erros seguem este formato:

```json
{
  "error": {
    "code": "invalid_field",
    "message": "Campo quantidade deve ser maior que zero."
  }
}
```
