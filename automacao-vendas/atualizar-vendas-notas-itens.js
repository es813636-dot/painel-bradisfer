'use strict';

const crypto = require('node:crypto');

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const NOTES_URL = 'https://api.sysemp.com.br/163/listaPedidosNotasSaida';
const TAB_B2B_NOTES = 'VendasB2B_Notas';
const TAB_B2B_ITEMS = 'VendasB2B_Itens';
const TAB_B2B_SUMMARY = 'VendasB2B_Resumo';
const TAB_B2B_CONTROL = 'ConciliacaoB2B';
const TAB_ONLINE_SUMMARY = 'VendasOnline_Resumo';
const TAB_ONLINE_ITEMS = 'VendasOnline_Itens';
const TAB_ONLINE_CONTROL = 'ConciliacaoOnline';
const START_DATE = '2026-01-02';
const PAGE_SIZE = 100;
const DAY_CONCURRENCY = 8;
const SHEET_CELL_SAFETY_LIMIT = 9500000;
const MARCUS_ID = '1604';
const COMPANIES = { '1': 'BRADISFER DISTRIBUIDORA', '3': 'CONSTRUBRAG', '4': 'SS CONSTRUCASA' };
const B2B_CHANNELS = new Set(['APLICATIVO', 'MOBWIT', 'SITE', 'VENDAS INTERNA']);
const MARKETPLACE_CHANNEL_MARKERS = ['SHOPEE', 'TIKTOK', 'MERCADO LIVRE'];
const SALE_OPERATIONS = new Set([
  'VENDA DE MERC. ADQUIRIDA OU RECEBIDA DE TERCEIROS',
  'VENDA ****ORCAMENTO*****',
  'VENDA DE PRODUTOS COM SUBSTITUICAO',
  'VENDA FORA UF *****ORCAMENTO******',
  'VENDA DE PRODUTOS COM SUBSTITUICAO FORA DO ESTADO',
  'VENDA DE MERC. ADQUI. OU RECE. DE TERCEIROS',
  'VENDA FORA UF APENAS MOVIMENTO FISCAL',
]);

const NOTES_HEADER = [
  'EmpresaId', 'Empresa', 'IdNota', 'NumeroNF', 'Serie', 'ChaveNFe', 'IdPedido',
  'PedidoMarketplace', 'DataPedido', 'DataEmissao', 'HoraPedido', 'IdVendedor',
  'Vendedor', 'IdCliente', 'Cliente', 'Cidade', 'UF', 'Canal', 'CFOP',
  'NaturezaOperacao', 'TotalProdutos', 'TotalNota', 'TotalGeral', 'Frete',
  'Servicos', 'CustoTotal', 'AjusteFiscal', 'Status', 'Situacao', 'NotaCancelada',
  'ChaveNota', 'AtualizadoEm',
];

const ITEMS_HEADER = [
  'EmpresaId', 'Empresa', 'IdNota', 'NumeroNF', 'IdPedido', 'PedidoMarketplace', 'DataEmissao',
  'IdVendedor', 'Vendedor', 'IdCliente', 'Cliente', 'Cidade', 'UF', 'Canal', 'CFOP',
  'IdProduto', 'Produto', 'Marca', 'Grupo', 'Categoria', 'Quantidade', 'ValorUnitario',
  'ValorLiquidoItem', 'AjusteFiscalAlocado', 'ValorFaturado', 'CustoUnitario',
  'CustoTotalItem', 'ChaveItem', 'AtualizadoEm',
];

// Uma linha por nota e marca. Mantém as dimensões usadas pelo Power BI,
// sem ocupar uma linha da planilha para cada produto vendido.
const B2B_SUMMARY_HEADER = [
  'EmpresaId', 'Empresa', 'IdVenda', 'IdPedidoOrigem', 'DataEmissao',
  'IdVendedor', 'Vendedor', 'IdCliente', 'Cliente', 'Cidade', 'UF', 'Canal',
  'Marca', 'Quantidade', 'Faturamento', 'ChaveResumo', 'AtualizadoEm',
];

const ONLINE_SUMMARY_HEADER = [
  'EmpresaId', 'Empresa', 'DataEmissao', 'Canal', 'Vendas', 'Faturamento',
  'ReceitaLiquidaItens', 'AjusteFiscal', 'CustoTotalItens', 'TicketMedio',
  'ChaveResumo', 'AtualizadoEm',
];

const ONLINE_ITEMS_HEADER = [
  'EmpresaId', 'Empresa', 'DataEmissao', 'Canal', 'CFOP', 'IdProduto', 'Produto',
  'Marca', 'Grupo', 'Categoria', 'Quantidade', 'PedidosComProduto',
  'ValorLiquidoItem', 'AjusteFiscalAlocado', 'ValorFaturado', 'CustoTotalItem',
  'MargemBruta', 'ChaveResumoItem', 'AtualizadoEm',
];

const CONTROL_HEADER = [
  'AtualizadoEm', 'Modo', 'DataInicio', 'DataFim', 'Status', 'DuracaoSegundos',
  'NotasLidas', 'NotasProcessadasJanela', 'ItensProcessadosJanela',
  'LinhasItensGravadasJanela', 'TotalFiscalJanela',
  'TotalItensJanela', 'AjusteFiscalJanela', 'SemVendedorQtd', 'SemVendedorValor',
  'MarcusExcluidoQtd', 'MarcusExcluidoValor', 'DiferencaFinal',
];

