'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan, aggregate } = require('./recuperar-vendas-b2b-sem-identificacao');
const { key } = require('./limpar-duplicatas-vendas-bradisfer');
const header = ['PeriodoInicio', 'PeriodoFim', 'IdVendedor', 'Vendedor', 'Marca', 'Cliente', 'Empresa',
  'Cidade', 'UF', 'Quantidade', 'Canal', 'ValorFaturado', 'DataEmissao', 'IdPedido', 'ChaveDedup'];
const line = (order, quantity, value) => ['2026-09-07', '2026-09-09', '7', 'VENDEDOR', 'MARCA', 'CLIENTE',
  'BRADISFER DISTRIBUIDORA', 'CIDADE', 'SP', quantity, 'SITE', value, '2026-09-08', order, 'old'];
function fixture() {
  const valid = [line('1', 1, 10), line('2', 2, 20)];
  const bad = line('', 3, 30); bad[12] = '';
  const rows = [header, ...valid, bad];
  const query = async () => ({ mode: 'order', grouped: new Map(valid.map(r => [key(r), { cents: r[11] * 100, quantity: r[9] }])), coarse: aggregate(valid) });
  return { rows, query };
}
test('só remove agregado redundante quando todos os pedidos válidos já existem', async () => {
  const { rows, query } = fixture();
  const plan = await buildPlan(rows, 'test', query);
  assert.equal(plan.targets.length, 1);
  assert.equal(plan.targets[0].index, 3);
  assert.equal(plan.summary.excessCents, 3000);
  assert.equal(plan.evidence[0].validOrdersAndBrands, 2);
});
test('aborta se falta algum pedido válido na planilha', async () => {
  const { rows, query } = fixture(); rows.splice(1, 1);
  await assert.rejects(buildPlan(rows, 'test', query), /Vendas identificadas/);
});
test('aborta quando o agregado incompleto não coincide com os pedidos da API', async () => {
  const { rows, query } = fixture(); rows.at(-1)[11] = 31;
  await assert.rejects(buildPlan(rows, 'test', query), /Agregados sem identificação/);
});
test('não remove registros de outro incidente', async () => {
  const { rows, query } = fixture(); rows.at(-1)[0] = '2026-09-01';
  await assert.rejects(buildPlan(rows, 'test', query), /outro incidente/);
});
test('não consulta API nem altera dados quando já está recuperado', async () => {
  const { rows } = fixture(); rows.pop();
  const plan = await buildPlan(rows, 'test', async () => { throw new Error('Não deveria consultar'); });
  assert.equal(plan.targets.length, 0);
});
