'use strict';
const { dates } = require('./transform');
const BASE = 'https://api.sysemp.com.br/163/';
async function post(method, body, token, fetcher = fetch) {
  if (!token) throw new Error('SYSEMP_TOKEN obrigatório para consultar API');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(BASE + method, { method: 'POST', headers: { 'Content-Type': 'application/json', Token: token },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Sysemp HTTP ${response.status}`);
      const data = await response.json();
      if (data.status !== true || !Array.isArray(data.retorno)) throw new Error('Sysemp status/retorno inválidos');
      return data.retorno;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
    }
  }
}
async function pages(method, body, token, request = post) {
  const all = [];
  for (let offset = 0; offset < 100000; offset += 100) {
    const rows = await request(method, { ...body, offset: String(offset) }, token);
    if (!Array.isArray(rows) || rows.length > 100) throw new Error('Tamanho de página inesperado');
    all.push(...rows);
    if (rows.length < 100) return all;
  }
  throw new Error('Limite de paginação atingido; nenhuma carga publicada');
}
async function fetchNotes(start, end, token, request = post) {
  const all = [];
  for (const day of dates(start, end)) for (const company of ['1', '3', '4']) {
    const rows = await pages('listaPedidosNotasSaida', { id_empresa: company, tipoconsulta: 'NF', id_nota_saida: '', datainicial: day, datafinal: day }, token, request);
    if (rows.some(r => String(r.id_empresa) !== company || r.data_emissao !== day)) throw new Error('API retornou nota fora do filtro');
    all.push(...rows);
  }
  return all;
}
const fetchStock = (token, request = post) => pages('listaProdutosComEstoquePrecoVendaCusto', { cod_barra: '' }, token, request);
module.exports = { post, pages, fetchNotes, fetchStock };