const text = value => String(value ?? '').trim();
const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const numeric = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(text(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};
const cents = value => Math.round(numeric(value) * 100);
const amount = valueInCents => Math.round(valueInCents) / 100;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isoDate = date => date.toISOString().slice(0, 10);

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function dateList(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    throw new Error(`Janela de datas inválida: ${start} a ${end}`);
  }
  const values = [];
  for (let current = start; current <= end; current = addDays(current, 1)) values.push(current);
  return values;
}

function noteKey(companyId, noteId) {
  if (!text(companyId) || !text(noteId)) throw new Error('Nota sem empresa ou ID fiscal.');
  return `${text(companyId)}|${text(noteId)}`;
}

function itemKey(companyId, noteId, productId, product, brand) {
  const productPart = text(productId) || `${normalize(product)}|${normalize(brand)}`;
  if (!productPart) throw new Error(`Item sem identificação na nota ${noteId}.`);
  return `${noteKey(companyId, noteId)}|${productPart}`;
}

function classifyNote(row) {
  if (normalize(row.nf_cancelada) === 'SIM' || normalize(row.tipo_documento) !== 'NF') return null;
  const companyId = text(row.id_empresa);
  const channel = normalize(row.canal);
  if ((companyId === '1' || companyId === '3') && B2B_CHANNELS.has(channel) && SALE_OPERATIONS.has(normalize(row.nat_operacao))) return 'b2b';
  if ((companyId === '3' || companyId === '4') && MARKETPLACE_CHANNEL_MARKERS.some(marker => channel.includes(marker))) return 'online';
  return null;
}

function isSaleNote(row) {
  return classifyNote(row) === 'b2b';
}

function allocateAdjustment(groupedItems, adjustmentCents, noteTotalCents, noteKeyValue) {
  if (!groupedItems.size && noteTotalCents) {
    const keyItem = `${noteKeyValue}|AJUSTE_FISCAL`;
    groupedItems.set(keyItem, {
      keyItem, productId: '', product: 'AJUSTE FISCAL SEM ITEM', brand: 'AJUSTE FISCAL',
      group: 'AJUSTE FISCAL', category: 'AJUSTE FISCAL', quantity: 0,
      liquidCents: 0, costCents: 0, grossUnitCents: 0,
    });
  }
  const ordered = [...groupedItems.values()].sort((a, b) => a.keyItem.localeCompare(b.keyItem, 'pt-BR', { numeric: true }));
  const totalWeight = ordered.reduce((sum, item) => sum + Math.abs(item.liquidCents), 0);
  let allocated = 0;
  for (const item of ordered) {
    item.adjustmentCents = totalWeight ? Math.trunc(adjustmentCents * Math.abs(item.liquidCents) / totalWeight) : 0;
    allocated += item.adjustmentCents;
  }
  let remainder = adjustmentCents - allocated;
  for (let index = 0; remainder !== 0 && ordered.length; index = (index + 1) % ordered.length) {
    const step = remainder > 0 ? 1 : -1;
    ordered[index].adjustmentCents += step;
    remainder -= step;
  }
  for (const item of ordered) item.fiscalCents = item.liquidCents + item.adjustmentCents;
}

