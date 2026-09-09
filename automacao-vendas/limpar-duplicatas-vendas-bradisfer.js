'use strict';

// Limpeza pontual das duplicatas anteriores ao upsert de 09/09/2026.
// Auditoria por padrão. Aplicação exige plano aprovado por hash, carga B2B
// desativada e nenhuma execução dela pendente. Não altera checkpoints.
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const TAB = 'VendasBradisfer';
const WRITER = 'atualizar-vendas-bradisfer.yml';
const HEADER = ['PeriodoInicio', 'PeriodoFim', 'IdVendedor', 'Vendedor', 'Marca', 'Cliente',
  'Empresa', 'Cidade', 'UF', 'Quantidade', 'Canal', 'ValorFaturado', 'DataEmissao', 'IdPedido', 'ChaveDedup'];
const COMPANIES = new Map([['BRADISFER DISTRIBUIDORA', '1'], ['CONSTRUBRAG', '3']]);
const B2B = new Set(['APLICATIVO', 'SITE', 'VENDAS INTERNA', 'MOBWIT']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const str = value => String(value ?? '');
const normalizedCompany = value => str(value).trim().toUpperCase();
const key = row => [2, 13, 4, 5, 12, 10].map(i => str(row[i])).join('|');
const coarseKey = row => JSON.stringify([2, 4, 5, 10].map(i => str(row[i])));
const hasIdentity = row => row[13] !== '' && row[13] != null && /^\d{4}-\d{2}-\d{2}$/.test(str(row[12]));
function cents(value) {
  assert.equal(typeof value, 'number', 'Valor financeiro não numérico; interrompendo.');
  assert.ok(Number.isFinite(value), 'Valor financeiro inválido.');
  return Math.round(value * 100);
}
function canonical(rows) {
  return rows.map(row => Array.from({ length: 15 }, (_, i) => row[i] ?? ''));
}
function duplicateGroups(rows) {
  assert.deepEqual(rows[0], HEADER, 'Cabeçalho diferente do esperado.');
  const groups = new Map();
  rows.slice(1).forEach((row, offset) => {
    cents(row[11]);
    assert.ok(typeof row[9] === 'number' && Number.isFinite(row[9]), 'Quantidade inválida.');
    // A regressão da API de 09/09 gerou linhas sem pedido/data. Elas não
    // participam desta limpeza: são preservadas integralmente, inclusive no backup.
    if (!hasIdentity(row)) return;
    const k = key(row);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ index: offset + 1, row }); // índice zero-based, inclui cabeçalho
  });
  return [...groups.entries()].filter(([, group]) => group.length > 1).map(([k, group]) => {
    const companies = new Set(group.map(x => normalizedCompany(x.row[6])));
    assert.equal(companies.size, 1, 'Colisão entre empresas: ' + JSON.stringify(group.map(x => ({
      row: x.index + 1, company: normalizedCompany(x.row[6]), date: str(x.row[12]),
      orderType: typeof x.row[13], sellerType: typeof x.row[2] }))) + '. Precisa de revisão manual.');
    const company = [...companies][0];
    assert.ok(COMPANIES.has(company), 'Empresa desconhecida.');
    return { key: k, company, companyId: COMPANIES.get(company), date: str(group[0].row[12]), group };
  });
}
async function getApiDay(token, companyId, date) {
  let payload;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch('https://api.sysemp.com.br/163/listarVendasPorVendedor', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Token: token },
        body: JSON.stringify({ id_empresa: companyId, datainicial: date, datafinal: date, offset: '0' }),
        signal: AbortSignal.timeout(60000),
      });
      assert.ok(response.ok, 'API Sysemp retornou HTTP ' + response.status);
      payload = await response.json();
      assert.equal(payload.status, true, 'API Sysemp retornou status diferente de true.');
      assert.ok(Array.isArray(payload.retorno) && payload.retorno.length > 0, 'Resposta vazia/inválida da API.');
      break;
    } catch (error) {
      if (attempt === 2) throw new Error('Falha na consulta Sysemp de ' + date + ': ' + error.name);
      await sleep(1500 * (attempt + 1));
    }
  }
  const grouped = new Map();
  const coarse = new Map();
  const modes = new Set();
  for (const seller of payload.retorno) {
    assert.ok(Array.isArray(seller.vendas), 'Grupo sem vendas na API.');
    for (const sale of seller.vendas) {
      const emission = str(sale['data de emissão'] || sale['data de emissao'] || sale['Data de Emissão']).trim();
      if (emission) assert.equal(emission, date, 'A API não respeitou o filtro de data.');
      assert.equal(COMPANIES.get(normalizedCompany(sale.empresa)), companyId, 'A API não respeitou o filtro de empresa.');
      const channel = str(sale['canal de venda']);
      if (companyId === '3' && !B2B.has(channel.trim().toUpperCase())) continue;
      const hasOrder = sale.id_pedido != null && str(sale.id_pedido) !== '';
      assert.equal(hasOrder, Boolean(emission), 'API com identificação parcialmente preenchida.');
      modes.add(hasOrder ? 'order' : 'daily-aggregate');
      const k = [str(seller.id_vendedor), str(sale.id_pedido), str(sale.marca), str(sale.cliente), emission, channel].join('|');
      const value = cents(sale['valor faturado']);
      assert.ok(typeof sale.quantidade === 'number' && Number.isFinite(sale.quantidade), 'Quantidade da API inválida.');
      const acc = grouped.get(k) || { cents: 0, quantity: 0 };
      acc.cents += value;
      acc.quantity += sale.quantidade;
      grouped.set(k, acc);
      const ck = JSON.stringify([str(seller.id_vendedor), str(sale.marca), str(sale.cliente), channel]);
      const ca = coarse.get(ck) || { cents: 0, quantity: 0 };
      ca.cents += value; ca.quantity += sale.quantidade; coarse.set(ck, ca);
    }
  }
  assert.equal(modes.size, 1, 'API mistura registros com e sem identificação.');
  return { grouped, coarse, mode: [...modes][0] };
}
function confirmExistingVersion(g, rows, day) {
  const daily = rows.slice(1).filter(r => hasIdentity(r) && str(r[12]) === g.date && normalizedCompany(r[6]) === g.company);
  const byCoarse = new Map();
  for (const r of daily) {
    const ck = coarseKey(r);
    if (!byCoarse.has(ck)) byCoarse.set(ck, []);
    byCoarse.get(ck).push(r);
  }
  // Sem data por linha na resposta, corroborar o recorte consultado com o
  // histórico do DIA INTEIRO. Não basta encontrar um valor isolado parecido.
  const overlap = [...byCoarse.keys()].filter(k => day.coarse.has(k)).length;
  assert.ok(overlap >= 0.95 * Math.max(byCoarse.size, day.coarse.size), 'O recorte diário não corresponde ao histórico.');
  let compared = 0, matching = 0;
  for (const [ck, rs] of byCoarse) {
    if (new Set(rs.map(key)).size !== rs.length) continue; // duplicatas são o alvo, não a referência
    compared++;
    const actual = day.coarse.get(ck);
    if (actual && actual.cents === rs.reduce((n, r) => n + cents(r[11]), 0) &&
        actual.quantity === rs.reduce((n, r) => n + r[9], 0)) matching++;
  }
  assert.ok(compared >= 5 && matching >= compared * 0.95, 'Dados independentes insuficientes para confirmar o dia.');
  const related = byCoarse.get(coarseKey(g.group[0].row));
  const others = related.filter(r => key(r) !== g.key);
  assert.equal(new Set(others.map(key)).size, others.length, 'Mais de um pedido duplicado no mesmo agregado.');
  const actual = day.coarse.get(coarseKey(g.group[0].row));
  if (!actual) return null;
  const remaining = { cents: actual.cents - others.reduce((n, r) => n + cents(r[11]), 0),
    quantity: actual.quantity - others.reduce((n, r) => n + r[9], 0) };
  // Nunca inventar valor de pedido a partir de agregado sem ID: só aceitar
  // uma versão que JÁ EXISTE no histórico e coincide em valor E quantidade.
  return g.group.some(({ row }) => cents(row[11]) === remaining.cents && row[9] === remaining.quantity) ? remaining : null;
}
async function makePlan(rows, token) {
  const groups = duplicateGroups(rows);
  const api = new Map();
  for (const g of groups) {
    const requestKey = g.companyId + '/' + g.date;
    if (!api.has(requestKey)) {
      api.set(requestKey, await getApiDay(token, g.companyId, g.date));
      await sleep(150);
    }
  }
  const unresolved = [];
  const changes = groups.flatMap(g => {
    const day = api.get(g.companyId + '/' + g.date);
    const truth = day.mode === 'order' ? day.grouped.get(g.key) : confirmExistingVersion(g, rows, day);
    if (!truth && day.mode === 'daily-aggregate') {
      unresolved.push({ date: g.date, rows: g.group.map(x => x.index + 1), reason: 'Nenhuma versão histórica coincide em valor e quantidade com a API atual.' });
      return [];
    }
    assert.ok(truth, 'Venda duplicada sem correspondente na API; revisão necessária.');
    const before = g.group.reduce((sum, x) => sum + cents(x.row[11]), 0);
    assert.ok(truth.cents >= 0 && before >= truth.cents, 'Conciliação exige aumento ou valor negativo; revisão necessária.');
    const keeper = g.group[0];
    return [{ key: g.key, company: g.company, date: g.date, originals: g.group, basis: day.mode,
      keep: keeper.index, remove: g.group.slice(1).map(x => x.index),
      quantity: truth.quantity, cents: truth.cents, removedCents: before - truth.cents }];
  });
  const byDate = {};
  for (const c of changes) byDate[c.date] = (byDate[c.date] || 0) + c.removedCents;
  const summary = { duplicateGroups: changes.length, rowsToRemove: changes.reduce((n, c) => n + c.remove.length, 0),
    affectedDates: Object.keys(byDate).length, excessCents: changes.reduce((n, c) => n + c.removedCents, 0), byDate,
    unresolvedGroups: unresolved.length, unresolved,
    unidentifiedRowsPreserved: rows.slice(1).filter(r => !hasIdentity(r)).length };
  return { changes, summary, fingerprint: hash({ changes, unresolved }) };
}
function expectedRows(rows, changes) {
  const updates = new Map(changes.map(c => [c.keep, c]));
  const removed = new Set(changes.flatMap(c => c.remove));
  return rows.flatMap((row, i) => {
    if (removed.has(i)) return [];
    const result = [...row];
    const c = updates.get(i);
    if (c) { result[9] = c.quantity; result[11] = c.cents / 100; result[14] = c.key; }
    return [result];
  });
}
function deletionRanges(indices) {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const ranges = [];
  for (const i of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.endIndex === i) last.endIndex++;
    else ranges.push({ startIndex: i, endIndex: i + 1 });
  }
  return ranges.reverse();
}
async function assertWriterStopped() {
  assert.equal(process.env.GITHUB_REPOSITORY, 'es813636-dot/painel-bradisfer');
  const base = 'https://api.github.com/repos/' + process.env.GITHUB_REPOSITORY;
  const headers = { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json' };
  const get = async suffix => {
    const response = await fetch(base + suffix, { headers });
    assert.ok(response.ok, 'Não foi possível verificar a pausa da carga B2B.');
    return response.json();
  };
  const writer = await get('/actions/workflows/' + WRITER);
  assert.equal(writer.state, 'disabled_manually', 'Pause a carga B2B antes de aplicar.');
  const runs = await get('/actions/workflows/' + WRITER + '/runs?per_page=30');
  assert.ok(runs.workflow_runs.every(r => r.status === 'completed'), 'Existe carga B2B pendente/em execução.');
}
async function main() {
  const apply = process.env.CLEANUP_MODE === 'apply';
  assert.ok(['audit', 'apply'].includes(process.env.CLEANUP_MODE || 'audit'), 'Modo inválido.');
  const { google } = require('googleapis');
  const credential = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(credential.client_email, null, credential.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });
  const read = async (tab = TAB) => {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID,
      range: "'" + tab + "'!A1:O", valueRenderOption: 'UNFORMATTED_VALUE' });
    assert.ok(response.data.values?.length > 1, 'Aba vazia ou inacessível.');
    return canonical(response.data.values);
  };
  if (apply) await assertWriterStopped();
  const rows = await read();
  const plan = await makePlan(rows, process.env.SYSEMP_TOKEN);
  console.log('CLEANUP_PLAN ' + JSON.stringify({ ...plan.summary, fingerprint: plan.fingerprint, rowsBefore: rows.length - 1 }));
  console.log('CLEANUP_PLAN_SHA256 ' + plan.fingerprint);
  if (!apply || plan.changes.length === 0) return;
  assert.equal(plan.fingerprint, process.env.EXPECTED_PLAN_SHA256, 'Plano mudou desde a auditoria. Nenhuma alteração aplicada.');
  // Duas leituras independentes da API precisam concordar antes da exclusão.
  const confirmation = await makePlan(rows, process.env.SYSEMP_TOKEN);
  assert.equal(confirmation.fingerprint, plan.fingerprint, 'A API mudou durante a conferência.');
  await assertWriterStopped();
  assert.equal(hash(await read()), hash(rows), 'A planilha mudou durante a conferência.');
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  const source = meta.data.sheets.find(s => s.properties.title === TAB).properties;
  const backupId = Math.max(...meta.data.sheets.map(s => s.properties.sheetId)) + 1;
  const backup = 'BackupB2B_' + new Date().toISOString().replace(/[-:.TZ]/g, '') + '_' + process.env.GITHUB_RUN_ID;
  const requests = [
    { duplicateSheet: { sourceSheetId: source.sheetId, newSheetId: backupId, newSheetName: backup } },
    { updateSheetProperties: { properties: { sheetId: backupId, hidden: true }, fields: 'hidden' } },
  ];
  for (const c of plan.changes) {
    for (const [columnIndex, value] of [[9, c.quantity], [11, c.cents / 100], [14, c.key]]) {
      requests.push({ updateCells: { start: { sheetId: source.sheetId, rowIndex: c.keep, columnIndex },
        rows: [{ values: [{ userEnteredValue: typeof value === 'number' ? { numberValue: value } : { stringValue: value } }] }],
        fields: 'userEnteredValue' } });
    }
  }
  for (const range of deletionRanges(plan.changes.flatMap(c => c.remove))) {
    requests.push({ deleteDimension: { range: { sheetId: source.sheetId, dimension: 'ROWS', ...range } } });
  }
  // Backup + ajustes + exclusões, nessa ordem, numa única operação atômica.
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, resource: { requests } });
  const after = await read();
  assert.equal(hash(await read(backup)), hash(rows), 'Backup diverge da leitura anterior.');
  assert.equal(hash(after), hash(expectedRows(rows, plan.changes)), 'Resultado diverge do plano; confira o backup.');
  assert.equal(duplicateGroups(after).length, plan.summary.unresolvedGroups, 'Contagem de duplicatas remanescentes diferente do plano.');
  const total = data => data.slice(1).reduce((sum, row) => sum + cents(row[11]), 0);
  assert.equal(total(rows) - total(after), plan.summary.excessCents, 'Diferença financeira inesperada.');
  const result = { ...plan.summary, rowsAfter: after.length - 1, remainingDuplicates: plan.summary.unresolvedGroups,
    totalBeforeCents: total(rows), totalAfterCents: total(after), backup, backupSheetId: backupId };
  console.log('CLEANUP_RESULT ' + JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    'Limpeza B2B conferida. Backup: `' + backup + '`. Linhas removidas: ' + result.rowsToRemove +
    '. Excesso removido (centavos): ' + result.excessCents + '. Grupos pendentes: ' + result.remainingDuplicates +
    '. Linhas sem identificação preservadas: ' + result.unidentifiedRowsPreserved + '.\n');
}
module.exports = { canonical, key, duplicateGroups, expectedRows, deletionRanges, makePlan, cents };
if (require.main === module) main().catch(error => { console.error('CLEANUP_ABORTED: ' + error.message); process.exitCode = 1; });
