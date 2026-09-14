'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { transform, stock, compare, cents, dates } = require('../transform');
const { config, ddl, tables } = require('../schema');
const { publicationSQL, Warehouse } = require('../warehouse');
const { fetchNotes, pages, post } = require('../source');
const { reconcileSheets } = require('../sheets');
const { options, run } = require('../run');
const fiscal = require('../../automacao-vendas/atualizar-vendas-notas-itens');
const fixture = require('./fixture.json');
const stamp = '2026-09-14T12:00:00.000Z';
const start = '2026-09-10';
const convert = (rows = fixture.notes) => transform(rows, stamp, start, start);
const env = { BQ_PROJECT_ID: 'example-project', BQ_RAW_DATASET: 'raw', BQ_COMERCIAL_DATASET: 'comercial', BQ_STAGING_DATASET: 'staging', BQ_LOCATION: 'US' };
const clone = value => structuredClone(value);
function grids(rows = fixture.notes) {
  return {
    b2b: [fiscal.B2B_SUMMARY_HEADER, ...fiscal.summarizeB2B(fiscal.prepareData(rows, stamp), stamp)],
    online: [fiscal.ONLINE_SUMMARY_HEADER, ...fiscal.summarizeOnline(fiscal.prepareData(rows, stamp, 'online'), stamp).summaryRows],
  };
}

test('same snapshot is deterministic, preserves cents, raw detail and company-qualified keys', () => {
  const d = convert();
  assert.deepEqual(d, convert());
  assert.equal(d.raw_notas_saida.length, 2);
  assert.equal(d.raw_itens_notas_saida.length, 3);
  assert.equal(d.fato_itens_vendidos.length, 2);
  assert.equal(d.fato_itens_vendidos[0].quantidade, '5');
  assert.equal(d.fato_itens_vendidos[0].valor_faturado, '105.00');
  assert.equal(d.fato_itens_vendidos[0].ajuste_fiscal_alocado, '5.00');
  assert.equal(d.notas_fiscais[1].vendedor_id, '1604'); // Allowed online only.
  assert.equal(d.notas_fiscais[0].chave, '1|500');
  for (const [name, rows] of Object.entries(d)) for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), tables[name].fields.map(f => f.name).sort());
  }
});