function prepareData(rawRows, updatedAt, segment = 'b2b', storeNoteRows = true) {
  if (!['b2b', 'online'].includes(segment)) throw new Error(`Segmento inválido: ${segment}`);
  const notes = new Map();
  const items = new Map();
  const stats = {
    notesRead: rawRows.length,
    selectedBeforeMarcus: 0,
    marcusExcludedCount: 0,
    marcusExcludedCents: 0,
    withoutSellerCount: 0,
    withoutSellerCents: 0,
  };

  for (const row of rawRows) {
    if (classifyNote(row) !== segment) continue;
    stats.selectedBeforeMarcus += 1;
    const companyId = text(row.id_empresa);
    const expectedCompany = COMPANIES[companyId];
    if (!expectedCompany) throw new Error(`Empresa inesperada na API fiscal: ${companyId}`);
    const company = text(row.fantasia_empresa) || expectedCompany;
    const noteId = text(row.id_nota_saida);
    const key = noteKey(companyId, noteId);
    const noteTotalCents = cents(row.vrtotal_geral);
    const sellerIdRaw = text(row.id_vendedor);
    if (segment === 'b2b' && sellerIdRaw === MARCUS_ID) {
      stats.marcusExcludedCount += 1;
      stats.marcusExcludedCents += noteTotalCents;
      continue;
    }
    const sellerMissing = !sellerIdRaw || !text(row.vendedor);
    const sellerId = sellerMissing ? 'SEM_VENDEDOR' : sellerIdRaw;
    const seller = sellerMissing ? 'SEM VENDEDOR' : text(row.vendedor);
    if (sellerMissing) {
      stats.withoutSellerCount += 1;
      stats.withoutSellerCents += noteTotalCents;
    }
    const emissionDate = text(row.data_emissao);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(emissionDate)) throw new Error(`Data de emissão inválida na nota ${key}.`);

    const groupedItems = new Map();
    for (const apiItem of Array.isArray(row.nota_saida_itens) ? row.nota_saida_itens : []) {
      const productId = text(apiItem.id_produto);
      const product = text(apiItem.descricao_produto) || 'PRODUTO SEM DESCRIÇÃO';
      const brand = text(apiItem.descricao_marca) || 'SEM MARCA';
      const keyItem = itemKey(companyId, noteId, productId, product, brand);
      const quantity = numeric(apiItem.qtde);
      const liquidCents = cents(apiItem.total_liquido);
      const unitCost = numeric(apiItem.custo_produto);
      const apiUnitPrice = numeric(apiItem.valor_unitario);
      const current = groupedItems.get(keyItem) || {
        keyItem, productId, product, brand,
        group: text(apiItem.descricao_grupo) || 'SEM GRUPO',
        category: text(apiItem.descricao_categoria) || 'SEM CATEGORIA',
        quantity: 0, liquidCents: 0, costCents: 0, grossUnitCents: 0,
      };
      current.quantity += quantity;
      current.liquidCents += liquidCents;
      current.costCents += Math.round(quantity * unitCost * 100);
      current.grossUnitCents += Math.round(quantity * apiUnitPrice * 100);
      groupedItems.set(keyItem, current);
    }

    const itemTotalCents = [...groupedItems.values()].reduce((sum, item) => sum + item.liquidCents, 0);
    const adjustmentCents = noteTotalCents - itemTotalCents;
    allocateAdjustment(groupedItems, adjustmentCents, noteTotalCents, key);
    const note = {
      key, companyId, company, noteId, emissionDate, noteTotalCents, itemTotalCents,
      adjustmentCents, sellerId, seller, channel: normalize(row.canal), cfop: text(row.cfop),
      orderId: text(row.pedido), clientId: text(row.id_cliente),
      client: text(row.razsocial_cliente) || 'CLIENTE NÃO INFORMADO',
      city: text(row.entrega_cidade || row.cidade), uf: text(row.sigla),
      row: storeNoteRows ? [
        companyId, company, noteId, text(row.nrnota), text(row.serie), text(row.chavenfe),
        text(row.pedido), text(row.marketplace_pedido), text(row.data_pedido), emissionDate,
        text(row.hora_pedido), sellerId, seller, text(row.id_cliente),
        text(row.razsocial_cliente) || 'CLIENTE NÃO INFORMADO', text(row.entrega_cidade || row.cidade),
        text(row.sigla), normalize(row.canal), text(row.cfop), text(row.nat_operacao),
        amount(cents(row.total_produtos)), amount(cents(row.total_nota_fiscal)), amount(noteTotalCents),
        amount(cents(row.valor_frete)), amount(cents(row.valor_financeiro_servico)),
        amount(cents(row.custo_total)), amount(adjustmentCents), text(row.status), text(row.descsituacao),
        text(row.nf_cancelada), key, updatedAt,
      ] : null,
    };
    if (notes.has(key)) throw new Error(`Nota duplicada no retorno fiscal: ${key}`);
    notes.set(key, note);

    for (const item of groupedItems.values()) {
      const averageUnitCents = item.quantity ? Math.round(item.grossUnitCents / item.quantity) : 0;
      const averageCostCents = item.quantity ? Math.round(item.costCents / item.quantity) : 0;
      items.set(item.keyItem, {
        key: item.keyItem,
        noteKey: key,
        emissionDate,
        liquidCents: item.liquidCents,
        adjustmentCents: item.adjustmentCents,
        fiscalCents: item.fiscalCents,
        costCents: item.costCents,
        companyId, company, channel: normalize(row.canal), cfop: text(row.cfop),
        productId: item.productId, product: item.product, brand: item.brand,
        group: item.group, category: item.category, quantity: item.quantity,
        row: [
          companyId, company, noteId, text(row.nrnota), text(row.pedido), text(row.marketplace_pedido), emissionDate,
          sellerId, seller, text(row.id_cliente), text(row.razsocial_cliente) || 'CLIENTE NÃO INFORMADO',
          text(row.entrega_cidade || row.cidade), text(row.sigla), normalize(row.canal), text(row.cfop),
          item.productId, item.product, item.brand, item.group, item.category, item.quantity,
          amount(averageUnitCents), amount(item.liquidCents), amount(item.adjustmentCents),
          amount(item.fiscalCents), amount(averageCostCents), amount(item.costCents),
          item.keyItem, updatedAt,
        ],
      });
    }
  }

  stats.marcusExcludedValue = amount(stats.marcusExcludedCents);
  stats.withoutSellerValue = amount(stats.withoutSellerCents);
  return { notes, items, stats };
}

