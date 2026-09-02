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
// Testado em 25/08/2026: 8 (~24-28s) e 12 (~28s, sem ganho -- nessa
// escala pequena de tempo a diferenca ja e ruido de rede/fila do
// GitHub Actions, nao vale a pena arriscar). Ficou em 8.
const PAGINAS_EM_PARALELO = 8;

const NOME_ABA = 'Produtos';
const LINHA_INICIO_DADOS = 4; // cabeçalho na linha 3, dados a partir da 4
const MAX_LINHAS_RESERVADAS = 5500; // mesmo teto usado nas fórmulas da aba Base

const COLUNAS_PLANILHA = [
  'Código Interno', 'Código Barras', 'Código Fabricante', 'Produto',
  'Marca', 'Grupo', 'SubGrupo', 'Unidade', 'Estoque Bradisfer',
  'EstMinimo1', 'EstMaximo1', 'Custo Atual', 'Preço', 'Código Auxiliar',
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
  'Código Auxiliar': 'codigo_auxiliar',
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

// Converte número de coluna (1-based) na letra do A1 notation: 1 -> A,
// 26 -> Z, 27 -> AA. O código antigo usava String.fromCharCode(64 + n),
// que só funciona até 26 colunas — na 27ª geraria '[' e produziria um
// range inválido.
function letraColuna(n) {
  let letra = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

// A aba tem um número fixo de colunas na grade; escrever fora dela devolve
// 400 "exceeds grid limits" em vez de expandir sozinho. Como o aviso de
// "Última atualização" fica 2 colunas depois da última coluna de dados,
// cada coluna nova em COLUNAS_PLANILHA empurra esse aviso pra direita e
// pode estourar a grade — foi o que aconteceu ao adicionar 'Código
// Auxiliar' em 01/09/2026 (aviso foi de O1 pra P1, numa aba de 15
// colunas, e o job passou a falhar toda rodada). Em vez de só ajustar o
// número, garante a largura antes de escrever.
async function garantirLarguraDaAba(sheets, colunasNecessarias) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties)' });
  const aba = (meta.data.sheets || []).find((s) => s.properties && s.properties.title === NOME_ABA);
  if (!aba) throw new Error('Aba "' + NOME_ABA + '" não encontrada na planilha.');

  const colunasAtuais = aba.properties.gridProperties.columnCount;
  if (colunasAtuais >= colunasNecessarias) return;

  const faltando = colunasNecessarias - colunasAtuais;
  console.log(
    'Aba "' + NOME_ABA + '" tem ' + colunasAtuais + ' colunas e são necessárias ' +
    colunasNecessarias + '. Acrescentando ' + faltando + ' coluna(s) no fim...'
  );
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    resource: {
      requests: [{
        appendDimension: { sheetId: aba.properties.sheetId, dimension: 'COLUMNS', length: faltando },
      }],
    },
  });
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
  // Coluna do aviso de "Última atualização": 2 colunas depois da última de
  // dados (1 coluna em branco de espaço), mesmo layout do Apps Script antigo.
  const colunaAvisoNum = COLUNAS_PLANILHA.length + 2;
  await garantirLarguraDaAba(sheets, colunaAvisoNum);

  console.log('Limpando área reservada e gravando ' + linhas.length + ' produtos...');
  const ultimaColuna = letraColuna(COLUNAS_PLANILHA.length); // 14 colunas = 'N'
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
  const colunaAviso = letraColuna(colunaAvisoNum);
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