test('cancelled/reclassified notes survive raw but leave commercial snapshot', () => {
  const rows = clone(fixture.notes);
  rows[0].nf_cancelada = 'SIM';
  rows[1].canal = 'SEM CANAL';
  const d = convert(rows);
  assert.equal(d.raw_notas_saida.length, 2);
  assert.equal(d.notas_fiscais.length, 0);
  assert.equal(d.fato_itens_vendidos.length, 0);
});
test('Marcus is excluded in B2B; missing seller is retained', () => {
  const rows = clone(fixture.notes);
  rows[0].id_vendedor = '1604';
  assert.equal(convert(rows).notas_fiscais.length, 1);
  rows[0].id_vendedor = '';
  assert.equal(convert(rows).notas_fiscais[0].vendedor_id, 'SEM_VENDEDOR');
});
test('duplicate source keys and incomplete detail fail closed', () => {
  assert.throws(() => convert([...fixture.notes, fixture.notes[0]]), /duplicada/);
  const rows = clone(fixture.notes);
  delete rows[0].nota_saida_itens;
  assert.throws(() => convert(rows), /ausente/);
});
test('malformed money, out-of-window data and invalid calendar dates fail', () => {
  const rows = clone(fixture.notes);
  rows[0].vrtotal_geral = 'n/a';
  assert.throws(() => convert(rows), /Número inválido/);
  assert.throws(() => transform(fixture.notes, stamp, '2026-09-11', '2026-09-11'), /fora/);
  assert.throws(() => dates('2026-02-30', '2026-03-01'), /Data inválida/);
  assert.throws(() => dates('2026-01-01', '2026-03-01'), /31 dias/);
});
test('stock uses available stock, preserves barcode and decimal precision', () => {
  const [row] = stock(fixture.products, stamp);
  assert.equal(row.codigo_barras, '0074468051034');
  assert.equal(row.estoque_disponivel, '7');
  assert.equal(row.estoque_fisico, '10');
  assert.equal(row.custo, '10.1234');
  assert.throws(() => stock([...fixture.products, ...fixture.products], stamp), /duplicada/);
});
test('financial reconciliation tolerates one cent per group, never nets differences across groups', () => {
  const expected = [{ g: 'A', v: '100' }, { g: 'B', v: '100' }];
  assert.equal(compare(expected, [{ g: 'A', v: '100.01' }, { g: 'B', v: '99.99' }], ['g'], 'v', 'test').every(r => r.status === 'OK'), true);
  assert.equal(compare(expected, [{ g: 'A', v: '100.02' }, { g: 'B', v: '99.98' }], ['g'], 'v', 'test').every(r => r.status === 'DIVERGENTE'), true);
  assert.equal(compare([{ g: 'zero', v: '0' }], [], ['g'], 'v', 'test')[0].status, 'DIVERGENTE');
  assert.equal(cents('-0.01'), -1n);
  assert.equal(cents('99999999999999.99'), 9999999999999999n);
});
test('Sheets reconciliation covers both segments and rejects stale data/schema/duplicates', () => {
  const sheets = grids(), data = convert();
  assert.ok(reconcileSheets(data, sheets, start, start).every(r => r.status === 'OK'));
  sheets.b2b[1][14] = 104.98;
  assert.ok(reconcileSheets(data, sheets, start, start).some(r => r.status === 'DIVERGENTE'));
  sheets.b2b.push(sheets.b2b[1]);
  assert.throws(() => reconcileSheets(data, sheets, start, start), /duplicada/);
  sheets.b2b = [['legacy']];
  assert.throws(() => reconcileSheets(data, sheets, start, start), /Cabeçalho/);
});
test('pagination finishes on partial page, requests all companies and rejects mismatched filters', async () => {
  const calls = [];
  await fetchNotes(start, start, 'fake', async (method, body) => { calls.push(body); return []; });
  assert.deepEqual(calls.map(c => c.id_empresa), ['1', '3', '4']);
  await assert.rejects(fetchNotes(start, start, 'fake', async () => [fixture.notes[1]]), /fora do filtro/);
  const rows = await pages('test', {}, 'fake', async (_, body) => body.offset === '0' ? Array(100).fill({}) : [{}]);
  assert.equal(rows.length, 101);
  await assert.rejects(pages('test', {}, 'fake', async () => Array(101).fill({})), /página/);
});
test('API requests use Token and fail on incomplete response', async () => {
  let attempts = 0;
  await assert.rejects(post('test', {}, 'fake', async (_, init) => {
    assert.equal(init.headers.Token, 'fake');
    attempts++;
    return { ok: true, json: async () => ({ status: false, retorno: [] }) };
  }), /status\/retorno/);
  assert.equal(attempts, 3);
});
test('destination identifiers reject injection and shared datasets', () => {
  assert.throws(() => config({}), /PROJECT/);
  assert.throws(() => config({ ...env, BQ_RAW_DATASET: 'raw`; DROP TABLE x' }), /inválido/);
  assert.throws(() => config({ ...env, BQ_STAGING_DATASET: 'raw' }), /separados/);
  assert.match(ddl(config(env)), /PARTITION BY data_emissao/);
});
test('publication uses atomic keyed MERGE, removes stale window only, asserts data before commit', () => {
  const sql = publicationSQL(config(env), convert(), 'a'.repeat(32));
  assert.match(sql, /^BEGIN TRANSACTION;/);
  assert.match(sql, /ON T.chave = S.chave/);
  assert.match(sql, /Nota mudou de data fora da janela/);
  assert.match(sql, /WHEN NOT MATCHED BY SOURCE AND T.data_emissao BETWEEN @start AND @end THEN DELETE/);
  assert.match(sql, /EXCEPT DISTINCT/);
  assert.match(sql, /FULL JOIN b USING\(empresa_id,data_emissao,canal,cfop\)/);
  assert.match(sql, /COMMIT TRANSACTION;$/);
  assert.doesNotMatch(sql, /TRUNCATE|DROP TABLE/);
});
test('safe CLI defaults and fixture-write/ungated-write protection', () => {
  assert.equal(options(['--start', start, '--end', start]).write, false);
  assert.throws(() => options(['--fixture', 'x', '--write', '--sheets']), /Fixture/);
  assert.throws(() => options(['--write']), /--sheets/);
  assert.throws(() => options(['--typo']), /Unknown option/);
});
test('offline simulation cannot instantiate a warehouse or read network', async t => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'bq-test-'));
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  const forbidden = () => { throw new Error('network forbidden'); };
  const result = await run(['--fixture', path.join(__dirname, 'fixture.json'), '--start', start, '--end', start, '--stock', '--output', output],
    { env: {}, createWarehouse: forbidden, fetchNotes: forbidden, readSheets: forbidden });
  assert.equal(result.status, 'SIMULACAO_OK');
  assert.equal(result.bigquery, 'NAO_VALIDADO');
  const saved = await fs.readFile(path.join(output, `${result.runId}.json`), 'utf8');
  assert.doesNotMatch(saved, /CLIENTE FICTICIO|VENDEDOR TESTE|nota_saida_itens/);
});
test('Sheets mismatch and API failure prevent any BigQuery write', async t => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'bq-test-'));
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  let writes = 0;
  const sheets = grids(); sheets.online[1][5] = 99;
  const dependencies = { env, fetchNotes: async () => fixture.notes, readSheets: async () => sheets,
    createWarehouse: async () => { writes++; throw new Error('should not happen'); } };
  await assert.rejects(run(['--write', '--sheets', '--start', start, '--end', start, '--output', output], dependencies), /divergente/);
  dependencies.fetchNotes = async () => { throw new Error('API indisponível'); };
  await assert.rejects(run(['--write', '--sheets', '--start', start, '--end', start, '--output', output], dependencies), /indisponível/);
  assert.equal(writes, 0);
});
test('failed staging load never reaches publication transaction', async () => {
  const warehouse = new Warehouse(config(env), {}), queries = [];
  warehouse.query = async sql => { queries.push(sql); };
  warehouse.stage = async () => { throw new Error('load failure'); };
  await assert.rejects(warehouse.publish(convert(), { reconciliation: [], updatedAt: stamp }, { runId: 'a'.repeat(32), start, end: start }), /load failure/);
  assert.ok(queries.some(s => s.includes("status='FALHA'")));
  assert.ok(queries.every(s => !s.includes('BEGIN TRANSACTION')));
});
test('ambiguous job submission recovers same job ID without a second insert', async () => {
  let inserts = 0;
  const ids = [];
  const warehouse = new Warehouse(config(env), { jobs: {
    insert: async () => { inserts++; throw new Error('timeout'); },
    get: async r => { ids.push(r.jobId); return { data: { status: { state: 'DONE' } } }; },
  } });
  await warehouse.query('SELECT 1', {}, 'fixed_job_id');
  assert.equal(inserts, 1);
  assert.deepEqual(ids, ['fixed_job_id', 'fixed_job_id']);
});

