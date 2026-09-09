'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { canonical, key, duplicateGroups, expectedRows, deletionRanges, makePlan } = require('./limpar-duplicatas-vendas-bradisfer');
const header = ['PeriodoInicio', 'PeriodoFim', 'IdVendedor', 'Vendedor', 'Marca', 'Cliente', 'Empresa',
  'Cidade', 'UF', 'Quantidade', 'Canal', 'ValorFaturado', 'DataEmissao', 'IdPedido', 'ChaveDedup'];
const row = (quantity, value, order = '10') => ['2026-01-01', '2026-09-09', '7', 'VENDEDOR TESTE', 'MARCA TESTE',
  'CLIENTE TESTE', 'BRADISFER DISTRIBUIDORA', 'CIDADE TESTE', 'SP', quantity, 'SITE', value, '2026-08-04', order, 'chave-antiga'];
const sale = (quantity, value, extra = {}) => ({ id_pedido: '10', marca: 'MARCA TESTE', cliente: 'CLIENTE TESTE',
  empresa: 'BRADISFER DISTRIBUIDORA', 'data de emissão': '2026-08-04', 'canal de venda': 'SITE',
  quantidade: quantity, 'valor faturado': value, ...extra });
function mockApi(t, sales) {
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ status: true,
    retorno: [{ id_vendedor: '7', vendas: sales }] }) }));
}
test('mantém o valor confirmado na API mesmo quando a primeira versão é menor', async t => {
  mockApi(t, [sale(17, 537.05)]);
  const rows = [header, row(4, 86.16), row(17, 537.05), row(2, 20, '20')];
  const plan = await makePlan(rows, 'test');
  assert.equal(plan.summary.excessCents, 8616);
  assert.equal(plan.summary.rowsToRemove, 1);
  const after = expectedRows(rows, plan.changes);
  assert.equal(after[1][11], 537.05);
  assert.equal(after[1][9], 17);
  assert.equal(after[1][14], key(after[1]));
  assert.deepEqual(after[2], rows[3]);
  assert.equal(duplicateGroups(after).length, 0);
});
test('reagrega CFOP e não soma cópias antigas ao valor correto', async t => {
  mockApi(t, [sale(5, 23.21), sale(32, 323.66)]);
  const rows = [header, row(37, 346.87), row(5, 23.21), row(32, 323.66)];
  const plan = await makePlan(rows, 'test');
  assert.equal(plan.summary.excessCents, 34687);
  assert.equal(plan.changes[0].quantity, 37);
  assert.equal(plan.summary.rowsToRemove, 2);
  assert.equal(expectedRows(rows, plan.changes)[1][11], 346.87);
});
test('não modifica pedidos distintos só porque cliente e valor coincidem', () => {
  assert.deepEqual(duplicateGroups([header, row(2, 10, '10'), row(2, 10, '11')]), []);
});
test('recusa colisão de chave entre empresas', () => {
  const other = row(2, 10); other[6] = 'CONSTRUBRAG';
  assert.throws(() => duplicateGroups([header, row(2, 10), other]), /Colisão entre empresas/);
});
test('recusa venda sem confirmação na API', async t => {
  mockApi(t, [sale(2, 10, { id_pedido: '999' })]);
  await assert.rejects(makePlan([header, row(1, 5), row(2, 10)], 'test'), /sem correspondente/);
});
test('recusa vazamento de datas na API', async t => {
  mockApi(t, [sale(2, 10, { 'data de emissão': '2026-08-05' })]);
  await assert.rejects(makePlan([header, row(1, 5), row(2, 10)], 'test'), /filtro de data/);
});
test('recusa vazamento de empresas na API', async t => {
  mockApi(t, [sale(2, 10, { empresa: 'CONSTRUBRAG' })]);
  await assert.rejects(makePlan([header, row(1, 5), row(2, 10)], 'test'), /filtro de empresa/);
});
test('recusa limpeza que exige valor superior à soma das cópias', async t => {
  mockApi(t, [sale(2, 100)]);
  await assert.rejects(makePlan([header, row(1, 5), row(2, 10)], 'test'), /aumento/);
});
test('exclusões são agrupadas e ordenadas de baixo para cima', () => {
  assert.deepEqual(deletionRanges([4, 1, 2, 7, 4]), [
    { startIndex: 7, endIndex: 8 }, { startIndex: 4, endIndex: 5 }, { startIndex: 1, endIndex: 3 },
  ]);
});
test('snapshot preserva números, texto e células vazias', () => {
  const rows = canonical([[1, '001', null]]);
  assert.deepEqual(rows[0].slice(0, 4), [1, '001', '', '']);
  assert.equal(rows[0].length, 15);
});
