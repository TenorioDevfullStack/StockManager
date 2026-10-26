import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { database } from './helpers/database.mjs';

test('formulário → transação SQL → saldo → balanço → CSV/PDF, desktop e celular', {timeout:60000}, async t => {
  const db=await database();
  const root=process.cwd();
  const safe = name => { assert.match(name,/^[a-z_]+$/);return name; };
  const server=createServer(async(req,res)=>{
    try {
      if(req.url==='/__fixture') {
        let raw='';for await(const chunk of req)raw+=chunk;
        const q=JSON.parse(raw);let data;
        if(q.rpc) {
          if(q.rpc==='garantir_organizacao') data=(await db.query('select garantir_organizacao() as id')).rows[0].id;
          else {
            assert.equal(q.rpc,'registrar_movimentacao_custeada');
            const entries=Object.entries(q.args);
            data=(await db.query(`select * from registrar_movimentacao_custeada(${entries.map(([key],i)=>`${safe(key)}=>$${i+1}`).join(',')})`,entries.map(([,v])=>v))).rows[0];
          }
        } else if(q.table==='organizacao_membros') {
          data={papel:'admin',organizacoes:{nome:'Equipe teste'}};
        } else {
          assert.ok(['produtos','movimentacoes','pessoas','documentos','tarefas'].includes(q.table));
          const params=[];
          const filter=(q.filters||[]).map(([key,value])=>value===null?`${safe(key)} is null`:(params.push(value),`${safe(key)}=$${params.length}`));
          let sql;
          if(q.op==='select') {
            sql=`select * from ${q.table}${filter.length?' where '+filter.join(' and '):''}`;
            if(q.orders?.length) sql+=' order by '+q.orders.map(([key,asc])=>`${safe(key)} ${asc?'asc':'desc'}`).join(',');
            if(q.range) {assert.ok(q.range.every(Number.isInteger));sql+=` limit ${q.range[1]-q.range[0]+1} offset ${q.range[0]}`;}
          } else {
            const values=Object.entries(q.value);
            const bound=values.map(([key,value])=>(params.push(value),[safe(key),`$${params.length}`]));
            if(q.op==='insert') sql=`insert into ${q.table} (${bound.map(([k])=>k)}) values (${bound.map(([,v])=>v)}) returning *`;
            else if(q.op==='update') sql=`update ${q.table} set ${bound.map(([k,v])=>`${k}=${v}`).join(',')} where ${filter.join(' and ')} returning *`;
            else throw new Error('O teste não deve reenviar caches ao banco.');
          }
          data=(await db.query(sql,params)).rows;
          if(q.single) data=data[0]??null;
        }
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));return;
      }
      const pathname=new URL(req.url,'http://localhost').pathname;
      const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!path.startsWith(root+'/'))throw new Error('Invalid path');
      const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
      res.setHeader('Content-Type',mime[extname(path)]||'text/plain');res.end(await readFile(path));
    } catch(error) {
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:null,error:{message:error.message}}));
    }
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  t.after(async()=>{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));await db.close();});
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR',timezoneId:'America/Sao_Paulo',acceptDownloads:true});
  await context.route('https://**/*',async route=>{
    if(route.request().url().includes('cdn.jsdelivr.net/npm/@supabase/supabase-js'))
      await route.fulfill({contentType:'text/javascript',body:await readFile('tests/helpers/supabase-fixture.js','utf8')});
    else await route.abort();
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>DB.inventoryLoaded && App.currentPage==='dashboard');
  await page.locator('#nav-produtos').click();
  await page.getByRole('button',{name:'+ Novo Material'}).click();
  await page.locator('#pf-nome').fill('Lâmpada LED 12W');
  await page.locator('#pf-sku').fill('LED-001');
  await page.locator('#pf-qtdMinima').fill('15');
  await page.locator('#modal-confirm').click();
  await page.waitForFunction(()=>DB.getProdutos().some(p=>p.sku==='LED-001'));
  const product=await page.evaluate(()=>DB.getProdutos().find(p=>p.sku==='LED-001'));
  assert.equal(product.quantidade,0);
  await page.locator(`button[title="Entrada"][onclick*="${product.id}"]`).click();
  await page.locator('#mf-quantidade').fill('20');
  await page.locator('#mf-custo').fill('30');
  await page.locator('#mf-referencia').fill('NF 1234');
  await page.locator('#modal-confirm').click();
  await page.waitForFunction(id=>DB.getProduto(id)?.quantidade===20,product.id);
  await page.locator(`button[title="Retirada"][onclick*="${product.id}"]`).click();
  await page.locator('#mf-quantidade').fill('8');
  await page.locator('#mf-funcionario').fill('Operador de manutenção');
  await page.locator('#mf-setor').fill('Primeiro subsolo');
  await page.locator('#mf-referencia').fill('OS 42');
  await page.locator('#modal-confirm').click();
  await page.waitForFunction(id=>DB.getProduto(id)?.quantidade===12,product.id);
  await page.locator('#nav-relatorios').click();
  assert.match(await page.locator('#rel-financeiro').innerText(),/600,00/);
  assert.match(await page.locator('#rel-financeiro').innerText(),/240,00/);
  assert.match(await page.locator('#rel-financeiro').innerText(),/360,00/);
  assert.match(await page.locator('#rel-aviso').innerText(),/sem custo/);
  assert.match(await page.locator('#rel-mov-tbody').innerText(),/Primeiro subsolo/);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#rel-csv-mov').click();
  const download=await downloadPromise;
  const csv=await readFile(await download.path(),'utf8');
  assert.match(csv,/"Custo total BRL"/);assert.match(csv,/"240"/);assert.match(csv,/"OS 42"/);
  const popupPromise=page.waitForEvent('popup');
  await page.locator('#rel-imprimir').click();
  const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');
  assert.match(await popup.locator('body').innerText(),/Entradas no período: R\$\s*600,00/);
  assert.equal(await popup.evaluate(()=>window.opener),null);
  await popup.pdf({path:'/tmp/stockmanager-balanco-qa.pdf',landscape:true,printBackground:true});
  await page.evaluate(()=>document.getElementById('session-user').textContent='DEMONSTRAÇÃO · dados fictícios');
  await page.evaluate(()=>document.getElementById('toasts').replaceChildren());
  await page.screenshot({path:'/tmp/stockmanager-desktop-qa.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=0);
  await page.screenshot({path:'/tmp/stockmanager-mobile-qa.png',fullPage:true,animations:'disabled'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.locator('#rel-data-ini').fill('2026-11-30');
  await page.locator('#rel-data-ini').dispatchEvent('change');
  assert.equal(await page.locator('#rel-imprimir').isDisabled(),true);
  assert.match(await page.locator('#rel-aviso').innerText(),/data inicial/);
  assert.deepEqual(errors,[]);
});
