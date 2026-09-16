'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  NOTES_HEADER, ITEMS_HEADER, B2B_SUMMARY_HEADER, ONLINE_SUMMARY_HEADER, ONLINE_ITEMS_HEADER, PRODUCT_COSTS_HEADER,
  MARCUS_ID, prepareData, summarizeB2B, summarizeOnline, validatePrepared,
  mergeWindow, isSaleNote, classifyNote, dateList, projectedGridCellCount, firstChangedRow,
  summarizeLatestProductCosts,
} = require('./atualizar-vendas-notas-itens');

function note(overrides = {}) {
  return {
    id_empresa: '1', fantasia_empresa: 'BRADISFER DISTRIBUIDORA', id_nota_saida: '500',
    nrnota: '100', serie: 'B', chavenfe: 'CHAVE', pedido: '39000', marketplace_pedido: '',
    data_pedido: '2026-09-10', data_emissao: '2026-09-10', hora_pedido: '10:00:00',
    id_vendedor: '10', vendedor: 'VENDEDOR', id_cliente: '20', razsocial_cliente: 'CLIENTE',
    entrega_cidade: 'ATIBAIA', sigla: 'SP', canal: 'APLICATIVO', cfop: '5.102',
    nat_operacao: 'Venda de merc. adquirida ou recebida de terceiros', tipo_documento: 'NF',
    nf_cancelada: 'NAO', total_produtos: '100.00', total_nota_fiscal: '100.00',
    vrtotal_geral: '105.00', valor_frete: '0', valor_financeiro_servico: '0',
    custo_total: '60', status: '2', descsituacao: 'TRANSMITIDA',
    nota_saida_itens: [
      { id_produto: 1, descricao_produto: 'PRODUTO A', descricao_marca: 'MARCA A', descricao_grupo: 'GRUPO', descricao_categoria: 'CATEGORIA', qtde: 2, valor_unitario: 20, total_liquido: 40, custo_produto: 10 },
      { id_produto: 1, descricao_produto: 'PRODUTO A', descricao_marca: 'MARCA A', descricao_grupo: 'GRUPO', descricao_categoria: 'CATEGORIA', qtde: 3, valor_unitario: 20, total_liquido: 60, custo_produto: 10 },
    ],
    ...overrides,
  };
}

test('prepara uma nota e agrega o mesmo produto sem duplicar o total fiscal', () => {
  const prepared = prepareData([note()], '2026-09-14T12:00:00.000Z');
  assert.equal(prepared.notes.size, 1);
  assert.equal(prepared.items.size, 1);
  const fiscal = [...prepared.notes.values()][0];
  const item = [...prepared.items.values()][0];
  assert.equal(fiscal.noteTotalCents, 10500);
  assert.equal(fiscal.itemTotalCents, 10000);
  assert.equal(fiscal.adjustmentCents, 500);
  assert.equal(item.row[20], 5);
  assert.equal(item.row[22], 100);
  assert.equal(item.row[23], 5);
  assert.equal(item.row[24], 105);
  assert.equal(item.row[26], 50);
  assert.deepEqual(validatePrepared(prepared), {
    fiscalCents: 10500, itemCents: 10000, adjustmentCents: 500,
    allocatedFiscalCents: 10500, differenceCents: 0,
  });
});

test('classifica vendedor vazio e preserva seu valor nos totais', () => {
  const prepared = prepareData([note({ id_vendedor: null, vendedor: null })], 'agora');
  const fiscal = [...prepared.notes.values()][0];
  assert.equal(fiscal.sellerId, 'SEM_VENDEDOR');
  assert.equal(fiscal.seller, 'SEM VENDEDOR');
  assert.equal(prepared.stats.withoutSellerCount, 1);
  assert.equal(prepared.stats.withoutSellerValue, 105);
});

test('resume B2B por nota e marca e preserva exatamente o total fiscal', () => {
  const prepared = prepareData([note({
    vrtotal_geral: '106.00',
    nota_saida_itens: [
      { id_produto: 1, descricao_produto: 'PRODUTO A', descricao_marca: 'MARCA A', qtde: 2, valor_unitario: 20, total_liquido: 40, custo_produto: 10 },
      { id_produto: 2, descricao_produto: 'PRODUTO B', descricao_marca: 'MARCA B', qtde: 3, valor_unitario: 20, total_liquido: 60, custo_produto: 10 },
    ],
  })], 'agora');
  const rows = summarizeB2B(prepared, 'agora');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, B2B_SUMMARY_HEADER.length);
  assert.equal(rows.reduce((sum, row) => sum + row[14], 0), 106);
  assert.deepEqual(rows.map(row => row[12]), ['MARCA A', 'MARCA B']);
  assert.deepEqual(rows.map(row => row[13]), [2, 3]);
  assert.ok(rows.every(row => row[2] === '500'));
});

