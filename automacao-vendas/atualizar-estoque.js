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

// O truque de RAW/USER_ENTERED + aspa simples so evita a reconversao pra
// numero NA HORA da escrita -- confirmado que o Sheets volta a reformatar
// a coluna como numero (perdendo o zero de novo) num recalculo/refresh
// posterior, se a coluna continuar com formato "Automatico". A fixacao
// de verdade e travar o formato da coluna como "Texto simples" (TEXT) --
// depois disso, mesmo escrita RAW simples mantem os digitos intactos.
async function garantirColunaTexto(sheets, spreadsheetId, nomeAba, colunaIndice, linhaInicio, qtdLinhas) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const aba = meta.data.sheets.find((s) => s.properties.title === nomeAba);
  if (!aba) throw new Error('Aba "' + nomeAba + '" nao encontrada pra travar formato de coluna.');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        repeatCell: {
          range: {
            sheetId: aba.properties.sheetId,
            startRowIndex: linhaInicio - 1,
            endRowIndex: linhaInicio - 1 + qtdLinhas,
            startColumnIndex: colunaIndice,
            endColumnIndex: colunaIndice + 1,
          },
          cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
          fields: 'userEnteredFormat.numberFormat',
        },
      }],
    },
  });
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

  // DIAGNOSTICO TEMPORARIO -- confirma o que a Sysemp manda de verdade pro
  // item que sabemos que deveria ser 0074468051034 (13 digitos), pra saber
  // se o valor bruto ja chega errado (< 13 digitos) ou se o problema eh
  // depois. Remover assim que confirmar.
  const itemDiagnostico = registros.find((reg) => String(reg.cod_barra || '').includes('74468051034'));
  if (itemDiagnostico) {
    console.log('DIAGNOSTICO cod_barra bruto: valor=' + JSON.stringify(itemDiagnostico.cod_barra) + ' tipo=' + typeof itemDiagnostico.cod_barra);
    console.log('DIAGNOSTICO registro completo: ' + JSON.stringify(itemDiagnostico));
  } else {
    console.log('DIAGNOSTICO: item 74468051034 nao encontrado nesta rodada de ' + registros.length + ' registros.');
  }

  const linhas = registros.map((reg) =>
    COLUNAS_PLANILHA.map((coluna) => valorConvertido(coluna, reg[MAPEAMENTO_CAMPOS[coluna]]))
  );

  const linhaDiagnostico = linhas.find((linha) => String(linha[COLUNAS_PLANILHA.indexOf('Código Barras')] || '').includes('74468051034'));
  if (linhaDiagnostico) {
    console.log('DIAGNOSTICO valor normalizado que vai pro Sheets: ' + JSON.stringify(linhaDiagnostico[COLUNAS_PLANILHA.indexOf('Código Barras')]));
  }

  // Limpa a área reservada inteira antes de escrever (mesmo comportamento
  // do Apps Script) — evita sobrar linha antiga de produto removido.
  console.log('Limpando área reservada e gravando ' + linhas.length + ' produtos...');
  const ultimaColuna = String.fromCharCode(64 + COLUNAS_PLANILHA.length); // 13 colunas = 'M'
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A' + LINHA_INICIO_DADOS + ':' + ultimaColuna + (LINHA_INICIO_DADOS + MAX_LINHAS_RESERVADAS - 1),
  });

  const colunaCodigoBarras = COLUNAS_PLANILHA.indexOf('Código Barras');
  const letraColunaBarras = String.fromCharCode(65 + colunaCodigoBarras);

  // Trava o formato da coluna Codigo Barras como "Texto simples" ANTES de
  // escrever -- sem isso, o Sheets pode reformatar de volta pra numero
  // num recalculo posterior, mesmo tendo sido escrito como texto forcado.
  await garantirColunaTexto(sheets, SHEET_ID, NOME_ABA, colunaCodigoBarras, LINHA_INICIO_DADOS, MAX_LINHAS_RESERVADAS);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A' + LINHA_INICIO_DADOS,
    valueInputOption: 'RAW',
    resource: { values: linhas },
  });

  // DIAGNOSTICO TEMPORARIO -- le a celula de volta direto pela API
  // (sem cache do CSV publico) logo apos a escrita RAW, pra saber se o
  // valor ja se perde nesse ponto ou so depois.
  const idxDiagnostico = linhas.findIndex((linha) => String(linha[colunaCodigoBarras] || '').includes('74468051034'));
  if (idxDiagnostico !== -1) {
    const linhaPlanilha = LINHA_INICIO_DADOS + idxDiagnostico;
    const leituraPosRaw = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: NOME_ABA + '!' + letraColunaBarras + linhaPlanilha,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    console.log('DIAGNOSTICO leitura pos-RAW (linha ' + linhaPlanilha + '): ' + JSON.stringify(leituraPosRaw.data.values));
  }

  // Com a coluna ja travada em "Texto simples", RAW normal ja preserva os
  // digitos -- mas escreve de novo com USER_ENTERED + aspa simples (mesmo
  // truque de digitar '0074468051034 direto na planilha) como reforco,
  // caso o formato da coluna nao tenha aplicado a tempo na escrita RAW
  // acima (repeatCell e values.update sao chamadas separadas).
  const valoresBarras = linhas.map((linha) => ["'" + linha[colunaCodigoBarras]]);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!' + letraColunaBarras + LINHA_INICIO_DADOS,
    valueInputOption: 'USER_ENTERED',
    resource: { values: valoresBarras },
  });

  // DIAGNOSTICO TEMPORARIO -- le de novo apos a escrita USER_ENTERED.
  if (idxDiagnostico !== -1) {
    const linhaPlanilha = LINHA_INICIO_DADOS + idxDiagnostico;
    const leituraPosUserEntered = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: NOME_ABA + '!' + letraColunaBarras + linhaPlanilha,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    console.log('DIAGNOSTICO leitura pos-USER_ENTERED (linha ' + linhaPlanilha + '): ' + JSON.stringify(leituraPosUserEntered.data.values));
  }

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
