const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
function api(){
  const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/bot-api/index.ts','utf8'))
    .replace(/^import .*?;\n/,'');
  const ctx=vm.createContext({Deno:{serve(){}},URL,Response,Request,console});vm.runInContext(source,ctx);return ctx;
}
test('API bloqueia edição direta de saldo e mantém metadata editável',()=>{
  const ctx=api();
  assert.throws(()=>vm.runInContext(`produtoPayload({quantidade:5},'u','o',true)`,ctx),/Altere o saldo/);
  assert.throws(()=>vm.runInContext(`produtoPayload({nome:'Material',quantidade:5},'u','o',false)`,ctx),/Altere o saldo/);
  assert.equal(vm.runInContext(`produtoPayload({nome:'Material'},'u','o',false).quantidade`,ctx),undefined);
  assert.equal(vm.runInContext(`produtoPayload({nome:'Novo nome'},'u','o',true).nome`,ctx),'Novo nome');
});
