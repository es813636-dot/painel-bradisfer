'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decision, refreshAfterLoad } = require('../powerbi-refresh');
const { scheduled } = require('../scheduled');
test('Power BI aguarda fim, intervalo e orçamento diário', () => {
  const now = new Date('2026-09-15T18:00:00Z');
  assert.equal(decision([{status:'Unknown', startTime:'2026-09-15T17:00:00Z'}],now),'EM_ANDAMENTO');
  assert.equal(decision([{status:'Completed', startTime:'2026-09-15T17:00:00Z',endTime:'2026-09-15T17:01:00Z'}],now),'INTERVALO_MINIMO');
  assert.equal(decision(Array(8).fill({startTime:'2026-09-15T08:00:00Z',endTime:'2026-09-15T08:01:00Z'}),now),'LIMITE_DIARIO');
  assert.equal(decision([],now),'ATUALIZAR');
});
test('não solicita atualização com carga divergente', async () => {
  await assert.rejects(refreshAfterLoad({status:'FALHA',bigquery:'NAO_VALIDADO'}),/carga validada/);
});
test('carga falha libera trava e não atualiza Power BI', async () => {
  let released = false, refreshed = false;
  const storage = {objects:{insert:async()=>({data:{generation:'123'}}),delete:async args=>{assert.equal(args.ifGenerationMatch,'123');released=true;}}};
  await assert.rejects(scheduled({env:{BQ_CONTROL_BUCKET:'test-bucket'},storage,load:async()=>{throw Error('ERP indisponível');},refresh:async()=>{refreshed=true;}}),/ERP/);
  assert.equal(released,true);assert.equal(refreshed,false);
});
test('execução concorrente não acessa ERP nem atualiza modelo', async () => {
  const storage={objects:{insert:async()=>{throw Object.assign(Error(),{code:412});}}};
  const result=await scheduled({env:{BQ_CONTROL_BUCKET:'test-bucket'},storage,load:async()=>{throw Error('Não executar');}});
  assert.equal(result.status,'CARGA_EM_ANDAMENTO');
});
test('solicita atualização apenas após carga e histórico válidos, sem repetir POST', async () => {
  const calls = [];
  const env = { PBI_REFRESH_ENABLED:'true', PBI_DATASET_ID:'709ebd76-0982-4a78-bd8c-8fc429df14aa',
    PBI_CLIENT_ID:'709ebd76-0982-4a78-bd8c-8fc429df14aa', PBI_TENANT_ID:'709ebd76-0982-4a78-bd8c-8fc429df14aa', PBI_REFRESH_TOKEN:'fixture' };
  const fetcher = async (url, args) => {
    calls.push({url,args});
    if (calls.length === 1) return {ok:true,json:async()=>({access_token:'fixture'})};
    if (calls.length === 2) return {ok:true,json:async()=>({value:[]})};
    throw Error('timeout POST');
  };
  await assert.rejects(refreshAfterLoad({status:'SUCESSO',bigquery:'VALIDADO'},{env,fetcher}),/timeout POST/);
  assert.equal(calls.length,3);
  assert.deepEqual(JSON.parse(calls[2].args.body),{notifyOption:'MailOnFailure'});
});
test('ordem da execução é carga, atualização e liberação da trava', async () => {
  const steps=[];
  const storage={objects:{insert:async()=>({data:{generation:'1'}}),delete:async()=>steps.push('liberar')}};
  await scheduled({env:{BQ_CONTROL_BUCKET:'test-bucket'},storage,load:async()=>{steps.push('carga');return {status:'SUCESSO',bigquery:'VALIDADO'};},refresh:async()=>{steps.push('refresh');return {status:'SOLICITADO'};}});
  assert.deepEqual(steps,['carga','refresh','liberar']);
});
