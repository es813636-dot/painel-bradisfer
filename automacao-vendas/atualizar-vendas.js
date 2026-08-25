// ----------------------------------------------------------------------
// Atualiza a aba "VendasAoVivo" da planilha do painel, buscando a
// Média Mensal/Total Vendido de TODO o catálogo na Sysemp, usando o
// endpoint listarVendasMediaPorProduto SEM código de barras (a Sysemp
// implementou isso em 20/08/2026 a nosso pedido) — devolve todos os
// produtos paginado por offset, em vez de 1 chamada por produto.
//
// Roda via GitHub Actions (.github/workflows/atualizar-vendas.yml),
// substituindo o antigo atualizarVendasAoVivo do Apps Script, que
// esbarrava na cota diária de 100 mil chamadas do Google.
// ----------------------------------------------------------------------

const { google } = require('googleapis');

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const NOME_ABA = 'VendasAoVivo';
const URL_VENDAS_MEDIA = 'https://api.sysemp.com.br/163/listarVendasMediaPorProduto';
const CABECALHO = ['Código Barras', 'Descrição Produto', 'Média Mensal', 'Total Vendido (12M)', 'Data Última Venda', 'Qtd Última Venda', 'Atualizado em', 'Erro'];
const PAUSA_ENTRE_ONDAS_MS = 300;
// Quantas paginas buscar ao mesmo tempo por "onda" -- antes era 1 por vez
// (sequencial), levando ~10min pro catalogo inteiro (~46 paginas de 100).
// A Sysemp confirmou que nao trava por tempo do lado deles, entao buscar
// varias em paralelo deve cortar bastante esse tempo sem depender de
// aumentar o tamanho da pagina (que ja tentamos, deu 504). Moderado de
// proposito -- se o servidor deles nao aguentar bem paralelo, e so
// baixar esse numero.
const PAGINAS_EM_PARALELO = 10;

function formatarDataBR(data) {
  const dd = String(data.getDate()).padStart(2, '0');
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  const yyyy = data.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mesma normalizacao usada em atualizar-estoque.js (ver comentario la pro
// historico completo). Precisa ser IDENTICA nos dois scripts: eh essa
// chave (ja sem a aspa -- ver limparCodigoBarras em script.js) que casa
// VendasAoVivo com Produtos (script.js, vendasVivoPersistente.get(...)).
function normalizarCodigoBarras(valor) {
  const texto = String(valor === undefined || valor === null ? '' : valor).trim();
  const completo = (texto && /^\d+$/.test(texto) && texto.length < 13) ? texto.padStart(13, '0') : texto;
  return completo ? "'" + completo : completo;
}

async function buscarPagina(token, offset, datainicial, datafinal) {
  const resp = await fetch(URL_VENDAS_MEDIA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: token },
    body: JSON.stringify({ cod_barra: '', datainicial, datafinal, offset: String(offset) }),
  });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '(sem corpo)');
    throw new Error('HTTP ' + resp.status + ' no offset ' + offset + ' — resposta: ' + corpo);
  }
  const dados = await resp.json();
  return dados.retorno || [];
}

async function buscarTodasVendas(token) {
  // Usa ONTEM como data final — vendas de hoje ainda estão sendo
  // processadas/fechadas na Sysemp e causavam oscilação entre consultas.
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const umAnoAtras = new Date(ontem);
  umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);

  const datainicial = formatarDataBR(umAnoAtras);
  const datafinal = formatarDataBR(ontem);

  let todos = [];

  // Primeira pagina sozinha, so pra descobrir o tamanho de pagina que a
  // Sysemp esta usando nesse ciclo (ja foi 100, mas e controlado do lado
  // deles -- nao assume valor fixo).
  const primeira = await buscarPagina(token, 0, datainicial, datafinal);
  console.log('offset 0: ' + primeira.length + ' registros (total: ' + primeira.length + ')');
  if (primeira.length === 0) return todos;
  todos = todos.concat(primeira);
  const tamanhoPagina = primeira.length;
  let offset = tamanhoPagina;
  let acabou = false;

  while (!acabou) {
    const offsetsDaOnda = [];
    for (let i = 0; i < PAGINAS_EM_PARALELO; i++) offsetsDaOnda.push(offset + i * tamanhoPagina);

    const paginas = await Promise.all(offsetsDaOnda.map((o) => buscarPagina(token, o, datainicial, datafinal)));

    for (let i = 0; i < paginas.length; i++) {
      const pagina = paginas[i];
      console.log('offset ' + offsetsDaOnda[i] + ': ' + pagina.length + ' registros (total: ' + (todos.length + pagina.length) + ')');
      if (pagina.length === 0) { acabou = true; break; }
      todos = todos.concat(pagina);
      // Pagina parcial (menor que o tamanho normal) tambem sinaliza fim
      // de catalogo -- as proximas ofertas da mesma onda, se sobrarem,
      // seriam vazias mesmo.
      if (pagina.length < tamanhoPagina) { acabou = true; break; }
    }

    offset += PAGINAS_EM_PARALELO * tamanhoPagina;
    if (!acabou) await dormir(PAUSA_ENTRE_ONDAS_MS);
  }

  return todos;
}

