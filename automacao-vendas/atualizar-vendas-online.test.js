'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('./atualizar-vendas-online'), 'utf8')
  .replace("const { google } = require('googleapis');", '').replace(/main\(\)\.catch\([\s\S]*$/, '');
const context = { console }; vm.createContext(context); vm.runInContext(source, context);
test('online aceita data_emissao sem mudar o formato gravado', () => {
  const rows = context.montarLinhas([{ id_vendedor: null, vendedor: null, vendas: [{
    data_emissao: '2026-09-08', pedido: 10, empresa: 'CONSTRUBRAG', quantidade: 1,
    'valor faturado': 10, marca: 'MARCA', cliente: 'CLIENTE', 'canal de venda': 'SITE',
  }] }], '2026-09-07', '2026-09-09');
  assert.equal(rows.linhas[0].linha[12], '2026-09-08');
  assert.equal(rows.maiorDataEmissao, '2026-09-08');
});
test('online rejeita retorno sem data', () => {
  assert.throws(() => context.montarLinhas([{ vendas: [{ quantidade: 1, 'valor faturado': 10 }] }],
    '2026-09-07', '2026-09-09'), /sem data de emissão válida/);
});