test('exclui Marcus pelo ID, independentemente do nome', () => {
  const prepared = prepareData([note({ id_vendedor: MARCUS_ID, vendedor: 'OUTRA GRAFIA' })], 'agora');
  assert.equal(prepared.notes.size, 0);
  assert.equal(prepared.items.size, 0);
  assert.equal(prepared.stats.marcusExcludedCount, 1);
  assert.equal(prepared.stats.marcusExcludedValue, 105);
});

test('filtra canal, cancelamento, documento e natureza de operação', () => {
  assert.equal(isSaleNote(note()), true);
  assert.equal(isSaleNote(note({ canal: 'SHOPEE' })), false);
  assert.equal(isSaleNote(note({ nf_cancelada: 'SIM' })), false);
  assert.equal(isSaleNote(note({ tipo_documento: 'PD' })), false);
  assert.equal(isSaleNote(note({ nat_operacao: 'Remessa em bonificação, doação ou brinde' })), false);
});

test('classifica marketplaces das empresas online sem misturar com B2B', () => {
  assert.equal(classifyNote(note({ id_empresa: '3', canal: 'SHOPEE MVONLINE 3' })), 'online');
  assert.equal(classifyNote(note({ id_empresa: '4', canal: 'TIKTOK SHOP' })), 'online');
  assert.equal(classifyNote(note({ id_empresa: '4', canal: 'MERCADO LIVRE' })), 'online');
  assert.equal(classifyNote(note({ id_empresa: '4', canal: 'SITE' })), null);
  assert.equal(classifyNote(note({ id_empresa: '1', canal: 'SHOPEE' })), null);
});

test('mantém vendedor 1604 no marketplace e concilia o rateio fiscal', () => {
  const marketplace = note({
    id_empresa: '3', fantasia_empresa: 'CONSTRUBRAG', canal: 'SHOPEE MVONLINE 3',
    id_vendedor: MARCUS_ID, vendedor: 'MARCUS', vrtotal_geral: '100.01',
  });
  const prepared = prepareData([marketplace], 'agora', 'online', false);
  assert.equal(prepared.notes.size, 1);
  assert.equal(prepared.stats.marcusExcludedCount, 0);
  assert.equal([...prepared.items.values()][0].row[24], 100.01);
  assert.deepEqual(validatePrepared(prepared, { excludeMarcus: false }), {
    fiscalCents: 10001, itemCents: 10000, adjustmentCents: 1,
    allocatedFiscalCents: 10001, differenceCents: 0,
  });
  const summarized = summarizeOnline(prepared, 'agora');
  assert.equal(summarized.summaryRows.length, 1);
  assert.equal(summarized.itemRows.length, 1);
  assert.equal(summarized.summaryRows[0].length, ONLINE_SUMMARY_HEADER.length);
  assert.equal(summarized.itemRows[0].length, ONLINE_ITEMS_HEADER.length);
  assert.equal(summarized.summaryRows[0][4], 1);
  assert.equal(summarized.summaryRows[0][5], 100.01);
  assert.equal(summarized.itemRows[0][11], 1);
  assert.equal(summarized.itemRows[0][14], 100.01);
});

test('mantém quatro casas do Custo Total fiscal e escolhe a referência mais recente', () => {
  const antiga = note({
    id_nota_saida: '499', data_emissao: '2026-08-31',
    nota_saida_itens: [{ id_produto: 7339, descricao_produto: 'TELA HEXAGONAL', descricao_marca: 'VONDER', qtde: 2, valor_unitario: 360, total_liquido: 720, custo_produto: 286.1234 }],
  });
  const recente = note({
    id_nota_saida: '500', data_emissao: '2026-09-10',
    nota_saida_itens: [{ id_produto: 7339, descricao_produto: 'TELA HEXAGONAL', descricao_marca: 'VONDER', qtde: 3, valor_unitario: 360, total_liquido: 1080, custo_produto: 287.265 }],
  });
  const costs = prepareData([antiga, recente], 'agora', 'b2b', false, false);
  const rows = summarizeLatestProductCosts({ costs }, [], 'agora');
  assert.deepEqual(rows[0], PRODUCT_COSTS_HEADER);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], '7339');
  assert.equal(rows[1][3], 287.265);
  assert.equal(rows[1][4], '2026-09-10');
});

