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

function linha(empresa, data, valor, quantidade = 1) {
  return ['2026-09-07', '2026-09-09', '', '', 'MARCA', 'CLIENTE', empresa, '', '', quantidade, 'SHOPEE', valor, data, 'chave'];
}
test('substituição remove agregado antigo e preserva parcelas, outra empresa e outra data', () => {
  const fora = linha('CONSTRUBRAG', '2026-09-07', 50);
  const outra = linha('SS CONSTRUCASA', '2026-09-08', 90);
  const parcela1 = linha('CONSTRUBRAG', '2026-09-08', 61.70);
  const parcela2 = linha('CONSTRUBRAG', '2026-09-08', 26.45);
  const antigas = [fora, linha('CONSTRUBRAG', '2026-09-08', 88.15, 2), outra, parcela1, parcela2];
  const requests = context.requestsSubstituicao(123, antigas, [parcela1, parcela2], 'CONSTRUBRAG', '2026-09-08', '2026-09-09');
  const grid = [['header'], ...antigas];
  for (const request of requests) {
    if (request.deleteDimension) { const r = request.deleteDimension.range; grid.splice(r.startIndex, r.endIndex-r.startIndex); }
    if (request.appendCells) grid.push(...request.appendCells.rows.map(r => r.values.map(c => c.userEnteredValue.numberValue ?? c.userEnteredValue.stringValue)));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(grid)), [['header'], fora, outra, parcela1, parcela2]);
  assert.equal(context.resumo(grid.slice(1).filter(l => l[6] === 'CONSTRUBRAG' && l[12] === '2026-09-08')).valor, 88.15);
  assert.ok(context.mesmasVendas([parcela1, parcela2], [parcela2, parcela1]));
});
test('linhas legítimas idênticas mantêm multiplicidade', () => {
  const l = linha('CONSTRUBRAG', '2026-09-08', 10);
  assert.equal(context.mesmasVendas([l, l], [l]), false);
  assert.equal(context.mesmasVendas([l, l], [l, l]), true);
});
test('API de outra empresa, fora da janela ou com valor inválido é rejeitada', () => {
  const venda = { empresa: 'CONSTRUBRAG', data_emissao: '2026-09-08', quantidade: 1, 'valor faturado': 10 };
  const montar = v => context.montarLinhas([{ vendas: [v] }], '2026-09-08', '2026-09-09', 'CONSTRUBRAG');
  assert.throws(() => montar({ ...venda, empresa: 'BRADISFER DISTRIBUIDORA' }), /outra empresa/);
  assert.throws(() => montar({ ...venda, data_emissao: '2026-09-07' }), /data de emissão válida/);
  assert.throws(() => montar({ ...venda, 'valor faturado': 'invalido' }), /inválidos/);
});

test('falha na segunda empresa não escreve nem apaga vendas da primeira', async () => {
  const ctx = { console: { log() {} }, process: { env: { SYSEMP_TOKEN: 'teste', GOOGLE_SERVICE_ACCOUNT_KEY: '{}' } } };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  let mutacoes = 0;
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { title: 'VendasOnline', sheetId: 123 } }] } }),
    batchUpdate: async () => { mutacoes++; },
    values: {
      get: async ({ range }) => ({ data: { values: range.includes('Controle') ? [['3', '2026-09-09'], ['4', '2026-09-09']] :
        [Array.from(vm.runInContext('CABECALHO', ctx)), linha('CONSTRUBRAG', '2026-09-08', 100)] } }),
      update: async () => { mutacoes++; },
    },
  } };
  ctx.google = { auth: { JWT: function () {} }, sheets: () => sheets };
  ctx.buscarVendasEmpresa = async (_, id) => {
    if (id === '4') throw new Error('API indisponível');
    return [{ vendas: [{ empresa: 'CONSTRUBRAG', data_emissao: '2026-09-08', quantidade: 1, 'valor faturado': 50 }] }];
  };
  await assert.rejects(ctx.main(), /API indisponível/);
  assert.equal(mutacoes, 0);
});
