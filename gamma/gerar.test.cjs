const { test } = require('node:test');
const assert = require('node:assert/strict');
const { request } = require('./gerar.cjs');
test('criação usa POST uma única vez e consulta usa GET', async () => {
  const calls=[];
  const mock=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({generationId:'id'})};};
  await request('/generations/from-template','teste',{gammaId:'modelo',prompt:'conteúdo'},mock);
  await request('/generations/id','teste',undefined,mock);
  assert.equal(calls[0].options.method,'POST');
  assert.equal(calls[1].options.method,'GET');
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.headers['X-API-KEY'],'teste');
});
test('erro no POST não repete uma criação que pode consumir créditos', async()=>{
  let calls=0;
  await assert.rejects(request('/generations/from-template','teste',{},async()=>{calls++;return {ok:false,status:503};}),/HTTP 503/);
  assert.equal(calls,1);
});
