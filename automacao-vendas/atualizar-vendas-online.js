'use strict';
// Substitui a janela reprocessada por empresa. Valor/quantidade e o
// agrupamento por CFOP podem mudar na API; nunca usar esses campos para
// acrescentar uma segunda versão da venda. Mantém as 14 colunas do Power BI.

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const NOME_ABA = 'VendasOnline';
const NOME_ABA_CONTROLE = 'VendasOnlineControle';
const EMPRESAS_MARKETPLACE = { '3': 'CONSTRUBRAG', '4': 'SS CONSTRUCASA' };
const CABECALHO = ['PeriodoInicio', 'PeriodoFim', 'IdVendedor', 'Vendedor', 'Marca', 'Cliente',
  'Empresa', 'Cidade', 'UF', 'Quantidade', 'Canal', 'ValorFaturado', 'DataEmissao', 'ChaveDedup'];

function somarDias(data, dias) {
  const d = new Date(data + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function campoVenda(venda, ...chaves) {
  for (const c of chaves) if (venda[c] !== undefined && venda[c] !== null && venda[c] !== '') return venda[c];
}
function montarLinhas(vendedores, inicio, fim, empresaEsperada) {
  if (!Array.isArray(vendedores)) throw new Error('Retorno de vendedores inválido.');
  const linhas = [];
  let maiorDataEmissao = null;
  for (const v of vendedores) {
    if (!Array.isArray(v.vendas)) throw new Error('Grupo sem lista de vendas.');
    for (const venda of v.vendas) {
      const data = String(campoVenda(venda, 'data de emissão', 'data de emissao', 'Data de Emissão', 'data_emissao') || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data < inicio || data > fim) {
        throw new Error('API sem data de emissão válida no período; nenhuma alteração será gravada.');
      }
      const empresa = String(venda.empresa || '').trim();
      if (empresaEsperada && empresa !== empresaEsperada) throw new Error('API retornou outra empresa: ' + empresa);
      const valor = Number(venda['valor faturado']);
      const quantidade = Number(venda.quantidade);
      if (venda['valor faturado'] == null || venda.quantidade == null ||
          venda['valor faturado'] === '' || venda.quantidade === '' ||
          !Number.isFinite(valor) || !Number.isFinite(quantidade)) throw new Error('Valor/quantidade inválidos na API.');
      const local = String(venda['cidade/uf'] || '');
      const barra = local.lastIndexOf('/');
      const linha = [inicio, fim, String(v.id_vendedor ?? ''), String(v.vendedor ?? '').trim(),
        venda.marca || '', venda.cliente || '', empresa,
        barra < 0 ? local : local.slice(0, barra), barra < 0 ? '' : local.slice(barra + 1),
        quantidade, venda['canal de venda'] || '', valor, data];
      // Coluna mantida por compatibilidade, não usada para eliminar linhas.
      const chave = [empresa, ...linha.slice(2, 6), data, valor, quantidade, linha[10]].join('|');
      linha.push(chave);
      linhas.push({ chave, linha });
      if (!maiorDataEmissao || data > maiorDataEmissao) maiorDataEmissao = data;
    }
  }
  return { linhas, maiorDataEmissao };
}
async function buscarVendasEmpresa(token, idEmpresa, inicio, fim) {
  const resp = await fetch('https://api.sysemp.com.br/163/listarVendasPorVendedor', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Token: token },
    body: JSON.stringify({ id_empresa: idEmpresa, datainicial: inicio, datafinal: fim, offset: '0' }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) throw new Error('Sysemp HTTP ' + resp.status);
  const dados = await resp.json();
  if (!Array.isArray(dados.retorno)) throw new Error('API sem retorno válido.');
  return dados.retorno;
}
function pertence(linha, empresa, inicio, fim) {
  return linha[6] === empresa && linha[12] >= inicio && linha[12] <= fim;
}
function celulas(linha) {
  return { values: linha.map(v => ({ userEnteredValue: typeof v === 'number' ? { numberValue: v } : { stringValue: String(v ?? '') } })) };
}
function requestsSubstituicao(sheetId, existentes, novas, empresa, inicio, fim) {
  const intervalos = [];
  existentes.forEach((linha, i) => {
    if (!pertence(linha, empresa, inicio, fim)) return;
    const indice = i + 1; // Cabeçalho ocupa a primeira linha.
    const ultimo = intervalos[intervalos.length - 1];
    if (ultimo && ultimo.endIndex === indice) ultimo.endIndex++;
    else intervalos.push({ sheetId, dimension: 'ROWS', startIndex: indice, endIndex: indice + 1 });
  });
  return [
    ...intervalos.reverse().map(range => ({ deleteDimension: { range } })),
    ...(novas.length ? [{ appendCells: { sheetId, rows: novas.map(celulas), fields: 'userEnteredValue' } }] : []),
  ];
}
function assinatura(linha) {
  // Período da consulta e chave técnica não mudam a venda.
  return JSON.stringify(linha.slice(2, 13));
}
function mesmasVendas(a, b) {
  if (a.length !== b.length) return false;
  const contagem = new Map();
  for (const l of a) { const k = assinatura(l); contagem.set(k, (contagem.get(k) || 0) + 1); }
  for (const l of b) { const k = assinatura(l); if (!contagem.get(k)) return false; contagem.set(k, contagem.get(k) - 1); }
  return true;
}
function resumo(linhas) {
  return { linhas: linhas.length, valor: Math.round(linhas.reduce((s, l) => s + Number(l[11]), 0) * 100) / 100,
    quantidade: linhas.reduce((s, l) => s + Number(l[9]), 0) };
}
async function main() {
  const { google } = require('googleapis');
  if (!process.env.SYSEMP_TOKEN) throw new Error('SYSEMP_TOKEN não configurado.');
  const chave = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(chave.client_email, null, chave.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  const aba = meta.data.sheets.find(s => s.properties.title === NOME_ABA);
  if (!aba) throw new Error('Aba VendasOnline ausente; interrompido para evitar carga incompleta.');
  const ler = async () => (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A1:N', valueRenderOption: 'UNFORMATTED_VALUE' })).data.values || [];
  let todas = await ler();
  if (JSON.stringify(todas[0]) !== JSON.stringify(CABECALHO)) throw new Error('Cabeçalho inesperado.');
  let existentes = todas.slice(1);
  const controle = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: NOME_ABA_CONTROLE + '!A2:B' });
  const checkpoints = new Map((controle.data.values || []).map(l => [String(l[0]), l[1]]));
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const inicioManual = process.env.REPROCESSAR_DESDE || '';
  if (inicioManual && (!/^\d{4}-\d{2}-\d{2}$/.test(inicioManual) || inicioManual > hoje || inicioManual < '2026-01-01')) throw new Error('REPROCESSAR_DESDE inválido.');
  const planos = [];
  // Valida todas as respostas antes de escrever. Uma falha preserva toda a aba.
  for (const [id, empresa] of Object.entries(EMPRESAS_MARKETPLACE)) {
    const checkpoint = checkpoints.get(id);
    if (!checkpoint) throw new Error('Checkpoint ausente para ' + empresa);
    const inicio = inicioManual || somarDias(checkpoint, -1);
    const vendedores = await buscarVendasEmpresa(process.env.SYSEMP_TOKEN, id, inicio, hoje);
    const { linhas, maiorDataEmissao } = montarLinhas(vendedores, inicio, hoje, empresa);
    const novas = linhas.map(l => l.linha);
    const antigas = existentes.filter(l => pertence(l, empresa, inicio, hoje));
    if (antigas.length && !novas.length) throw new Error('API vazia para período com vendas: ' + empresa);
    console.log(JSON.stringify({ empresa, inicio, fim: hoje, antes: resumo(antigas), api: resumo(novas) }));
    planos.push({ id, empresa, inicio, novas, maiorDataEmissao });
  }
  if (process.env.SO_SIMULAR === '1') { console.log('Simulação: nenhuma alteração.'); return; }
  if (process.env.CRIAR_BACKUP === '1') {
    const nome = 'BackupOnline_' + new Date().toISOString().replace(/[-:.]/g, '');
    // Copiar a aba histórica inteira excede os 10 milhões de células.
    // Preserva exatamente todas as linhas que a transação poderá remover.
    const backup = [CABECALHO, ...existentes.filter(l => planos.some(p => pertence(l, p.empresa, p.inicio, hoje)))];
    let backupId = 1;
    while (meta.data.sheets.some(s => s.properties.sheetId === backupId)) backupId++;
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: {
      requests: [
        { addSheet: { properties: { sheetId: backupId, title: nome, gridProperties: { rowCount: backup.length, columnCount: CABECALHO.length } } } },
        { updateCells: { start: { sheetId: backupId, rowIndex: 0, columnIndex: 0 }, rows: backup.map(celulas), fields: 'userEnteredValue' } },
      ],
    } });
    console.log('Backup criado: ' + nome + ' (' + (backup.length - 1) + ' linhas do período)');
  }
  for (const p of planos) {
    const antigas = existentes.filter(l => pertence(l, p.empresa, p.inicio, hoje));
    if (!mesmasVendas(antigas, p.novas)) {
      const requests = requestsSubstituicao(aba.properties.sheetId, existentes, p.novas, p.empresa, p.inicio, hoje);
      // Delete + append em UMA transação atômica do Sheets. Não repetir
      // automaticamente a mutação se a resposta da rede for incerta.
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } }, { retry: false });
      existentes = (await ler()).slice(1);
      const gravadas = existentes.filter(l => pertence(l, p.empresa, p.inicio, hoje));
      if (!mesmasVendas(gravadas, p.novas)) throw new Error('Verificação após gravação falhou: ' + p.empresa);
    }
    console.log('Conferido via API autenticada do Sheets: ' + p.empresa + ' ' + JSON.stringify(resumo(p.novas)));
    for (const data of [...new Set(p.novas.map(l => l[12]))].sort()) {
      console.log('SHOPEE ' + p.empresa + ' ' + data + ' ' + JSON.stringify(resumo(p.novas.filter(l => l[12] === data && l[10] === 'SHOPEE'))));
    }
    if (p.maiorDataEmissao && p.maiorDataEmissao > checkpoints.get(p.id)) checkpoints.set(p.id, p.maiorDataEmissao);
  }
  await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: NOME_ABA_CONTROLE + '!A1',
    valueInputOption: 'RAW', requestBody: { values: [['IdEmpresa', 'UltimaDataEmissaoProcessada'], ...checkpoints] } });
  console.log('Concluído.');
}
module.exports = { montarLinhas, CABECALHO, resumo };
if (require.main === module) main().catch(err => { console.error('Falhou:', err.message); process.exitCode = 1; });