function summarizeB2B(prepared, updatedAt) {
  const summaries = new Map();
  for (const item of prepared.items.values()) {
    const note = prepared.notes.get(item.noteKey);
    if (!note) throw new Error(`Item sem nota correspondente: ${item.noteKey}`);
    const brand = text(item.brand) || 'SEM MARCA';
    const key = `${note.key}|${normalize(brand)}`;
    const current = summaries.get(key) || { key, note, brand, quantity: 0, fiscalCents: 0 };
    current.quantity += item.quantity;
    current.fiscalCents += item.fiscalCents;
    summaries.set(key, current);
  }
  const rows = [...summaries.values()].map(({ key, note, brand, quantity, fiscalCents }) => [
    note.companyId, note.company, note.noteId, note.orderId, note.emissionDate,
    note.sellerId, note.seller, note.clientId, note.client, note.city, note.uf,
    note.channel, brand, quantity, amount(fiscalCents), key, updatedAt,
  ]);
  const summarizedCents = rows.reduce((sum, row) => sum + cents(row[14]), 0);
  const fiscalCents = [...prepared.notes.values()].reduce((sum, note) => sum + note.noteTotalCents, 0);
  if (summarizedCents !== fiscalCents) {
    throw new Error(`Resumo B2B não conciliou: ${amount(summarizedCents)} vs ${amount(fiscalCents)}.`);
  }
  return sortRows(rows, [4, 0, 2, 12]);
}

function summarizeOnline(prepared, updatedAt) {
  const costByNote = new Map();
  for (const item of prepared.items.values()) {
    costByNote.set(item.noteKey, (costByNote.get(item.noteKey) || 0) + item.costCents);
  }

  const summaries = new Map();
  for (const note of prepared.notes.values()) {
    const key = `${note.companyId}|${note.emissionDate}|${note.channel}`;
    const current = summaries.get(key) || {
      key, companyId: note.companyId, company: note.company, emissionDate: note.emissionDate,
      channel: note.channel, sales: 0, fiscalCents: 0, liquidCents: 0,
      adjustmentCents: 0, costCents: 0,
    };
    current.sales += 1;
    current.fiscalCents += note.noteTotalCents;
    current.liquidCents += note.itemTotalCents;
    current.adjustmentCents += note.adjustmentCents;
    current.costCents += costByNote.get(note.key) || 0;
    summaries.set(key, current);
  }

  const productSummaries = new Map();
  for (const item of prepared.items.values()) {
    const productPart = item.productId || `${normalize(item.product)}|${normalize(item.brand)}`;
    const key = `${item.companyId}|${item.emissionDate}|${item.channel}|${item.cfop}|${productPart}`;
    const current = productSummaries.get(key) || {
      key, companyId: item.companyId, company: item.company, emissionDate: item.emissionDate,
      channel: item.channel, cfop: item.cfop, productId: item.productId, product: item.product,
      brand: item.brand, group: item.group, category: item.category, quantity: 0,
      noteKeys: new Set(), liquidCents: 0, adjustmentCents: 0, fiscalCents: 0, costCents: 0,
    };
    current.quantity += item.quantity;
    current.noteKeys.add(item.noteKey);
    current.liquidCents += item.liquidCents;
    current.adjustmentCents += item.adjustmentCents;
    current.fiscalCents += item.fiscalCents;
    current.costCents += item.costCents;
    productSummaries.set(key, current);
  }

  const summaryRows = [...summaries.values()].map(value => [
    value.companyId, value.company, value.emissionDate, value.channel, value.sales,
    amount(value.fiscalCents), amount(value.liquidCents), amount(value.adjustmentCents),
    amount(value.costCents), amount(Math.round(value.fiscalCents / value.sales)), value.key, updatedAt,
  ]);
  const itemRows = [...productSummaries.values()].map(value => [
    value.companyId, value.company, value.emissionDate, value.channel, value.cfop,
    value.productId, value.product, value.brand, value.group, value.category, value.quantity,
    value.noteKeys.size, amount(value.liquidCents), amount(value.adjustmentCents),
    amount(value.fiscalCents), amount(value.costCents), amount(value.fiscalCents - value.costCents),
    value.key, updatedAt,
  ]);
  return {
    summaryRows: sortRows(summaryRows, [2, 0, 3]),
    itemRows: sortRows(itemRows, [2, 0, 3, 5]),
  };
}

function validatePrepared(prepared, { excludeMarcus = true } = {}) {
  let fiscalCents = 0;
  let itemCents = 0;
  let adjustmentCents = 0;
  let allocatedFiscalCents = 0;
  for (const note of prepared.notes.values()) {
    if (excludeMarcus && note.sellerId === MARCUS_ID) throw new Error('Vendedor 1604 passou pelo filtro.');
    fiscalCents += note.noteTotalCents;
    adjustmentCents += note.adjustmentCents;
  }
  for (const item of prepared.items.values()) {
    if (!prepared.notes.has(item.noteKey)) throw new Error(`Item sem nota correspondente: ${item.key}`);
    itemCents += item.liquidCents;
    allocatedFiscalCents += item.fiscalCents;
  }
  if (itemCents + adjustmentCents !== fiscalCents) {
    throw new Error(`Conciliação falhou: itens ${amount(itemCents)} + ajustes ${amount(adjustmentCents)} != fiscal ${amount(fiscalCents)}.`);
  }
  if (allocatedFiscalCents !== fiscalCents) {
    throw new Error(`Rateio fiscal falhou: itens faturados ${amount(allocatedFiscalCents)} != fiscal ${amount(fiscalCents)}.`);
  }
  return { fiscalCents, itemCents, adjustmentCents, allocatedFiscalCents, differenceCents: fiscalCents - allocatedFiscalCents };
}

