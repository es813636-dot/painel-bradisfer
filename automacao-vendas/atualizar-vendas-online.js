// ----------------------------------------------------------------------
// Atualiza a aba "VendasOnline" da planilha do painel, buscando as vendas
// de marketplace (Shopee, TikTok, futuramente Mercado Livre) das empresas
// CONSTRUBRAG e SS CONSTRUCASA via listarVendasPorVendedor.
//
// Alimenta um dashboard Power BI separado, não o painel HTML em si (ver
// CONTEXTO.md, migração da aba Vendas pro Power BI) — por isso a aba fica
// só como fonte de dado bruto, sem consumo em script.js.
//
// Descobertas ao sondar essa API (02/09/2026, ver também
// testar-apis-novas.js): offset precisa ser "0" (com "" volta vazio,
// sem erro), id_empresa é obrigatório (sem "todas"), e offset aqui pagina
// por VENDEDOR, não por 100 registros como os outros endpoints — uma
// chamada só já trouxe até ~58 mil linhas de venda em ~0,3-4s, sem sinal
// de corte. Por isso não tem loop de paginação aqui (diferente de
// atualizar-vendas.js / atualizar-estoque.js): se a Sysemp um dia passar
// a paginar de verdade, os totais por empresa vão cair de forma óbvia
// (ver contagemMinimaEsperada abaixo) e o job falha alto, em vez de
// silenciosamente gravar menos linha.
// ----------------------------------------------------------------------

const { google } = require('googleapis');

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const NOME_ABA = 'VendasOnline';
const URL_VENDAS_POR_VENDEDOR = 'https://api.sysemp.com.br/163/listarVendasPorVendedor';

// id -> nome só pra log/diagnóstico; a coluna Empresa da planilha vem do
// campo "empresa" de cada linha de venda, não daqui.
const EMPRESAS_MARKETPLACE = { '3': 'CONSTRUBRAG', '4': 'SS CONSTRUCASA' };

const CABECALHO = [
  'PeriodoInicio', 'PeriodoFim', 'IdVendedor', 'Vendedor', 'Marca', 'Cliente',
  'Empresa', 'Cidade', 'UF', 'Quantidade', 'Canal', 'ValorFaturado',
];

function dataISO(data) {
  return data.toISOString().slice(0, 10);
}

// Período: mês fechado anterior ao atual (ex. rodando em setembro, busca
// 01/08 a 31/08) — evita pegar um mês parcial que mudaria de valor a cada
// rodada. Ajustar aqui se quiser outra janela.
function periodoMesAnterior() {
  const hoje = new Date();
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0); // último dia do mês anterior
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return { datainicial: dataISO(inicio), datafinal: dataISO(fim) };
}

async function buscarVendasEmpresa(token, idEmpresa, datainicial, datafinal) {
  const resp = await fetch(URL_VENDAS_POR_VENDEDOR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: token },
    body: JSON.stringify({ id_empresa: idEmpresa, datainicial, datafinal, offset: '0' }),
  });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '(sem corpo)');
    throw new Error('HTTP ' + resp.status + ' pra empresa ' + idEmpresa + ' — resposta: ' + corpo);
  }
  const dados = await resp.json();
  return dados.retorno || [];
}

// "Cidade/UF" -> ["Cidade", "UF"], separando pelo ÚLTIMO '/' (nome de
// cidade não deveria ter barra, mas por garantia — evita cortar errado se
// algum dia aparecer um nome composto com '/').
function separarCidadeUf(texto) {
  const valor = String(texto || '');
  const i = valor.lastIndexOf('/');
  if (i === -1) return [valor, ''];
  return [valor.slice(0, i), valor.slice(i + 1)];
}

function montarLinhas(vendedores, datainicial, datafinal) {
  const linhas = [];
  vendedores.forEach((v) => {
    const idVendedor = v.id_vendedor == null ? '' : String(v.id_vendedor);
    const nomeVendedor = v.vendedor == null ? '' : String(v.vendedor).trim();
    (v.vendas || []).forEach((venda) => {
      const [cidade, uf] = separarCidadeUf(venda['cidade/uf']);
      linhas.push([
        datainicial,
        datafinal,
        idVendedor,
        nomeVendedor,
        venda.marca || '',
        venda.cliente || '',
        venda.empresa || '',
        cidade,
        uf,
        Number(venda.quantidade) || 0,
        venda['canal de venda'] || '',
        Number(venda['valor faturado']) || 0,
      ]);
    });
  });
  return linhas;
}

// Aba nova (não existe na planilha até a primeira rodada) — cria se
// faltar, mesmo padrão de relatorio-comparativo.js.
async function garantirAbaVendasOnline(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  const existe = meta.data.sheets.some((s) => s.properties.title === NOME_ABA);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { requests: [{ addSheet: { properties: { title: NOME_ABA } } }] },
    });
    console.log('Aba "' + NOME_ABA + '" criada.');
  }
}

async function main() {
  const sysempToken = process.env.SYSEMP_TOKEN;
  if (!sysempToken) throw new Error('SYSEMP_TOKEN não configurado (variável de ambiente/secret).');

  const chaveServico = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(chaveServico.client_email, null, chaveServico.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  await garantirAbaVendasOnline(sheets);

  const { datainicial, datafinal } = periodoMesAnterior();
  console.log('Período: ' + datainicial + ' a ' + datafinal);

  let todasAsLinhas = [];
  for (const [idEmpresa, nomeEmpresa] of Object.entries(EMPRESAS_MARKETPLACE)) {
    console.log('Buscando vendas da empresa ' + idEmpresa + ' (' + nomeEmpresa + ')...');
    const vendedores = await buscarVendasEmpresa(sysempToken, idEmpresa, datainicial, datafinal);
    const linhas = montarLinhas(vendedores, datainicial, datafinal);
    console.log('  -> ' + vendedores.length + ' vendedor(es)/grupo(s), ' + linhas.length + ' linha(s) de venda');
    todasAsLinhas = todasAsLinhas.concat(linhas);
  }

  if (todasAsLinhas.length === 0) {
    console.log('AVISO: nenhuma linha encontrada pro período. Nada foi alterado na planilha, para evitar apagar dados válidos.');
    return;
  }

  console.log('Gravando ' + todasAsLinhas.length + ' linhas na aba ' + NOME_ABA + '...');
  // Sobrescreve a aba inteira a cada rodada (mesmo padrão do
  // atualizar-estoque.js) — mais simples que deduplicar por período, e o
  // volume (dezenas de milhares de linhas, não milhões) permite.
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A2:Z',
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A1',
    valueInputOption: 'RAW',
    resource: { values: [CABECALHO, ...todasAsLinhas] },
  });

  console.log('Concluído: ' + todasAsLinhas.length + ' linhas gravadas.');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
