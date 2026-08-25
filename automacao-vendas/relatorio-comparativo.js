// ----------------------------------------------------------------------
// Relatorio pontual (nao roda automaticamente) -- compara vendas de
// julho x agosto/2026 pras marcas PYRAMID, LINHAL e SV METAIS.
//
// Busca o catalogo (codigo de barras -> marca/custo) e as vendas de
// cada mes via API da Sysemp, cruza por codigo de barras, soma por
// marca e grava o resultado numa aba nova da planilha ("Relatorio
// Comparativo"). Agosto e parcial (so ate ontem, mesma convencao do
// atualizar-vendas.js) -- por isso o relatorio traz tambem a media
// diaria, pra comparar de forma justa com julho (mes completo).
//
// Rodar manualmente via GitHub Actions (workflow_dispatch) ou local
// com SYSEMP_TOKEN e GOOGLE_SERVICE_ACCOUNT_KEY no ambiente.
// ----------------------------------------------------------------------

const { google } = require('googleapis');

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const NOME_ABA_RELATORIO = 'Relatorio Comparativo';
const URL_VENDAS_MEDIA = 'https://api.sysemp.com.br/163/listarVendasMediaPorProduto';
const URL_PRODUTOS = 'https://api.sysemp.com.br/163/listaProdutosComEstoquePrecoVendaCusto';
const LIMITE_POR_PAGINA_PRODUTOS = 100;
const PAGINAS_EM_PARALELO = 8;

const MARCAS_ALVO = ['PYRAMID', 'LINHAL', 'SV METAIS'];

function normalizarMarca(m) {
  return String(m || '').trim().toUpperCase();
}

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const campo = (item, ...chaves) => {
  for (const c of chaves) if (item[c] !== undefined && item[c] !== null && item[c] !== '') return item[c];
  return undefined;
};

// ---- catalogo (codigo de barras -> marca/custo) ----
async function buscarPaginaProdutos(token, offset) {
  const resp = await fetch(URL_PRODUTOS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: token },
    body: JSON.stringify({ offset: String(offset) }),
  });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '(sem corpo)');
    throw new Error('HTTP ' + resp.status + ' (produtos) no offset ' + offset + ' — resposta: ' + corpo);
  }
  return resp.json();
}

async function buscarCatalogo(token) {
  let offset = 0;
  let todos = [];
  let acabou = false;

  while (!acabou) {
    const offsetsDaOnda = [];
    for (let i = 0; i < PAGINAS_EM_PARALELO; i++) offsetsDaOnda.push(offset + i * LIMITE_POR_PAGINA_PRODUTOS);
    const respostas = await Promise.all(offsetsDaOnda.map((o) => buscarPaginaProdutos(token, o)));

    for (const resposta of respostas) {
      const registros = resposta.retorno || resposta.data || [];
      if (registros.length === 0) { acabou = true; break; }
      todos = todos.concat(registros);
      if (registros.length < LIMITE_POR_PAGINA_PRODUTOS) { acabou = true; break; }
    }
    offset += PAGINAS_EM_PARALELO * LIMITE_POR_PAGINA_PRODUTOS;
    if (!acabou) await dormir(300);
  }

  const mapa = new Map(); // codBarra -> { marca, precoVenda }
  todos.forEach((item) => {
    const codBarra = String(item.cod_barra || '').trim();
    if (!codBarra) return;
    mapa.set(codBarra, {
      marca: normalizarMarca(item.descricao_marca),
      precoVenda: parseFloat(campo(item, 'preço_venda', 'preco_venda')) || 0,
    });
  });
  console.log('Catalogo: ' + mapa.size + ' produtos com codigo de barras.');

  // Aviso se alguma marca-alvo nao aparecer no catalogo -- pode ser
  // nome escrito diferente na Sysemp (ex. com sufixo/abreviacao).
  MARCAS_ALVO.forEach((marca) => {
    const qtdProdutos = [...mapa.values()].filter((v) => v.marca === marca).length;
    console.log('  marca "' + marca + '": ' + qtdProdutos + ' produtos no catalogo.');
    if (qtdProdutos === 0) console.log('  AVISO: nenhum produto encontrado com essa marca -- conferir o nome exato na Sysemp.');
  });

  return mapa;
}

// ---- vendas de um periodo ----
async function buscarPaginaVendas(token, offset, datainicial, datafinal) {
  const resp = await fetch(URL_VENDAS_MEDIA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: token },
    body: JSON.stringify({ cod_barra: '', datainicial, datafinal, offset: String(offset) }),
  });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '(sem corpo)');
    throw new Error('HTTP ' + resp.status + ' (vendas ' + datainicial + '-' + datafinal + ') no offset ' + offset + ' — resposta: ' + corpo);
  }
  const dados = await resp.json();
  return dados.retorno || [];
}

