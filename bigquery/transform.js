'use strict';
const crypto = require('node:crypto');
const fiscal = require('../automacao-vendas/atualizar-vendas-notas-itens');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const money = cents => {
  if (!Number.isSafeInteger(cents)) throw new Error('Valor monetário fora da precisão segura');
  return (cents / 100).toFixed(2);
};
function decimal(value) {
  if (value === null || value === undefined || String(value).trim() === '') throw new Error('Número obrigatório ausente');
  const text = String(value).trim().replace(',', '.');
  if (!/^-?\d+(\.\d{1,9})?$/.test(text) || !Number.isFinite(Number(text))) throw new Error('Número inválido na origem');
  return text;
}
function dates(start, end) {
  for (const d of [start, end]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '') ||
    Number.isNaN(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d) throw new Error('Data inválida');
  const days = fiscal.dateList(start, end);
  if (days.length > 31) throw new Error('Máximo de 31 dias por execução; divida o histórico');
  return days;
}
function unique(rows) {
  const seen = new Set();
  for (const r of rows) {
    if (!r.chave || seen.has(r.chave)) throw new Error('Chave ausente ou duplicada');
    seen.add(r.chave);
  }
  return rows;
}
function transform(rawRows, updatedAt, start, end) {
  dates(start, end);
  const result = { raw_notas_saida: [], raw_itens_notas_saida: [], notas_fiscais: [], fato_itens_vendidos: [], fato_vendas_resumo: [] };
  for (const r of rawRows) {
    dates(r.data_emissao, r.data_emissao);
    if (r.data_emissao < start || r.data_emissao > end || !['1', '3', '4'].includes(String(r.id_empresa))) throw new Error('Nota fora da janela/empresa');
    if (!Array.isArray(r.nota_saida_itens)) throw new Error('Detalhe de itens ausente');
    // The legacy converter tolerates invalid numbers; shadow ingestion must fail closed.
    decimal(r.vrtotal_geral);
    for (const item of r.nota_saida_itens) for (const name of ['qtde', 'total_liquido', 'custo_produto', 'valor_unitario']) decimal(item[name]);
    const key = fiscal.noteKey(r.id_empresa, r.id_nota_saida);
    const raw = (chave, payload) => ({ chave, data_emissao: r.data_emissao, empresa_id: String(r.id_empresa),
      payload, payload_sha256: hash(payload), atualizado_em: updatedAt });
    const { nota_saida_itens: items, ...header } = r;
    result.raw_notas_saida.push(raw(key, JSON.stringify(header)));
    items.forEach((item, index) => result.raw_itens_notas_saida.push({ ...raw(`${key}|${index}`, JSON.stringify(item)), chave_nota: key }));
  }
  unique(result.raw_notas_saida);
  for (const segmento of ['b2b', 'online']) {
    const p = fiscal.prepareData(rawRows, updatedAt, segmento);
    fiscal.validatePrepared(p, { excludeMarcus: segmento === 'b2b' });
    const noteRows = new Map();
    for (const n of p.notes.values()) {
      const row = { chave: n.key, data_emissao: n.emissionDate, empresa_id: n.companyId, empresa: n.company,
        canal: n.channel, cfop: n.cfop, segmento, atualizado_em: updatedAt, nota_id: n.noteId,
        pedido_id: n.orderId, vendedor_id: n.sellerId, vendedor: n.seller, cliente_id: n.clientId,
        cliente: n.client, cidade: n.city, uf: n.uf, total_fiscal: money(n.noteTotalCents), ajuste_fiscal: money(n.adjustmentCents) };
      noteRows.set(n.key, row);
      result.notas_fiscais.push(row);
    }
    for (const item of p.items.values()) {
      const { total_fiscal, ajuste_fiscal, ...note } = noteRows.get(item.noteKey);
      result.fato_itens_vendidos.push({ ...note, chave: item.key, chave_nota: item.noteKey,
        produto_id: item.productId, produto: item.product, marca: item.brand, grupo: item.group, categoria: item.category,
        quantidade: decimal(item.quantity), valor_liquido: money(item.liquidCents), ajuste_fiscal_alocado: money(item.adjustmentCents),
        valor_faturado: money(item.fiscalCents), custo_total: money(item.costCents) });
    }
    // Same note/brand grain for both segments; channel-day marketplace view uses fiscal notes.
    for (const row of fiscal.summarizeB2B(p, updatedAt)) {
      const { total_fiscal, ajuste_fiscal, ...note } = noteRows.get(`${row[0]}|${row[2]}`);
      result.fato_vendas_resumo.push({ ...note, chave: row[15], marca: row[12], quantidade: decimal(row[13]), faturamento: decimal(row[14]) });
    }
  }
  Object.values(result).forEach(unique);
  return result;
}
function stock(products, updatedAt) {
  return unique(products.map(p => {
    const id = String(p.id_produto ?? '').trim();
    if (!id) throw new Error('Produto sem ID');
    let barcode = String(p.cod_barra ?? '').trim().replace(/^'/, '');
    if (/^\d+$/.test(barcode) && barcode.length < 13) barcode = barcode.padStart(13, '0');
    return { chave: id, produto_id: id, codigo_barras: barcode, produto: String(p.descricao ?? ''),
      marca: String(p.descricao_marca ?? ''), grupo: String(p.descricao_grupo ?? ''), subgrupo: String(p.descricao_subgrupo ?? ''),
      unidade: String(p.unidade ?? ''), estoque_disponivel: decimal(p.estoque_disponivel), estoque_fisico: decimal(p.estoque),
      minimo: decimal(p.estoque_minimo), maximo: decimal(p.estoque_maximo), custo: decimal(p.custo),
      preco: decimal(p['preço_venda']), atualizado_em: updatedAt };
  }));
}
// Exact decimal arithmetic for reconciliation, independent of floating-point sums.
function cents(value) {
  const v = decimal(value);
  const [whole, fraction = ''] = v.replace('-', '').split('.');
  if (fraction.slice(2).replace(/0/g, '')) throw new Error('Conciliação monetária exige centavos');
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))) * (v.startsWith('-') ? -1n : 1n);
}
function aggregate(rows, dimensions, measure) {
  const map = new Map();
  for (const row of rows) {
    const key = JSON.stringify(dimensions.map(d => String(row[d] ?? '')));
    map.set(key, (map.get(key) || 0n) + cents(row[measure]));
  }
  return map;
}
function compare(expected, actual, dimensions, measure, source) {
  const a = aggregate(expected, dimensions, measure), b = aggregate(actual, dimensions, measure);
  return [...new Set([...a.keys(), ...b.keys()])].sort().map(grupo => {
    const delta = (b.get(grupo) || 0n) - (a.get(grupo) || 0n);
    const amount = v => `${v < 0n ? '-' : ''}${(v < 0n ? -v : v) / 100n}.${String((v < 0n ? -v : v) % 100n).padStart(2, '0')}`;
    return { fonte: source, grupo, esperado: amount(a.get(grupo) || 0n), observado: amount(b.get(grupo) || 0n), diferenca: amount(delta),
      status: a.has(grupo) && b.has(grupo) && delta >= -1n && delta <= 1n ? 'OK' : 'DIVERGENTE' };
  });
}
module.exports = { transform, stock, decimal, dates, unique, compare, aggregate, cents };