test('Custo Total inclui vendas do Marcus sem recolocá-las no B2B', () => {
  const vendaMarcus = note({
    id_vendedor: MARCUS_ID, vendedor: 'MARCUS',
    nota_saida_itens: [{ id_produto: 7339, descricao_produto: 'TELA HEXAGONAL', descricao_marca: 'VONDER', qtde: 1, valor_unitario: 360, total_liquido: 360, custo_produto: 287.265 }],
  });
  assert.equal(prepareData([vendaMarcus], 'agora').items.size, 0);
  const costs = prepareData([vendaMarcus], 'agora', 'b2b', false, false);
  assert.equal(summarizeLatestProductCosts({ costs }, [], 'agora')[1][3], 287.265);
});

test('consolida vendas online por data, empresa, canal e produto', () => {
  const rows = [
    note({ id_empresa: '3', id_nota_saida: '501', canal: 'SHOPEE', vrtotal_geral: 105 }),
    note({ id_empresa: '3', id_nota_saida: '502', canal: 'SHOPEE', vrtotal_geral: 105 }),
  ];
  const prepared = prepareData(rows, 'agora', 'online', false);
  const summarized = summarizeOnline(prepared, 'agora');
  assert.equal(summarized.summaryRows.length, 1);
  assert.equal(summarized.summaryRows[0][4], 2);
  assert.equal(summarized.summaryRows[0][5], 210);
  assert.equal(summarized.itemRows.length, 1);
  assert.equal(summarized.itemRows[0][10], 10);
  assert.equal(summarized.itemRows[0][11], 2);
  assert.equal(summarized.itemRows[0][14], 210);
});

test('recusa nota duplicada na mesma resposta', () => {
  assert.throws(() => prepareData([note(), note()], 'agora'), /Nota duplicada/);
});

test('substitui somente a janela incremental e mantém o histórico externo', () => {
  const oldBefore = Array(NOTES_HEADER.length).fill(''); oldBefore[9] = '2026-09-01'; oldBefore[2] = '1';
  const oldInside = Array(NOTES_HEADER.length).fill(''); oldInside[9] = '2026-09-10'; oldInside[2] = '2';
  const replacement = Array(NOTES_HEADER.length).fill(''); replacement[9] = '2026-09-10'; replacement[2] = '3';
  const result = mergeWindow([NOTES_HEADER, oldBefore, oldInside], NOTES_HEADER, [replacement], 9, '2026-09-08', '2026-09-14', 'incremental');
  assert.deepEqual(result.map(row => row[2]), ['IdNota', '1', '3']);
});

test('carga histórica descarta todas as linhas anteriores', () => {
  const old = Array(ITEMS_HEADER.length).fill(''); old[6] = '2026-01-02';
  const fresh = Array(ITEMS_HEADER.length).fill(''); fresh[6] = '2026-09-10';
  const result = mergeWindow([ITEMS_HEADER, old], ITEMS_HEADER, [fresh], 6, '2026-01-02', '2026-09-14', 'historico');
  assert.deepEqual(result, [ITEMS_HEADER, fresh]);
});

test('carga histórica permite substituir uma aba do formato anterior', () => {
  const fresh = Array(B2B_SUMMARY_HEADER.length).fill(''); fresh[4] = '2026-09-14';
  const result = mergeWindow([['CabecalhoAntigo'], ['valor']], B2B_SUMMARY_HEADER, [fresh], 4, '2026-01-02', '2026-09-14', 'historico');
  assert.deepEqual(result, [B2B_SUMMARY_HEADER, fresh]);
});

test('gera lista diária inclusiva e valida a janela', () => {
  assert.deepEqual(dateList('2026-09-12', '2026-09-14'), ['2026-09-12', '2026-09-13', '2026-09-14']);
  assert.throws(() => dateList('2026-09-14', '2026-09-12'), /inválida/);
});

test('projeta células usando a grade existente e a expansão necessária', () => {
  const tabs = new Map([
    ['Existente', { gridProperties: { rowCount: 100, columnCount: 10 } }],
    ['Alvo', { gridProperties: { rowCount: 50, columnCount: 20 } }],
  ]);
  const targets = [
    { name: 'Alvo', after: Array(70), columns: 12, shrinkGrid: true },
    { name: 'Nova', after: Array(1500), columns: 28 },
  ];
  assert.equal(projectedGridCellCount(tabs, targets), 1000 + 840 + 42000);
});

test('localiza a primeira linha alterada para gravar somente o fim da janela', () => {
  const before = [['A'], ['1'], ['2'], ['3']];
  const after = [['A'], ['1'], ['4']];
  assert.equal(firstChangedRow(before, after), 2);
  assert.equal(firstChangedRow(before, before), 4);
});
