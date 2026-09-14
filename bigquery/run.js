'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parseArgs } = require('node:util');
const { transform, stock, dates, compare } = require('./transform');
const { fetchNotes, fetchStock } = require('./source');
const { config } = require('./schema');
const { createWarehouse } = require('./warehouse');
const { readSheets, reconcileSheets } = require('./sheets');

function options(args) {
  const { values } = parseArgs({ args, strict: true, options: {
    start: { type: 'string' }, end: { type: 'string' }, fixture: { type: 'string' }, output: { type: 'string', default: 'output' },
    write: { type: 'boolean', default: false }, 'allow-empty': { type: 'boolean', default: false },
    stock: { type: 'boolean', default: false }, sheets: { type: 'boolean', default: false },
    'api-only': { type: 'boolean', default: false },
  } });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  values.end ||= today;
  values.start ||= new Date(Date.parse(values.end) - 6 * 86400000).toISOString().slice(0, 10);
  dates(values.start, values.end);
  if (values.write && values.fixture) throw new Error('Fixture nunca pode gravar no BigQuery');
  if (values.sheets && values['api-only']) throw new Error('--sheets e --api-only são modos exclusivos');
  if (values.write && !values.sheets && !values['api-only']) {
    throw new Error('Publicação exige --sheets ou --api-only explícito');
  }
  return values;
}
async function run(args = process.argv.slice(2), dependencies = {}) {
  const opts = options(args), env = dependencies.env || process.env;
  const runId = randomUUID().replaceAll('-', ''), updatedAt = new Date().toISOString();
  const report = { runId, updatedAt, mode: opts.write ? (opts['api-only'] ? 'PRODUCAO_API' : 'PARALELO') : 'SIMULACAO', start: opts.start, end: opts.end,
    status: 'INICIADO', sheets: 'NAO_VALIDADO', bigquery: 'NAO_VALIDADO', reconciliation: [] };
  await fs.mkdir(opts.output, { recursive: true });
  try {
    // Validate destination before consuming the ERP API. Simulation needs no GCP configuration.
    const c = opts.write ? config(env) : null;
    const fixture = opts.fixture ? JSON.parse(await fs.readFile(opts.fixture, 'utf8')) : null;
    const rows = fixture ? fixture.notes : await (dependencies.fetchNotes || fetchNotes)(opts.start, opts.end, env.SYSEMP_TOKEN);
    if (!Array.isArray(rows)) throw new Error('Notas ausentes');
    const data = transform(rows, updatedAt, opts.start, opts.end);
    if (opts.stock) data.fato_estoque_atual = stock(fixture ? fixture.products : await (dependencies.fetchStock || fetchStock)(env.SYSEMP_TOKEN), updatedAt);
    if (opts.write && !opts['allow-empty'] && (data.notas_fiscais.length === 0 || (opts.stock && !data.fato_estoque_atual.length))) {
      throw new Error('Carga vazia bloqueada; conferir origem antes de usar --allow-empty');
    }
    report.counts = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length]));
    const dimensions = ['empresa_id', 'data_emissao', 'canal', 'cfop'];
    report.reconciliation = compare(data.notas_fiscais, data.fato_itens_vendidos.map(r => ({ ...r, total_fiscal: r.valor_faturado })), dimensions, 'total_fiscal', 'API_ITENS');
    if (opts.sheets || fixture?.sheets) {
      const sheetComparison = reconcileSheets(data, fixture?.sheets || await (dependencies.readSheets || readSheets)(env), opts.start, opts.end);
      report.reconciliation.push(...sheetComparison);
      report.sheets = sheetComparison.some(r => r.status !== 'OK') ? 'DIVERGENTE' : 'VALIDADO';
    }
    if (report.reconciliation.some(r => r.status !== 'OK')) throw new Error('Conciliação divergente; publicação bloqueada');
    if (opts.write) {
      const warehouse = await (dependencies.createWarehouse || createWarehouse)(c);
      await warehouse.publish(data, report, { runId, start: opts.start, end: opts.end });
      report.bigquery = 'VALIDADO';
    }
    report.status = opts.write ? 'SUCESSO' : 'SIMULACAO_OK';
    return report;
  } catch (error) {
    report.status = error.pending ? 'PENDENTE_CONFERIR_JOB' : 'FALHA';
    // Do not persist API payloads, customer names, tokens or HTTP response bodies.
    report.error = error.message;
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(opts.output, `${runId}.json`), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ runId, status: report.status, counts: report.counts, sheets: report.sheets, bigquery: report.bigquery }));
  }
}
module.exports = { options, run };
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
