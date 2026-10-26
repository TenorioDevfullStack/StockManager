import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database, asUser, createProduct, move, userA, userB, orgA, orgB, legacyId } from './helpers/database.mjs';

test('livro de estoque: custos, isolamento, integridade e compatibilidade', async t => {
  const db = await database();
  t.after(() => db.close());
  const lamp = await createProduct(db, 'Lâmpada LED');
  await t.test('material começa zerado; legado mantém saldo sem inventar custo', async () => {
    assert.equal(Number(lamp.quantidade),0);
    const legacy = (await db.query('select * from produtos where id=$1',[legacyId])).rows[0];
    assert.equal(Number(legacy.quantidade),10); assert.equal(legacy.custo_medio,null);
  });
  await t.test('compra e retirada congelam os custos históricos', async () => {
    const compra = await move(db,lamp.id,'entrada',20,30,{setor:'Estoque',referencia:'NF 123'});
    assert.equal(Number(compra.custo_total),600);
    const consumo = await move(db,lamp.id,'saida',8);
    assert.equal(Number(consumo.custo_total),240);
    await move(db,lamp.id,'entrada',8,40);
    const current = (await db.query('select * from produtos where id=$1',[lamp.id])).rows[0];
    assert.equal(Number(current.quantidade),20); assert.equal(Number(current.custo_medio),34);
    assert.equal(Number((await db.query('select custo_total from movimentacoes where id=$1',[consumo.id])).rows[0].custo_total),240);
  });
  await t.test('quantidades fracionárias e custo zero são válidos', async () => {
    const cabo = await createProduct(db,'Cabo','mt');
    await move(db,cabo.id,'entrada',2.5,4.8);
    assert.equal(Number((await move(db,cabo.id,'saida',0.5)).custo_total),2.4);
    const doacao = await createProduct(db,'Doação');
    assert.equal(Number((await move(db,doacao.id,'entrada',1,0)).custo_total),0);
  });
  await t.test('entrada sem custo contamina média desconhecida sem alterar preço de compras conhecidas', async () => {
    const compra = await move(db,legacyId,'entrada',2,30);
    assert.equal(Number(compra.custo_total),60);
    assert.equal((await move(db,legacyId,'saida',1)).custo_total,null);
    await move(db,lamp.id,'entrada',1);
    assert.equal((await move(db,lamp.id,'saida',1)).custo_total,null);
  });
  await t.test('repetição de operação não duplica quantidade nem histórico', async () => {
    const operacao='40000000-0000-4000-8000-000000000001';
    const first=await move(db,lamp.id,'entrada',2,10,{operacao});
    const replay=await move(db,lamp.id,'entrada',2,10,{operacao});
    assert.equal(replay.id,first.id);
    assert.equal(Number((await db.query('select count(*) from movimentacoes where operacao_id=$1',[operacao])).rows[0].count),1);
    await assert.rejects(move(db,lamp.id,'entrada',3,10,{operacao}),/já utilizado/);
  });
  await t.test('validações rejeitam operações sem alterar saldo', async () => {
    const before=(await db.query('select quantidade from produtos where id=$1',[lamp.id])).rows[0].quantidade;
    for (const args of [['saida',999,null],['entrada',0,1],['entrada',-1,1],['entrada',1,-1],['entrada','NaN',1],['entrada',0.0001,1],['saida',1,1]]) {
      await assert.rejects(move(db,lamp.id,...args));
    }
    await assert.rejects(move(db,lamp.id,'ajuste',0,null,{motivo:''}),/motivo/);
    assert.equal((await db.query('select quantidade from produtos where id=$1',[lamp.id])).rows[0].quantidade,before);
  });
  await t.test('ajuste permite zerar; aumento sem origem torna custo desconhecido', async () => {
    const item=await createProduct(db,'Inventário');
    await move(db,item.id,'entrada',1,12);
    await move(db,item.id,'ajuste',2);
    assert.equal((await db.query('select custo_medio from produtos where id=$1',[item.id])).rows[0].custo_medio,null);
    await move(db,item.id,'ajuste',0);
    await move(db,item.id,'entrada',1,50);
    assert.equal(Number((await db.query('select custo_medio from produtos where id=$1',[item.id])).rows[0].custo_medio),50);
  });
  await t.test('cliente não pode adulterar saldo, custo, livro ou chamar núcleo privado', async () => {
    for (const sql of [
      `update produtos set quantidade=100 where id='${lamp.id}'`,
      `update produtos set custo_medio=0 where id='${lamp.id}'`,
      `insert into produtos(nome,quantidade) values ('Fraude',10)`,
      `update movimentacoes set custo_total=0`, `delete from movimentacoes`,
      `insert into movimentacoes(tipo,quantidade) values ('entrada',100)`,
      `delete from produtos where id='${lamp.id}'`,
      `select public._movimentar_com_custo(null,null,null,null,null,null,null,null,null,null,null,null,null)`,
    ]) await assert.rejects(db.exec(sql),/permission denied/);
    await db.query('update produtos set nome=$1 where id=$2',['Lâmpada renomeada',lamp.id]);
    await assert.rejects(db.query('update produtos set unidade=$1 where id=$2',['mt',lamp.id]),/Unidade/);
    await assert.rejects(db.query('update produtos set excluido_em=now() where id=$1',[lamp.id]),/Zere/);
  });
  await t.test('RLS e RPC bloqueiam outra organização e fornecedor externo', async () => {
    await asUser(db,userB);
    assert.equal((await db.query('select * from produtos where id=$1',[lamp.id])).rows.length,0);
    await assert.rejects(move(db,lamp.id,'saida',1),/não encontrado/);
    const fornecedor=(await db.query("insert into pessoas(nome,tipo,org_id) values ('Externo','fornecedor',$1) returning id",[orgB])).rows[0].id;
    await asUser(db,userA);
    await assert.rejects(move(db,lamp.id,'entrada',1,10,{fornecedor}),/Fornecedor/);
  });
  await t.test('bot usa o mesmo custeio e valida vínculo do usuário', async () => {
    await asUser(db,userA,'service_role');
    const sql='select * from registrar_movimentacao_api(p_org_id=>$1,p_user_id=>$2,p_produto_id=>$3,p_tipo=>$4,p_quantidade=>$5,p_custo_unitario=>$6)';
    const bot=(await db.query(sql,[orgA,userA,lamp.id,'entrada',2,12])).rows[0];
    assert.equal(Number(bot.custo_total),24);
    await assert.rejects(db.query(sql,[orgA,userB,lamp.id,'entrada',2,12]),/não pertence/);
    await asUser(db,userA);
  });
});
