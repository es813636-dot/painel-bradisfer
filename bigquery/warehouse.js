'use strict';
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { tables, ref } = require('./schema');
const { compare } = require('./transform');
const columns = name => tables[name].fields.map(f => `\`${f.name}\``).join(', ');
const stageRef = (c, name, runId) => `\`${c.project}.${c.staging}.${name}_${runId}\``;
const windowFilter = alias => `${alias}.data_emissao BETWEEN @start AND @end`;

function publicationSQL(c, data, runId) {
  if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('ID de execução inválido');
  const sql = ['BEGIN TRANSACTION;'];
  // A date correction across the requested boundary needs a wider window. Otherwise
  // removed products/brands could survive under the old date outside the replacement.
  sql.push(`ASSERT NOT EXISTS(SELECT 1 FROM ${ref(c, 'raw_notas_saida')} T
    JOIN ${stageRef(c, 'raw_notas_saida', runId)} S USING(chave)
    WHERE T.data_emissao != S.data_emissao AND NOT (${windowFilter('T')}))
    AS 'Nota mudou de data fora da janela; ampliar o período e reprocessar';`);
  for (const name of Object.keys(data)) {
    if (!tables[name] || !tables[name].fields.some(f => f.name === 'chave')) throw new Error('Tabela de publicação inválida');
    const stage = stageRef(c, name, runId), target = ref(c, name), cols = columns(name);
    sql.push(`ASSERT (SELECT COUNT(*) = COUNT(DISTINCT chave) FROM ${stage}) AS 'Chaves duplicadas no staging';`);
    if (tables[name].partition) sql.push(`ASSERT NOT EXISTS(SELECT 1 FROM ${stage} S WHERE NOT (${windowFilter('S')})) AS 'Janela inválida';`);
    // Match by key; the boundary check above prevents writes outside the window.
    sql.push(`MERGE ${target} T USING ${stage} S ON T.chave = S.chave
      WHEN MATCHED THEN UPDATE SET ${tables[name].fields.filter(f => f.name !== 'chave').map(f => `${f.name} = S.${f.name}`).join(', ')}
      WHEN NOT MATCHED THEN INSERT (${cols}) VALUES (${tables[name].fields.map(f => `S.${f.name}`).join(', ')})
      WHEN NOT MATCHED BY SOURCE${tables[name].partition ? ` AND ${windowFilter('T')}` : ''} THEN DELETE;`);
    const where = tables[name].partition ? ' WHERE data_emissao BETWEEN @start AND @end' : '';
    sql.push(`ASSERT (SELECT COUNT(*) FROM ${target}${where}) = ${data[name].length} AS 'Contagem divergente';`);
    sql.push(`ASSERT NOT EXISTS(SELECT ${cols} FROM ${stage} EXCEPT DISTINCT SELECT ${cols} FROM ${target}${where}) AS 'Conteúdo divergente';`);
    sql.push(`ASSERT (SELECT COUNT(*) = COUNT(DISTINCT chave) FROM ${target}) AS 'Chaves duplicadas no destino';`);
  }
  const fiscal = ref(c, 'notas_fiscais'), items = ref(c, 'fato_itens_vendidos'), summary = ref(c, 'fato_vendas_resumo');
  for (const [target, measure] of [[items, 'valor_faturado'], [summary, 'faturamento']]) {
    sql.push(`ASSERT NOT EXISTS (
      WITH a AS (SELECT empresa_id, data_emissao, canal, cfop, SUM(total_fiscal) valor FROM ${fiscal}
        WHERE data_emissao BETWEEN @start AND @end GROUP BY 1,2,3,4),
      b AS (SELECT empresa_id, data_emissao, canal, cfop, SUM(${measure}) valor FROM ${target}
        WHERE data_emissao BETWEEN @start AND @end GROUP BY 1,2,3,4)
      SELECT 1 FROM a FULL JOIN b USING(empresa_id,data_emissao,canal,cfop)
      WHERE ABS(COALESCE(a.valor,0)-COALESCE(b.valor,0)) > 0.01
    ) AS 'Conciliação fiscal por empresa/data/canal/CFOP falhou';`);
  }
  sql.push(`INSERT INTO ${ref(c, 'conciliacao_cargas')} SELECT * FROM ${stageRef(c, 'conciliacao_cargas', runId)};`);
  sql.push(`UPDATE ${ref(c, 'etl_execucoes')} SET status='SUCESSO', fim=CURRENT_TIMESTAMP(), linhas=@rows WHERE execucao_id=@runId;`);
  sql.push('COMMIT TRANSACTION;');
  return sql.join('\n');
}

