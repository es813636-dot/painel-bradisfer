'use strict';
const fs = require('node:fs');
const { pages } = require('../bigquery/source');
const { prepareData, dateList } = require('../automacao-vendas/atualizar-vendas-notas-itens');
const VENDEDORES = [
  ['JOAO VICTOR GREGORIO RICARDO', 'João Gregório'],
  ['GUILHERME PERES DOS SANTOS', 'Guilherme Santos'],
  ['ALEXANDRE MARIO BERNARDINI', 'Alexandre Mario'],
  ['CRISTINA FABRI', 'Cristina Fabri'],
];
const normal = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
function centavos(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw Error('Valor obrigatório inválido na origem');
  const valueCents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(valueCents)) throw Error('Valor fora da precisão monetária');
  return valueCents;
}
function periodo(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw Error('Mês inválido; use AAAA-MM');
  const [year, number] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  const previous = new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7);
  return { month, start: month + '-01', end, previous };
}
function csv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (char === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) throw Error('CSV incompleto');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
function lerMetas(text, month) {
  const rows = csv(text); const header = rows.shift() || [];
  const index = ['Vendedor', 'Marca', 'AnoMes', 'MetaValor'].map(name => header.indexOf(name));
  if (index.some(i => i < 0)) throw Error('Cabeçalhos da aba Meta_Marca inválidos');
  const metas = new Map();
  for (const row of rows) {
    if (row[index[2]] !== month) continue;
    const seller = normal(row[index[0]]);
    metas.set(seller, (metas.get(seller) || 0) + centavos(row[index[3]]));
  }
  for (const [seller] of VENDEDORES) if (!metas.has(seller) || metas.get(seller) <= 0) throw Error('Meta mensal ausente para um dos quatro vendedores');
  return metas;
}
async function consultar(month, token) {
  const p = periodo(month), raw = [];
  // Duas consultas simultâneas, uma por empresa, sem alterar o banco ou a planilha.
  for (const day of dateList(p.start, p.end)) {
    const results = await Promise.all(['1', '3'].map(async company => {
      const rows = await pages('listaPedidosNotasSaida', { id_empresa: company, tipoconsulta: 'NF', id_nota_saida: '', datainicial: day, datafinal: day }, token);
      if (rows.some(r => String(r.id_empresa) !== company || r.data_emissao !== day)) throw Error('API retornou notas fora do filtro');
      return rows;
    }));
    raw.push(...results.flat());
  }
  return selecionar(raw);
}
function selecionar(raw) {
  const prepared = prepareData(raw, new Date().toISOString(), 'b2b');
  return [...prepared.notes.values()].map(n => ({ ...n, gross: centavos(n.row[20]) }));
}
function indicadores(current, previous, metas) {
  return VENDEDORES.map(([name, label]) => {
    const notes = current.filter(n => normal(n.seller) === name);
    const prior = previous.filter(n => normal(n.seller) === name);
    if (notes.some(n => !n.orderId || !n.clientId)) throw Error('Pedido ou cliente sem identificação; relatório não gerado');
    const sum = list => list.reduce((s, n) => s + n.gross, 0);
    return { name, label, value: sum(notes), previous: sum(prior), meta: metas.get(name),
      sales: new Set(notes.map(n => n.companyId + '|' + n.orderId)).size,
      clients: new Set(notes.map(n => n.clientId)).size,
      weeks: [1, 2, 3, 4, 5].map(w => sum(notes.filter(n => Math.ceil(Number(n.emissionDate.slice(-2)) / 7) === w))) };
  });
}
const money = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
const percent = n => Number.isFinite(n) ? n.toFixed(2).replace('.', ',') + '%' : 'Sem base de comparação';
const table = (heads, rows) => [heads.join(' | '), heads.map(() => '---').join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
function montar(month, team) {
  const p = periodo(month), slides = [], add = (t, b) => slides.push('# ' + t + '\n\n' + b);
  const total = field => team.reduce((s, v) => s + v[field], 0);
  const ratio = (value, base) => base ? percent(value / base * 100) : 'Sem base de comparação';
  const variation = s => s.previous ? percent((s.value / s.previous - 1) * 100) : 'Sem vendas no mês anterior';
  const historical = month < '2026-09' ? 'As metas anteriores a setembro de 2026 foram replicadas da referência de setembro, conforme informado pela gestão. Validar a meta histórica antes de avaliação oficial.' : 'Metas correspondem à soma vendedor/marca cadastrada na planilha para o mês consultado.';
  add('Reunião de Indicadores de Vendas', `Análise dos resultados — ${month}\nBradisfer e Construbrag · B2B · ${p.start} a ${p.end}\nJoão Gregório, Guilherme Santos, Alexandre Mario e Cristina Fabri`);
  add('Panorama Geral do Time', `Meta: ${money(total('meta'))}\nRealizado: ${money(total('value'))}\nAtingimento: ${ratio(total('value'), total('meta'))}\nVendas: ${total('sales')} · Ticket: ${total('sales') ? money(total('value') / total('sales')) : 'Sem vendas'}\nMês anterior (${p.previous}): ${money(total('previous'))}\n${historical}`);
  add('Comparativo dos 4 Vendedores', table(['Vendedor', 'Meta', 'Realizado', '% Meta', 'Vendas', 'Ticket'], team.map(s => [s.label, money(s.meta), money(s.value), ratio(s.value, s.meta), s.sales, s.sales ? money(s.value / s.sales) : 'Sem vendas'])));
  for (const s of team) {
    add('Análise Individual — ' + s.label, `Meta: ${money(s.meta)}\nRealizado: ${money(s.value)}\nAtingimento: ${ratio(s.value, s.meta)}\nGap (meta menos realizado): ${money(s.meta - s.value)}\n${s.sales} vendas · ${s.clients} clientes · Ticket: ${s.sales ? money(s.value / s.sales) : 'Sem vendas'}\nMês anterior: ${money(s.previous)} · Variação: ${variation(s)}\n\nEvolução no mês\n${table(['Dias do mês', 'Realizado'], s.weeks.map((v, i) => [`${i * 7 + 1}–${Math.min(i * 7 + 7, Number(p.end.slice(-2)))}`, money(v)]).filter((_, i) => i * 7 + 1 <= Number(p.end.slice(-2))))}\nO último bloco pode ter menos de sete dias. ${historical}`);
  }
  add('Análise Comparativa de Evolução', table(['Vendedor', p.previous, month, 'Variação'], team.map(s => [s.label, money(s.previous), money(s.value), variation(s)])));
  add('Diagnóstico Coletivo', `Comparar volume, ticket e clientes atendidos de cada vendedor. Maior realizado do grupo: ${[...team].sort((a, b) => b.value - a.value)[0].label}. Os dados não demonstram a causa das variações. Usar os indicadores como ponto de partida para a conversa com cada vendedor.`);
  add('Decisões e Próximos Passos', team.map(s => `${s.label}: propor acompanhamento semanal de volume, ticket e clientes. Registrar responsável, prazo e resultado esperado na reunião.`).join('\n\n') + '\n\nGestão: validar metas históricas. Estas são propostas, não decisões já aprovadas.');
  add('Encerramento', `Realizado: ${money(total('value'))}\nAtingimento: ${ratio(total('value'), total('meta'))}\n${total('sales')} vendas. Revisar os resultados das ações na próxima reunião.`);
  add('Observação sobre Completude dos Dados', `Fonte: SYSEMP listaPedidosNotasSaida, consulta direta; Meta_Marca da planilha usada no Power BI. Empresas 1 e 3; canais Aplicativo, Mobwit, Site e Vendas Interna; operações de venda elegíveis da integração; Marcus excluído. Somente os quatro vendedores indicados entram nos totais.\nRealizado = total_produtos; não confirma recebimento financeiro. Vendas = pedidos distintos por empresa e vendedor; cliente = ID distinto por vendedor. Ticket = realizado/vendas.\n${historical}\nNão há dados de leads, propostas ou conversão. Não inventar indicadores, margens ou causas. Consulta realizada em ${new Date().toISOString()}.`);
  return slides.join('\n\n---\n\n');
}
async function executar() {
  const nowMonth = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date());
  const month = process.env.REPORT_MONTH || periodo(nowMonth).previous;
  const p = periodo(month);
  if (month >= nowMonth) throw Error('Somente meses encerrados podem ser gerados');
  const token = process.env.SYSEMP_TOKEN;
  if (!token) throw Error('SYSEMP_TOKEN ausente');
  const response = await fetch('https://docs.google.com/spreadsheets/d/1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A/gviz/tq?tqx=out:csv&sheet=Meta_Marca', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Não foi possível consultar Meta_Marca');
  const metas = lerMetas(await response.text(), month);
  const current = await consultar(month, token), previous = await consultar(p.previous, token);
  const input = montar(month, indicadores(current, previous, metas));
  const dir = process.env.RUNNER_TEMP || 'gamma/local'; fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dir + '/gamma-input.md', input);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `month=${month}\n`);
  console.log('Dados dos quatro vendedores conferidos; conteúdo preparado sem publicar os valores nos logs.');
}
module.exports = { periodo, csv, lerMetas, selecionar, indicadores, montar, centavos };
if (require.main === module) executar().catch(() => { console.error('Falha ao preparar os dados. Confira metas do mês, filtros e disponibilidade da API. Nenhuma apresentação foi gerada.'); process.exitCode = 1; });
