'use strict';
// Recuperação pontual do incidente de 09/09. Só remove agregados sem ID
// quando TODAS as vendas correspondentes já existem corretamente na aba.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { canonical, key, coarseKey, cents, getApiDay, deletionRanges, assertWriterStopped, duplicateGroups } = require('./limpar-duplicatas-vendas-bradisfer');
const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const TAB = 'VendasBradisfer';
const START = '2026-09-07', END = '2026-09-09';
const COMPANIES = [['BRADISFER DISTRIBUIDORA', '1'], ['CONSTRUBRAG', '3']];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const blank = value => value == null || String(value).trim() === '';
const company = row => String(row[6] || '').trim().toUpperCase();
function aggregate(rows) {
  const map = new Map();
  for (const row of rows) {
    const k = coarseKey(row), a = map.get(k) || { cents: 0, quantity: 0 };
    a.cents += cents(row[11]); a.quantity += row[9]; map.set(k, a);
  }
  return map;
}
function compareMaps(actual, expected, message) {
  assert.equal(actual.size, expected.size, message + ' (contagem)');
  for (const [k, value] of expected) assert.deepEqual(actual.get(k), value, message + ' (valor/quantidade)');
}
async function buildPlan(rows, token, query = getApiDay) {
  assert.equal(duplicateGroups(rows).length, 0, 'Resolver duplicatas identificadas antes desta recuperação.');
  const targets = [];
  rows.slice(1).forEach((row, i) => {
    if (!blank(row[12]) && !blank(row[13])) return;
    assert.ok(blank(row[12]) && blank(row[13]), 'Identificação parcialmente preenchida; revisão necessária.');
    assert.ok(row[0] === START && row[1] === END, 'Linha sem identificação pertence a outro incidente.');
    assert.ok(COMPANIES.some(([name]) => name === company(row)), 'Empresa desconhecida.');
    targets.push({ index: i + 1, row });
  });
  const evidence = [];
  if (targets.length) {
    for (const [name, id] of COMPANIES) {
      const bad = targets.filter(t => company(t.row) === name).map(t => t.row);
      if (!bad.length) continue;
      const current = await query(token, id, START, END);
      assert.equal(current.mode, 'order', 'API ainda não fornece pedido/data.');
      const valid = rows.slice(1).filter(r => company(r) === name && !blank(r[13]) && r[12] >= START && r[12] <= END);
      const existing = new Map(valid.map(r => [key(r), { cents: cents(r[11]), quantity: r[9] }]));
      assert.equal(existing.size, valid.length, 'Há pedidos duplicados entre os registros válidos.');
      compareMaps(existing, current.grouped, 'Vendas identificadas não coincidem integralmente com a API');
      compareMaps(aggregate(bad), current.coarse, 'Agregados sem identificação não coincidem integralmente com a API');
      evidence.push({ company: name, unidentified: bad.length, validOrdersAndBrands: valid.length,
        cents: bad.reduce((n, r) => n + cents(r[11]), 0) });
    }
  }
  const snapshot = hash(rows);
  return { targets, evidence, snapshot,
    fingerprint: hash({ snapshot, indices: targets.map(t => t.index), evidence }),
    summary: { rowsBefore: rows.length - 1, rowsToRemove: targets.length,
      excessCents: targets.reduce((n, t) => n + cents(t.row[11]), 0), evidence } };
}
async function main() {
  const mode = process.env.CLEANUP_MODE;
  assert.ok(['repair_audit', 'repair_apply'].includes(mode), 'Modo de recuperação inválido.');
  const apply = mode === 'repair_apply';
  const { google } = require('googleapis');
  const credential = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(credential.client_email, null, credential.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });
  const read = async (tab = TAB) => {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "'" + tab + "'!A1:O", valueRenderOption: 'UNFORMATTED_VALUE' });
    assert.ok(r.data.values?.length > 1, 'Planilha inacessível/vazia.');
    return canonical(r.data.values);
  };
  if (apply) await assertWriterStopped();
  const rows = await read();
  const plan = await buildPlan(rows, process.env.SYSEMP_TOKEN);
  console.log('CLEANUP_PLAN ' + JSON.stringify({ ...plan.summary, fingerprint: plan.fingerprint }));
  console.log('CLEANUP_PLAN_SHA256 ' + plan.fingerprint);
  if (!apply || !plan.targets.length) return;
  assert.equal(plan.fingerprint, process.env.EXPECTED_PLAN_SHA256, 'Plano mudou desde a auditoria.');
  const second = await buildPlan(rows, process.env.SYSEMP_TOKEN);
  assert.equal(second.fingerprint, plan.fingerprint, 'API mudou durante a conferência.');
  await assertWriterStopped();
  assert.equal(hash(await read()), plan.snapshot, 'Planilha mudou durante a conferência.');
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  const source = metadata.data.sheets.find(s => s.properties.title === TAB).properties;
  const backupId = Math.max(...metadata.data.sheets.map(s => s.properties.sheetId)) + 1;
  const backup = 'BackupB2B_antes_recuperacao_' + process.env.GITHUB_RUN_ID;
  const requests = [
    { duplicateSheet: { sourceSheetId: source.sheetId, newSheetId: backupId, newSheetName: backup } },
    { updateSheetProperties: { properties: { sheetId: backupId, hidden: true }, fields: 'hidden' } },
    ...deletionRanges(plan.targets.map(t => t.index)).map(range => ({ deleteDimension: {
      range: { sheetId: source.sheetId, dimension: 'ROWS', ...range } } })),
  ];
  // Operação atômica: backup completo primeiro, exclusão só dos agregados redundantes depois.
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, resource: { requests } });
  const after = await read();
  const removed = new Set(plan.targets.map(t => t.index));
  assert.equal(hash(await read(backup)), plan.snapshot, 'Backup diferente do original.');
  assert.equal(hash(after), hash(rows.filter((_, i) => !removed.has(i))), 'Resultado diferente do plano.');
  assert.ok(after.slice(1).every(r => !blank(r[12]) && !blank(r[13])), 'Ainda há registros sem identificação.');
  assert.equal(duplicateGroups(after).length, 0, 'Duplicatas inesperadas após recuperação.');
  console.log('CLEANUP_RESULT ' + JSON.stringify({ ...plan.summary, rowsAfter: after.length - 1,
    unidentifiedRemaining: 0, duplicateGroups: 0, backup, backupSheetId: backupId }));
}
module.exports = { buildPlan, aggregate, compareMaps };
if (require.main === module) main().catch(error => { console.error('CLEANUP_ABORTED: ' + error.message); process.exitCode = 1; });
