'use strict';
const day = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
function decision(history, now, maxDaily = 8, intervalMinutes = 120) {
  if (!Array.isArray(history)) throw Error('Histórico Power BI inválido');
  if (history.some(r => !r.endTime && r.status === 'Unknown')) return 'EM_ANDAMENTO';
  const today = history.filter(r => day(new Date(r.startTime)) === day(now));
  if (today.length >= maxDaily) return 'LIMITE_DIARIO';
  if (today.some(r => now - new Date(r.startTime) < intervalMinutes * 60000)) return 'INTERVALO_MINIMO';
  return 'ATUALIZAR';
}
async function refreshAfterLoad(report, { env = process.env, fetcher = fetch, now = new Date() } = {}) {
  if (report.status !== 'SUCESSO' || report.bigquery !== 'VALIDADO') throw Error('Atualização Power BI exige carga validada');
  if (env.PBI_REFRESH_ENABLED !== 'true') return { status: 'DESATIVADO' };
  const guid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (!guid.test(env.PBI_DATASET_ID || '') || !guid.test(env.PBI_CLIENT_ID || '') || !guid.test(env.PBI_TENANT_ID || '') || !env.PBI_REFRESH_TOKEN) throw Error('Configuração OAuth Power BI incompleta');
  const maxDaily = Number(env.PBI_MAX_DAILY || 8), interval = Number(env.PBI_INTERVAL_MINUTES || 120);
  if (!Number.isInteger(maxDaily) || maxDaily < 1 || maxDaily > 8 || !Number.isInteger(interval) || interval < 120) throw Error('Política Power BI inválida; confirmar capacidade antes de aumentar limites');
  const auth = await fetcher(`https://login.microsoftonline.com/${env.PBI_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', body: new URLSearchParams({ client_id: env.PBI_CLIENT_ID, grant_type: 'refresh_token', refresh_token: env.PBI_REFRESH_TOKEN,
      scope: 'https://analysis.windows.net/powerbi/api/Dataset.ReadWrite.All offline_access' }), signal: AbortSignal.timeout(30000)
  });
  if (!auth.ok) throw Error(`OAuth Power BI HTTP ${auth.status}; refazer autorização`);
  const token = await auth.json();
  if (!token.access_token) throw Error('OAuth Power BI sem token de acesso');
  // Rotation must be persisted by the operator before enabling unattended execution.
  if (token.refresh_token && token.refresh_token !== env.PBI_REFRESH_TOKEN) {
    if (!env.PBI_TOKEN_SECRET) throw Error('Rotação OAuth exige Secret Manager');
    const { google } = require('googleapis');
    const client = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const secret = google.secretmanager({ version: 'v1', auth: client });
    await secret.projects.secrets.addVersion({ parent: env.PBI_TOKEN_SECRET, requestBody: { payload: { data: Buffer.from(token.refresh_token).toString('base64') } } });
  }
  const url = `https://api.powerbi.com/v1.0/myorg/datasets/${env.PBI_DATASET_ID}/refreshes`;
  const headers = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' };
  const response = await fetcher(url + '?$top=60', { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Histórico Power BI HTTP ${response.status}`);
  const status = decision((await response.json()).value, now, maxDaily, interval);
  if (status !== 'ATUALIZAR') return { status };
  // Never retry an ambiguous POST: next execution checks the authoritative history.
  const result = await fetcher(url, { method: 'POST', headers, body: JSON.stringify({ notifyOption: 'MailOnFailure' }), signal: AbortSignal.timeout(30000) });
  if (result.status !== 202) throw Error(`Atualização Power BI HTTP ${result.status}`);
  return { status: 'SOLICITADO', requestId: result.headers.get('x-ms-request-id') };
}
module.exports = { decision, refreshAfterLoad };