async function main() {
  const sysempToken = process.env.SYSEMP_TOKEN;
  if (!sysempToken) throw new Error('SYSEMP_TOKEN não configurado (variável de ambiente/secret).');

  const chaveServico = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(chaveServico.client_email, null, chaveServico.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('Buscando vendas de todo o catálogo na Sysemp (paginado, sem código de barras)...');
  const registros = await buscarTodasVendas(sysempToken);
  console.log('Total de produtos com venda encontrados: ' + registros.length);
  if (registros.length > 0) {
    console.log('DIAGNÓSTICO — primeiro item bruto: ' + JSON.stringify(registros[0]));
  }

  console.log('Lendo dados existentes na aba ' + NOME_ABA + '...');
  const leitura = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A2:H',
  });
  const existentes = leitura.data.values || [];
  const mapaLinhas = new Map();
  // Chave de comparacao sempre sem a aspa simples (ver normalizarCodigoBarras
  // mais abaixo) -- assim o casamento funciona igual pra linhas antigas
  // (gravadas sem aspa, antes desse fix) e novas (com aspa), sem duplicar
  // linha nenhuma na transicao.
  existentes.forEach((linha, i) => mapaLinhas.set(String(linha[0]).replace(/^'/, ''), i));

  // O endpoint em lote (sem código de barras) devolve os campos com
  // nomes diferentes do endpoint de 1 produto só (sem acento,
  // capitalização diferente) — aceita as duas grafias, pra não quebrar
  // se algum dia a Sysemp padronizar.
  const campo = (item, ...chaves) => {
    for (const c of chaves) if (item[c] !== undefined && item[c] !== null && item[c] !== '') return item[c];
    return undefined;
  };

  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  let atualizados = 0;
  registros.forEach((item) => {
    const codBarra = normalizarCodigoBarras(campo(item, 'Codigo barras', 'Código Barras'));
    if (!codBarra) return;
    const chave = codBarra.replace(/^'/, '');
    const linhaNova = [
      codBarra,
      campo(item, 'Descricao produto', 'Descrição Produto') || '',
      parseFloat(campo(item, 'Média Mensal', 'Media Mensal')) || 0,
      parseFloat(campo(item, 'Total vendido', 'Total Vendido')) || 0,
      campo(item, 'Data ultima venda', 'Data Última Venda') || '',
      parseFloat(campo(item, 'Quantidade ultima venda', 'Quantidade Última Venda')) || 0,
      agora,
      '',
    ];
    if (mapaLinhas.has(chave)) {
      existentes[mapaLinhas.get(chave)] = linhaNova;
    } else {
      mapaLinhas.set(chave, existentes.length);
      existentes.push(linhaNova);
    }
    atualizados++;
  });
  // Produtos que não vieram na resposta (sem venda no período, ou já
  // processados antes) mantêm a linha que já tinham — nunca são apagados.

  console.log('Gravando ' + existentes.length + ' linhas na planilha (' + atualizados + ' atualizadas nesta rodada)...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A1',
    valueInputOption: 'RAW',
    resource: { values: [CABECALHO, ...existentes] },
  });

  console.log('Concluído.');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
