# Controle de custos e balanço de materiais

Primeira etapa gerencial do StockManager: entradas valorizadas, consumo pelo custo médio ponderado móvel e posição atual do estoque. Não é um módulo fiscal, contas a pagar ou fechamento contábil.

## Fluxo de uso

1. Cadastre o material e a unidade em **Materiais**. O saldo começa em zero.
2. Em **Entrada**, informe quantidade, custo por unidade cadastrada e, quando disponíveis, fornecedor e referência da nota. Inclua no custo unitário o frete rateado manualmente. A referência é texto; o anexo PDF continua no módulo Documentos.
3. Em **Retirada**, informe quantidade, funcionário, setor e referência do serviço. O banco registra o custo médio vigente naquele momento.
4. Em **Relatórios**, escolha o período. As entradas e o consumo usam as datas do período no fuso de São Paulo. A posição do estoque é **atual**, independente do filtro de datas; não representa o saldo histórico no último dia do período.
5. Exporte CSV, ou use **Imprimir / Salvar PDF** e selecione o destino PDF no navegador. A impressão inclui o período, os valores parciais, as movimentações e a tabela atual com os filtros de categoria/situação.

Peças, caixas, metros e litros são agregados separadamente. Não há conversão automática entre embalagens. “Repor até o mínimo” é a diferença positiva entre mínimo e saldo; não é uma previsão de demanda nem um pedido aprovado. As entradas representam recebimento de materiais, não confirmação de pagamento ao fornecedor.

## Regras de custo

- Custo unitário em BRL, com até seis casas decimais; quantidade com até três. O valor da movimentação é arredondado para centavos no servidor.
- Média móvel: `(saldo anterior × custo médio anterior + entrada × custo unitário) / novo saldo`, persistida com seis casas decimais.
- Uma retirada congela seu custo unitário e total. Uma nova compra não reavalia retiradas antigas.
- Custo vazio/desconhecido é `NULL`; custo zero significa material gratuito. Totais conhecidos são identificados como parciais quando houver pendências.
- Saldos anteriores à migração permanecem com custo desconhecido. Uma entrada com preço conhecido não inventa o custo do estoque antigo. A média permanece desconhecida enquanto existir saldo de origem desconhecida. Ao esgotar o saldo, uma nova entrada com custo conhecido inicia uma nova média.
- Ajustes são saldos absolutos, permitem zero e exigem justificativa. Não entram nos totais de compras/consumo. Um aumento de inventário sem origem torna o custo médio desconhecido. Uma redução preserva a média vigente.
- Reavaliação auditada de saldo inicial, devoluções, estornos e correção de custo lançado incorretamente serão fluxos posteriores. Não edite o histórico diretamente para corrigir um lançamento.

## Integridade

As operações do app e do bot usam o mesmo núcleo transacional com bloqueio do material. A transação grava quantidade, custo e movimentação em conjunto, valida organização/fornecedor e impede estoque negativo.

O app envia um UUID por operação: repetir a mesma solicitação retorna o lançamento existente. Reusar o UUID com outro conteúdo é rejeitado. O bot deve enviar `operacao_id` e preservar esse valor ao repetir uma chamada que falhou por perda de conexão.

O navegador não pode inserir, regravar ou excluir o livro de movimentações, nem atualizar quantidade/custo diretamente na tabela de produtos. Material com saldo não pode ser excluído; a unidade não muda depois de haver saldo ou histórico. A exclusão lógica de um material zerado preserva seus snapshots nas movimentações.

O cache de estoque é somente leitura do servidor. Uma falha de conexão não cria uma operação local. Consultas de produtos e movimentações percorrem páginas, evitando o limite padrão de 1.000 registros. Balanços não podem ser emitidos se a última atualização do estoque falhar. O relatório não é um snapshot transacional entre dispositivos: use Atualizar dados antes de emitir e evite movimentar o inventário durante uma conferência formal.

A exportação JSON permanece disponível para consulta/backup de dados. A restauração direta do JSON no navegador foi desativada porque poderia sobrescrever o livro de estoque. A recuperação exige uma rotina validada no servidor; arquivos do Storage também precisam de backup separado.

## Implantação coordenada

Esta alteração contém código e uma migração. Publicar somente o frontend não ativa o recurso.

1. Faça backup do banco, dos arquivos anexados e exporte os caches dos dispositivos usados. Confira se há operações antigas que ficaram apenas locais; elas não são reenviadas automaticamente por esta versão.
2. Reproduza o ambiente em homologação e aplique todas as migrations anteriores, seguidas de `supabase/migrations/20261026210000_inventory_costs.sql`.
3. Confira os testes abaixo e valide duas organizações distintas em uma instância Supabase de homologação, incluindo login, API HTTP/PostgREST e arquivos. Os testes locais não substituem essa validação.
4. Em uma janela coordenada, pause as gravações e aplique a migração no banco de produção. Atualize a Edge Function `bot-api` e o frontend desta mesma versão antes de retomar o uso. Clientes antigos não podem mais editar saldos diretamente nem sincronizar cópias de produtos/movimentações.
5. Confirme entradas, retiradas, balanço e exportação com uma conta autorizada. O bot exige que `BOT_USER_ID` pertença a `BOT_ORG_ID`.

Não reaplique migrations antigas de permissões depois desta migração: elas podem restaurar privilégios amplos. Não remova a migração para tentar um rollback do frontend. Qualquer reversão precisa preservar os novos campos e as restrições do livro; pare as gravações e prepare uma migração corretiva validada.

## Validação reproduzível

Node.js 24 ou superior:

```bash
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

`npm test` usa o Postgres embutido do PGlite, aplica a sequência real de migrations e simula somente os schemas gerenciados `auth`/`storage`. Confere custos, permissões, RLS, idempotência, campos da API, datas, CSV e falha remota. Não testa carga nem concorrência real entre conexões Supabase.

O teste de navegador usa o HTML e JS reais, Chromium, um adaptador local do cliente Supabase e as transações SQL reais no PGlite. Percorre cadastro → entrada → retirada → relatório → CSV/impressão; verifica a tela também em 390 px. Não acessa nem modifica contas reais e não valida o deploy da Edge Function/PostgREST gerenciados.