test('successful publication stages all tables and reconciles server-side totals before commit', async () => {
  const warehouse = new Warehouse(config(env), {}), queries = [], stages = [];
  warehouse.query = async sql => { queries.push(sql); };
  warehouse.stage = async (name, rows) => { stages.push({ name, rows }); };
  warehouse.rows = async () => convert().notas_fiscais;
  const report = { reconciliation: [], updatedAt: stamp };
  await warehouse.publish(convert(), report, { runId: 'a'.repeat(32), start, end: start });
  assert.equal(stages.length, 6);
  assert.equal(stages.at(-1).name, 'conciliacao_cargas');
  assert.ok(report.reconciliation.every(r => r.status === 'OK'));
  assert.match(queries.at(-1), /^BEGIN TRANSACTION;/);
});
test('server-side reconciliation failure does not promote staging', async () => {
  const warehouse = new Warehouse(config(env), {}), queries = [];
  warehouse.query = async sql => { queries.push(sql); };
  warehouse.stage = async () => {};
  warehouse.rows = async () => [];
  await assert.rejects(warehouse.publish(convert(), { reconciliation: [], updatedAt: stamp }, { runId: 'a'.repeat(32), start, end: start }), /diverge/);
  assert.ok(queries.every(s => !s.includes('BEGIN TRANSACTION')));
});
test('a confirmed transaction failure is audited; uncertain commit is not marked failed', async () => {
  for (const jobFailed of [true, false]) {
    const warehouse = new Warehouse(config(env), {}), queries = [];
    warehouse.query = async sql => {
      queries.push(sql);
      if (sql.startsWith('BEGIN TRANSACTION')) throw Object.assign(new Error('publication failure'), { jobFailed, pending: !jobFailed });
    };
    warehouse.stage = async () => {};
    warehouse.rows = async () => convert().notas_fiscais;
    await assert.rejects(warehouse.publish(convert(), { reconciliation: [], updatedAt: stamp }, { runId: 'a'.repeat(32), start, end: start }), /publication failure/);
    assert.equal(queries.some(s => s.includes("status='FALHA'")), jobFailed);
  }
});
