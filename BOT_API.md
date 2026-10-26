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
supabase/migrations/20261026210000_inventory_costs.sql (depois de todas as migrations anteriores)
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

Retorna totais de materiais, movimentações e alertas de estoque baixo/sem estoque. O campo `quantidades_por_unidade` substitui `total_itens` para não somar metros, litros e peças.

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
  "quantidade": 0,
  "qtd_minima": 3,
  "localizacao": "Prateleira A1",
  "descricao": "Lampada branca fria"
}
```

Novos materiais começam com saldo zero. Use `/movimentacoes` para registrar entradas; `PATCH /produtos/:id` não aceita `quantidade`.

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

O endpoint usa uma RPC atômica, atualizando saldo, custo médio e histórico na mesma operação. `ajuste` aceita zero e exige motivo; `saida` exige responsável.

Campos opcionais: `custo_unitario` (somente entrada; vazio = desconhecido, zero = gratuito), `setor`, `documento_referencia`, `fornecedor_id` e `operacao_id` (UUID de idempotência). Preserve `operacao_id` e os mesmos dados ao repetir uma chamada após falha de conexão. Fornecedor e usuário precisam pertencer à organização configurada. As respostas incluem `custo_unitario`, `custo_total` e `produto_snapshot`.

A atualização deve acompanhar o frontend e a migração de custos. Veja [implantação e regras](docs/CUSTOS_BALANCO.md).

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
