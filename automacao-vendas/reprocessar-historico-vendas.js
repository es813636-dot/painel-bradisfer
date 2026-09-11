'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');

const b2b = require('./atualizar-vendas-bradisfer');
const online = require('./atualizar-vendas-online');
const spreadsheetId = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const empresas = { '1': 'BRADISFER DISTRIBUIDORA', '3': 'CONSTRUBRAG', '4': 'SS CONSTRUCASA' };
const abas = { VendasBradisfer: b2b.CABECALHO, VendasOnline: online.CABECALHO };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function windows(start, end) {
  const result = [];
  while (start <= end) {
    const d = new Date(start + 'T00:00:00Z');
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const finish = last < end ? last : end;
    result.push([start, finish]);
    const next = new Date(finish + 'T00:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
    start = next.toISOString().slice(0, 10);
  }
  return result;
}
function validateExisting(name, values, end) {
  if (JSON.stringify(values[0]) !== JSON.stringify(abas[name])) throw new Error('Cabeçalho inesperado: ' + name);
  const allowed = name === 'VendasBradisfer' ? [empresas[1], empresas[3]] : [empresas[3], empresas[4]];
  for (const row of values.slice(1)) {
    if (!allowed.includes(row[6]) || !/^\d{4}-\d{2}-\d{2}$/.test(row[12]) || row[12] > end) {
      throw new Error('Linha existente fora do contrato; preservar e investigar: ' + name);
    }
  }
}
function totals(rows) {
  const result = {};
  for (const r of rows) {
    const k = r[6] + '|' + r[12].slice(0, 7);
    const t = result[k] ||= { linhas: 0, centavos: 0, quantidade: 0 };
    t.linhas++; t.centavos += Math.round(Number(r[11]) * 100); t.quantidade += Number(r[9]);
  }
  return result;
}
function equalRows(a, b) {
  // Sheets may omit trailing empty cells. Compare normalized typed values.
  const normal = rows => rows.map(r => r.map(v => v ?? '').concat()).map(r => {
    while (r.at(-1) === '') r.pop(); return r;
  });
  return digest(normal(a)) === digest(normal(b));
}
async function fetchWindow(id, start, end) {
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch('https://api.sysemp.com.br/163/listarVendasPorVendedor', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Token: process.env.SYSEMP_TOKEN },
        body: JSON.stringify({ id_empresa: id, datainicial: start, datafinal: end, offset: '0' }), signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) throw new Error('Sysemp HTTP ' + r.status);
      const data = await r.json();
      if (data.status !== true || !Array.isArray(data.retorno)) throw new Error('Status/retorno inválidos');
      if (data.has_more === true || data.hasMore === true || data.next_offset != null || data.nextOffset != null) throw new Error('API informou paginação não concluída');
      online.montarLinhas(data.retorno, start, end, empresas[id]); // strict numeric/date/company validation
      if (id !== '4') b2b.validarRetornoVendas(data, id, start, end);
      for (const seller of data.retorno) if (seller.id_vendedor == null || !String(seller.vendedor || '').trim()) throw new Error('Vendedor sem identificação');
      return data.retorno;
    } catch (e) { error = e; await sleep(2000 * (attempt + 1)); }
  }
  throw new Error(`${id} ${start} a ${end}: ${error.message}`);
}
function encryptBackup(plan) {
  const salt = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const secret = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY).private_key;
  const key = crypto.hkdfSync('sha256', Buffer.from(secret), salt, Buffer.from('sales-history-v1'), 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(plan)), cipher.final()]);
  fs.writeFileSync('historico-backup.enc', JSON.stringify({ version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') }));
}
async function main() {
  const { google } = require('googleapis');
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(key.client_email, null, key.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });
  const read = async name => (await sheets.spreadsheets.values.get({ spreadsheetId, range: name + '!A1:' + (name === 'VendasBradisfer' ? 'O' : 'N'), valueRenderOption: 'UNFORMATTED_VALUE' })).data.values || [];
  if (process.argv[2] === 'prepare') {
    const end = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const plan = { generatedAt: new Date().toISOString(), end, before: {}, after: {}, raw: [] };
    let start = '2026-01-01';
    for (const [name, header] of Object.entries(abas)) {
      plan.before[name] = await read(name);
      validateExisting(name, plan.before[name], end);
      for (const row of plan.before[name].slice(1)) if (row[12] < start) start = row[12];
      plan.after[name] = [header];
    }
    plan.start = start;
    for (const [begin, finish] of windows(start, end)) {
      for (const id of Object.keys(empresas)) {
        const raw = await fetchWindow(id, begin, finish);
        plan.raw.push({ id, inicio: begin, fim: finish, retorno: raw });
        const old = Object.values(plan.before).flatMap(rows => rows.slice(1)).filter(r => r[6] === empresas[id] && r[12] >= begin && r[12] <= finish);
        if (old.length && !raw.some(s => s.vendas.length)) throw new Error('Retorno vazio para período com histórico');
        if (id !== '4') plan.after.VendasBradisfer.push(...b2b.montarLinhas(raw, begin, finish, b2b.FONTES.find(f => f.idEmpresa === id).canaisPermitidos).linhas.map(l => l.linha));
        if (id !== '1') plan.after.VendasOnline.push(...online.montarLinhas(raw, begin, finish, empresas[id]).linhas.map(l => l.linha));
        console.log('Validado API: empresa ' + id + ', ' + begin + ' a ' + finish);
      }
    }
    plan.summary = Object.fromEntries(Object.keys(abas).map(name => [name, { antes: totals(plan.before[name].slice(1)), api: totals(plan.after[name].slice(1)) }]));
    fs.writeFileSync('historico-plan.json', JSON.stringify(plan));
    encryptBackup(plan);
    console.log('Preparação completa. Backup criptografado pronto; nenhuma venda alterada.');
    return;
  }
  if (process.argv[2] !== 'apply') throw new Error('Modo deve ser prepare ou apply');
  const plan = JSON.parse(fs.readFileSync('historico-plan.json'));
  for (const name of Object.keys(abas)) if (!equalRows(await read(name), plan.before[name])) throw new Error('Planilha mudou após o backup: ' + name);
  const meta = (await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })).data;
  const write = async (name, values) => {
    const p = meta.sheets.find(s => s.properties.title === name).properties;
    if (p.gridProperties.rowCount < values.length) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId: p.sheetId, gridProperties: { rowCount: values.length } }, fields: 'gridProperties.rowCount' } }] } });
      p.gridProperties.rowCount = values.length;
    }
    for (let i = 0; i < values.length; i += 1500) {
      // Absolute ranges are idempotent, including when a network response is lost.
      await sheets.spreadsheets.values.update({ spreadsheetId, range: name + '!A' + (i + 1), valueInputOption: 'RAW', requestBody: { values: values.slice(i, i + 1500) } });
      await sleep(1200);
    }
    if (p.gridProperties.rowCount > values.length) await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${name}!A${values.length + 1}:${name === 'VendasBradisfer' ? 'O' : 'N'}${p.gridProperties.rowCount}` });
    if (!equalRows(await read(name), values)) throw new Error('Conferência integral falhou: ' + name);
  };
  const changed = [];
  try {
    for (const name of Object.keys(abas)) {
      changed.push(name);
      await write(name, plan.after[name]);
      console.log('Histórico gravado e todas as linhas conferidas: ' + name);
    }
  } catch (error) {
    for (const name of changed.reverse()) { await write(name, plan.before[name]); console.log('Backup restaurado: ' + name); }
    throw error;
  }
  console.log('RESULTADO ' + JSON.stringify(plan.summary));
  console.log(`Histórico completo atualizado: ${plan.start} a ${plan.end}.`);
}
module.exports = { windows, equalRows, validateExisting, totals };
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
