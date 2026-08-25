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
const PAUSA_ENTRE_ONDAS_MS = 300;
// Mesmo padrao de busca em paralelo do atualizar-vendas.js (ver
// CONTEXTO.md pro historico completo dos testes de paralelismo). Esse
// endpoint ja era rapido sozinho (~45-70s pro catalogo, contra os
// ~450-660s que o de vendas tinha antes), entao o ganho aqui e menor em
// termos absolutos -- mas mantem consistencia entre os dois scripts.
// Testar de novo o teto de paralelismo pra ESSE endpoint especifico se
// for subir esse numero -- e um endpoint diferente do de vendas, pode
// ter um limite de 504 diferente.
const PAGINAS_EM_PARALELO = 8;

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

// Duas correcoes pro codigo de barras, as duas confirmadas com casos
// reais (ver CONTEXTO.md pro historico completo da investigacao):
//
// 1. A Sysemp as vezes devolve cod_barra como NUMERO no JSON (nao
//    string), perdendo zeros a esquerda antes mesmo de chegar aqui.
//    Completa de volta pra 13 digitos (EAN-13, o mais comum no Brasil)
//    quando o codigo so tiver digitos e for mais curto que isso.
//
// 2. Mesmo gravando como texto (RAW, USER_ENTERED+aspa, formato "Texto
//    simples" na coluna, e ate formula de string literal -- tentamos
//    TODAS essas abordagens), o Google Sheets reconverte um valor
//    so-digitos de volta pra numero num recalculo em segundo plano,
//    perdendo o zero de novo minutos depois. A UNICA forma que resistiu
//    foi colocar uma aspa simples como parte literal do CONTEUDO da
//    celula (nao como dica de formatacao da UI) -- isso torna o valor
//    permanentemente nao-numerico, imune a qualquer reformatacao futura.
//    script.js tira essa aspa de volta ao ler (limparCodigoBarras).
function normalizarCodigoBarras(valor) {
  const texto = String(valor === undefined || valor === null ? '' : valor).trim();
  const completo = (texto && /^\d+$/.test(texto) && texto.length < 13) ? texto.padStart(13, '0') : texto;
  return completo ? "'" + completo : completo;
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
  let acabou = false;

  while (!acabou) {
    const offsetsDaOnda = [];
    for (let i = 0; i < PAGINAS_EM_PARALELO; i++) offsetsDaOnda.push(offset + i * LIMITE_POR_PAGINA);

    const respostas = await Promise.all(offsetsDaOnda.map((o) => buscarPagina(token, o)));

    for (let i = 0; i < respostas.length; i++) {
      const resposta = respostas[i];
      if (resposta.status === false) {
        console.log('AVISO: a API retornou status=false. Resposta: ' + JSON.stringify(resposta));
      }
      const registros = resposta.retorno || resposta.data || [];
      console.log('  -> offset ' + offsetsDaOnda[i] + ': ' + registros.length + ' registros (total: ' + (todos.length + registros.length) + ')');
      if (registros.length === 0) { acabou = true; break; }
      todos = todos.concat(registros);
      // Pagina parcial (menor que o limite) tambem sinaliza fim de
      // catalogo -- as proximas ofertas da mesma onda seriam vazias.
      if (registros.length < LIMITE_POR_PAGINA) { acabou = true; break; }
    }

    offset += PAGINAS_EM_PARALELO * LIMITE_POR_PAGINA;
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
