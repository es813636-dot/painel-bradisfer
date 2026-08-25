// ----------------------------------------------------------------------
// Atualiza a aba "Produtos" da planilha do painel, buscando estoque/
// preço/custo de todo o catálogo na Sysemp (listaProdutosComEstoque
// PrecoVendaCusto, paginado por offset — já era assim antes).
//
// Substitui o atualizarEstoque do Apps Script, migrado pro GitHub
// Actions junto com o atualizarVendasAoVivo, pra não depender da cota
// diária do Google (100 mil chamadas/dia) nem manter dois lugares de
// automação separados.
//
// IMPORTANTE: escreve na aba "Produtos" (não na BaseLooker direto) —
// outras abas da planilha (BaseLooker, AnaliseMinMax) têm fórmulas que
// dependem do layout exato de linhas/colunas aqui. Não mudar a ordem
// das colunas nem a linha de início dos dados sem revisar essas
// fórmulas também.
// ----------------------------------------------------------------------

const { google } = require('googleapis');

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const URL_METODO = 'https://api.sysemp.com.br/163/listaProdutosComEstoquePrecoVendaCusto';
const LIMITE_POR_PAGINA = 100;
const PAUSA_ENTRE_PAGINAS_MS = 300;

const NOME_ABA = 'Produtos';
const LINHA_INICIO_DADOS = 4; // cabeçalho na linha 3, dados a partir da 4
const MAX_LINHAS_RESERVADAS = 5500; // mesmo teto usado nas fórmulas da aba Base

const COLUNAS_PLANILHA = [
  'Código Interno', 'Código Barras', 'Código Fabricante', 'Produto',
  'Marca', 'Grupo', 'SubGrupo', 'Unidade', 'Estoque Bradisfer',
  'EstMinimo1', 'EstMaximo1', 'Custo Atual', 'Preço',
];

const MAPEAMENTO_CAMPOS = {
  'Código Interno': 'id_produto',
  'Código Barras': 'cod_barra',
  'Código Fabricante': 'cod_fabrica',
  'Produto': 'descricao',
  'Marca': 'descricao_marca',
  'Grupo': 'descricao_grupo',
  'SubGrupo': 'descricao_subgrupo',
  'Unidade': 'unidade',
  'Estoque Bradisfer': 'estoque',
  'EstMinimo1': 'estoque_minimo',
  'EstMaximo1': 'estoque_maximo',
  'Custo Atual': 'custo',
  'Preço': 'preço_venda',
};

const COLUNAS_NUMERICAS = new Set([
  'Estoque Bradisfer', 'EstMinimo1', 'EstMaximo1', 'Custo Atual', 'Preço',
]);

// A Sysemp as vezes devolve o codigo de barras como NUMERO no JSON (nao
// string), o que perde zeros a esquerda antes mesmo de chegar aqui --
// confirmado com um caso real: codigo cadastrado 0074468051034 (13
// digitos, EAN-13) voltou da API como 74468051034 (11 digitos, 2 zeros
// a menos). Como nao da pra recuperar um zero que ja sumiu no JSON,
// completa de volta pra 13 digitos (padrao EAN-13, o mais comum no
// Brasil) sempre que o codigo só tiver digitos e for mais curto que
// isso -- nao mexe em codigos que ja tem 13+ digitos (EAN-13/GTIN-14
// legitimos ficam intactos).
function normalizarCodigoBarras(valor) {
  const texto = String(valor === undefined || valor === null ? '' : valor).trim();
  if (texto && /^\d+$/.test(texto) && texto.length < 13) return texto.padStart(13, '0');
  return texto;
}

function valorConvertido(coluna, valor) {
  if (coluna === 'Código Barras') return normalizarCodigoBarras(valor);
  if (valor === undefined || valor === null || valor === '') return '';
  if (COLUNAS_NUMERICAS.has(coluna)) {
    const num = parseFloat(String(valor).replace(',', '.'));
    return isNaN(num) ? '' : num;
  }
  return valor;
}

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buscarPagina(token, offset) {
  const resp = await fetch(URL_METODO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: token },
    body: JSON.stringify({ offset: String(offset) }),
  });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '(sem corpo)');
    throw new Error('HTTP ' + resp.status + ' no offset ' + offset + ' — resposta: ' + corpo);
  }
  return resp.json();
}

async function buscarTodosProdutos(token) {
  let offset = 0;
  let todos = [];

  while (true) {
    const resposta = await buscarPagina(token, offset);

    if (resposta.status === false) {
      console.log('AVISO: a API retornou status=false. Resposta: ' + JSON.stringify(resposta));
    }

    const registros = resposta.retorno || resposta.data || [];
    if (registros.length === 0) break;

    todos = todos.concat(registros);
    console.log('  -> offset ' + offset + ': ' + registros.length + ' registros (total: ' + todos.length + ')');

    if (registros.length < LIMITE_POR_PAGINA) break;

    offset += LIMITE_POR_PAGINA;
    await dormir(PAUSA_ENTRE_PAGINAS_MS);
  }

  return todos;
}

async function main() {
  const sysempToken = process.env.SYSEMP_TOKEN;
  if (!sysempToken) throw new Error('SYSEMP_TOKEN não configurado (variável de ambiente/secret).');

  const chaveServico = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(chaveServico.client_email, null, chaveServico.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('Buscando produtos na API do Sysemp...');
  const registros = await buscarTodosProdutos(sysempToken);
  console.log('Total de produtos extraídos: ' + registros.length);

  if (registros.length === 0) {
    console.log('AVISO: a API não retornou nenhum produto. Nada foi alterado na planilha, para evitar apagar dados válidos.');
    return;
  }

  if (registros.length > MAX_LINHAS_RESERVADAS) {
    console.log(
      'AVISO: ' + registros.length + ' produtos encontrados, mas só há ' +
      MAX_LINHAS_RESERVADAS + ' linhas reservadas nas fórmulas da aba Base. ' +
      'Os produtos além desse limite não entrarão nos cálculos.'
    );
  }

  const linhas = registros.map((reg) =>
    COLUNAS_PLANILHA.map((coluna) => valorConvertido(coluna, reg[MAPEAMENTO_CAMPOS[coluna]]))
  );

  // Limpa a área reservada inteira antes de escrever (mesmo comportamento
  // do Apps Script) — evita sobrar linha antiga de produto removido.
  console.log('Limpando área reservada e gravando ' + linhas.length + ' produtos...');
  const ultimaColuna = String.fromCharCode(64 + COLUNAS_PLANILHA.length); // 13 colunas = 'M'
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A' + LINHA_INICIO_DADOS + ':' + ultimaColuna + (LINHA_INICIO_DADOS + MAX_LINHAS_RESERVADAS - 1),
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A' + LINHA_INICIO_DADOS,
    valueInputOption: 'RAW',
    resource: { values: linhas },
  });

  const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const colunaAviso = String.fromCharCode(64 + COLUNAS_PLANILHA.length + 2); // +2 colunas de espaço, igual Apps Script
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!' + colunaAviso + '1',
    valueInputOption: 'RAW',
    resource: { values: [['Última atualização: ' + dataHora]] },
  });

  console.log('Planilha atualizada com sucesso: ' + linhas.length + ' produtos.');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
