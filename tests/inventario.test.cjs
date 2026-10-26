const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
function app() {
  const memory = new Map();
  const storage = {getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  const ctx=vm.createContext({console,Date,Intl,Map,Set,crypto:{randomUUID},localStorage:storage,sessionStorage:storage,
    document:{addEventListener(){}},window:{}, setTimeout,URL,Blob});
  for(const file of ['inventario','storage','app','relatorios']) vm.runInContext(fs.readFileSync(`js/${file}.js`,'utf8'),ctx);
  vm.runInContext('App.showToast = () => {};',ctx);
  return {ctx,run:s=>vm.runInContext(s,ctx)};
}
test('custos desconhecidos são distintos de material gratuito',()=>{
  const {run}=app();
  assert.equal(run('Inventario.custo(null)'),null);
  assert.equal(run('Inventario.custo(undefined)'),null);
  assert.equal(run('Inventario.custo(0)'),0);
});
test('balanço usa a data de São Paulo, inclui o último dia e não mistura estoque atual com datas',()=>{
  const {run}=app();
  const r=run(`Inventario.consolidar(
    [{quantidade:10,custoMedio:3,qtdMinima:2},{quantidade:1,custoMedio:null,qtdMinima:2}],
    [{tipo:'entrada',data:'2026-10-01T02:59:59Z',custoTotal:100},
     {tipo:'entrada',data:'2026-10-01T03:00:00Z',custoTotal:600},
     {tipo:'saida',data:'2026-11-01T02:59:59Z',custoTotal:240},
     {tipo:'saida',data:'2026-11-01T03:00:00Z',custoTotal:999},
     {tipo:'saida',data:'2026-10-10T12:00:00Z',custoTotal:null},
     {tipo:'ajuste',data:'2026-10-11T12:00:00Z',custoTotal:500}],
    '2026-10-01','2026-10-31')`);
  assert.equal(r.valorEntradas,600);assert.equal(r.valorSaidas,240);assert.equal(r.valorEstoque,30);
  assert.equal(r.saidasSemCusto,1);assert.equal(r.materiaisSemCusto,1);assert.equal(r.reposicao.length,1);
});
test('quantidades são agregadas por unidade e não em um total físico incompatível',()=>{
  const {run}=app();
  assert.equal(JSON.stringify(run("Inventario.unidades([{unidade:'un',quantidade:3},{unidade:'mt',quantidade:2.5},{unidade:'un',quantidade:2}])")),JSON.stringify([['mt',2.5],['un',5]]));
});
test('CSV protege fórmulas, aspas e decimais brasileiros; impressão escapa conteúdo',()=>{
  const {run}=app();
  assert.equal(run('Relatorios.csvCell(2.5)'),'"2,5"');
  assert.equal(run('Relatorios.csvCell(\'=HYPERLINK("https://example.test")\')'),'"\'=HYPERLINK(""https://example.test"")"');
  run(`DB._set(DB.KEYS.produtos,[{id:'p',nome:'<script>alert(1)</script>',quantidade:2,unidade:'un',qtdMinima:1,custoMedio:3}]); DB.orgNome='<img src=x>';`);
  const html=run('Relatorios.htmlImpressao()');
  assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img src=x&gt;'));
});
test('snapshot mantém nome e unidade originais após exclusão/edição',()=>{
  const {run}=app();
  assert.equal(run(`Inventario.movimento({produtoId:'inexistente',produtoSnapshot:{nome:'Lâmpada original',unidade:'un'}}).nome`),'Lâmpada original');
});
test('falha remota não cria movimento ou saldo local; não há gravação offline',async()=>{
  const {run}=app();
  run(`DB.user={id:'usuario'};DB.orgId='org';DB.remoteReady=true;DB.supabase={rpc:async()=>({error:{message:'Sem conexão'}})};DB._set(DB.KEYS.produtos,[{id:'p',quantidade:3}]);`);
  assert.equal(await run(`DB.saveMovimentacao({produtoId:'p',tipo:'entrada',quantidade:2})`),null);
  assert.equal(run('DB.getProduto("p").quantidade'),3);assert.equal(run('DB.getMovimentacoes().length'),0);
  run('DB.remoteReady=false');
  assert.equal(await run(`DB.saveMovimentacao({produtoId:'p',tipo:'entrada',quantidade:2})`),null);
});
test('consulta busca todas as páginas, inclusive além de 1.000 registros',async()=>{
  const {run}=app();
  run(`let ranges=[];DB.orgId='org'; DB.supabase={from:()=>({select(){return this},eq(){return this},order(){return this},range:async(a,b)=>{ranges.push([a,b]);return {data:Array.from({length:a===0?1000:2},(_,i)=>({id:a+i}))}}})};`);
  assert.equal((await run("DB._readInventoryTable('movimentacoes')")).length,1002);
  assert.equal(run('ranges.length'),2);
});
test('sincronizar nunca reenvia saldo/histórico e importar backup não adultera o livro',async()=>{
  const {run}=app();
  run(`DB.remoteReady=true;DB.user={id:'u'};let writes=[];DB.supabase={from:t=>{writes.push(t);return {upsert:async()=>({data:[]})}}};DB._set(DB.KEYS.produtos,[{id:'p',quantidade:10}]);DB._set(DB.KEYS.movimentacoes,[{id:'m'}]);`);
  await run('DB.syncToSupabase()');assert.equal(run('writes.length'),0);
  assert.throws(()=>run('DB.importData({produtos:[],pessoas:[],movimentacoes:[]})'),/não foi aplicado/);
  assert.equal(run('DB.getProduto("p").quantidade'),10);
});