function summarizeByCompany(prepared) {
  const companies = new Map();
  const getCompany = (companyId, company) => {
    const current = companies.get(companyId) || {
      companyId, company, notes: 0, itemRows: 0, quantity: 0,
      fiscalCents: 0, liquidCents: 0, adjustmentCents: 0, costCents: 0,
      sellers: new Set(), clients: new Set(), products: new Set(),
    };
    companies.set(companyId, current);
    return current;
  };
  for (const note of prepared.notes.values()) {
    const current = getCompany(note.companyId, note.company);
    current.notes += 1;
    current.fiscalCents += note.noteTotalCents;
    current.liquidCents += note.itemTotalCents;
    current.adjustmentCents += note.adjustmentCents;
    if (note.sellerId && note.sellerId !== 'SEM_VENDEDOR') current.sellers.add(note.sellerId);
    const clientId = note.row?.[13];
    if (clientId) current.clients.add(clientId);
  }
  for (const item of prepared.items.values()) {
    const current = getCompany(item.companyId, item.company);
    current.itemRows += 1;
    current.quantity += item.quantity;
    current.costCents += item.costCents;
    if (item.productId) current.products.add(item.productId);
  }
  return [...companies.values()]
    .sort((a, b) => a.companyId.localeCompare(b.companyId, 'pt-BR', { numeric: true }))
    .map(value => ({
      companyId: value.companyId,
      company: value.company,
      sales: value.notes,
      itemRows: value.itemRows,
      quantity: amount(Math.round(value.quantity * 100)),
      products: value.products.size,
      clients: value.clients.size,
      sellers: value.sellers.size,
      fiscalTotal: amount(value.fiscalCents),
      itemTotal: amount(value.liquidCents),
      adjustment: amount(value.adjustmentCents),
      costTotal: amount(value.costCents),
      grossMargin: amount(value.fiscalCents - value.costCents),
      grossMarginPct: value.fiscalCents ? Math.round((value.fiscalCents - value.costCents) * 10000 / value.fiscalCents) / 100 : 0,
    }));
}

async function postNotes(token, body, attempt = 1) {
  try {
    const response = await fetch(NOTES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Token: token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.status !== true || !Array.isArray(payload.retorno)) throw new Error('status/retorno inválidos');
    return payload.retorno;
  } catch (error) {
    if (attempt >= 3) throw error;
    await sleep(1000 * attempt);
    return postNotes(token, body, attempt + 1);
  }
}

async function fetchDay(token, companyId, date) {
  const unique = new Map();
  for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
    const rows = await postNotes(token, {
      offset: String(offset), id_empresa: companyId, tipoconsulta: 'NF', id_nota_saida: '',
      datainicial: date, datafinal: date,
    });
    for (const row of rows) {
      if (text(row.data_emissao) !== date) continue;
      unique.set(noteKey(row.id_empresa, row.id_nota_saida), row);
    }
    if (rows.length < PAGE_SIZE) return [...unique.values()];
  }
  throw new Error(`Mais de 10 mil notas no dia ${date}, empresa ${companyId}.`);
}

function emptyPrepared() {
  return {
    notes: new Map(), items: new Map(),
    stats: {
      notesRead: 0, selectedBeforeMarcus: 0, marcusExcludedCount: 0,
      marcusExcludedCents: 0, withoutSellerCount: 0, withoutSellerCents: 0,
      marcusExcludedValue: 0, withoutSellerValue: 0,
    },
  };
}

function mergePrepared(target, source) {
  for (const [key, value] of source.notes) {
    if (target.notes.has(key)) throw new Error(`Nota repetida entre lotes: ${key}`);
    target.notes.set(key, value);
  }
  for (const [key, value] of source.items) {
    if (target.items.has(key)) throw new Error(`Item repetido entre lotes: ${key}`);
    target.items.set(key, value);
  }
  for (const field of ['notesRead', 'selectedBeforeMarcus', 'marcusExcludedCount', 'marcusExcludedCents', 'withoutSellerCount', 'withoutSellerCents']) {
    target.stats[field] += source.stats[field];
  }
  target.stats.marcusExcludedValue = amount(target.stats.marcusExcludedCents);
  target.stats.withoutSellerValue = amount(target.stats.withoutSellerCents);
}

async function fetchPreparedWindow(token, start, end, updatedAt, { includeB2B = true, includeOnline = true } = {}) {
  const dates = dateList(start, end);
  const result = { b2b: emptyPrepared(), online: emptyPrepared() };
  const companyIds = new Set();
  if (includeB2B) ['1', '3'].forEach(id => companyIds.add(id));
  if (includeOnline) ['3', '4'].forEach(id => companyIds.add(id));
  for (const companyId of companyIds) {
    for (let index = 0; index < dates.length; index += DAY_CONCURRENCY) {
      const batch = dates.slice(index, index + DAY_CONCURRENCY);
      const pages = await Promise.all(batch.map(date => fetchDay(token, companyId, date)));
      const rawRows = pages.flat();
      if (includeB2B && (companyId === '1' || companyId === '3')) mergePrepared(result.b2b, prepareData(rawRows, updatedAt, 'b2b', true));
      if (includeOnline && (companyId === '3' || companyId === '4')) mergePrepared(result.online, prepareData(rawRows, updatedAt, 'online', false));
      console.log(`API fiscal empresa ${companyId}: ${Math.min(index + batch.length, dates.length)}/${dates.length} dias; B2B ${result.b2b.notes.size} nota(s), online ${result.online.notes.size} nota(s).`);
    }
  }
  return result;
}

