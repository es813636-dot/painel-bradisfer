'use strict';
const { google } = require('googleapis');
const { randomUUID } = require('node:crypto');
const { run } = require('./run');
const { refreshAfterLoad } = require('./powerbi-refresh');
async function scheduled({ env = process.env, load = run, refresh = refreshAfterLoad, storage } = {}) {
  const bucket = env.BQ_CONTROL_BUCKET;
  if (!bucket || !/^[a-z0-9][a-z0-9._-]{2,221}$/.test(bucket)) throw Error('Bucket de controle obrigatório');
  storage ||= google.storage({ version: 'v1', auth: new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }) });
  let generation;
  try {
    const lock = await storage.objects.insert({ bucket, name: 'carga.lock', ifGenerationMatch: '0',
      requestBody: { metadata: { execution: randomUUID(), createdAt: new Date().toISOString() } },
      media: { mimeType: 'text/plain', body: 'locked' } });
    generation = lock.data.generation;
  } catch (error) { if (Number(error.code) === 412) return { status: 'CARGA_EM_ANDAMENTO' }; throw error; }
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const start = new Date(Date.parse(today) - (env.BQ_RECONCILE_DAYS === '7' ? 6 : 1) * 86400000).toISOString().slice(0, 10);
    const report = await load(['--start', start, '--end', today, '--write', '--api-only']);
    const powerbi = await refresh(report, { env });
    console.log(JSON.stringify({ status: report.status, powerbi }));
    return { status: report.status, powerbi };
  } finally { await storage.objects.delete({ bucket, object: 'carga.lock', ifGenerationMatch: generation }); }
}
module.exports = { scheduled };
if (require.main === module) scheduled().catch(() => { console.error('Falha na carga agendada; consultar execução e relatórios de conciliação.'); process.exitCode = 1; });