function parameters(values) {
  return Object.entries(values).map(([name, value]) => ({ name, parameterType: { type:
    ['start', 'end'].includes(name) ? 'DATE' : typeof value === 'number' ? 'INT64' : 'STRING' }, parameterValue: { value: String(value) } }));
}
class Warehouse {
  constructor(c, api) { this.c = c; this.api = api; }
  async job(configuration, media, jobId = `bradisfer_${randomUUID().replaceAll('-', '')}`) {
    const reference = { projectId: this.c.project, location: this.c.location, jobId };
    // On an ambiguous submission, recover this exact ID; never submit a second mutation.
    try {
      await this.api.jobs.insert({ projectId: this.c.project, requestBody: { jobReference: reference, configuration }, ...(media ? { media } : {}) });
    } catch (error) {
      try { await this.api.jobs.get(reference); } catch {
        throw Object.assign(new Error(`Submissão não confirmada: consultar BigQuery job ${jobId}`), { pending: true });
      }
    }
    const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      let data;
      try { ({ data } = await this.api.jobs.get(reference)); } catch {
        throw Object.assign(new Error(`Consulta de status interrompida: conferir BigQuery job ${jobId}`), { pending: true });
      }
      if (data.status.state === 'DONE') {
        if (data.status.errorResult) throw Object.assign(new Error(`BigQuery job ${jobId}: ${data.status.errorResult.reason}`), { jobFailed: true });
        return reference;
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    throw Object.assign(new Error(`Resultado pendente: consultar BigQuery job ${jobId} antes de reexecutar`), { pending: true });
  }
  async query(sql, values = {}, jobId) {
    return this.job({ query: { query: sql, useLegacySql: false, parameterMode: 'NAMED', queryParameters: parameters(values),
      maximumBytesBilled: this.c.maximumBytesBilled } }, undefined, jobId);
  }
  async rows(sql, values) {
    const job = await this.query(sql, values);
    const rows = [];
    let pageToken;
    do {
      const { data } = await this.api.jobs.getQueryResults({ ...job, pageToken, maxResults: 10000 });
      if (!data.jobComplete) throw new Error('Consulta incompleta');
      for (const row of data.rows || []) rows.push(Object.fromEntries(data.schema.fields.map((f, index) => [f.name, row.f[index].v])));
      pageToken = data.pageToken;
    } while (pageToken);
    return rows;
  }
  async stage(name, rows, runId) {
    const tableId = `${name}_${runId}`;
    await this.api.tables.insert({ projectId: this.c.project, datasetId: this.c.staging, requestBody: {
      tableReference: { projectId: this.c.project, datasetId: this.c.staging, tableId },
      schema: { fields: tables[name].fields }, expirationTime: String(Date.now() + 24 * 3600000),
    } });
    if (!rows.length) return;
    await this.job({ load: { destinationTable: { projectId: this.c.project, datasetId: this.c.staging, tableId },
      sourceFormat: 'NEWLINE_DELIMITED_JSON', writeDisposition: 'WRITE_EMPTY', createDisposition: 'CREATE_NEVER',
      schema: { fields: tables[name].fields }, maxBadRecords: 0, ignoreUnknownValues: false } },
    { mimeType: 'application/octet-stream', body: Readable.from(rows.map(row => JSON.stringify(row) + '\n')) });
  }
  async publish(data, report, context) {
    const { runId, start, end } = context;
    const values = { runId, start, end, rows: Object.values(data).reduce((sum, rows) => sum + rows.length, 0) };
    await this.query(`INSERT INTO ${ref(this.c, 'etl_execucoes')}
      (execucao_id,inicio,data_inicio,data_fim,status) VALUES(@runId,CURRENT_TIMESTAMP(),@start,@end,'INICIADO')`, { runId, start, end });
    let publicationStarted = false;
    try {
      for (const [name, rows] of Object.entries(data)) await this.stage(name, rows, runId);
      // Read staging back from BigQuery, with server-side sums and counts, before promotion.
      const observed = await this.rows(`SELECT empresa_id,data_emissao,canal,cfop,SUM(total_fiscal) total_fiscal
        FROM ${stageRef(this.c, 'notas_fiscais', runId)} GROUP BY 1,2,3,4`);
      const reconciliation = compare(data.notas_fiscais, observed, ['empresa_id', 'data_emissao', 'canal', 'cfop'], 'total_fiscal', 'BIGQUERY_API');
      if (reconciliation.some(r => r.status !== 'OK')) throw new Error('Staging BigQuery diverge da API');
      report.reconciliation.push(...reconciliation);
      await this.stage('conciliacao_cargas', report.reconciliation.map(r => ({ ...r, execucao_id: runId, atualizado_em: report.updatedAt })), runId);
      publicationStarted = true;
      await this.query(publicationSQL(this.c, data, runId), values, `bradisfer_publish_${runId}`);
    } catch (error) {
      // An uncertain publication may still commit. Never mark it failed or compensate blindly.
      if (!publicationStarted || error.jobFailed) await this.query(`UPDATE ${ref(this.c, 'etl_execucoes')}
        SET status='FALHA',fim=CURRENT_TIMESTAMP(),erro='Falha confirmada; consultar relatório local e jobs da execução'
        WHERE execucao_id=@runId`, { runId }).catch(() => {});
      throw error;
    }
  }
}
async function createWarehouse(c) {
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  return new Warehouse(c, google.bigquery({ version: 'v2', auth }));
}
module.exports = { Warehouse, createWarehouse, publicationSQL, parameters, stageRef };