function normalizeGrid(values) {
  return values.map(row => {
    const normalized = row.map(value => value ?? '');
    while (normalized.length && normalized.at(-1) === '') normalized.pop();
    return normalized;
  });
}

function gridHash(values) {
  return crypto.createHash('sha256').update(JSON.stringify(normalizeGrid(values))).digest('hex');
}

function firstChangedRow(before, after) {
  const limit = Math.min(before.length, after.length);
  let index = 0;
  while (index < limit && gridHash([before[index]]) === gridHash([after[index]])) index += 1;
  return index;
}

function mergeWindow(existing, header, newRows, dateColumnIndex, start, end, mode) {
  if (existing.length && JSON.stringify(existing[0]) !== JSON.stringify(header)) {
    throw new Error(`Cabeçalho inesperado em ${header[0]}.`);
  }
  const preserved = mode === 'historico' ? [] : existing.slice(1).filter(row => {
    const date = text(row[dateColumnIndex]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Linha existente com data inválida: ${JSON.stringify(row.slice(0, 10))}`);
    return date < start || date > end;
  });
  return [header, ...preserved, ...newRows];
}

function sortRows(rows, indexes) {
  return rows.sort((a, b) => {
    for (const index of indexes) {
      const comparison = text(a[index]).localeCompare(text(b[index]), 'pt-BR', { numeric: true });
      if (comparison) return comparison;
    }
    return 0;
  });
}

function columnName(count) {
  let value = count;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function projectedGridCellCount(tabs, targets) {
  const targetByName = new Map(targets.map(target => [target.name, target]));
  let cells = 0;
  for (const [name, properties] of tabs) {
    const target = targetByName.get(name);
    const rows = target
      ? Math.max(properties.gridProperties.rowCount, target.after.length, 1)
      : properties.gridProperties.rowCount;
    const columns = target
      ? Math.max(properties.gridProperties.columnCount, target.columns, 1)
      : properties.gridProperties.columnCount;
    cells += rows * columns;
    targetByName.delete(name);
  }
  for (const target of targetByName.values()) {
    cells += Math.max(1000, target.after.length, 1) * Math.max(target.columns, 1);
  }
  return cells;
}

async function listTabs(sheets) {
  const response = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  return new Map(response.data.sheets.map(sheet => [sheet.properties.title, sheet.properties]));
}

async function ensureTab(sheets, tabs, name, neededRows, neededColumns) {
  if (tabs.has(name)) return tabs.get(name);
  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    resource: { requests: [{ addSheet: { properties: {
      title: name,
      gridProperties: { rowCount: Math.max(1000, neededRows), columnCount: neededColumns },
    } } }] },
  });
  const properties = response.data.replies[0].addSheet.properties;
  tabs.set(name, properties);
  return properties;
}

async function readTab(sheets, tabs, name, columns) {
  if (!tabs.has(name)) return [];
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${name}!A1:${columnName(columns)}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return response.data.values || [];
}

async function writeExact(sheets, tabs, name, values, currentValues = []) {
  const neededRows = Math.max(values.length, 1);
  const neededColumns = Math.max(...values.map(row => row.length), 1);
  const properties = await ensureTab(sheets, tabs, name, neededRows, neededColumns);
  const requests = [];
  if (properties.gridProperties.rowCount < neededRows) {
    requests.push({ updateSheetProperties: { properties: { sheetId: properties.sheetId, gridProperties: { rowCount: neededRows } }, fields: 'gridProperties.rowCount' } });
    properties.gridProperties.rowCount = neededRows;
  }
  if (properties.gridProperties.columnCount < neededColumns) {
    requests.push({ updateSheetProperties: { properties: { sheetId: properties.sheetId, gridProperties: { columnCount: neededColumns } }, fields: 'gridProperties.columnCount' } });
    properties.gridProperties.columnCount = neededColumns;
  }
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, resource: { requests } });

  const firstWriteIndex = firstChangedRow(currentValues, values);
  for (let index = firstWriteIndex; index < values.length; index += 1500) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${name}!A${index + 1}`,
      valueInputOption: 'RAW',
      resource: { values: values.slice(index, index + 1500) },
    });
    if (index + 1500 < values.length) await sleep(500);
  }
  if (properties.gridProperties.rowCount > values.length) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${name}!A${values.length + 1}:${columnName(properties.gridProperties.columnCount)}${properties.gridProperties.rowCount}`,
    });
  }
}

async function main() {
  const started = Date.now();
  const token = process.env.SYSEMP_TOKEN;
  if (!token) throw new Error('SYSEMP_TOKEN não configurado.');
  const requestedMode = normalize(process.env.MODO_CARGA || 'incremental').toLowerCase();
  if (!['incremental', 'historico'].includes(requestedMode)) throw new Error('MODO_CARGA deve ser incremental ou historico.');
  const simulate = process.env.SO_SIMULAR === '1';
  const includeB2B = process.env.INCLUIR_B2B !== '0';
  const includeOnline = process.env.INCLUIR_ONLINE !== '0';
  const includeB2BDetails = process.env.INCLUIR_B2B_ITENS === '1';
  if (!includeB2B && !includeOnline) throw new Error('Ative ao menos um segmento para a carga.');
  let sheets;
  let tabs;
  let beforeB2BNotes = [];
  let beforeB2BItems = [];
  let beforeB2BSummary = [];
  let beforeB2BControl = [];
  let beforeOnlineSummary = [];
  let beforeOnlineItems = [];
  let beforeOnlineControl = [];
  if (!simulate) {
    const credential = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || 'null');
    if (!credential?.client_email || !credential?.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY inválido.');
    const { google } = require('googleapis');
    const auth = new google.auth.JWT(credential.client_email, null, credential.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
    sheets = google.sheets({ version: 'v4', auth });
    tabs = await listTabs(sheets);
    if (includeB2B) {
      beforeB2BSummary = await readTab(sheets, tabs, TAB_B2B_SUMMARY, B2B_SUMMARY_HEADER.length);
      if (includeB2BDetails) {
        beforeB2BNotes = await readTab(sheets, tabs, TAB_B2B_NOTES, NOTES_HEADER.length);
        beforeB2BItems = await readTab(sheets, tabs, TAB_B2B_ITEMS, ITEMS_HEADER.length);
      }
      beforeB2BControl = await readTab(sheets, tabs, TAB_B2B_CONTROL, CONTROL_HEADER.length);
    }
    if (includeOnline) {
      beforeOnlineSummary = await readTab(sheets, tabs, TAB_ONLINE_SUMMARY, ONLINE_SUMMARY_HEADER.length);
      beforeOnlineItems = await readTab(sheets, tabs, TAB_ONLINE_ITEMS, ONLINE_ITEMS_HEADER.length);
      beforeOnlineControl = await readTab(sheets, tabs, TAB_ONLINE_CONTROL, CONTROL_HEADER.length);
    }
  }

  const needsBootstrap = (includeB2B && (!beforeB2BSummary.length
      || (includeB2BDetails && (!beforeB2BNotes.length || !beforeB2BItems.length))))
    || (includeOnline && (!beforeOnlineSummary.length || !beforeOnlineItems.length));
  const mode = simulate ? requestedMode : (needsBootstrap ? 'historico' : requestedMode);
  const end = process.env.DATA_FIM || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const windowDays = Number(process.env.JANELA_DIAS || 7);
  const start = process.env.DATA_INICIO || (mode === 'historico' ? START_DATE : addDays(end, -(windowDays - 1)));
  console.log(`Carga ${mode}: ${start} a ${end}.`);

  const updatedAt = new Date().toISOString();
  const prepared = await fetchPreparedWindow(token, start, end, updatedAt, { includeB2B, includeOnline });
  const reconciliations = {
    b2b: validatePrepared(prepared.b2b, { excludeMarcus: true }),
    online: validatePrepared(prepared.online, { excludeMarcus: false }),
  };
  const newB2BNotes = sortRows([...prepared.b2b.notes.values()].map(value => value.row), [9, 0, 2]);
  const newB2BItems = sortRows([...prepared.b2b.items.values()].map(value => value.row), [6, 0, 2, 15]);
  const newB2BSummary = summarizeB2B(prepared.b2b, updatedAt);
  const online = summarizeOnline(prepared.online, updatedAt);
  const newOnlineSummary = online.summaryRows;
  const newOnlineItems = online.itemRows;
  const segmentResult = segment => ({
    notesRead: prepared[segment].stats.notesRead, notes: prepared[segment].notes.size,
    items: prepared[segment].items.size, fiscalTotal: amount(reconciliations[segment].fiscalCents),
    itemTotal: amount(reconciliations[segment].itemCents), adjustment: amount(reconciliations[segment].adjustmentCents),
    withoutSeller: { count: prepared[segment].stats.withoutSellerCount, value: prepared[segment].stats.withoutSellerValue },
    marcusExcluded: { count: prepared[segment].stats.marcusExcludedCount, value: prepared[segment].stats.marcusExcludedValue },
    difference: amount(reconciliations[segment].differenceCents),
  });
  const result = {
    mode, start, end, segments: { b2b: includeB2B, b2bDetails: includeB2BDetails, online: includeOnline },
    b2b: { ...segmentResult('b2b'), byCompany: summarizeByCompany(prepared.b2b) },
    online: { ...segmentResult('online'), summaryRows: newOnlineSummary.length, itemSummaryRows: newOnlineItems.length },
    plannedDataCells: (includeB2B ? (newB2BSummary.length * B2B_SUMMARY_HEADER.length)
      + (includeB2BDetails ? (newB2BNotes.length * NOTES_HEADER.length) + (newB2BItems.length * ITEMS_HEADER.length) : 0) : 0)
      + (includeOnline ? (newOnlineSummary.length * ONLINE_SUMMARY_HEADER.length) + (newOnlineItems.length * ONLINE_ITEMS_HEADER.length) : 0),
  };
  if (simulate) {
    console.log('SIMULAÇÃO concluída; nenhuma planilha foi alterada.');
    console.log('RESULTADO=' + JSON.stringify(result));
    return;
  }
  const finalB2BNotes = mergeWindow(beforeB2BNotes, NOTES_HEADER, newB2BNotes, 9, start, end, mode);
  const finalB2BItems = mergeWindow(beforeB2BItems, ITEMS_HEADER, newB2BItems, 6, start, end, mode);
  const finalB2BSummary = mergeWindow(beforeB2BSummary, B2B_SUMMARY_HEADER, newB2BSummary, 4, start, end, mode);
  const finalOnlineSummary = mergeWindow(beforeOnlineSummary, ONLINE_SUMMARY_HEADER, newOnlineSummary, 2, start, end, mode);
  const finalOnlineItems = mergeWindow(beforeOnlineItems, ONLINE_ITEMS_HEADER, newOnlineItems, 2, start, end, mode);
  const makeControl = (before, segment, tabName) => {
    if (before.length && JSON.stringify(before[0]) !== JSON.stringify(CONTROL_HEADER)) throw new Error(`Cabeçalho inesperado em ${tabName}.`);
    const stats = prepared[segment].stats;
    const reconciliation = reconciliations[segment];
    const row = [
      updatedAt, mode, start, end, 'SUCESSO', Math.round((Date.now() - started) / 100) / 10,
      stats.notesRead, prepared[segment].notes.size, prepared[segment].items.size,
      segment === 'online' ? newOnlineItems.length : (includeB2BDetails ? newB2BItems.length : 0),
      amount(reconciliation.fiscalCents), amount(reconciliation.itemCents), amount(reconciliation.adjustmentCents),
      stats.withoutSellerCount, stats.withoutSellerValue,
      stats.marcusExcludedCount, stats.marcusExcludedValue,
      amount(reconciliation.differenceCents),
    ];
    return before.length ? [...before, row] : [CONTROL_HEADER, row];
  };
  const finalB2BControl = makeControl(beforeB2BControl, 'b2b', TAB_B2B_CONTROL);
  const finalOnlineControl = makeControl(beforeOnlineControl, 'online', TAB_ONLINE_CONTROL);

  const targets = [];
  if (includeB2B) targets.push(
    { name: TAB_B2B_SUMMARY, before: beforeB2BSummary, after: finalB2BSummary, columns: B2B_SUMMARY_HEADER.length },
    { name: TAB_B2B_CONTROL, before: beforeB2BControl, after: finalB2BControl, columns: CONTROL_HEADER.length },
  );
  if (includeB2B && includeB2BDetails) targets.push(
    { name: TAB_B2B_NOTES, before: beforeB2BNotes, after: finalB2BNotes, columns: NOTES_HEADER.length },
    { name: TAB_B2B_ITEMS, before: beforeB2BItems, after: finalB2BItems, columns: ITEMS_HEADER.length },
  );
  if (includeOnline) targets.push(
    { name: TAB_ONLINE_SUMMARY, before: beforeOnlineSummary, after: finalOnlineSummary, columns: ONLINE_SUMMARY_HEADER.length },
    { name: TAB_ONLINE_ITEMS, before: beforeOnlineItems, after: finalOnlineItems, columns: ONLINE_ITEMS_HEADER.length },
    { name: TAB_ONLINE_CONTROL, before: beforeOnlineControl, after: finalOnlineControl, columns: CONTROL_HEADER.length },
  );
  const projectedCells = projectedGridCellCount(tabs, targets);
  if (projectedCells > SHEET_CELL_SAFETY_LIMIT) {
    throw new Error(`Carga projetaria ${projectedCells.toLocaleString('pt-BR')} células na planilha, acima do limite seguro de ${SHEET_CELL_SAFETY_LIMIT.toLocaleString('pt-BR')}. Use uma planilha separada para os itens online.`);
  }
  console.log(`Capacidade conferida: ${projectedCells.toLocaleString('pt-BR')} células projetadas.`);
  const changed = [];
  try {
    for (const target of targets) {
      changed.push(target);
      await writeExact(sheets, tabs, target.name, target.after, target.before);
      const actual = await readTab(sheets, tabs, target.name, target.columns);
      if (gridHash(actual) !== gridHash(target.after)) throw new Error(`Conferência após gravação falhou em ${target.name}.`);
      console.log(`${target.name}: ${target.after.length - 1} linha(s), gravação conferida.`);
    }
  } catch (error) {
    console.error(`Falha após iniciar gravação: ${error.message}. Restaurando abas alteradas.`);
    for (const target of changed.reverse()) {
      await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${target.name}!A:AN` });
      if (target.before.length) await writeExact(sheets, tabs, target.name, target.before, target.after);
      console.log(`Backup restaurado: ${target.name}.`);
    }
    throw error;
  }

  console.log('RESULTADO=' + JSON.stringify(result));
}

module.exports = {
  NOTES_HEADER, ITEMS_HEADER, B2B_SUMMARY_HEADER, ONLINE_SUMMARY_HEADER, ONLINE_ITEMS_HEADER, CONTROL_HEADER,
  MARCUS_ID, prepareData, summarizeB2B, summarizeOnline, validatePrepared,
  mergeWindow, noteKey, itemKey, isSaleNote, classifyNote, dateList, allocateAdjustment,
  projectedGridCellCount, firstChangedRow, summarizeByCompany,
};

if (require.main === module) main().catch(error => {
  console.error('Falhou:', error.stack || error.message || error);
  process.exit(1);
});
