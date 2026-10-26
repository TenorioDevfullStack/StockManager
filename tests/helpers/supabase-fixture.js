// Adaptador exclusivo dos testes: usa um Postgres local, sem acessar contas reais.
window.supabase = {
  createClient() {
    const request = async payload => {
      try {
        return await (await fetch('/__fixture', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).json();
      } catch(error) { return {data:null,error:{message:error.message}}; }
    };
    return {
      auth: {getSession:async()=>({data:{session:{user:{id:'10000000-0000-4000-8000-000000000001',email:'gestor@example.test'}}}}),onAuthStateChange(){},signOut:async()=>({})},
      rpc:(name,args)=>request({rpc:name,args}),
      from(table) {
        const state={table,op:'select',filters:[],orders:[]};
        return {
          select(fields){state.fields=fields;return this},
          eq(key,value){state.filters.push([key,value]);return this},
          is(key,value){state.filters.push([key,value]);return this},
          order(key,options){state.orders.push([key,options?.ascending!==false]);return this},
          range(a,b){state.range=[a,b];return this},
          insert(value){state.op='insert';state.value=value;return this},
          update(value){state.op='update';state.value=value;return this},
          upsert(value){state.op='upsert';state.value=value;return this},
          single(){state.single=true;return this},
          maybeSingle(){state.single=true;return this},
          then(resolve,reject){return request(state).then(resolve,reject)},
        };
      },
    };
  },
};
