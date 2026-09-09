'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Executa só as definições, sem inicializar SDK nem rodar main/escrever no Sheets.
const source = fs.readFileSync(require.resolve('./atualizar-vendas-bradisfer'), 'utf8')
  .replace("const { google } = require('googleapis');", '')
  .replace(/main\(\)\.catch\([\s\S]*$/, '');
const context = { console };
vm.createContext(context); vm.runInContext(source, context);
const venda = (extra = {}) => ({ empresa: 'BRADISFER DISTRIBUIDORA', id_pedido: '38141',
  'data de emissão': '2026-07-02', marca: 'MARCA TESTE', cliente: 'CLIENTE TESTE',
  'canal de venda': 'SITE', quantidade: 4, 'valor faturado': 86.16, ...extra });
const payload = sales => ({ status: true, retorno: [{ id_vendedor: '7', vendedor: 'TESTE', vendas: sales }] });
test('IDs iguais em empresas distintas geram chaves distintas e duas vendas', () => {
  const sales = [venda(), venda({ empresa: 'CONSTRUBRAG', quantidade: 17, 'valor faturado': 537.05 })];
  const result = context.montarLinhas(payload(sales).retorno, '2026-07-02', '2026-07-02', null);
  assert.equal(result.linhas.length, 2);
  assert.notEqual(result.linhas[0].chave, result.linhas[1].chave);
  assert.equal(result.linhas[0].linha[11], 86.16);
  assert.equal(result.linhas[1].linha[11], 537.05);
});
test('CFOP continua agregado dentro da mesma empresa e pedido', () => {
  const result = context.montarLinhas(payload([venda({ cfop: '5.102' }), venda({ cfop: '5.405' })]).retorno,
    '2026-07-02', '2026-07-02', null);
  assert.equal(result.linhas.length, 1);
  assert.equal(result.linhas[0].linha[9], 8);
  assert.equal(result.linhas[0].linha[11], 172.32);
});
test('resposta agregada sem pedido/data é rejeitada', () => {
  const invalid = venda({ cfop: '5.102' }); delete invalid.id_pedido; delete invalid['data de emissão'];
  assert.throws(() => context.validarRetornoVendas(payload([invalid]), '1', '2026-07-02', '2026-07-02'), /sem id_pedido/);
});
test('valida empresa, intervalo e status antes de aceitar vendas', () => {
  context.validarRetornoVendas(payload([venda()]), '1', '2026-07-02', '2026-07-02');
  assert.throws(() => context.validarRetornoVendas(payload([venda({ empresa: 'CONSTRUBRAG' })]), '1', '2026-07-02', '2026-07-02'), /outra empresa/);
  assert.throws(() => context.validarRetornoVendas(payload([venda()]), '1', '2026-07-03', '2026-07-03'), /fora da janela/);
  assert.throws(() => context.validarRetornoVendas({ status: false, retorno: [] }, '1', '2026-07-02', '2026-07-02'), /inválida/);
});
test('releitura recalcula chave com empresa, sem depender da chave antiga gravada', async () => {
  const base = ['2026-07-02', '2026-07-02', '7', 'TESTE', 'MARCA TESTE', 'CLIENTE TESTE',
    'BRADISFER DISTRIBUIDORA', 'CIDADE', 'SP', 4, 'SITE', 86.16, '2026-07-02', '38141'];
  const other = [...base]; other[6] = 'CONSTRUBRAG'; other[9] = 17; other[11] = 537.05;
  const sdk = { spreadsheets: { values: { get: async () => ({ data: { values: [base, other] } }) } } };
  const existing = await context.lerLinhasExistentes(sdk);
  assert.equal(existing.size, 2);
  const computed = context.montarLinhas(payload([venda(), venda({ empresa: 'CONSTRUBRAG' })]).retorno, '2026-07-02', '2026-07-02', null);
  assert.ok(computed.linhas.every(r => existing.has(r.chave)));
});
