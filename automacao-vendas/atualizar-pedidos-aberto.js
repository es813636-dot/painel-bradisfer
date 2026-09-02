// ----------------------------------------------------------------------
// Atualiza a aba "PedidosAberto" da planilha do painel, buscando quanto já
// está pedido aos fornecedores e ainda não foi recebido (listarPedidoCompras
// da Sysemp) -- substitui a importação manual de arquivo como fonte
// principal da sugestão de compra (ver script.js, obterPedidoEmAberto()).
//
// Só a empresa 1 (BRADISFER ATACADISTA) tem pedido de compra -- confirmado
// em 02/09/2026 sondando as empresas 1, 3 e 4, só a 1 devolveu dado.
//
// Janela de datas: 120 dias corridos. Testado em 02/09/2026 contra 3,5 anos
// de histórico (2023 a hoje): TODO item ainda "Aguardando Entrega" tinha no
// máximo 29 dias desde a data do pedido -- não existe backorder antigo
// esquecido aberto. 120 dias é margem generosa sem precisar varrer o
// histórico inteiro toda rodada.
//
// O item do pedido NÃO traz código de barras -- só id_produto/cod_fabrica.
// Por isso casa por Código Interno (id_produto) do lado do painel, não por
// nome nem código de barras.
// ----------------------------------------------------------------------

const { google } = require('googleapis');

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const NOME_ABA = 'PedidosAberto';
const URL_PEDIDO_COMPRAS = 'https://api.sysemp.com.br/163/listarPedidoCompras';
const ID_EMPRESA = '1';
const JANELA_DIAS = 120;

const CABECALHO = ['Código Interno', 'Cód. Fabricante', 'Produto', 'Marca', 'Qtde Em Aberto', 'Nº Pedidos', 'Custo Líquido Médio'];

function dataISO(data) {
  return data.toISOString().slice(0, 10);
}

async function buscarPagina(token, offset, datainicial, datafinal) {
  const resp = await fetch(URL_PEDIDO_COMPRAS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: token },
    body: JSON.stringify({ id_empresa: ID_EMPRESA, datainicial, datafinal, offset: String(offset) }),
  });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '(sem corpo)');
    throw new Error('HTTP ' + resp.status + ' no offset ' + offset + ' — resposta: ' + corpo);
  }
  const dados = await resp.json();
  return dados.retorno || [];
}

async function buscarTodosPedidos(token) {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - JANELA_DIAS);
  const datainicial = dataISO(inicio);
  const datafinal = dataISO(hoje);

  let todos = [];
  let offset = 0;
  while (true) {
    const pagina = await buscarPagina(token, offset, datainicial, datafinal);
    console.log('offset ' + offset + ': ' + pagina.length + ' pedido(s) (total: ' + (todos.length + pagina.length) + ')');
    if (pagina.length === 0) break;
    todos = todos.concat(pagina);
    offset += pagina.length; // API pagina por Nº DE PEDIDOS, não por tamanho fixo de página
  }
  return todos;
}

// Agrega os itens de todos os pedidos por Código Interno (id_produto) --
// um mesmo produto pode aparecer em vários pedidos abertos ao mesmo tempo.
function agregarItensAbertos(pedidos) {
  const porProduto = new Map();
  pedidos.forEach((pedido) => {
    (pedido.itens_pedido || []).forEach((item) => {
      const saldo = Number(item.qtde_saldo_a_receber) || 0;
      // cancelado 'F' = não cancelado (única grafia vista até agora, mas
      // não assume — só entra se for exatamente 'F').
      if (saldo <= 0 || item.cancelado !== 'F') return;
      const idProduto = String(item.id_produto || '').trim();
      if (!idProduto) return;
      if (!porProduto.has(idProduto)) {
        porProduto.set(idProduto, {
          idProduto,
          codFabrica: item.cod_fabrica || '',
          produto: item.descricao_produto || '',
          marca: item.descricao_marca || '',
          qtde: 0,
          nPedidos: 0,
          somaCustoLiquido: 0,
        });
      }
      const acc = porProduto.get(idProduto);
      acc.qtde += saldo;
      acc.nPedidos += 1;
      acc.somaCustoLiquido += Number(item.custo_liquido) || 0;
    });
  });
  return [...porProduto.values()];
}

async function main() {
  const sysempToken = process.env.SYSEMP_TOKEN;
  if (!sysempToken) throw new Error('SYSEMP_TOKEN não configurado (variável de ambiente/secret).');

  const chaveServico = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(chaveServico.client_email, null, chaveServico.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('Buscando pedidos de compra na Sysemp (empresa ' + ID_EMPRESA + ', últimos ' + JANELA_DIAS + ' dias)...');
  const pedidos = await buscarTodosPedidos(sysempToken);
  console.log('Total de pedidos: ' + pedidos.length);

  const itens = agregarItensAbertos(pedidos);
  console.log('Produtos distintos com saldo em aberto: ' + itens.length);

  const linhas = itens
    .sort((a, b) => b.qtde - a.qtde)
    .map((it) => [
      it.idProduto,
      it.codFabrica,
      it.produto,
      it.marca,
      it.qtde,
      it.nPedidos,
      it.nPedidos > 0 ? Math.round((it.somaCustoLiquido / it.nPedidos) * 100) / 100 : 0,
    ]);

  // Aba nova -- cria se ainda não existir, mesmo padrão de
  // relatorio-comparativo.js / atualizar-vendas-online.js.
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  const existe = meta.data.sheets.some((s) => s.properties.title === NOME_ABA);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { requests: [{ addSheet: { properties: { title: NOME_ABA } } }] },
    });
    console.log('Aba "' + NOME_ABA + '" criada.');
  }

  console.log('Gravando ' + linhas.length + ' linha(s) na aba ' + NOME_ABA + '...');
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: NOME_ABA + '!A2:Z' });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A1',
    valueInputOption: 'RAW',
    resource: { values: [CABECALHO, ...linhas] },
  });

  console.log('Concluído.');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