async function buscarVendasPeriodo(token, datainicial, datafinal) {
  let todos = [];
  const primeira = await buscarPaginaVendas(token, 0, datainicial, datafinal);
  console.log('  offset 0: ' + primeira.length + ' registros');
  if (primeira.length === 0) return todos;
  todos = todos.concat(primeira);
  const tamanhoPagina = primeira.length;
  let offset = tamanhoPagina;
  let acabou = false;

  while (!acabou) {
    const offsetsDaOnda = [];
    for (let i = 0; i < PAGINAS_EM_PARALELO; i++) offsetsDaOnda.push(offset + i * tamanhoPagina);
    const paginas = await Promise.all(offsetsDaOnda.map((o) => buscarPaginaVendas(token, o, datainicial, datafinal)));

    for (let i = 0; i < paginas.length; i++) {
      const pagina = paginas[i];
      console.log('  offset ' + offsetsDaOnda[i] + ': ' + pagina.length + ' registros');
      if (pagina.length === 0) { acabou = true; break; }
      todos = todos.concat(pagina);
      if (pagina.length < tamanhoPagina) { acabou = true; break; }
    }
    offset += PAGINAS_EM_PARALELO * tamanhoPagina;
    if (!acabou) await dormir(300);
  }

  return todos;
}

// Soma quantidade/faturamento vendido por marca-alvo, cruzando as vendas
// do periodo com o catalogo (codigo de barras -> marca/preco de venda).
function somarPorMarca(vendas, catalogo) {
  const somas = new Map(MARCAS_ALVO.map((m) => [m, { qtd: 0, valor: 0 }]));
  vendas.forEach((item) => {
    const codBarra = String(campo(item, 'Codigo barras', 'Código Barras') || '').trim();
    if (!codBarra) return;
    const info = catalogo.get(codBarra);
    if (!info || !somas.has(info.marca)) return;
    const qtd = parseFloat(campo(item, 'Total vendido', 'Total Vendido')) || 0;
    const acc = somas.get(info.marca);
    acc.qtd += qtd;
    acc.valor += qtd * info.precoVenda;
  });
  return somas;
}

async function garantirAbaRelatorio(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  const existe = meta.data.sheets.some((s) => s.properties.title === NOME_ABA_RELATORIO);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { requests: [{ addSheet: { properties: { title: NOME_ABA_RELATORIO } } }] },
    });
    console.log('Aba "' + NOME_ABA_RELATORIO + '" criada.');
  }
}

async function main() {
  const sysempToken = process.env.SYSEMP_TOKEN;
  if (!sysempToken) throw new Error('SYSEMP_TOKEN não configurado.');
  const chaveServico = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(chaveServico.client_email, null, chaveServico.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('Buscando catalogo (codigo de barras -> marca/custo)...');
  const catalogo = await buscarCatalogo(sysempToken);

  // Julho: mes completo. Agosto: parcial, ate ontem (mesma convencao do
  // atualizar-vendas.js -- hoje ainda esta sendo fechado na Sysemp).
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const fmtBR = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();

  const julhoIni = '01/07/2026';
  const julhoFim = '31/07/2026';
  const agostoIni = '01/08/2026';
  const agostoFim = fmtBR(ontem);
  const diasAgosto = ontem.getMonth() === 7 ? ontem.getDate() : 31; // se "ontem" ainda cair em agosto

  console.log('Buscando vendas de julho (' + julhoIni + ' a ' + julhoFim + ')...');
  const vendasJulho = await buscarVendasPeriodo(sysempToken, julhoIni, julhoFim);
  console.log('Total julho: ' + vendasJulho.length + ' produtos com venda.');

  console.log('Buscando vendas de agosto (' + agostoIni + ' a ' + agostoFim + ')...');
  const vendasAgosto = await buscarVendasPeriodo(sysempToken, agostoIni, agostoFim);
  console.log('Total agosto (parcial): ' + vendasAgosto.length + ' produtos com venda.');

  const somaJulho = somarPorMarca(vendasJulho, catalogo);
  const somaAgosto = somarPorMarca(vendasAgosto, catalogo);

  const linhas = [
    ['Marca', 'Qtd Julho (31 dias)', 'Faturamento Julho', 'Média diária Julho',
     'Qtd Agosto (' + diasAgosto + ' dias, parcial)', 'Faturamento Agosto', 'Média diária Agosto',
     'Variação média diária'],
  ];

  MARCAS_ALVO.forEach((marca) => {
    const j = somaJulho.get(marca);
    const a = somaAgosto.get(marca);
    const mediaJulho = j.qtd / 31;
    const mediaAgosto = a.qtd / diasAgosto;
    const variacao = mediaJulho > 0 ? ((mediaAgosto - mediaJulho) / mediaJulho) * 100 : (mediaAgosto > 0 ? 100 : 0);
    linhas.push([
      marca,
      Math.round(j.qtd * 100) / 100,
      Math.round(j.valor * 100) / 100,
      Math.round(mediaJulho * 100) / 100,
      Math.round(a.qtd * 100) / 100,
      Math.round(a.valor * 100) / 100,
      Math.round(mediaAgosto * 100) / 100,
      Math.round(variacao * 10) / 10 + '%',
    ]);
    console.log(marca + ': julho ' + j.qtd.toFixed(1) + ' un (R$ ' + j.valor.toFixed(2) + ') | agosto parcial ' + a.qtd.toFixed(1) + ' un (R$ ' + a.valor.toFixed(2) + ')');
  });

  await garantirAbaRelatorio(sheets);
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: NOME_ABA_RELATORIO + '!A1:Z1000' });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA_RELATORIO + '!A1',
    valueInputOption: 'RAW',
    resource: { values: linhas },
  });

  console.log('Relatório gravado na aba "' + NOME_ABA_RELATORIO + '".');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
