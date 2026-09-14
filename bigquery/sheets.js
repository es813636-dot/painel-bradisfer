'use strict';
const { compare } = require('./transform');
const fiscal = require('../automacao-vendas/atualizar-vendas-notas-itens');
function gridRows(values, header, start, end, key) {
  if (!values.length || JSON.stringify(values[0]) !== JSON.stringify(header)) throw new Error('Cabeçalho Sheets incompatível com versão fiscal');
  const rows = values.slice(1).filter(row => row.some(v => v !== '')).map(row => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])));
  const selected = rows.filter(row => row.DataEmissao >= start && row.DataEmissao <= end);
  const keys = new Set();
  for (const row of selected) {
    if (!row[key] || keys.has(row[key])) throw new Error('Chave Sheets ausente/duplicada');
    keys.add(row[key]);
  }
  return selected;
}
function reconcileSheets(data, grids, start, end) {
  const b2b = gridRows(grids.b2b, fiscal.B2B_SUMMARY_HEADER, start, end, 'ChaveResumo');
  const online = gridRows(grids.online, fiscal.ONLINE_SUMMARY_HEADER, start, end, 'ChaveResumo');
  const normalize = row => ({ empresa_id: String(row.EmpresaId), data_emissao: row.DataEmissao, canal: row.Canal, total_fiscal: row.Faturamento });
  return [
    ...compare(data.fato_vendas_resumo.filter(r => r.segmento === 'b2b').map(r => ({ ...r, total_fiscal: r.faturamento })), b2b.map(normalize), ['empresa_id', 'data_emissao', 'canal'], 'total_fiscal', 'SHEETS_B2B'),
    ...compare(data.notas_fiscais.filter(r => r.segmento === 'online'), online.map(normalize), ['empresa_id', 'data_emissao', 'canal'], 'total_fiscal', 'SHEETS_ONLINE'),
  ];
}
async function readSheets(env = process.env) {
  if (!env.BQ_SHEETS_ID) throw new Error('BQ_SHEETS_ID obrigatório');
  const { google } = require('googleapis');
  // Explicitly isolated from the legacy Sheets writer key. ADC identity must be a sheet Viewer.
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    ...(env.BQ_SHEETS_READER_KEY ? { credentials: JSON.parse(env.BQ_SHEETS_READER_KEY) } : {}) });
  const api = google.sheets({ version: 'v4', auth });
  const { data } = await api.spreadsheets.values.batchGet({ spreadsheetId: env.BQ_SHEETS_ID,
    ranges: ['VendasBradisfer!A:Q', 'VendasOnline_Resumo!A:L'], valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
  return { b2b: data.valueRanges[0].values || [], online: data.valueRanges[1].values || [] };
}
module.exports = { gridRows, reconcileSheets, readSheets };
