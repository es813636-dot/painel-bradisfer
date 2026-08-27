const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const SHEET_NAME = 'BaseLooker';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(SHEET_NAME);
const ANALISE_SHEET_NAME = 'AnaliseMinMax';
const ANALISE_CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(ANALISE_SHEET_NAME);
// Vendas AO VIVO em lote (Apps Script bate na Sysemp pra cada produto,
// de tempos em tempos, e grava aqui) — média mensal real de 12 meses
// pra todo o catálogo, sem precisar clicar item por item.
const VENDAS_VIVO_SHEET_NAME = 'VendasAoVivo';
const VENDAS_VIVO_CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(VENDAS_VIVO_SHEET_NAME);
// Ponte (Cloudflare Worker, ver cloudflare-worker/produto-detalhe.js) que
// busca compras/vendas reais na Sysemp, um produto por vez, sob demanda
// (ao clicar num item). Substituiu o Apps Script Web App em 25/08/2026 --
// eliminava o redirecionamento interno do Google (ver CONTEXTO.md e
// LINHAGEM-DE-DADOS.md pro historico). "Compras" ficou ~8x mais rapido
// (2,9s -> 0,36s); "vendas" continua limitado pela propria Sysemp
// calculando 1 ano de historico por produto (5-15s, nao e coisa nossa).
const WEBAPP_URL = 'https://rough-dust-49b2.bradisferdistribuuidora.workers.dev';
const AUTO_REFRESH_MS = 5 * 60 * 1000;
// A Sysemp calcula "Média Mensal" como total vendido em 365 dias / 12 — usamos
// o mesmo divisor pra converter Lead Time (dias) em "meses", senão a sugestão
// de compra fica ligeiramente inconsistente com a média que a própria API manda.
const DIAS_POR_MES_SYSEMP = 365 / 12;

// Marcas que não são mais compradas mas ainda aparecem no estoque —
// ficam de fora do painel inteiro (KPIs, gráficos, tabela). Comparação
// não diferencia maiúsculas/minúsculas nem espaços nas pontas.
// Para voltar a incluir uma marca, é só apagar a linha correspondente.
const MARCAS_EXCLUIDAS = [
  'PLASTILIT',
  'MAXI FORCE',
  'AGATA',
  'MINASUL',
  'COMEP',
  'TRIOPLAST',
  'IV PLAST',
  'DAMA METAIS',
  'WORLD TINTAS',
  'MORLAN',
  'RIOMAR',
  'PAULICEIA',
  'TBR',
  'TEKBOND',
  'DOAN',
].map(m => m.trim().toUpperCase());

// ---- Ícones inline (estilo Phosphor "regular", stroke-based, currentColor) ----
// Sem dependência externa: cada entrada é um <svg> completo, sizing controlado
// pela classe .icon-* que o envolve (não pelos atributos width/height do svg).
const SVG_ICONS = {
  x: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round"><line x1="200" y1="56" x2="56" y2="200"/><line x1="200" y1="200" x2="56" y2="56"/></svg>',
  warning: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M137.94,32.44l95.34,165.48A16,16,0,0,1,219.34,222H36.66a16,16,0,0,1-13.94-24.08L118.06,32.44A16,16,0,0,1,137.94,32.44Z"/><line x1="128" y1="104" x2="128" y2="144"/><circle cx="128" cy="176" r="1" fill="currentColor" stroke="none"/></svg>',
  prohibit: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><circle cx="128" cy="128" r="96"/><line x1="61.51" y1="61.51" x2="194.49" y2="194.49"/></svg>',
  chartBar: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><line x1="32" y1="224" x2="224" y2="224"/><rect x="72" y="120" width="32" height="104" rx="4"/><rect x="152" y="72" width="32" height="152" rx="4"/></svg>',
  wallet: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M216,88H72a24,24,0,0,1,0-48H192a8,8,0,0,1,8,8V88"/><rect x="24" y="64" width="208" height="144" rx="16"/><circle cx="180" cy="140" r="12" fill="currentColor" stroke="none"/></svg>',
  target: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><circle cx="128" cy="128" r="96"/><circle cx="128" cy="128" r="56"/><circle cx="128" cy="128" r="16" fill="currentColor" stroke="none"/></svg>',
  receipt: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M200,224l-16-16-16,16-16-16-16,16-16-16-16,16-16-16-16,16V56a8,8,0,0,1,8-8H192a8,8,0,0,1,8,8Z"/><line x1="88" y1="96" x2="168" y2="96"/><line x1="88" y1="136" x2="168" y2="136"/></svg>',
  trophy: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M112,184h32v24H112Z"/><line x1="96" y1="232" x2="160" y2="232"/><path d="M80,56H48a8,8,0,0,0-8,8v8a40,40,0,0,0,40,40"/><path d="M176,56h32a8,8,0,0,1,8,8v8a40,40,0,0,1-40,40"/><path d="M80,32H176V96a48,48,0,0,1-96,0Z"/></svg>',
  trendUp: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><polyline points="32 200 96 136 144 168 224 72"/><polyline points="160 72 224 72 224 136"/></svg>',
  calendar: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><rect x="40" y="48" width="176" height="168" rx="8"/><line x1="176" y1="24" x2="176" y2="72"/><line x1="80" y1="24" x2="80" y2="72"/><line x1="40" y1="96" x2="216" y2="96"/></svg>',
  calendarCheck: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><rect x="40" y="48" width="176" height="168" rx="8"/><line x1="176" y1="24" x2="176" y2="72"/><line x1="80" y1="24" x2="80" y2="72"/><line x1="40" y1="96" x2="216" y2="96"/><polyline points="92 150 118 176 168 128"/></svg>',
  users: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><circle cx="88" cy="108" r="40"/><path d="M15.8,208a80,80,0,0,1,144.4,0"/><path d="M162,152a40,40,0,1,1,47.4,39.5"/><path d="M255.9,208a80,80,0,0,0-70.2-63.6"/></svg>',
  package: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M223.68,66.15,135.68,18a15.88,15.88,0,0,0-15.36,0l-88,48.17A16,16,0,0,0,24,80.14v95.72a16,16,0,0,0,8.32,14L120.32,238a15.88,15.88,0,0,0,15.36,0l88-48.17a16,16,0,0,0,8.32-14V80.14A16,16,0,0,0,223.68,66.15Z"/><polyline points="24.32 66.15 128 128 231.68 66.15"/><line x1="128" y1="128" x2="128" y2="238"/></svg>',
  folders: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M64,176H208a8,8,0,0,0,8-8V80a8,8,0,0,0-8-8H136L112,48H48a8,8,0,0,0-8,8V184"/><path d="M40,88H24a8,8,0,0,0-8,8v96a16,16,0,0,0,16,16H192"/></svg>',
  hourglass: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M64,32H192a0,0,0,0,1,0,0V64a64,96,0,0,1-64,96h0A64,96,0,0,1,64,64V32A0,0,0,0,1,64,32Z" transform="translate(0 0)"/><path d="M64,224H192a0,0,0,0,0,0,0V192a64,32,0,0,0-64-64h0a64,32,0,0,0-64,64v32A0,0,0,0,0,64,224Z" transform="translate(0 0)"/></svg>',
  downloadSimple: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><line x1="128" y1="144" x2="128" y2="32"/><polyline points="88 104 128 144 168 104"/><path d="M208,152v40a8,8,0,0,1-8,8H56a8,8,0,0,1-8-8V152"/></svg>',
  uploadSimple: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><line x1="128" y1="144" x2="128" y2="32"/><polyline points="88 72 128 32 168 72"/><path d="M208,152v40a8,8,0,0,1-8,8H56a8,8,0,0,1-8-8V152"/></svg>',
  sirenIcon: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M32,216V152a96,96,0,0,1,192,0v64Z"/><line x1="128" y1="56" x2="128" y2="32"/><line x1="180" y1="72" x2="196" y2="56"/><line x1="76" y1="72" x2="60" y2="56"/><line x1="16" y1="216" x2="240" y2="216"/></svg>',
  checkCircle: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><circle cx="128" cy="128" r="96"/><polyline points="92 140 116 164 168 100"/></svg>',
  xCircle: '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><circle cx="128" cy="128" r="96"/><line x1="160" y1="96" x2="96" y2="160"/><line x1="160" y1="160" x2="96" y2="96"/></svg>',
};
function icon(nome, cls) {
  const svg = SVG_ICONS[nome] || '';
  return '<span class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + svg + '</span>';
}

let dadosCompletos = [];
let elementoFocoAntesDoModal = null; // pra devolver o foco ao fechar o modal
let donutChartInstance = null;
let filtroGrupo = '';
let filtroSituacao = '';
let filtroMarca = '';
let buscaMarcaTexto = ''; // o que está digitado no campo de marca (pode não ter sido selecionado ainda)
let mostrarSugestoesMarca = false;
let buscaTexto = '';
let ordemCol = 'valorRepor';
let ordemDir = -1;
let marcaExpandidaTabela = '';
let abaSelecionada = 'estoque'; // 'estoque' ou 'vendas'
let mostrarItensNormaisMarca = false; // segunda seção (estoque normal/excesso) começa fechada
let marcaRelatorioVendas = ''; // marca selecionada no relatório "itens mais vendidos por marca" (aba Vendas)
let filtroGrupoVendas = ''; // filtro por grupo/linha de produto, exclusivo da aba Vendas
// Liga a animação do donut só quando a mudança veio de uma seleção de
// verdade (fatia, legenda, chip, card) — não em toda renderização (senão o
// anel "recarregaria" a cada tecla digitada na busca, já que ela também
// chama renderizar()). É lido e resetado uma única vez dentro de renderizar().
let animarDonutNoProximoRender = false;
// Mesma lógica da flag acima, só que pro gráfico de barras (valor em
// estoque por marca) — liga só em cliques de verdade (chip, card, legenda,
// clear-filters, ou numa barra), nunca em toda renderização.
let animarBarraNoProximoRender = false;
// Mesma lógica, agora pros 6 contadores de KPI no topo — liga só em
// seleções reais (chip, card, clear-filters, donut, legenda), nunca em
// toda renderização (senão os números "recarregariam" a cada tecla
// digitada na busca).
let animarKpiNoProximoRender = false;
// Mesma lógica, agora pro grid da Rotina de Compras — liga só ao trocar
// o dia da semana selecionado, nunca em toda renderização (senão os
// cartões "recarregariam" a cada tecla digitada na busca ou a cada
// atualização automática).
let animarRotinaNoProximoRender = false;
// Mesma lógica, agora pros gráficos da aba Vendas (marcas mais/menos
// vendidas) — liga só ao clicar numa barra desses gráficos.
let animarMarcasVendasNoProximoRender = false;
// Mesma lógica, pras 3 tabelas com entrada animada da aba Vendas
// (produtos mais/menos vendidos, relatório por marca, sem giro) — liga
// só ao trocar um filtro de verdade (grupo, marca), nunca em toda
// renderização (senão as linhas "recarregariam" a cada atualização
// automática).
let animarTabelasVendasNoProximoRender = false;
let marcasMaisVendasChartInstance = null;
let marcasMenosVendasChartInstance = null;
let vendasQtdMarcaChartInstance = null; // donut simples, nunca anima — sempre recriado, sem custo extra
let vendasQtdGrupoChartInstance = null;
let vendasEvolucaoChartInstance = null;
let vendasTicketAnoChartInstance = null;
let buscaItensCriticosTexto = ''; // busca dentro da seção de itens críticos
let buscaItensNormaisTexto = ''; // busca dentro da seção "demais itens"
let pedidosEmAberto = new Map(); // normalizarProduto(produto) -> quantidade em aberto (soma se repetir)
// Impressao digital (nome+tamanho+data de modificacao) de cada arquivo ja
// importado nessa sessao -- usado so pra avisar se o mesmo arquivo for
// importado de novo por engano, ja que pedidosEmAberto SOMA a cada
// importacao (proposital, pra acumular varios pedidos diferentes).
let arquivosPedidosAbertoImportados = new Set();
const CHAVE_LOCALSTORAGE_PEDIDOS_ABERTO = 'bradisfer_pedidosEmAberto';
// Salva pedidosEmAberto no localStorage (sobrevive a recarregar a pagina).
// Chamado depois de toda importacao de arquivo e toda edicao manual.
function salvarPedidosEmAbertoNoLocalStorage() {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE_PEDIDOS_ABERTO, JSON.stringify(Array.from(pedidosEmAberto.entries())));
  } catch (erro) {
    console.warn('Nao consegui salvar pedidos em aberto no localStorage:', erro);
  }
}
// Recarrega pedidosEmAberto do localStorage (chamado uma vez, no inicio).
function carregarPedidosEmAbertoDoLocalStorage() {
  try {
    const salvo = localStorage.getItem(CHAVE_LOCALSTORAGE_PEDIDOS_ABERTO);
    if (salvo) pedidosEmAberto = new Map(JSON.parse(salvo));
  } catch (erro) {
    console.warn('Nao consegui carregar pedidos em aberto do localStorage:', erro);
  }
}
carregarPedidosEmAbertoDoLocalStorage();
// Dados da planilha de análise (Média, Desvio, Ponto de Pedido, etc.) —
// persiste entre atualizações. Se uma busca vier vazia ou muito menor que
// a anterior (Google Sheets sendo editado bem na hora da consulta, por
// exemplo), mantém os últimos dados bons em vez de perder tudo.
let minMaxPlanilhaPersistente = new Map();
// Mesma lógica de persistência que minMaxPlanilhaPersistente, só que pra
// venda AO VIVO em lote (chave: código de barras).
let vendasVivoPersistente = new Map();
let diaRotinaSelecionado = null; // null até carregar — definido pra "hoje" (ou SEG se hoje for fim de semana)

// ----------------------------------------------------------------------
// Rotina de Compras (ROTINA_DE_COMPRAS_BRADISFER_v2) — quais fornecedores
// revisar em cada dia da semana, conforme o Lead Time de cada um.
// t: 'SEMANAL' | 'QUINZENAL' | 'MENSAL' · d: dia da semana ('SEG'..'SEX')
// s: null (semanal) | 'S1+S3'/'S2+S4' (quinzenal) | 1..4 (mensal, número da semana do mês)
// ----------------------------------------------------------------------
// Lead Time Total por marca (dias) — independe do produto bater ou não
// na planilha de análise, então cobre também os casos sem match.
// Já inclui os aliases confirmados: TD METAIS -> SV METAIS,
// AGUIA FORCE -> AGUIA FORCE (PYRAMID).
const LEAD_TIME_POR_MARCA = {
  'ADELBRAS': 29,
  'AGUIA FORCE': 271,
  'AGUIA FORCE (PYRAMID)': 271,
  'AKATO': 45,
  'ALIANÇA': 51,
  'ALLTAPE': 46,
  'ARTBOR': 76,
  'ASTONIA': 76,
  'AVANT': 61,
  'BRASFORT': 41,
  'BRASLIDER': 46,
  'CASTOR': 35,
  'CHEMICOLOR': 35,
  'CHESIQUIMICA': 61,
  'CLARINOX': 29,
  'COLOR&COLA': 55,
  'COMPEL': 32,
  'DAMA METAIS': 28,
  'DELFLEX': 56,
  'DEPLASTI': 45,
  'DISFLEX': 29,
  'DIVERSOS': 23,
  'DIX': 23,
  'DOAN': 23,
  'EDUARDO EPI': 23,
  'ELITE': 23,
  'ETANIZ': 28,
  'FERTAK': 28,
  'FIOLUX': 30,
  'FIRMEZA': 166,
  'FORCE': 46,
  'FOX BRASIL': 51,
  'GARDEN': 23,
  'GERDAU': 29,
  'GIROCOR': 28,
  'GOMES GARCIA': 58,
  'GTFIX': 56,
  'HIPERFITA': 23,
  'IBERE': 25,
  'ILUMI': 42,
  'IMBAT': 37,
  'INJEPLASTEC': 38,
  'INJEREST': 23,
  'INPLAST': 23,
  'ISAC SACARIA': 32,
  'ITAQUA': 37,
  'IV PLAST': 23,
  'JIMO': 46,
  'JNG': 23,
  'JOPACK': 23,
  'KALIPSO': 23,
  'KIAN': 30,
  'KNC': 23,
  'LINHAL': 30,
  'LIXAS TATU': 30,
  'LONAPACK': 23,
  'LORENZETTI': 23,
  'LOTUS': 23,
  'LUCONI': 30,
  'MAESTRO': 30,
  'MASTIFLEX': 23,
  'MAX FERRAMENTAS': 44,
  'MAXI FORCE': 23,
  'MB': 23,
  'MEGAÓ': 23,
  'METALOSA': 23,
  'MINASUL': 30,
  'MOMFORT': 23,
  'MORIA': 46,
  'MORLAN': 29,
  'MULTIFIX': 46,
  'MUNDIAL PRIME': 23,
  'NAUTIKA': 46,
  'NEW PALLETS': 23,
  'NEW-FIX': 37,
  'OAMA INDUSTRIA DE VALVULAS EIRELI': 23,
  'OVERTIME': 46,
  'PADO': 46,
  'PAULICEIA': 46,
  'PENEIRAS SÃO JORGE': 30,
  'PILLER': 56,
  'PLASTILIT': 23,
  'PRATIMIX': 46,
  'PYRAMID': 53,
  'RAYCO': 23,
  'RAYMA BOMBAS': 23,
  'RIOMAR': 46,
  'ROCO': 46,
  'ROPER PLAST': 61,
  'S.LOPES': 23,
  'SAMPAFLEX': 30,
  'SANTANA': 46,
  'SERLONAS': 61,
  'SOLDACAPA': 61,
  'SOLUÇÃO': 23,
  'SS METAIS': 35,
  'STARFER': 23,
  'SV METAIS': 39,
  'SV METAIS-REPAROS': 39,
  'TAF': 45,
  'TBR': 23,
  'TD METAIS': 39,
  'TECNOPRADO': 30,
  'TECNYL': 46,
  'TEKBOND': 23,
  'TERMOBRAS': 46,
  'TINTAS JUMBO': 46,
  'TOOLS WORLD': 23,
  'TORALF': 23,
  'TRAMONTINA': 29,
  'TRAMONTINA FERRAMENTA': 38,
  'TUBOS BRAVO': 23,
  'UNIFIO': 61,
  'UNIFORTTE': 46,
  'UNIPRO': 31,
  'UNIWELD': 46,
  'VEDA FLON': 23,
  'VEDATUDO': 23,
  'VEDAX': 23,
  'VITESSE': 23,
  'VONDER': 20,
  'WHILCLA': 23,
  'WORLD TINTAS': 23,
  'WS CORRENTES': 46
};

const ROTINA_COMPRAS = [
  {f:'FERTAK',t:'SEMANAL',d:'SEG',s:null},
  {f:'OAMA INDUSTRIA DE VALVULAS EIRELI',t:'SEMANAL',d:'SEG',s:null},
  {f:'MUNDIAL PRIME',t:'SEMANAL',d:'TER',s:null},
  {f:'VEDAX',t:'SEMANAL',d:'TER',s:null},
  {f:'DIVERSOS',t:'SEMANAL',d:'QUA',s:null},
  {f:'GIROCOR',t:'SEMANAL',d:'QUA',s:null},
  {f:'INJEPLASTEC',t:'SEMANAL',d:'QUA',s:null},
  {f:'PYRAMID',t:'SEMANAL',d:'QUA',s:null},
  {f:'SV METAIS (OAMA ou TD METAIS)',t:'SEMANAL',d:'QUA',s:null},
  {f:'HIPERFITA( IMPERIO HIPER)',t:'SEMANAL',d:'QUI',s:null},
  {f:'INJEREST',t:'SEMANAL',d:'QUI',s:null},
  {f:'RAYCO (KIAN)',t:'SEMANAL',d:'QUI',s:null},
  {f:'SV METAIS-REPAROS (BRUNO DIAS)',t:'SEMANAL',d:'QUI',s:null},
  {f:'TRAMONTINA (ELETRIK)',t:'SEMANAL',d:'QUI',s:null},
  {f:'VEDATUDO (DRYKO)',t:'SEMANAL',d:'QUI',s:null},
  {f:'ETANIZ (CHESIQUIMICA)',t:'SEMANAL',d:'SEX',s:null},
  {f:'INPLAST',t:'SEMANAL',d:'SEX',s:null},
  {f:'TRAMONTINA FERRAMENTA  (MULT)',t:'SEMANAL',d:'SEX',s:null},
  {f:'ADELBRAS (CCL)',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'CASTOR',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'CLARINOX',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'COMPEL',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'DISFLEX',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'FIOLUX',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'IBERE (MAXI RUBBER )',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'IMBAT',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'ITAQUA',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'LINHAL',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'LIXAS TATU',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'LUCONI',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'SAMPAFLEX',t:'QUINZENAL',d:'SEG',s:'S1+S3'},
  {f:'CHEMICOLOR (BASTON)',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'GERDAU',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'ILUMI',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'KIAN',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'MAESTRO',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'MINASUL',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'NEW-FIX',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'PENEIRAS SÃO JORGE',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'SS METAIS',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'TAF',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'TECNOPRADO',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'UNIPRO',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'VONDER',t:'QUINZENAL',d:'QUA',s:'S2+S4'},
  {f:'AGUIA FORCE (PYRAMID)',t:'MENSAL',d:'SEG',s:1},
  {f:'AVANT (LPS)',t:'MENSAL',d:'SEG',s:1},
  {f:'BRASLIDER',t:'MENSAL',d:'SEG',s:1},
  {f:'DEPLASTI',t:'MENSAL',d:'SEG',s:1},
  {f:'GTFIX',t:'MENSAL',d:'SEG',s:1},
  {f:'MULTIFIX',t:'MENSAL',d:'SEG',s:1},
  {f:'PADO',t:'MENSAL',d:'SEG',s:1},
  {f:'SANTANA',t:'MENSAL',d:'SEG',s:1},
  {f:'TERMOBRAS',t:'MENSAL',d:'SEG',s:1},
  {f:'UNIFORTTE',t:'MENSAL',d:'SEG',s:1},
  {f:'ARTBOR',t:'MENSAL',d:'TER',s:2},
  {f:'BRASFORT (BRAFT)',t:'MENSAL',d:'TER',s:2},
  {f:'DELFLEX',t:'MENSAL',d:'TER',s:2},
  {f:'MORIA',t:'MENSAL',d:'TER',s:2},
  {f:'ROPER PLAST',t:'MENSAL',d:'TER',s:2},
  {f:'SOLDACAPA',t:'MENSAL',d:'TER',s:2},
  {f:'ASTONIA',t:'MENSAL',d:'QUA',s:3},
  {f:'CHESIQUIMICA',t:'MENSAL',d:'QUA',s:3},
  {f:'FORCE',t:'MENSAL',d:'QUA',s:3},
  {f:'JIMO',t:'MENSAL',d:'QUA',s:3},
  {f:'NAUTIKA',t:'MENSAL',d:'QUA',s:3},
  {f:'PILLER',t:'MENSAL',d:'QUA',s:3},
  {f:'ROCO',t:'MENSAL',d:'QUA',s:3},
  {f:'TECNYL',t:'MENSAL',d:'QUA',s:3},
  {f:'WS CORRENTES',t:'MENSAL',d:'QUA',s:3},
  {f:'AKATO',t:'MENSAL',d:'QUI',s:4},
  {f:'ALLTAPE',t:'MENSAL',d:'QUI',s:4},
  {f:'COLOR&COLA (PETKOV)',t:'MENSAL',d:'QUI',s:4},
  {f:'FIRMEZA',t:'MENSAL',d:'QUI',s:4},
  {f:'FOX BRASIL',t:'MENSAL',d:'QUI',s:4},
  {f:'MAX FERRAMENTAS',t:'MENSAL',d:'QUI',s:4},
  {f:'OVERTIME',t:'MENSAL',d:'QUI',s:4},
  {f:'PRATIMIX',t:'MENSAL',d:'QUI',s:4},
  {f:'SERLONAS',t:'MENSAL',d:'QUI',s:4},
  {f:'UNIFIO',t:'MENSAL',d:'QUI',s:4}
];

function fmtMoeda(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); }
function fmtNum(v) { return v.toLocaleString('pt-BR'); }

// Escapa texto vindo da planilha/API (produto, marca, fornecedor...) antes de
// jogar em innerHTML — sem isso, um nome de produto com "<" ou "&" quebra o
// layout, e alguém com acesso de edição na planilha poderia injetar HTML/JS.
const MAPA_ESCAPE_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(texto) {
  return String(texto == null ? '' : texto).replace(/[&<>"']/g, ch => MAPA_ESCAPE_HTML[ch]);
}

// Retrofita acessibilidade de teclado em elementos clicáveis que não são
// <button>/<a>/<input>/<select> nativos (chips, linhas de tabela, cards...):
// dá foco via Tab e ativa com Enter/Espaço, sem precisar reescrever cada
// template de HTML pra usar <button>.
function tornarClicaveisAcessiveis(raiz) {
  raiz.querySelectorAll('.clickable, .chip, .legend-item, .autocomplete-item, thead th[data-col]').forEach(el => {
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    // <th> mantém o role nativo de columnheader (o aria-sort abaixo já avisa
    // que é ordenável) — sobrescrever pra "button" faria o leitor de tela
    // perder a associação da coluna com as células da tabela.
    if (tag !== 'TH' && !el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (!el.dataset.a11yClique) {
      el.dataset.a11yClique = '1';
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
    }
  });
  raiz.querySelectorAll('thead th[data-col]').forEach(th => {
    const seta = th.querySelector('.arrow');
    const dir = seta ? seta.textContent.trim() : '';
    th.setAttribute('aria-sort', dir === '▲' ? 'ascending' : dir === '▼' ? 'descending' : 'none');
  });
}

// Gera e baixa um CSV (";" como separador e vírgula decimal, pra abrir certo
// no Excel BR sem precisar de "Texto em colunas") a partir de uma matriz de
// linhas. BOM no começo garante que acentos apareçam corretos no Excel.
function baixarCSV(nomeArquivo, cabecalhos, linhas) {
  const formatarCampo = valor => {
    const texto = String(valor == null ? '' : valor);
    return /[;"\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  };
  const conteudo = [cabecalhos, ...linhas].map(l => l.map(formatarCampo).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Nomes de aba do Excel tem limite de 31 caracteres e nao aceitam
// : \ / ? * [ ] -- sanitiza e desempata nomes que colidiram depois do
// corte (ex. duas marcas que só diferem depois do caractere 31).
function sanitizarNomeAba(nome, nomesJaUsados) {
  let base = String(nome).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Marca';
  let candidato = base;
  let sufixo = 2;
  while (nomesJaUsados.has(candidato.toLowerCase())) {
    const corte = 31 - String(sufixo).length - 1;
    candidato = base.slice(0, corte) + '_' + sufixo;
    sufixo++;
  }
  nomesJaUsados.add(candidato.toLowerCase());
  return candidato;
}

// Exporta um .xlsx com todos os itens de estoque zerado (situação
// RUPTURA) de hoje: uma aba "Resumo" com a contagem/valor por marca, e
// uma aba por marca com a lista de itens dela. Usa a lib SheetJS (xlsx),
// carregada via CDN no index.html.
function exportarZeradosExcel() {
  const zerados = dadosCompletos.filter(d => d.situacao === 'RUPTURA');
  if (zerados.length === 0) {
    alert('Nenhum item com estoque zerado no momento.');
    return;
  }

  const porMarca = new Map(); // marca -> itens[]
  zerados.forEach(d => {
    const chave = d.marca || '(sem marca)';
    if (!porMarca.has(chave)) porMarca.set(chave, []);
    porMarca.get(chave).push(d);
  });
  const marcasOrdenadas = [...porMarca.keys()].sort((a, b) => a.localeCompare(b));

  const wb = XLSX.utils.book_new();

  const linhasResumo = marcasOrdenadas.map(marca => {
    const itens = porMarca.get(marca);
    return {
      Marca: marca,
      'Itens zerados': itens.length,
      'Valor a repor (mínimo)': itens.reduce((s, d) => s + (d.valorRepor || 0), 0),
    };
  });
  linhasResumo.push({
    Marca: 'TOTAL',
    'Itens zerados': zerados.length,
    'Valor a repor (mínimo)': zerados.reduce((s, d) => s + (d.valorRepor || 0), 0),
  });
  const wsResumo = XLSX.utils.json_to_sheet(linhasResumo);
  wsResumo['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  const nomesAbasUsados = new Set(['resumo']);
  marcasOrdenadas.forEach(marca => {
    const itens = [...porMarca.get(marca)].sort((a, b) => a.produto.localeCompare(b.produto));
    const linhas = itens.map(d => ({
      Produto: d.produto,
      'Código de Barras': d.codigoBarras,
      Grupo: d.grupo,
      Mínimo: d.minimo,
      Máximo: d.maximo,
      Custo: d.custo || 0,
      'Valor a repor (mínimo)': d.valorRepor || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws['!cols'] = [{ wch: 45 }, { wch: 16 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, sanitizarNomeAba(marca, nomesAbasUsados));
  });

  const dataHoje = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, 'estoque_zerado_por_marca_' + dataHoje + '.xlsx');
}

// Versão abreviada pros cards de KPI (evita estourar a largura do card
// com valores grandes, tipo R$ 4.334.163 -> R$ 4,33 mi)
function fmtMoedaCompacta(v) {
  const abs = Math.abs(v);
  if (abs >= 1000000) return 'R$ ' + (v / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi';
  if (abs >= 1000) return 'R$ ' + (v / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mil';
  return fmtMoeda(v);
}

function parseNumeroBR(raw) {
  if (raw === undefined || raw === null) return 0;
  let s = String(raw).trim();
  if (s === '') return 0;
  s = s.replace(/[^0-9,.\-]/g, '');
  if (s === '' || s === '-') return 0;
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  } else if (s.includes('.')) {
    const partes = s.split('.');
    if (partes.length > 1 && partes[partes.length - 1].length === 3) {
      s = s.replace(/\./g, '');
    }
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

function parseCSV(texto) {
  const linhas = [];
  let campo = '', linhaAtual = [], dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i], prox = texto[i + 1];
    if (dentroAspas) {
      if (c === '"' && prox === '"') { campo += '"'; i++; }
      else if (c === '"') { dentroAspas = false; }
      else { campo += c; }
    } else {
      if (c === '"') { dentroAspas = true; }
      else if (c === ',') { linhaAtual.push(campo); campo = ''; }
      else if (c === '\r') { /* ignora */ }
      else if (c === '\n') { linhaAtual.push(campo); campo = ''; linhas.push(linhaAtual); linhaAtual = []; }
      else { campo += c; }
    }
  }
  if (campo !== '' || linhaAtual.length > 0) { linhaAtual.push(campo); linhas.push(linhaAtual); }
  if (linhas.length === 0) return [];
  const cabecalho = linhas[0];
  return linhas.slice(1).filter(l => l.some(v => v !== '')).map(l => {
    const obj = {};
    cabecalho.forEach((h, idx) => { obj[h] = l[idx] !== undefined ? l[idx] : ''; });
    return obj;
  });
}

// A automacao grava o codigo de barras com uma aspa simples na FRENTE do
// valor (ex. "'0074468051034") -- nao como dica de formatacao do Sheets
// (isso so funciona digitando na UI ou com USER_ENTERED, e mesmo assim o
// Sheets as vezes reconverte o texto pra numero num recalculo depois,
// perdendo zero a esquerda -- ver CONTEXTO.md). A aspa faz parte do
// CONTEUDO de verdade da celula (escrita como RAW), o que torna o valor
// permanentemente nao-numerico e imune a qualquer reformatacao. Aqui so
// tira essa aspa de volta antes de usar o codigo.
function limparCodigoBarras(valor) {
  return String(valor || '').trim().replace(/^'/, '');
}

// id do elemento -> último valor numérico que ele terminou de mostrar.
// Chave por el.id (string), não por referência ao nó: renderizar() reescreve
// #app inteiro via innerHTML a cada chamada, então o <div id="kpi-total">
// de agora é sempre um objeto DOM novo — uma chave por referência nunca
// bateria entre renders, e a barra sempre recomeçaria do zero mesmo com
// esse Map. animarAgora segue a mesma convenção de animarDonutNoProximoRender:
// true só quando a renderização veio de uma seleção real do usuário.
const ultimoValorKpi = {};

// prefers-reduced-motion pro lado JS. O @media do CSS não alcança config de
// biblioteca (Chart.js) nem animação por requestAnimationFrame, então quem
// pediu menos movimento no sistema precisa ser checado explicitamente aqui —
// senão o donut continua girando e o número continua contando. matchMedia é
// vivo: mudou a preferência, .matches reflete na hora, sem recarregar.
const mediaMotionReduzido = window.matchMedia('(prefers-reduced-motion: reduce)');
function motionReduzido() { return mediaMotionReduzido.matches; }

function animarNumero(el, valorFinal, formatador, duracaoMs, animarAgora) {
  const chave = el.id;
  if (!animarAgora || document.hidden || motionReduzido()) {
    el.textContent = formatador(valorFinal);
    ajustarFonteParaCaber(el);
    if (chave) ultimoValorKpi[chave] = valorFinal;
    return;
  }

  const de = (chave && chave in ultimoValorKpi) ? ultimoValorKpi[chave] : 0;
  const inicio = performance.now();
  function passo(agora) {
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = formatador(de + (valorFinal - de) * ease);
    ajustarFonteParaCaber(el);
    if (t < 1) {
      requestAnimationFrame(passo);
    } else if (chave) {
      ultimoValorKpi[chave] = valorFinal;
    }
  }
  requestAnimationFrame(passo);
}

// Garante que o valor NUNCA estoure a largura do card: reduz o
// tamanho da fonte em passos pequenos até caber, com um piso mínimo
// legível. Roda a cada frame da animação (é uma operação barata).
function ajustarFonteParaCaber(el) {
  const tamanhoMax = 27, tamanhoMin = 14;
  let tamanho = tamanhoMax;
  el.style.fontSize = tamanho + 'px';
  while (el.scrollWidth > el.clientWidth && tamanho > tamanhoMin) {
    tamanho -= 1;
    el.style.fontSize = tamanho + 'px';
  }
}

// Espera um pouquinho depois da última tecla digitada antes de redesenhar
// o painel inteiro — sem isso, cada letra redesenha tudo (KPIs, gráficos,
// tabelas), o que fica pesado principalmente no celular.
function debounce(fn, atrasoMs) {
  let temporizador = null;
  return function (...args) {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn.apply(this, args), atrasoMs);
  };
}

// Rola a tela ate o painel de resultados de uma busca (produto ou marca)
// depois que ele acabou de ser desenhado -- so os dois paineis usam esse
// id, e nunca os dois ao mesmo tempo (busca por produto x marca
// selecionada), entao basta um seletor.
function rolarParaResultadosBusca() {
  const painel = document.getElementById('painel-resultados-busca');
  if (painel) painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function normalizarProduto(texto) {
  return String(texto || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

async function carregarDados() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = 'Atualizando...';
  document.getElementById('subtitle').textContent = 'conectando...';

  try {
    const [respBase, respAnalise, respVendasVivo] = await Promise.all([
      fetch(CSV_URL + '&t=' + Date.now()),
      fetch(ANALISE_CSV_URL + '&t=' + Date.now()).catch(() => null), // fonte opcional — não trava o painel se falhar
      fetch(VENDAS_VIVO_CSV_URL + '&t=' + Date.now()).catch(() => null), // idem
    ]);
    if (!respBase.ok) throw new Error('HTTP ' + respBase.status);
    const textoBase = await respBase.text();
    const parsedData = parseCSV(textoBase);
    const linhas = parsedData.filter(r => r['Código Barras'] && String(r['Código Barras']).trim() !== '');

    // ---- fonte 2 (opcional): Mínimo/Máximo calculados na planilha de análise ----
    const minMaxPlanilha = new Map();
    if (respAnalise && respAnalise.ok) {
      const textoAnalise = await respAnalise.text();
      const linhasAnalise = parseCSV(textoAnalise);
      linhasAnalise.forEach(r => {
        const chave = normalizarProduto(r['Produto']);
        const minRaw = r['Estoque Mínimo (Planilha)'];
        const maxRaw = r['Estoque Máximo (Planilha)'];
        const descontinuada = String(r['Descontinuada'] || '').trim().toUpperCase() === 'SIM';
        const temMinMaxValido = !descontinuada && minRaw !== '' && maxRaw !== '' && minRaw !== undefined && maxRaw !== undefined;
        if (chave) {
          minMaxPlanilha.set(chave, {
            min: temMinMaxValido ? parseNumeroBR(minRaw) : null,
            max: temMinMaxValido ? parseNumeroBR(maxRaw) : null,
            temMinMaxValido,
            descontinuada,
            mediaMensal: parseNumeroBR(r['Média Mensal']),
            desvioPadrao: parseNumeroBR(r['Desvio Padrão']),
            curva: r['Curva'] || '',
            leadTimeTotal: parseNumeroBR(r['Lead Time Total']),
            pontoPedido: r['Ponto de Pedido'] !== '' ? parseNumeroBR(r['Ponto de Pedido']) : null,
            pedidoSugerido: r['Pedido Sugerido'] !== '' ? parseNumeroBR(r['Pedido Sugerido']) : null,
            nivelAtendimento: parseNumeroBR(r['Nível Atendimento']),
            constanteZ: parseNumeroBR(r['Constante Z']),
            tempoReposicaoMeses: parseNumeroBR(r['Tempo Reposição (Meses)']),
            loteMinimo: parseNumeroBR(r['Lote Mínimo']),
            loteEconomico: parseNumeroBR(r['Lote Econômico']),
            vendaMediaDia3M: parseNumeroBR(r['Venda Média Dia (3M)']),
            estoqueSeguranca: r['Estoque de Segurança'] !== '' ? parseNumeroBR(r['Estoque de Segurança']) : null,
          });
        }
      });
    }

    // Só substitui os dados persistentes se a busca trouxe algo razoável.
    // Se veio vazia ou muito menor que a versão anterior (ex.: planilha
    // sendo editada bem na hora da consulta automática), mantém a última
    // versão boa em vez de fazer produtos "perderem" o match temporariamente.
    const ehRazoavel = minMaxPlanilha.size > 0 &&
      (minMaxPlanilhaPersistente.size === 0 || minMaxPlanilha.size >= minMaxPlanilhaPersistente.size * 0.5);
    if (ehRazoavel) {
      minMaxPlanilhaPersistente = minMaxPlanilha;
    }

    // ---- fonte 3 (opcional): Vendas AO VIVO em lote (Apps Script + Sysemp) ----
    const vendasVivo = new Map();
    if (respVendasVivo && respVendasVivo.ok) {
      const textoVendasVivo = await respVendasVivo.text();
      const linhasVendasVivo = parseCSV(textoVendasVivo);
      linhasVendasVivo.forEach(r => {
        const codBarra = limparCodigoBarras(r['Código Barras']);
        if (!codBarra) return;
        const mediaMensal = r['Média Mensal'] !== '' ? parseNumeroBR(r['Média Mensal']) : null;
        if (mediaMensal === null) return; // linha com erro registrado pelo lote — ignora
        vendasVivo.set(codBarra, {
          mediaMensal,
          totalVendido: parseNumeroBR(r['Total Vendido (12M)']),
          dataUltimaVenda: r['Data Última Venda'] || '',
          qtdUltimaVenda: parseNumeroBR(r['Qtd Última Venda']),
        });
      });
    }
    const vendasVivoEhRazoavel = vendasVivo.size > 0 &&
      (vendasVivoPersistente.size === 0 || vendasVivo.size >= vendasVivoPersistente.size * 0.5);
    if (vendasVivoEhRazoavel) {
      vendasVivoPersistente = vendasVivo;
    }

    let qtdComOverride = 0;

    dadosCompletos = linhas.map(r => {
      const estoque = parseNumeroBR(r['Estoque Atual']);
      const custo = parseNumeroBR(r['Custo Unitário']);

      let minimo = parseNumeroBR(r['Estoque Mínimo']);
      let maximo = parseNumeroBR(r['Estoque Máximo']);
      let fonteMinMax = 'sysemp';

      const overridePlanilha = minMaxPlanilhaPersistente.get(normalizarProduto(r['Produto']));
      if (overridePlanilha && overridePlanilha.temMinMaxValido) {
        minimo = overridePlanilha.min;
        maximo = overridePlanilha.max;
        fonteMinMax = 'planilha';
        qtdComOverride++;
      }

      const situacao = estoque <= 0 ? 'RUPTURA' : (estoque < minimo ? 'BAIXO' : (estoque > maximo ? 'EXCESSO' : 'OK'));
      const valorEstoque = Math.max(0, estoque) * custo; // estoque negativo (venda além do saldo) não vira valor negativo
      const valorRepor = (situacao === 'RUPTURA' || situacao === 'BAIXO') ? Math.max(0, (minimo - estoque) * custo) : 0;
      const codigoBarras = limparCodigoBarras(r['Código Barras']);
      const precoMargem = precoMargemDoProduto(codigoBarras); // [margemLiquida, precoVenda] ou null se não achou na tabela de preços
      const vendasAoVivoLote = codigoBarras ? (vendasVivoPersistente.get(codigoBarras) || null) : null;
      return { produto: r['Produto'] || '', marca: r['Marca'] || '', grupo: r['Grupo'] || '(sem grupo)', codigoBarras, estoque, minimo, maximo, custo, situacao, valorEstoque, valorRepor, fonteMinMax, analise: overridePlanilha || null, margemLucro: precoMargem ? precoMargem[0] : null, precoVenda: precoMargem ? precoMargem[1] : null, vendasAoVivoLote };
    });

    const totalAntesExclusao = dadosCompletos.length;
    dadosCompletos = dadosCompletos.filter(d => !MARCAS_EXCLUIDAS.includes(d.marca.trim().toUpperCase()));
    const qtdExcluida = totalAntesExclusao - dadosCompletos.length;

    document.getElementById('subtitle').textContent = fmtNum(dadosCompletos.length) + ' produtos monitorados em tempo real' +
      (qtdExcluida > 0 ? ' · ' + fmtNum(qtdExcluida) + ' ocultos (marcas excluídas)' : '') +
      (qtdComOverride > 0 ? ' · ' + fmtNum(qtdComOverride) + ' com mín/máx da planilha de análise' : '');
    document.getElementById('updated-label').textContent = 'atualizado às ' + new Date().toLocaleTimeString('pt-BR');
    renderizar();
  } catch (err) {
    document.getElementById('app').innerHTML =
      '<div class="error-box">Não consegui buscar os dados agora (' + err.message + ').<br><br>' +
      'Se este arquivo foi aberto direto do computador (duplo clique), publique-o num link real primeiro — ' +
      'navegadores bloqueiam esse tipo de busca em páginas locais. ' +
      'Confira também se a planilha está compartilhada como "qualquer pessoa com o link pode visualizar".</div>';
    document.getElementById('subtitle').textContent = 'falha ao carregar';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Atualizar agora';
  }
}

const donutColors = { RUPTURA: '#e66767', BAIXO: '#a87c0e', EXCESSO: '#3987e5', OK: '#008300' };

// Paleta categórica pro ranking de marcas (gráfico de barras) — uma cor
// distinta por posição, girando o matiz mantendo luminosidade/saturação
// parecidas entre si (nenhuma cor "grita" mais que outra), com o dourado
// da marca como âncora na primeira posição. Todas testadas visualmente
// contra --bg-deep pra manter contraste de texto/grid legível.
const PALETA_MARCAS = ['#FFB800', '#3987e5', '#e66767', '#199e70', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6', '#84cc16', '#94a3b8'];
function corMarca(indice) { return PALETA_MARCAS[indice % PALETA_MARCAS.length]; }

// ----------------------------------------------------------------------
// TABELA DE PRECOS/MARGEM — exportada do Sysemp ("manutenção da tabela de
// preços"), casada por codigoBarras com dadosCompletos. Margem líquida é
// dado real do Sysemp, não estimativa — mas é uma FOTO ESTÁTICA do dia da
// exportação (2026-08-18): preço/margem mudam com reajuste e isso aqui não
// atualiza sozinho. Pra manter vivo, reexportar do Sysemp e colar de novo
// aqui (ou, melhor, subir pra uma aba na mesma planilha Google e buscar ao
// vivo, igual BaseLooker/AnaliseMinMax — ainda não feito).
// ----------------------------------------------------------------------
const TABELA_PRECOS = {"7899095407596":[45.3,5.72],"7908642000323":[32.2,4.38],"7908642000064":[48.5,9.14],"7908642000347":[47.7,8.96],"7908642000071":[50.6,19.39],"7908642000354":[45.4,16.93],"7908642000156":[41.2,12.11],"7908642000439":[39.0,11.55],"7908642000163":[53.5,14.97],"7908642000446":[52.9,14.67],"7908642000170":[30.4,8.76],"7908642000453":[31.2,8.97],"7908642000187":[30.6,11.22],"7908642000460":[30.2,11.21],"7899095407688":[31.7,17.23],"7908642000491":[48.7,17.24],"7908642000224":[49.4,19.61],"7908642000507":[46.7,18.29],"7908642000255":[32.0,19.73],"7908642000538":[29.7,19.08],"7908642000026":[39.4,3.35],"7908642000040":[40.4,5.15],"7908642000057":[35.4,5.61],"7908642000095":[38.4,9.13],"7908642000101":[38.4,11.23],"7908642000309":[38.8,3.3],"7908642000316":[38.6,4.94],"7908642000330":[33.0,5.37],"7908642000378":[36.5,8.79],"7908642000385":[30.7,9.65],"1080000000001":[40.9,21.92],"7898684201881":[43.2,23.54],"7898684201478":[40.9,23.54],"7898684200310":[40.9,23.54],"7898684200457":[39.6,23.68],"7898684200464":[39.5,22.85],"2190000000006":[30.7,13.56],"7898684200488":[29.5,14.72],"2240000000008":[19.3,16.53],"7898684200082":[33.4,15.83],"7898684200075":[33.4,15.83],"1127000000003":[33.6,15.88],"7898684200471":[42.9,19.28],"2410000000005":[30.2,2.49],"2100000000005":[30.0,1.73],"17898567704017":[0.2,12.69],"7898567704324":[10.5,14.17],"17898567704314":[21.7,5.41],"7908642003409":[18.0,29.56],"7908642003423":[23.3,48.89],"7908642003454":[33.3,46.4],"5898659060217":[27.8,18.35],"5898659060224":[34.1,20.58],"7899612783288":[24.6,18.98],"7908642003461":[20.5,27.83],"7908642003584":[31.6,27.23],"5898959378760":[57.7,26.14],"7897488022548":[23.8,26.98],"7897488022562":[21.8,28.63],"17898567700033":[14.1,6.64],"7898915994247":[12.4,18.5],"7898915994254":[13.6,17.26],"7908642005915":[23.2,15.11],"7898659061816":[28.8,17.08],"7898003890956":[17.7,1.72],"7898659060420":[44.5,16.63],"7898684201836":[11.6,1.52],"7898941890179":[63.3,10.28],"7894061006018":[55.7,0.54],"7898684201829":[40.3,5.12],"7894061009736":[24.7,24.61],"7898684201850":[17.8,5.96],"7898684201843":[19.6,4.07],"7893394007822":[20.3,4.88],"7898684201874":[23.3,7.6],"7898684201980":[15.5,10.16],"7898684201867":[23.8,8.51],"7897488010248":[18.5,9.76],"7898159700307":[29.8,7.53],"3550000000007":[14.8,67.07],"3530000000009":[37.6,31.53],"7898684201461":[-7.3,83.18],"7898684200136":[23.8,42.13],"7898684200938":[35.7,34.86],"3200000000001":[22.0,23.22],"7898684201331":[33.8,34.59],"7898003890505":[16.4,12.82],"7898003890512":[24.3,8.94],"7898003890543":[24.1,5.69],"07898902513178":[23.5,5.57],"07898902513185":[19.1,6.09],"7898959378669":[59.0,242.69],"7898959378676":[58.1,260.97],"7898959378690":[42.7,348.35],"7898959378539":[47.6,48.52],"7898959378546":[43.5,46.9],"7898959378553":[43.1,49.35],"7898959378560":[44.7,57.4],"7898959378577":[32.4,73.34],"7898959378584":[36.1,78.46],"7898959378591":[50.6,80.89],"7898959378607":[55.5,119.62],"7898959378614":[39.9,136.76],"7898959378621":[46.2,168.19],"124":[58.3,178.8],"7898959378645":[42.5,201.82],"7898659062219":[37.1,8.98],"7898659062165":[52.5,6.3],"7898659062127":[40.7,5.49],"7898659062196":[45.5,7.93],"7898659062141":[43.3,5.94],"7898659062134":[43.2,5.48],"7898659062189":[48.3,7.34],"7898659062158":[31.8,5.98],"7898659062202":[45.6,8.64],"7898659062172":[45.0,6.54],"2009000000001":[20.9,210.05],"7898659062400":[58.2,2.04],"7898659062417":[24.6,1.47],"7898659062424":[63.5,1.75],"7898659062431":[56.9,2.11],"7898659062448":[42.6,2.34],"7898659062455":[39.8,2.74],"7898659062462":[58.8,3.23],"7898659062479":[56.4,4.45],"7898659062486":[54.8,4.71],"7898659062493":[58.8,5.2],"7898659062509":[52.4,5.56],"7898659062516":[49.4,5.93],"7898659062523":[53.4,6.89],"7898659062530":[44.0,7.52],"7898659062547":[46.2,8.76],"7898659062554":[30.6,8.81],"7898659062561":[54.9,10.33],"7898659062578":[29.8,12.35],"7898659062585":[48.9,14.79],"7898659062592":[38.0,17.14],"7898659062608":[25.3,21.44],"7898659062615":[20.4,25.8],"7898659062349":[62.3,9.64],"7898659062356":[42.6,13.72],"7898659062288":[50.5,2.83],"7898659062295":[66.7,4.42],"7898659062301":[58.4,4.26],"7898659062318":[62.9,5.86],"7898659062325":[42.2,5.83],"7898659062332":[62.1,7.26],"167":[40.4,12.93],"168":[36.7,16.82],"2408000000002":[36.4,7.68],"7898659062882":[51.2,12.56],"7898659063698":[46.7,173.07],"7898659061946":[30.1,12.89],"7898659061953":[31.9,13.46],"7898659063605":[36.0,27.59],"7898659063612":[43.3,34.85],"7898659063629":[34.8,44.57],"7898659061960":[26.7,46.73],"7898659063636":[27.0,46.17],"7898659063643":[45.1,71.32],"7898659063650":[33.5,77.89],"7898659063667":[47.0,86.54],"7898659063674":[47.3,95.2],"7898659061922":[37.6,8.97],"7898659063681":[25.4,112.5],"7898659061939":[43.4,10.48],"8080000000004":[24.3,53.21],"7898659065890":[24.2,11.72],"9000000000001":[40.6,7.49],"9010000000000":[32.0,8.13],"7898659065906":[18.0,8.96],"7898659065883":[26.0,11.0],"7898659062066":[68.7,8.77],"7898659062073":[55.6,10.92],"7898659061793":[68.8,2.34],"7898659061809":[70.1,2.48],"7898659062035":[71.5,3.2],"7898659062042":[70.1,3.81],"7898659062059":[61.8,4.51],"1990000000003":[32.3,46.37],"7898659062080":[55.2,10.95],"7898659062110":[44.3,18.38],"7898659062226":[53.0,16.14],"7898659062240":[33.7,37.67],"7898659062233":[46.4,23.35],"2000000000008":[32.6,81.67],"2001000000005":[32.6,81.65],"2016000000009":[37.2,272.17],"2002000000002":[26.4,81.65],"2017000000006":[36.2,366.41],"2003000000009":[26.4,81.67],"2018000000003":[36.3,397.81],"2019000000000":[36.4,439.69],"2004000000006":[20.5,81.65],"2005000000003":[20.5,81.65],"2006000000000":[17.3,73.02],"2007000000007":[20.9,90.64],"2008000000004":[8.4,78.93],"2010000000007":[21.5,93.22],"2011000000004":[29.8,128.76],"2012000000001":[26.9,141.33],"2013000000008":[37.0,181.45],"2014000000005":[34.2,205.49],"2015000000002":[31.5,251.24],"7898659062622":[37.6,7.28],"7898659062646":[31.9,7.78],"7898659062639":[54.1,8.16],"7898659062653":[53.2,7.9],"7898659062660":[58.6,8.87],"7898659062677":[59.3,11.36],"7898659062684":[63.8,9.9],"7898659062691":[60.1,11.78],"7898659062707":[62.5,11.75],"7898659062714":[60.3,13.35],"7898659062721":[40.0,12.96],"7898659062738":[38.0,15.5],"7898659062745":[55.0,25.69],"7898659062752":[43.3,33.8],"7898659062769":[47.5,36.65],"7898659062776":[38.4,36.57],"7898659062783":[38.4,41.32],"7898659062790":[48.2,46.2],"7898659062806":[37.1,48.24],"7898659062813":[48.2,51.58],"7898659062820":[33.5,49.95],"7897488000065":[14.7,6.21],"7897488000027":[18.9,6.14],"7897488009938":[27.8,9.93],"7893308005883":[37.2,4.88],"7893308005869":[7.6,8.32],"7898684201812":[20.2,9.35],"7898003890420":[14.8,7.06],"7897488022005":[22.8,21.94],"7897488017056":[21.8,16.35],"7897488016981":[30.7,31.89],"7898921098014":[19.5,11.33],"7898921098281":[23.6,12.94],"7898921098342":[26.1,12.87],"7898921098311":[26.1,12.87],"7898921098298":[23.3,12.87],"7898921098335":[21.6,12.25],"7898921098021":[19.3,12.32],"7898921098038":[19.5,13.86],"7898921098045":[22.5,18.29],"7898921098700":[14.2,19.95],"7898921098694":[15.8,32.0],"7898921098267":[22.5,20.86],"7898921098250":[21.0,22.1],"7898312140162":[38.1,10.04],"7898312140193":[11.3,12.12],"7898312140179":[38.1,10.04],"7898312140186":[6.9,12.12],"7908642000835":[25.7,15.69],"7897488015458":[20.0,41.06],"7897488013690":[26.9,41.43],"7894061000467":[37.9,3.36],"7908642004598":[27.3,8.81],"7908642004604":[23.0,8.49],"7908642004611":[24.4,10.64],"7908642004628":[24.4,11.22],"7908642004635":[24.9,12.11],"7908642004642":[26.0,14.98],"7908642004659":[28.8,18.05],"7908642004666":[26.3,17.63],"7908642004680":[37.1,27.84],"7899095403895":[11.5,33.65],"7899095404458":[12.9,35.51],"7899095405011":[34.7,43.36],"7908642004574":[26.1,7.16],"7908642004581":[28.8,8.41],"7908642004017":[28.3,5.05],"7908642004024":[28.7,5.29],"7908642004031":[29.5,6.2],"7908642004048":[29.5,6.39],"7908642004055":[30.2,6.71],"7908642004062":[27.5,8.18],"7899095406766":[43.6,7.35],"7908642005588":[44.1,5.2],"7908642005601":[39.4,5.56],"7908642005656":[43.8,10.25],"7899095407237":[24.2,11.76],"7898924256213":[22.6,11.57],"7898659063001":[40.4,46.77],"7898659063018":[36.8,49.9],"7898659063025":[27.5,53.02],"7899095406742":[48.7,7.0],"7908642005540":[39.3,3.22],"7908642005564":[36.3,3.51],"7908642005687":[42.6,6.07],"7908642005700":[41.7,6.98],"7908642005731":[46.8,3.85],"7908642005755":[43.5,4.04],"7908642005793":[36.6,5.36],"7908642005854":[35.4,11.51],"7898924256251":[22.6,12.13],"7898659063148":[35.5,30.75],"7897488015939":[15.3,13.86],"7897488015960":[17.2,17.03],"7897488015946":[17.1,15.2],"7897488015953":[16.5,16.03],"7908642006035":[40.9,13.7],"7982505483171":[17.0,4.5],"7898373050011":[8.0,36.99],"7898003890260":[14.4,19.22],"7898003890253":[14.4,18.63],"7898003891236":[26.0,23.26],"7898003891229":[41.9,21.82],"7898003890246":[14.5,10.31],"7898003890284":[14.4,11.17],"7898003891212":[34.3,12.83],"7898003891267":[14.5,13.49],"7898003891274":[14.5,14.19],"7898003890277":[14.4,14.97],"7898003891243":[14.5,14.14],"7898003890291":[14.5,15.79],"7898003894237":[18.2,11.81],"7898003895111":[22.2,18.83],"7898003894220":[22.1,11.67],"7898003895104":[22.2,17.91],"17898907527993":[23.6,12.68],"7897488006876":[19.8,12.46],"7897488006821":[18.5,26.68],"7898937717374":[37.7,21.2],"7898903892234":[24.2,2.78],"7898937717343":[18.0,6.27],"7898959378034":[43.8,13.28],"7898903892616":[46.8,2.44],"7898937717763":[12.8,6.58],"7898659060512":[43.3,63.73],"7897488003134":[18.2,13.23],"7897488003158":[18.5,20.13],"7898659061496":[25.0,165.47],"1831000000009":[31.4,137.79],"1832000000006":[26.2,150.43],"1807000000004":[57.8,178.59],"1809000000008":[54.9,249.49],"384":[26.2,117.0],"385":[37.6,133.7],"386":[30.6,117.0],"387":[30.6,117.0],"388":[26.2,117.0],"389":[26.2,117.0],"1812000000008":[30.6,117.0],"7898659061465":[51.6,51.4],"7898659061519":[50.2,56.55],"7898659061489":[15.0,65.85],"7898659061502":[14.4,156.06],"7898659063391":[44.7,169.27],"7898659061540":[53.9,267.43],"7898659061564":[46.8,266.87],"1800000000005":[32.8,113.06],"1805000000000":[21.3,107.44],"7898937544536":[33.7,2.53],"7898937544543":[35.4,2.53],"7898547051455":[27.7,2.53],"7898937544482":[19.4,2.69],"7898937544499":[30.6,2.69],"7898937544505":[27.7,2.53],"7898937544512":[33.7,2.53],"7898937544529":[30.7,2.53],"7898937544451":[16.0,4.26],"7898937544420":[23.1,4.26],"7898547051448":[23.1,4.26],"7898937544383":[20.1,4.33],"7898937544444":[21.6,4.33],"7898937544390":[10.0,4.33],"7898937544406":[17.0,4.33],"7898937544413":[16.0,4.26],"7898659060123":[46.3,6.28],"7898659060116":[33.7,12.74],"7898937717855":[54.1,27.18],"7898959378713":[51.3,5.91],"7898937717961":[51.3,5.91],"7898937717930":[51.3,5.91],"7898937717947":[51.3,5.91],"7898937717954":[51.3,5.91],"7898659064107":[26.9,15.65],"7898937717916":[26.9,15.65],"7898659060611":[10.5,15.65],"7898659064114":[26.9,15.65],"7898659064121":[10.5,15.65],"7897488007026":[18.5,12.13],"7898659060826":[22.1,503.22],"433":[23.7,359.44],"434":[14.4,449.31],"1415000000001":[29.1,376.17],"8170000000002":[23.7,504.97],"438":[85.9,467.27],"5420000000001":[39.2,530.2],"440":[31.2,373.08],"444":[63.8,3.12],"7898944938922":[47.8,32.88],"0192505483294":[33.4,87.46],"BA01L":[28.4,30.89],"7898943819338":[24.9,30.19],"7898943819994":[20.8,29.08],"7898943819499":[28.0,41.09],"7982505483324":[17.0,35.77],"BC04L":[25.0,29.98],"7898943819406":[24.2,41.02],"79825054836317":[17.0,35.91],"7898943819314":[24.5,42.36],"56548":[20.9,44.52],"07898943820018":[31.2,36.02],"7898943819383":[26.4,50.69],"7898943819307":[32.7,41.09],"461":[18.7,43.72],"7898943819468":[17.0,35.44],"7898943819215":[26.3,33.61],"7898943819376":[25.6,44.65],"465":[26.0,34.03],"7898943819985":[34.7,33.61],"7898943819260":[18.0,15.59],"7898943819420":[17.0,18.77],"7898943819765":[0.0,0.0],"7898943819284":[24.5,17.58],"7898943819444":[21.4,24.19],"0192505291615":[32.4,39.54],"7898943819116":[19.9,53.16],"7898943819789":[27.3,57.3],"7898943819939":[17.0,112.22],"7898943819987":[20.8,94.51],"7898943819277":[18.9,19.94],"7898943819437":[28.8,31.1],"7898943819253":[17.5,28.82],"7898943819413":[15.5,39.37],"7898943820001":[17.9,36.89],"7982505483218":[23.4,24.19],"484":[24.3,80.01],"485":[18.9,81.1],"7898479801777":[8.9,79.92],"7898479801784":[13.5,76.07],"7898479801807":[23.9,78.15],"7898479801814":[18.3,77.39],"7898684202000":[23.1,59.91],"7894061001006":[30.9,5.49],"7894061001020":[31.3,7.21],"7896193297999":[37.7,16.92],"7896193298002":[40.1,21.0],"7982505483164":[17.0,5.68],"7898684201614":[13.4,16.91],"7897488022616":[44.0,61.0],"7897488022623":[27.2,42.05],"7897488022630":[27.5,45.57],"7897488015410":[19.1,7.76],"7897488000454":[22.0,7.95],"7897488000423":[20.2,15.47],"7898684201621":[16.1,15.12],"7898944936904":[53.3,10.38],"7982505483201":[17.0,11.16],"7982505483195":[27.0,7.0],"7898159701366":[19.1,5.1],"7898159701373":[21.9,5.77],"7898159701335":[19.5,4.06],"7898159701342":[19.9,4.58],"7898159701359":[22.0,5.25],"7897488004254":[26.8,9.88],"7897488004261":[28.3,10.68],"7897488004117":[24.1,10.58],"7897488004278":[25.0,11.4],"7897488004285":[22.3,11.57],"7897488003202":[30.9,2.68],"7898907527750":[0.1,19.67],"7908642009173":[35.0,11.53],"7908642009180":[30.0,11.82],"9990000000005":[10.9,26.28],"1000000000009":[10.9,26.27],"7898659060444":[46.6,9.75],"7908642007858":[24.4,3.25],"528":[0.0,1.04],"7893308002202":[29.9,5.26],"7898684200297":[25.0,10.24],"7898684200273":[25.0,8.75],"7898684201751":[18.2,12.88],"7898684201775":[18.5,9.03],"7898684201768":[8.7,12.31],"7908642003034":[22.3,17.59],"7908642003058":[27.6,19.83],"7908642003072":[33.1,24.24],"7896603846250":[17.3,4.44],"7896603802881":[16.9,5.68],"7896603879067":[23.3,12.21],"7896603803116":[12.3,7.65],"7896603803123":[25.3,12.1],"7896603803109":[16.0,5.98],"7896603847165":[28.2,3.45],"7896603847172":[24.6,5.8],"7896603800931":[30.8,1.7],"7896603806957":[24.9,11.69],"7896603806964":[20.2,15.52],"7896603806971":[14.1,17.09],"7896603899935":[15.9,8.56],"1669000000008":[17.1,2.34],"1670000000004":[25.2,5.67],"7898659060451":[45.1,9.02],"7898903892357":[52.3,11.43],"7898937717534":[59.2,17.2],"7898937717541":[63.2,22.73],"7898959378416":[58.3,28.69],"7898959378423":[57.3,31.13],"7898659060468":[50.5,41.09],"7880000000001":[42.5,45.73],"7870000000002":[22.4,38.34],"7898903892203":[39.6,7.98],"571":[52.2,6.38],"572":[21.9,335.48],"7897488005039":[19.7,5.55],"7898659063049":[34.5,49.83],"7898659063070":[39.9,6.17],"7898659063056":[45.0,5.41],"7898659063063":[43.5,5.7],"4460000000008":[30.6,2.79],"7898907527118":[2.0,31.07],"17898915994947":[11.0,5.88],"7898312140032":[8.4,5.88],"7898312140100":[15.7,11.58],"7898312140131":[23.0,5.54],"7898312140049":[16.6,15.25],"7898312140117":[16.6,27.76],"7898312140124":[20.2,10.47],"7898312140018":[8.4,5.88],"7898312140087":[10.8,11.58],"7898312140063":[22.9,5.55],"7898312140025":[16.6,15.25],"7898312140094":[16.7,27.75],"7898312140070":[20.2,10.47],"594":[-4.1,18.45],"7898659060437":[19.5,33.57],"7893308003773":[17.0,18.41],"1101000000003":[16.7,21.3],"7897488022111":[29.3,22.39],"7898659061434":[22.3,27.49],"7898659061441":[22.3,27.49],"7898659061458":[22.3,27.49],"7898088926021":[17.1,1.26],"7898088926038":[17.1,1.26],"7898088926045":[17.3,1.25],"7898088926052":[19.7,1.26],"7898088926069":[17.4,1.35],"7898088926076":[23.4,1.35],"7898088926083":[23.4,1.35],"7898088926090":[24.0,1.35],"7898088926106":[25.8,1.35],"7898088926113":[25.8,1.35],"7898088926120":[22.2,1.35],"7898088926137":[17.4,1.35],"7898088926014":[12.6,1.27],"5510000000009":[25.0,17.97],"5520000000008":[20.1,17.97],"7898659061212":[41.4,14.41],"7898659061250":[51.4,14.41],"7898659061229":[41.4,14.41],"1906000000004":[51.4,14.41],"7898659061236":[41.4,14.41],"7898659061205":[26.1,14.42],"7898659061243":[41.4,14.41],"7898088924102":[9.5,2.1],"7898088924126":[15.0,2.1],"7898088924157":[9.5,2.1],"7898088924188":[15.0,2.1],"7898088924225":[9.5,2.1],"7898088924249":[18.4,2.46],"7899829900089":[18.4,2.46],"7898088925321":[18.4,2.46],"7898088925031":[9.2,2.85],"7898088925048":[9.2,2.85],"7898088924058":[15.1,2.31],"7898088924065":[9.6,2.31],"7898088924089":[9.6,2.31],"7898088921101":[30.9,0.82],"7898088921125":[34.6,0.82],"7898088921156":[34.6,0.82],"7898088921187":[34.6,0.82],"7898088921224":[34.6,0.82],"7898088921057":[23.7,0.82],"7898088921064":[19.0,0.82],"7898088921088":[23.7,0.82],"7898088923105":[9.7,0.6],"7898088923129":[9.7,0.6],"7898088923150":[9.7,0.6],"7898088923181":[15.1,0.6],"7898088923228":[15.1,0.6],"7899829906616":[17.2,0.78],"7898088923068":[17.2,0.78],"7898088923082":[11.9,0.78],"7898659061380":[23.2,3.24],"7898659061335":[33.4,3.24],"7898659061342":[23.2,3.24],"7898659061359":[23.2,3.24],"7898659061366":[23.2,3.24],"7898659061373":[30.2,3.24],"7898915994322":[20.4,13.59],"1623000000000":[8.9,14.75],"7908642000965":[31.4,2.93],"7908642000972":[31.5,2.96],"1620000000009":[19.3,9.44],"1622000000003":[13.8,20.08],"1624000000007":[15.1,24.02],"671":[25.4,18.61],"0192505483232":[33.4,28.28],"7897488021947":[20.0,18.23],"7897488001574":[19.3,13.37],"7897488001581":[18.2,20.57],"7897488021954":[18.3,27.24],"7899095403673":[22.0,29.59],"7898659063131":[22.3,33.98],"7908642005250":[30.7,31.87],"7908642005267":[28.0,33.02],"7897488021930":[15.4,10.83],"7897488001567":[20.3,9.66],"7898684200600":[14.7,12.32],"7898684200822":[15.3,13.34],"7898684200815":[11.2,21.97],"7898684201126":[13.3,18.87],"7898684200433":[8.4,12.4],"7898684200778":[14.4,13.74],"7898684200839":[24.0,9.3],"7898567698548":[19.0,22.04],"7898684201805":[21.0,15.39],"6700000000003":[18.5,10.83],"7898941889289":[21.6,16.44],"7898941889265":[39.9,16.44],"7898567977896":[12.2,14.31],"7898659062028":[37.2,25.07],"7897613529126":[27.9,27.97],"7897613529119":[27.9,17.21],"7898684200846":[10.7,11.74],"7898684200365":[-4.4,11.89],"7898684200723":[-4.8,17.14],"7898684200730":[-1.7,19.94],"7898684200570":[2.6,10.61],"7898684200761":[-2.9,11.32],"7898684200389":[2.9,11.11],"7898684200419":[18.2,13.03],"7898684200785":[18.4,18.02],"7898684200341":[-3.9,19.83],"7898684200372":[-2.4,17.95],"7898684200334":[-3.8,17.7],"7898684200747":[-1.5,20.4],"7898567624585":[11.2,20.56],"7898684200884":[-2.3,20.18],"7898567536543":[7.1,23.05],"7898684200396":[9.6,23.37],"7898567658412":[0.6,15.72],"7898684200402":[5.3,17.32],"7898684200426":[20.9,16.84],"7898684200921":[12.8,13.74],"7898684200358":[12.7,17.9],"7898684200594":[-1.7,14.94],"7908642009487":[23.4,12.17],"7908642009500":[30.9,23.13],"7897488017186":[31.3,33.94],"7897488017162":[40.7,33.23],"7897488017070":[27.4,39.34],"7897488017100":[30.8,45.81],"7330000000001":[14.5,10.94],"7350000000009":[58.0,3.49],"7370000000007":[6.1,15.65],"2800000000004":[1.9,23.39],"7400000000001":[42.6,6.75],"7430000000008":[41.8,3.94],"745":[15.8,1.65],"747":[25.8,1.81],"749":[27.2,1.99],"7292659063779":[33.7,40.8],"7898659064992":[41.1,29.39],"7898659061984":[40.6,15.27],"7891230610038":[16.0,36.31],"7891230600039":[16.2,36.4],"761":[25.0,455.29],"1925000000005":[14.4,31.31],"1932000000003":[39.9,38.35],"1930000000009":[22.8,23.83],"1943000000009":[23.9,29.84],"1924000000008":[8.4,23.34],"1931000000006":[14.5,38.35],"1929000000003":[22.8,23.83],"3750000000001":[33.1,6.14],"4040000000002":[18.9,6.14],"3760000000000":[30.7,5.36],"3770000000009":[34.7,5.36],"3780000000008":[31.0,3.8],"3790000000007":[31.0,3.8],"3800000000003":[30.3,3.61],"4030000000003":[29.0,3.51],"3810000000002":[26.7,3.41],"3920000000008":[26.7,3.41],"4050000000001":[26.7,3.41],"7800000000009":[29.0,2.98],"4910000000008":[23.6,2.98],"8180000000001":[33.9,4.85],"3930000000007":[29.0,2.98],"3900000000000":[26.7,2.8],"5170000000005":[32.3,4.05],"4120000000001":[29.0,2.98],"3820000000001":[29.0,2.98],"4060000000000":[29.0,2.98],"3950000000005":[18.4,2.98],"4140000000009":[23.6,2.98],"4110000000002":[30.4,3.55],"3830000000000":[31.1,3.55],"3910000000009":[27.3,8.57],"7898684200617":[13.2,17.57],"7897488001741":[25.7,32.2],"7897488001680":[18.4,23.57],"7896202400037":[26.6,4.67],"7830000000006":[53.4,15.45],"803":[16.9,140.18],"7898659060154":[41.8,12.34],"7898959378362":[28.4,44.19],"7898659060406":[43.1,37.27],"7898937717657":[28.4,44.19],"808":[30.5,50.32],"7898937717213":[43.1,37.27],"810":[41.2,57.51],"9100000000008":[33.4,26.36],"7898937717398":[26.7,26.36],"7898937717756":[47.2,29.96],"7898659060147":[43.0,12.34],"7898959378355":[58.4,35.83],"817":[48.9,41.79],"7898937717138":[42.3,11.42],"8360000000007":[50.8,15.08],"7898903892074":[39.0,11.43],"8370000000006":[50.3,15.08],"7898937717992":[45.3,11.42],"8380000000005":[50.2,15.08],"7898903892036":[57.1,41.78],"7898903892241":[53.1,17.25],"7898937717121":[45.3,26.02],"7898959378478":[43.0,12.34],"7898903892098":[48.3,11.42],"9080000000003":[54.6,13.7],"7898937717206":[52.8,16.18],"7898903892067":[49.9,15.45],"7898903892883":[31.4,17.83],"7898903892012":[53.0,26.96],"7898659065777":[55.2,26.96],"7898659063322":[62.5,20.17],"7898659060628":[31.6,114.58],"7898937717725":[40.1,23.29],"7898903892937":[41.2,18.47],"7898937717503":[59.6,25.29],"7898937717497":[27.5,25.29],"7898659060673":[63.3,30.89],"7898903892371":[28.3,26.96],"1125000000009":[33.6,26.96],"7898659060581":[29.1,26.96],"7898937717169":[38.9,12.35],"7898903892210":[40.1,16.25],"1026000000009":[45.8,14.31],"1027000000006":[23.4,14.31],"1014000000006":[28.1,13.2],"1025000000002":[45.8,14.31],"1028000000003":[45.8,14.31],"1236":[16.9,155.76],"1232":[21.9,167.74],"7899095408975":[34.1,18.57],"7898684200235":[17.6,19.9],"7898684200808":[31.1,22.3],"3440000000001":[17.1,112.33],"7898684200518":[13.1,119.62],"7898684200303":[17.9,125.3],"7898684200501":[8.2,125.32],"7898684200211":[13.0,41.34],"7898684200044":[24.3,51.73],"7898684200051":[27.4,59.9],"7898684200495":[24.1,64.14],"880":[22.0,75.45],"2260000000006":[14.5,20.31],"230":[43.8,35.16],"232":[45.0,36.2],"228":[33.8,29.96],"7898684200020":[23.1,24.08],"229":[28.4,25.8],"7898684202055":[21.3,28.96],"3960000000004":[21.3,35.16],"7898684201713":[21.9,36.1],"398":[32.9,44.63],"7898684201706":[33.8,45.07],"7898684201720":[31.3,45.07],"0000000008822":[18.0,36.2],"7898684201539":[39.5,33.44],"7898684200327":[32.3,41.81],"7898684201942":[26.7,46.85],"7898684200006":[27.6,47.59],"7898684200099":[33.1,45.67],"7898003890383":[21.6,4.28],"7898003890369":[29.7,5.51],"7898003890345":[26.1,8.08],"7898003890390":[26.5,13.72],"7898003894336":[19.6,11.68],"7898003893339":[27.3,9.53],"7898003893346":[26.4,17.54],"7898659060789":[14.2,283.85],"1118000000001":[30.1,295.96],"7898959378980":[25.0,156.11],"1117000000004":[24.3,460.01],"7898959378751":[57.1,42.49],"7898959378744":[51.6,20.91],"7898959378737":[54.6,48.59],"7898659060543":[28.5,101.66],"7898659060567":[39.5,113.97],"7898659060550":[52.2,156.86],"7898659060529":[32.5,161.22],"7898659060536":[38.3,178.2],"7898937717701":[42.4,44.84],"7898937717718":[43.4,48.68],"7898659060598":[48.0,59.18],"7898659060017":[41.6,6.58],"7898959378485":[48.8,6.58],"7894061003390":[38.1,4.46],"7898684200891":[2.8,11.21],"7898684200860":[5.6,14.58],"7898684200853":[1.2,31.5],"78940614001211":[53.1,6.21],"924":[54.6,11.74],"925":[15.9,21.83],"7898659065937":[49.8,11.73],"7898659065944":[16.1,20.76],"7898659061977":[60.8,14.39],"7898659063032":[2.6,9.49],"7898907527026":[29.5,22.31],"17898915994060":[18.2,20.2],"17898907527030":[25.2,20.56],"7898907527903":[23.6,20.02],"17898915993513":[25.2,20.56],"17898915994015":[8.9,20.56],"7898915993493":[23.5,14.93],"7898907527330":[24.0,15.08],"7898907527354":[24.3,14.11],"7898907527347":[17.4,14.11],"7898907527514":[20.9,15.67],"7898915993059":[14.4,14.25],"7898907527538":[23.0,14.79],"7898907527552":[25.9,15.53],"7898567700463":[26.4,15.67],"7898907527569":[20.4,15.53],"7898907527910":[25.9,15.55],"17898907527207":[14.4,15.87],"17898567700507":[21.0,15.67],"7898567702351":[16.8,19.51],"7898567702375":[16.8,19.49],"1070000000002":[16.9,152.9],"1066000000005":[14.6,168.85],"1067000000002":[16.9,154.76],"1068000000009":[23.2,170.24],"1069000000006":[16.9,154.75],"1023000000008":[14.4,142.37],"1024000000005":[23.3,150.65],"1019000000001":[31.9,149.4],"1020000000007":[32.2,152.1],"7898684200693":[30.7,55.44],"7898684200709":[28.0,55.44],"7898684201164":[34.0,55.43],"7898684201416":[24.2,55.44],"7898684201171":[36.6,55.44],"7898684200686":[24.3,48.91],"7898684201263":[32.9,54.21],"7898684200662":[26.8,54.21],"3120000000002":[25.5,53.89],"7898684200679":[28.5,53.89],"7898684201003":[32.4,88.63],"1047000000004":[34.8,95.46],"7898684202093":[34.4,95.46],"7898684202086":[14.6,95.46],"7898684201737":[35.2,95.46],"7898684201645":[27.6,58.92],"7898684201652":[30.7,58.92],"1040000000005":[35.5,58.91],"7898684201447":[39.5,58.92],"7898684201508":[32.3,57.69],"7898684201072":[25.9,50.34],"7898684201638":[26.1,53.01],"7898684201607":[24.5,53.01],"7898684201423":[26.8,53.01],"7898684200990":[41.9,94.43],"7898684202116":[27.3,87.09],"7898684202017":[27.3,87.09],"7898684202123":[32.8,87.09],"7898684201744":[32.8,87.09],"7898684200631":[25.0,50.27],"7898684201379":[26.6,52.21],"7898684201119":[24.3,50.27],"7898684201454":[27.6,52.59],"7898684201218":[33.5,52.21],"7898684200648":[18.7,45.04],"7898684201386":[22.6,49.15],"7898684200624":[17.7,47.33],"7898684201355":[23.2,51.39],"7898684200655":[26.1,51.39],"7898479802286":[27.6,134.73],"1021000000004":[25.6,152.12],"7898479800541":[25.6,130.36],"7898684201935":[-10.9,143.43],"190000000002":[27.8,135.39],"1022000000001":[25.5,152.11],"7898479800572":[25.6,130.37],"7898684201362":[21.9,143.42],"7898684200259":[35.6,25.55],"7898684201102":[24.4,24.45],"7898684200037":[23.4,25.69],"7898684200792":[36.0,46.02],"7898684200013":[22.7,27.0],"9":[25.5,36.7],"7898684201027":[33.4,40.85],"7898684201034":[43.6,48.69],"7898684200907":[24.5,57.18],"7898684201676":[24.5,62.98],"7898684201133":[40.3,62.98],"7898684201492":[28.3,67.1],"7898684201157":[28.3,67.09],"7898684201140":[28.3,67.1],"7898684201294":[18.2,59.16],"7390000000005":[21.8,60.32],"7898684201683":[29.4,60.32],"7898684200532":[23.2,37.21],"7898684201300":[19.6,40.98],"7898684200525":[24.4,40.25],"7898684201690":[15.4,42.22],"7898684201188":[26.8,46.42],"7898684201515":[30.0,50.16],"7898684201546":[30.0,52.31],"6520000000007":[21.4,48.4],"7898684201089":[26.5,56.53],"7898684201584":[26.3,58.34],"7898684201485":[11.7,49.46],"7898684201232":[29.6,54.63],"7898684201096":[28.4,51.45],"7898684201225":[27.5,53.88],"7898684201249":[14.8,45.82],"6510000000008":[29.6,53.05],"7898684201553":[22.5,52.7],"7898684201409":[21.3,47.04],"7898684201065":[-0.0,43.73],"7898684201393":[33.8,48.52],"7898684201904":[10.4,45.07],"7898684201195":[34.4,73.38],"10280000000000":[30.4,73.38],"7898684200112":[12.9,49.71],"7898684200129":[14.3,53.45],"7898684201317":[26.0,60.36],"7898684200105":[15.5,55.66],"7898684200440":[32.2,66.99],"1055000000009":[23.3,147.26],"1051000000001":[23.2,151.63],"1052000000008":[23.2,151.63],"1053000000005":[23.2,151.62],"1054000000002":[23.2,151.62],"7898684200976":[12.3,106.05],"7898684200983":[26.3,107.26],"7898684200952":[22.3,98.64],"7894061003789":[26.0,7.06],"7898684202048":[29.4,28.99],"7898684201348":[13.3,35.48],"7894061007503":[33.1,7.04],"7894061000276":[21.2,6.86],"7894061002416":[16.9,9.23],"7894061003031":[15.8,3.13],"7894061008500":[25.3,18.84],"7894061003017":[27.1,3.23],"7894061002997":[32.4,2.68],"7898684201201":[46.8,23.75],"7898659060666":[44.3,19.26],"7908642008855":[21.2,20.79],"7898684201959":[24.6,34.19],"7898659063124":[21.8,41.05],"7898659060093":[27.9,33.84],"7898659060062":[27.6,14.42],"7898659063100":[23.6,41.53],"7898659063117":[14.4,62.26],"7898659060086":[24.7,17.59],"7898659060079":[27.1,28.01],"7898003894558":[23.4,3.36],"7898003894541":[30.8,3.0],"7898003894527":[31.1,1.75],"7898003894572":[22.3,5.88],"7898003894565":[24.0,4.6],"7898003894589":[24.4,9.96],"7898003894534":[28.8,2.5],"7898003894596":[19.3,11.27],"7898003894145":[32.9,3.36],"7898003894152":[23.0,3.79],"7898003894121":[34.2,2.43],"7898003894176":[22.6,7.55],"7898003894169":[19.5,4.86],"7898003894183":[15.6,10.55],"7898003894138":[17.4,2.4],"7898003894190":[22.3,11.92],"7894061001105":[8.4,13.91],"7894061002478":[9.6,17.82],"7894061003352":[12.2,9.78],"7894061002935":[32.3,1.49],"7894061001617":[37.7,0.86],"7898684200716":[23.2,4.22],"7982505483188":[16.8,3.38],"7894061002546":[4.8,2.98],"7894061009026":[18.6,5.44],"7898684200549":[34.5,15.59],"7894061000696":[2.6,8.64],"7894061000351":[35.3,2.68],"7894061000474":[9.2,5.78],"7898684200556":[18.6,11.43],"7898684200563":[22.8,13.58],"7894061005875":[-1.5,0.22],"7898373050516":[14.5,13.86],"1134":[24.4,886.79],"1135":[24.4,656.87],"7982505483263":[30.6,132.33],"7982505483270":[20.5,132.93],"55":[28.3,124.88],"7982505483256":[28.3,140.44],"7898684201973":[12.9,81.34],"7898684201966":[29.5,76.78],"1142":[17.0,40.7],"7894061001884":[31.8,6.4],"7899095404038":[18.6,26.21],"7899095403604":[16.8,28.48],"7908642005229":[25.6,32.75],"7899829912945":[31.7,30.05],"7896603850240":[20.8,19.94],"7898090991000":[39.3,5.07],"7898090991017":[42.0,3.06],"7898090990010":[34.7,6.99],"7898090990027":[39.0,5.06],"7898917522011":[12.3,1.25],"7898917522028":[11.3,1.87],"7898090991048":[12.7,2.51],"7898963516118":[14.9,84.58],"7898943819932":[17.0,42.94],"7897488001697":[18.4,25.67],"7897488001703":[19.6,32.65],"7897488015977":[28.0,31.06],"7908642006707":[37.8,19.57],"7908642006714":[47.5,26.56],"7898088926144":[13.6,5.05],"7899095455795":[48.8,9.77],"7899095455740":[44.0,6.75],"7899095455771":[49.3,8.62],"7899095455726":[36.3,5.24],"7899095455764":[43.0,6.51],"7898659060413":[30.0,30.16],"7896603803628":[28.8,23.22],"7897613520017":[23.6,3.67],"7898659064565":[55.0,34.93],"7898659064558":[36.2,32.28],"7898659064671":[16.3,25.5],"7898659064688":[13.1,28.32],"7898659064695":[20.6,31.16],"7897613515013":[15.5,7.57],"7898003891359":[24.7,15.98],"7898031547013":[14.7,44.9],"7896243101856":[10.0,9.51],"7896243101719":[7.3,7.54],"7898547051974":[21.4,1.11],"7898547051882":[21.9,1.12],"7898547051899":[20.9,1.11],"7898547051905":[21.4,1.12],"7898547052087":[22.2,1.62],"7898547052094":[22.2,1.62],"7898547052100":[24.7,1.62],"7898547052117":[24.7,1.62],"7898547051844":[30.7,0.93],"7898547051851":[29.7,0.93],"7898547052018":[34.1,0.93],"7898547051868":[29.7,0.93],"7898547052209":[28.7,17.51],"1707":[22.5,9.41],"7982505483249":[23.8,7.96],"7898943820198":[33.6,15.71],"7897613511053":[17.0,2.49],"7897613511091":[16.8,3.24],"7897613511152":[16.7,4.22],"7897613511237":[14.7,6.68],"7897613510056":[14.6,2.52],"7897613510094":[14.8,3.24],"7897613510155":[14.9,4.73],"7897613510230":[14.7,9.54],"7897613512159":[16.6,7.14],"7897613512234":[17.9,9.12],"7897613514153":[14.6,4.65],"7897613514238":[17.9,6.83],"7897613523018":[14.7,6.69],"7897613523025":[14.6,8.27],"7897613523513":[14.7,4.89],"7897613523520":[14.7,6.26],"7897613503010":[15.1,1.62],"7897613503027":[16.5,2.02],"7897613503034":[14.8,2.57],"7897613503041":[16.6,3.68],"7897613503058":[14.6,4.31],"7897613503065":[16.7,5.8],"7897613503072":[15.5,7.23],"7897613503089":[16.6,10.22],"7897613520413":[17.1,22.5],"7897613520420":[14.7,32.47],"7897613520819":[14.8,8.41],"7897613509180":[14.7,24.96],"7898921098120":[22.7,21.09],"7898921098113":[21.2,22.18],"7899095403475":[16.1,16.02],"7894061009446":[27.2,9.1],"7894061002065":[5.5,11.39],"7894061003666":[16.4,15.39],"7894061002324":[13.3,23.22],"2502000000007":[16.5,25.96],"7899095404779":[35.4,11.63],"7898094335596":[17.0,21.98],"7896451837356":[15.2,38.92],"7896451849908":[15.2,42.69],"7896451853233":[15.2,33.21],"7896451853240":[15.2,33.21],"7896451856975":[15.2,37.53],"7896451856999":[15.2,38.21],"7896451865458":[15.2,25.28],"7896451876645":[15.2,28.44],"7894061001167":[12.3,0.92],"2587000000004":[23.3,41.83],"7908642006684":[53.0,14.67],"7898684201560":[19.0,48.2],"7898937717008":[34.7,2.94],"7898659063254":[47.8,5.28],"7898659063261":[37.2,5.13],"7898659063292":[48.2,8.13],"7908642002556":[24.7,5.18],"7899095456235":[42.4,5.19],"7908642002426":[29.5,5.19],"7899095409163":[20.8,5.19],"7908642002396":[29.5,5.19],"7897488022180":[41.6,75.18],"7897488001406":[15.9,59.05],"7898958277529":[20.6,16.21],"7898903892029":[37.5,10.81],"7706912057875":[26.6,21.02],"7706912057950":[21.3,24.5],"7706912057974":[21.2,27.38],"7898659064725":[40.6,23.85],"7898003893285":[14.7,44.8],"2015":[19.7,3.7],"2624000000006":[23.6,3.0],"2625000000003":[23.3,3.36],"2626000000000":[23.3,3.36],"2627000000007":[23.3,3.36],"2628000000004":[23.3,3.36],"2629000000001":[23.3,3.36],"2631000000004":[23.6,3.0],"2632000000001":[23.3,3.36],"2633000000008":[23.3,3.36],"7898585090522":[17.1,18.56],"7898547052001":[24.5,1.11],"7898547051912":[24.5,1.11],"7898547051929":[24.5,1.11],"7898547051936":[25.0,1.12],"7898547051943":[25.0,1.12],"7898547051998":[25.0,1.12],"7898547052124":[24.7,1.62],"7898547052131":[24.7,1.62],"7898547052148":[24.7,1.62],"7898547052155":[17.6,1.62],"7898547052162":[17.6,1.62],"7898547052179":[24.7,1.62],"7898547053510":[24.7,1.62],"7898547051967":[34.7,0.93],"7898547051875":[34.3,0.93],"7898659062899":[59.6,17.08],"7898659062875":[37.4,9.06],"7898659064596":[49.2,30.18],"7898659064664":[33.8,41.23],"7898659063155":[14.3,32.28],"7898659064626":[20.7,32.72],"7898659064633":[31.4,53.57],"7898659064602":[24.0,23.09],"7898659064619":[17.6,25.42],"2070":[48.0,45.0],"7898659064541":[44.8,60.95],"7898659064657":[32.0,11.4],"7898659064572":[35.0,20.68],"7898768553646":[36.0,13.94],"2909000000004":[41.8,62.27],"7908642000392":[55.3,24.57],"7897613512050":[14.6,3.78],"7897613512098":[14.7,5.39],"7897613517239":[16.7,9.82],"7898659065272":[53.3,13.06],"7898659065289":[49.3,18.17],"2161":[3.3,24.79],"2712000000000":[25.1,176.22],"2713000000007":[49.8,15.07],"7898659064886":[35.5,26.13],"7898547050328":[24.9,3.23],"7898547051950":[31.3,12.13],"7897613522011":[18.9,8.72],"7897613522028":[22.6,16.79],"7908642008565":[30.3,5.51],"7908642008589":[29.4,4.38],"7908642008596":[53.5,8.24],"27899095456024":[20.9,2.36],"7908642007797":[42.9,2.89],"7908642005281":[33.4,14.32],"7908642005298":[31.9,14.55],"7908642005304":[33.9,15.71],"7908642005311":[36.8,17.93],"7908642005328":[32.1,17.93],"7899095404557":[12.0,127.97],"7908642005137":[9.2,99.9],"7908642005144":[48.5,62.6],"736532119445":[27.3,20.6],"7908642008626":[35.0,37.36],"2734000000002":[30.2,13.51],"7908642007667":[40.4,16.99],"7908642007674":[41.9,19.0],"7908642007681":[40.5,20.06],"7908642007698":[41.7,25.1],"736532119438":[41.3,26.14],"736532119452":[38.8,26.91],"7908642007728":[38.6,28.12],"7908642008831":[23.8,37.82],"7908642000828":[20.3,26.74],"7908642009142":[12.9,26.75],"2217":[15.8,83.42],"7908051322207":[24.1,137.37],"7908051322931":[17.9,241.84],"7908051322252":[20.2,379.82],"7898659064589":[27.7,30.18],"7898659063278":[38.7,5.6],"7908642003478":[30.8,33.07],"7898659063339":[16.5,39.46],"7898659063346":[14.4,88.5],"7898659063353":[20.1,125.55],"7908642009074":[17.1,1.3],"7908642009081":[18.1,1.75],"7908642009098":[14.9,3.29],"7908642009104":[16.2,2.6],"7908642009111":[15.6,4.95],"7898090920512":[14.7,253.39],"2766":[13.3,536.84],"7898003893230":[14.8,6.9],"2312":[0.0,1.04],"7898515550171":[18.7,130.6],"7898515550188":[27.5,11.48],"7898515550836":[25.2,17.94],"7898515551000":[18.7,50.86],"7898515550096":[19.2,148.19],"7898515550867":[16.7,75.14],"7898515550850":[21.8,33.36],"7898515550843":[22.3,25.31],"2322":[-25.9,1.04],"7898488023382":[14.5,7.81],"7898488023399":[14.5,7.81],"7898488023467":[14.3,8.52],"7898488023498":[21.5,26.22],"7898488023504":[21.5,26.21],"7898488023542":[14.5,30.58],"7898488023559":[14.5,30.58],"7898488023634":[28.4,54.04],"7898488023641":[31.2,56.76],"7898100554966":[20.4,10.34],"7898100554997":[23.1,28.5],"7898100554935":[23.5,28.82],"7898100554683":[25.5,19.59],"7898100553068":[21.0,19.59],"7898100554744":[12.3,19.59],"7898100554706":[25.4,19.48],"284700000007":[34.4,21.54],"7908051323006":[19.3,211.76],"7908051323389":[20.9,400.58],"7908051322993":[14.9,211.76],"7908051323372":[20.9,400.56],"7908051319139":[25.1,219.2],"7908051325369":[16.8,401.87],"7908051322238":[23.2,201.98],"7908051322245":[17.9,302.3],"7908051322962":[18.7,98.21],"7908051316473":[21.4,122.76],"7908051316480":[21.4,147.31],"7908051320937":[25.3,212.55],"7908051319344":[25.3,398.55],"7899095403468":[23.7,22.16],"7899095400405":[18.8,31.89],"7899095400412":[16.5,39.01],"7899095400429":[17.8,56.62],"7899095405233":[48.4,30.84],"7899095405790":[48.7,31.08],"7706912801843":[20.7,20.93],"7891065000141":[18.9,13.15],"7891065000158":[18.8,15.26],"7891065000165":[18.8,17.79],"7891065000172":[18.7,23.73],"7891065011635":[17.2,26.02],"7891065000189":[18.7,32.63],"7891065000196":[17.1,37.32],"7891065006129":[17.1,25.55],"7891065006198":[13.2,33.61],"7893394007570":[14.3,16.4],"2846000000002":[36.6,37.47],"2455":[0.0,0.0],"7908642008633":[29.3,19.83],"7898488042154":[24.9,39.94],"7898488040822":[25.9,39.94],"7908642007865":[28.0,9.96],"7898083500011":[23.4,136.01],"7898083500028":[23.4,162.7],"7898083500035":[26.0,192.1],"7898083500042":[26.0,219.47],"7898083500059":[26.0,263.15],"7898083500578":[26.0,304.61],"7898083500356":[23.4,138.97],"7898943819956":[24.6,52.82],"7897613518236":[16.7,24.95],"7897613528235":[28.8,8.18],"7898090920505":[15.0,7.0],"7898090921007":[-587.3,7.06],"2863000000009":[-587.7,7.05],"2524":[28.5,96.69],"7898945401036":[24.4,10.25],"7898945401067":[20.9,10.25],"7898945401982":[19.6,18.53],"7898945401968":[17.5,19.66],"7898945401975":[19.5,18.53],"7898945401951":[17.9,19.84],"7898945401852":[31.0,12.11],"7898945401876":[31.0,12.11],"7898945402040":[18.4,14.5],"7898945402033":[18.4,14.5],"7898945402071":[25.3,15.14],"7898945402088":[21.8,15.14],"7898945401814":[29.8,22.6],"7898945401234":[28.1,22.59],"7898488043151":[30.3,38.5],"7898488023689":[21.8,75.0],"7898488043168":[31.3,64.06],"7898488023702":[28.4,113.09],"7898659064732":[56.1,2.4],"7908642007827":[42.2,18.32],"17898941765054":[13.8,18.19],"7898941765064":[16.0,74.9],"17898941765016":[28.1,19.17],"17898941765030":[13.7,73.68],"7898903892005":[32.1,2.67],"7898659063285":[48.1,7.3],"2060000000002":[26.8,131.5],"7898607380105":[16.5,145.53],"7898607380112":[16.5,181.92],"7898199712346":[31.3,24.94],"7899612719461":[46.9,46.0],"7899612719485":[31.2,109.14],"7899612796059":[34.5,30.25],"7898316522254":[13.8,5.21],"7898316522261":[14.1,5.35],"7898659062257":[30.5,57.47],"2649":[-683.1,4.05],"2909000000929":[-681.8,4.06],"2654":[20.0,8.1],"2655":[20.0,9.45],"2656":[20.0,8.1],"2657":[20.0,8.1],"7908642002150":[34.0,2.36],"7908642002143":[34.0,2.36],"7908642002136":[33.9,2.36],"7908642002266":[21.3,3.44],"7908642002259":[17.9,3.45],"7908642002228":[20.8,3.45],"7899612784636":[9.5,1.21],"7898659065012":[36.8,31.76],"7898659065029":[28.6,47.72],"7898599490578":[20.8,44.33],"7898599490127":[32.6,35.29],"7898943509758":[17.6,65.45],"7898759180165":[25.8,14.61],"7898759180141":[22.8,11.29],"7898759180127":[26.2,9.91],"3010000000006":[42.6,6.54],"7898759180080":[24.0,14.17],"7898759180066":[22.8,11.29],"7898759180004":[26.2,9.91],"742832915366":[54.1,7.0],"2775":[14.9,137.3],"7898393920554":[11.4,95.93],"7899612732613":[19.0,49.23],"7899612796882":[27.5,15.38],"7898959829475":[22.9,13.9],"7898959829413":[35.7,25.06],"7898959829437":[33.1,33.49],"7898959829444":[27.9,41.09],"7898959829451":[26.4,59.01],"27898959829462":[26.9,87.52],"7898959829598":[5.5,103.01],"7898959829499":[33.2,203.18],"7898659065296":[12.2,23.38],"7898659062905":[53.4,17.01],"17898941765023":[15.0,22.43],"17898941765047":[21.9,86.74],"7898937632011":[21.8,21.06],"7898937632035":[23.7,24.39],"2922":[20.9,310.01],"7897613520222":[14.8,4.47],"7897613524022":[17.8,10.34],"7897613524015":[17.9,10.34],"7896603850226":[19.6,8.56],"7897488006968":[31.8,20.1],"7897488006975":[30.8,16.9],"7898159700673":[29.5,22.1],"7897488003189":[28.1,19.01],"7897488022647":[26.1,53.54],"7897488022654":[26.1,53.54],"7897488010217":[28.7,26.09],"7897488010224":[28.8,27.63],"7891435038019":[12.9,3.25],"7891435038057":[14.8,3.09],"7891435038088":[12.9,3.67],"7891435072402":[15.0,6.67],"7891435072419":[15.0,6.47],"7891435929072":[26.6,5.91],"7891435929058":[28.5,5.4],"37891435046404":[14.7,1.3],"7891435052183":[19.3,2.74],"27891435049286":[15.8,3.4],"93":[15.6,4.7],"7891435936810":[14.6,3.09],"7891435936834":[14.7,3.09],"7891435936858":[14.6,3.45],"7891435932553":[3.4,2.87],"7891435936889":[14.6,3.05],"7891435936902":[14.5,3.04],"7891435933550":[6.8,3.05],"7891435936933":[23.2,5.83],"7891435936957":[14.5,6.5],"7891435936971":[14.7,5.65],"7891435936995":[14.7,5.66],"7891435937039":[14.6,5.73],"7891435933567":[13.2,4.78],"7891435937091":[13.1,5.71],"7891435937190":[24.0,4.8],"7891435932560":[13.0,5.1],"7891435933574":[13.2,5.44],"7891435937251":[13.0,6.04],"7891435937558":[14.9,0.87],"7891435937572":[21.7,0.69],"7891435937626":[13.1,10.59],"7891435932577":[21.9,6.08],"7891435933598":[27.1,6.37],"7891435937916":[13.9,9.7],"7891435938081":[15.6,11.12],"7891435933888":[15.4,11.23],"7891435933581":[14.6,6.22],"7891435938104":[-16.4,13.37],"7891435938159":[15.0,15.96],"7891435933895":[13.0,15.39],"7891435938241":[15.0,20.18],"7898567997573":[-2.5,29.38],"7899095456341":[21.0,3.44],"7899829909730":[22.8,2.41],"7899829909723":[23.0,2.41],"7899829909716":[23.0,2.41],"3024":[22.6,35.38],"3025":[34.2,36.41],"7898934880767":[25.0,337.15],"7897047206952":[26.5,659.22],"7898659064893":[40.0,33.15],"7898436140130":[23.5,13.9],"7908051315704":[22.2,286.7],"7908051323181":[22.6,531.4],"7898907527880":[-0.7,9.18],"7891738028915":[20.2,19.47],"7891738018855":[8.8,16.38],"7891738018930":[15.8,13.13],"7891738018992":[13.0,15.07],"7891738019081":[17.8,13.38],"7891738019234":[14.4,12.88],"7891738444227":[23.4,15.94],"7891738342929":[13.0,20.75],"7891738342936":[19.9,17.81],"7891738342950":[13.0,23.75],"7897613520000":[27.7,1.84],"7898464735629":[33.4,32.1],"7898464739184":[38.4,13.13],"7898464735209":[27.6,33.44],"7898464735216":[24.7,39.64],"7899807201627":[18.3,3.41],"7899807201658":[18.3,3.41],"7899807201665":[18.3,3.41],"7899807201689":[18.1,3.4],"7898464735858":[17.0,28.14],"7898464735872":[17.0,29.46],"7898094339679":[29.6,6.88],"7898094339686":[29.5,8.57],"7898094339709":[24.6,10.55],"7898094332625":[17.9,104.11],"7899807202785":[40.8,2.06],"7899807202792":[24.3,2.06],"7899807202808":[24.3,2.06],"7898094338986":[23.8,300.41],"7898094332908":[41.1,2.95],"7898094339099":[27.2,4.45],"7898094339105":[26.8,4.45],"7898094339112":[27.1,4.45],"7898094339129":[27.2,4.45],"7898094339136":[27.2,4.45],"7898094330645":[33.5,26.51],"7898094332151":[18.4,6.38],"7898921098137":[23.2,21.24],"7908642001634":[30.1,41.73],"7908642001641":[29.6,40.56],"7908642001658":[31.8,42.48],"7899095458000":[41.0,3.65],"7908642009043":[39.7,3.54],"7908642009401":[31.7,34.89],"7908642009418":[34.4,39.61],"7908642001351":[47.1,5.49],"7908642001368":[44.1,6.77],"7908642001443":[45.0,20.53],"7908642001450":[46.1,25.18],"7908642001474":[46.0,28.48],"7908642001481":[68.2,89.14],"7908642008107":[40.5,4.66],"7908642008114":[40.4,5.62],"7908642008121":[39.4,6.62],"7908642008138":[29.3,9.6],"7908642008145":[31.6,12.88],"7908089600070":[27.0,4.01],"79080896000872":[24.4,4.01],"7908089600094":[24.4,4.01],"7908089600285":[23.0,10.79],"7908089600391":[16.6,16.63],"7908089600414":[18.6,23.78],"7908089600384":[24.3,10.8],"79080896007802":[25.0,10.38],"7908089600605":[37.5,5.38],"7908089600612":[18.3,5.38],"7898599490110":[37.3,38.64],"7898943509703":[20.4,114.76],"7898943509710":[18.9,122.5],"7898943509727":[20.3,154.39],"7898943509826":[17.6,65.45],"7898599493715":[31.6,53.41],"7908642001467":[46.7,26.16],"7898599491223":[20.8,89.58],"7897937403652":[13.4,18.23],"7891738445620":[19.0,26.93],"7891738445750":[22.1,27.39],"7891738018794":[16.1,17.73],"7891738039065":[21.9,20.88],"7891738018879":[16.9,15.35],"7891738693878":[17.9,19.3],"7891738019173":[17.3,13.29],"7891738019210":[23.1,13.29],"7893308003841":[19.3,22.02],"7893308003865":[6.7,49.82],"17891200011534":[19.3,16.1],"7908642005502":[46.6,7.2],"7908642005526":[39.2,7.81],"7908642005557":[37.1,3.31],"07908642005595":[43.7,5.5],"7908642005618":[35.7,5.51],"7908642005748":[43.8,3.92],"07908642005786":[38.2,4.89],"7899095407848":[34.9,9.46],"7908642002174":[32.8,2.3],"7898067900523":[1.4,2.69],"7898067900400":[-1.1,0.38],"7898067901407":[52.7,1.89],"7898067901414":[1.0,2.33],"7898067901421":[0.9,3.76],"3300":[5.0,4.51],"7898067900455":[0.2,0.48],"7898067900479":[1.1,1.76],"3306":[1.3,0.96],"7898067900981":[1.0,8.67],"7898067900868":[4.9,1.3],"7898067900875":[0.7,2.57],"7898067900882":[1.1,4.24],"7898067900684":[18.4,4.59],"7898067900899":[1.4,2.69],"7898067900264":[0.2,0.62],"7898067900271":[0.7,1.07],"7898067903234":[0.9,2.73],"7898067900035":[1.3,1.41],"7898067900042":[0.9,3.68],"7898495130394":[0.9,3.76],"7898067900059":[0.8,3.36],"7898067900608":[1.3,1.64],"7898067901537":[1.1,2.49],"7898067901544":[1.1,5.66],"7898067903104":[1.0,11.79],"7898067901186":[0.9,11.28],"7898067901193":[1.0,10.19],"7898067900738":[1.2,0.96],"7898067900752":[0.9,4.2],"3384":[22.7,4.22],"7898067900776":[1.0,12.47],"7898067900080":[1.0,1.24],"7898067903890":[0.8,1.08],"7898067903876":[1.2,1.11],"7898067901124":[5.1,4.48],"7898067901131":[0.8,6.52],"7898067901148":[1.0,18.43],"7898067908574":[1.0,15.33],"7898067901766":[25.0,6.4],"7898067900790":[0.8,1.79],"7898067900806":[1.2,3.48],"7898067900820":[1.0,9.59],"7898067903135":[1.1,7.54],"7898067901469":[1.1,10.16],"7898067901476":[1.0,9.76],"7898067901483":[1.0,29.57],"7898067900127":[-0.3,0.4],"7898067900141":[0.8,2.59],"7898067900394":[1.0,5.73],"7898067900240":[1.1,2.05],"7898067900257":[1.1,2.13],"7898067904774":[0.9,2.3],"7891738018862":[24.0,15.51],"7891738018633":[18.9,18.22],"7891738028977":[14.1,13.76],"7899829909426":[19.4,5.21],"7899829909433":[19.4,5.21],"7899829909440":[20.3,5.29],"7899829909457":[19.4,5.21],"7899829909464":[19.4,5.21],"7891738018787":[27.7,19.56],"7891738445705":[18.4,30.89],"3452":[18.4,30.89],"7898067900622":[1.0,0.44],"7899095404816":[37.4,5.6],"7890577434581":[18.7,40.84],"7908642004086":[29.0,10.04],"7899095457300":[24.7,47.81],"7908642004208":[25.1,39.76],"7908642004093":[22.9,10.12],"7908642004109":[28.2,11.61],"7908642004116":[28.1,13.92],"7908642004123":[29.0,14.15],"7908642004130":[29.4,14.45],"7908642004147":[28.9,21.77],"7899095457263":[24.3,34.88],"7899095457256":[24.7,31.05],"7908642004154":[29.0,23.61],"7899095457249":[24.7,26.31],"7908642004161":[25.1,25.24],"7908642003508":[20.7,33.33],"7908642008640":[28.5,23.6],"7899612729033":[27.0,17.58],"7899612728142":[24.4,21.59],"7899612729026":[16.7,13.06],"7899612714251":[42.2,16.17],"7899612714275":[51.9,19.0],"7899612714329":[5.0,20.18],"7899612785138":[5.0,25.33],"7899612714343":[44.3,41.65],"7899612714350":[52.4,58.96],"7899612714374":[48.1,69.87],"7899095406858":[27.1,7.91],"7908642004246":[29.4,8.52],"7899095406872":[26.2,9.84],"7908642004260":[27.3,10.09],"7908642004277":[34.8,14.54],"7908642004284":[26.7,14.83],"7899095406919":[32.3,17.09],"7908642004307":[26.6,19.83],"7908642004314":[26.5,24.96],"7908642004352":[17.1,3.99],"7908642004369":[17.8,4.07],"7908642004376":[18.5,4.17],"7908642004383":[32.6,5.21],"7899095406971":[18.7,5.87],"7899095406988":[32.4,6.93],"7899095406995":[32.4,8.42],"7908642004420":[32.3,10.64],"7899612717849":[28.0,22.17],"7899612783219":[23.2,12.93],"7898390940548":[25.3,4.87],"7898390940555":[22.8,5.57],"7898390942153":[18.6,6.86],"7898390942160":[14.0,6.86],"7898390942177":[14.0,6.86],"7898390942306":[21.0,4.15],"7898390942313":[21.0,4.15],"7898390942320":[21.0,4.15],"7898390940456":[23.0,5.31],"7898390940401":[19.5,6.36],"7898390940449":[23.0,5.31],"7898067901520":[0.8,1.22],"7898390940265":[19.5,6.51],"7891435038026":[19.5,3.84],"7899612717344":[24.3,15.22],"7899612717405":[12.4,9.39],"7898684202109":[28.5,16.44],"7898943509666":[20.8,41.52],"7908642002167":[33.0,2.36],"7908642002181":[33.5,2.3],"7908642002648":[21.7,0.67],"7908642002631":[29.8,0.79],"7898659063308":[52.8,8.67],"7898094335220":[41.5,27.06],"7898094339150":[43.0,56.55],"7898684202130":[21.8,56.54],"7898464735865":[17.0,28.14],"7898464735889":[20.1,30.99],"7898684202147":[18.3,58.09],"7908642000408":[53.3,27.14],"7908642002198":[33.6,2.3],"7891117048695":[16.0,32.94],"7891117043201":[15.4,3.21],"7891117043249":[20.0,2.99],"7891117043164":[18.7,2.68],"3479000000001":[7.0,9.54],"3481000000004":[2.6,13.36],"3482000000001":[37.9,3.11],"7898684202246":[30.0,5.2],"7898684202260":[20.5,9.44],"7898684202277":[32.5,9.45],"7898684202284":[44.1,8.58],"7898684202253":[35.2,9.5],"7898684202154":[51.4,21.54],"7898684202161":[51.9,21.54],"7898684202178":[51.9,21.54],"7898684202185":[51.9,21.54],"7898684202192":[51.9,21.54],"7898684202208":[51.9,21.54],"7898684202215":[51.9,21.54],"7898684202222":[51.9,21.54],"7898684202239":[51.9,21.54],"7898585090591":[25.6,5.69],"7908642002662":[32.4,0.79],"7899095457140":[22.2,0.67],"7899095457119":[27.3,0.76],"7899095457102":[29.4,0.79],"0736532118769":[12.9,10.63],"3628":[62.0,188.54],"3629":[48.7,208.39],"3630":[55.4,238.16],"3631":[40.6,267.93],"7898659065739":[41.8,32.69],"7898659065951":[49.2,63.27],"7898659065968":[44.0,74.57],"3637":[8.1,0.38],"3639":[9.1,0.46],"7890000001885":[7.4,0.57],"3641":[10.2,1.9],"3642":[11.2,5.37],"7898659063469":[31.7,12.85],"7898031546955":[14.9,12.36],"7898031546924":[14.8,12.5],"7898031541196":[17.7,38.7],"7898031546986":[14.9,12.36],"7898659061397":[26.5,4.47],"7898659061410":[14.5,3.86],"3669":[19.6,4.5],"3670":[17.2,7.8],"7898031547044":[16.6,2.48],"7898390941293":[19.7,15.29],"7898390941309":[19.9,15.36],"7898390941316":[19.7,15.3],"7898390940487":[21.1,1.9],"7898390940012":[25.6,12.88],"7898390940777":[13.8,12.06],"7898390940432":[21.9,5.31],"7898659060659":[43.8,25.02],"7908642001108":[34.9,66.25],"7899612781413":[18.8,40.37],"7899612784827":[34.9,69.6],"7899612794871":[20.6,23.3],"7899612787545":[18.9,8.87],"7899612784926":[14.4,37.51],"7899612781659":[5.0,57.62],"7899612794888":[20.6,27.21],"7899612781536":[18.8,45.97],"7899612787606":[18.8,9.54],"7899612787736":[18.9,25.0],"7899612787729":[18.9,22.87],"7899612787620":[18.9,9.93],"7899612795144":[15.2,86.59],"7899612700292":[22.6,77.88],"7899612781383":[28.8,30.56],"7899612719492":[18.7,113.0],"7899612794703":[14.4,31.78],"7899612794710":[14.4,31.28],"7899612795786":[14.4,87.45],"7899612795779":[14.4,54.57],"7899612724373":[28.4,31.52],"7899612781741":[14.6,5.45],"7899612781772":[14.5,6.94],"7899612781789":[19.3,6.24],"7899612781796":[14.4,7.11],"7899612781833":[14.4,8.92],"7899612781857":[21.1,13.12],"7899612781864":[14.5,11.15],"7899612781871":[14.4,11.05],"7899612705969":[14.4,124.8],"7898390943549":[19.7,21.2],"7891435937992":[-2.8,11.19],"7898100550524":[22.9,18.39],"7898100550388":[17.5,17.5],"7898100550449":[17.8,17.5],"7898100550517":[19.9,24.14],"7898100550418":[20.6,17.51],"7898100550326":[24.0,10.18],"7898100550364":[20.5,24.47],"7898684202352":[24.0,94.44],"7898684202369":[32.7,94.44],"7898684202406":[25.6,79.89],"7898684202390":[22.8,79.88],"7898684202376":[18.3,79.89],"7898684202383":[18.3,79.89],"7898684202307":[29.1,106.06],"7898684202291":[38.7,106.06],"7898684202345":[25.6,90.76],"7898684202338":[30.2,90.76],"7898684202314":[25.6,90.76],"7898684202321":[26.4,90.76],"7898100558667":[25.4,19.48],"7898100558681":[25.5,19.59],"7898100558612":[25.6,19.58],"7898100558629":[25.5,19.59],"7898100558711":[25.5,28.51],"7898100558544":[20.4,10.34],"7898526963199":[8.6,8.06],"7898684201911":[23.5,59.43],"7898945401722":[23.0,9.9],"7898965442743":[6.9,5.67],"7898965442750":[14.4,25.28],"3897000000003":[42.1,22.12],"7908642008527":[18.3,9.93],"7908642007551":[24.9,28.63],"7908642007544":[33.4,18.66],"7908642001139":[16.3,45.9],"7908642001207":[31.8,90.54],"7908642001191":[18.9,79.31],"7908642001153":[19.0,57.6],"7891112013810":[13.8,20.59],"7891112011489":[14.5,25.74],"7891112010574":[16.4,30.88],"7891117023760":[17.4,57.67],"7899612790248":[14.5,11.77],"7899612790187":[14.2,5.88],"7899612782915":[14.4,491.48],"7899612782861":[14.5,52.76],"7899612782878":[14.4,89.55],"7899612782908":[14.4,270.62],"7899612792051":[21.0,32.08],"3962":[24.3,17.9],"7899612718211":[29.9,66.58],"7899612718228":[22.7,97.19],"7891738019449":[13.3,19.02],"7891738019005":[13.0,15.07],"7898092000175":[12.9,6.43],"7898092000250":[16.5,6.49],"7898092000274":[14.4,27.06],"7898092000212":[13.0,5.51],"7898092000267":[22.7,6.23],"7898092000304":[13.0,29.11],"7898092000205":[13.2,4.93],"7898092000199":[13.0,7.13],"7898092000281":[16.1,17.66],"7898092000311":[13.1,4.17],"7898092000137":[18.2,4.42],"7898092000120":[13.0,17.64],"7898092000014":[14.9,6.13],"7898092000021":[19.3,16.17],"7898092000038":[19.3,30.13],"7898599491360":[22.1,34.07],"7891738039126":[33.0,21.22],"7897488022531":[23.9,20.64],"7897488022555":[21.9,27.05],"7897488044991":[8.5,39.35],"7898547051127":[24.5,33.87],"7898547055743":[16.2,75.95],"7898067903272":[1.6,0.84],"7898067903296":[0.4,1.05],"7898067903302":[1.2,2.65],"7898067903319":[0.8,3.5],"7898067903326":[1.1,4.11],"7898067903333":[2.0,0.79],"7898067903609":[0.4,1.19],"7898067903357":[1.2,0.96],"7898067903364":[1.5,0.9],"7898067903371":[0.9,2.38],"7898067903388":[1.1,3.08],"7898067903395":[1.0,3.85],"7898067903401":[1.0,7.03],"7898067903449":[0.5,1.05],"7898067903456":[0.4,1.53],"7898067903463":[0.6,1.7],"7898067903470":[0.9,4.61],"7898067903487":[1.1,5.12],"7898067903494":[1.0,16.23],"7898067905238":[1.0,3.27],"7898067907331":[1.0,3.71],"7898067901858":[0.9,7.22],"7898067909281":[1.0,10.09],"7898638113802":[14.9,11.61],"7898067904880":[1.6,1.45],"7898067904996":[0.9,5.94],"7898067904989":[1.1,4.91],"7898067905009":[0.8,6.54],"7898067904965":[1.0,6.19],"7898067904958":[0.9,5.26],"7898067903586":[0.1,1.03],"7898067903593":[0.3,1.17],"7898638117008":[1.0,36.13],"7898638117015":[1.0,43.71],"7898638115554":[0.9,10.35],"7898067903111":[1.2,4.12],"7898067903807":[2.1,1.53],"7898067902442":[1.0,15.39],"7898067902503":[1.0,38.3],"7898067902473":[1.0,10.19],"7898067902480":[1.0,36.29],"7898638115547":[1.1,11.77],"7898067901346":[2.5,5.25],"7898067905030":[-0.1,0.47],"7898067902640":[1.0,2.9],"7898067905047":[0.8,5.86],"7898638117152":[0.9,1.66],"7908548600986":[1.1,12.16],"7898067909472":[1.0,8.32],"7898067903418":[0.6,0.64],"7898067903432":[0.8,1.87],"7898067903500":[1.3,1.63],"7898067903661":[0.8,2.73],"7898067905511":[1.0,6.97],"37898067901378":[0.8,5.24],"7898638116599":[2.5,5.22],"7898638116568":[2.5,5.06],"7899706503136":[2.6,6.67],"7896193298941":[46.0,20.58],"7898003890307":[16.7,18.73],"7898003891458":[44.3,38.08],"7898003890444":[16.0,5.81],"7898003895135":[18.3,27.16],"7898003895128":[18.3,27.16],"7898003894749":[27.8,8.34],"7898003894732":[21.9,7.76],"7898003894718":[27.9,6.68],"7898003894701":[28.1,6.15],"7898003896767":[17.3,12.7],"7898003896750":[16.7,10.27],"7898003896705":[17.6,2.57],"7898003896712":[20.2,3.1],"7898003896736":[16.6,6.4],"7898003896743":[16.6,7.7],"7898003896132":[16.8,2.31],"7898003896156":[16.8,2.77],"7898003896170":[16.6,3.88],"7898003896187":[17.3,4.53],"7898003896194":[17.3,6.19],"7898003896217":[17.2,8.76],"7898003896231":[17.3,11.81],"7898003896248":[17.2,14.38],"7898003893384":[23.7,13.27],"7898003891311":[27.2,10.37],"7898003891380":[31.2,9.44],"7898003892219":[13.3,19.27],"7898003892202":[18.4,19.01],"7898003892387":[14.5,45.14],"7898003893254":[20.1,20.07],"7898003896316":[16.7,48.02],"7898003891397":[18.4,8.24],"7898003893315":[19.8,22.36],"7898003890413":[22.7,11.03],"7898003893278":[25.9,22.42],"7898003891366":[18.3,6.31],"7898003895371":[18.3,12.5],"7891249071967":[27.0,58.75],"7891249071981":[28.6,45.57],"7891249011383":[36.6,10.39],"7891249010096":[22.2,1.46],"7891249010119":[25.5,2.83],"4191":[40.8,14.61],"7891249035419":[9.1,10.65],"4194":[16.2,147.31],"7898599490073":[24.5,40.18],"4196":[15.0,169.19],"7899447137850":[16.7,45.47],"7899447127592":[24.7,46.17],"7899447127608":[17.3,50.66],"7899447127615":[16.8,52.43],"7899447127622":[16.9,54.69],"7899447127639":[16.8,55.08],"7899447127646":[16.8,59.97],"7899447137904":[16.8,64.35],"7899447127653":[16.8,67.97],"7899447127660":[24.7,73.46],"7899447127677":[12.5,77.18],"7899447127684":[16.8,87.97],"7899447127691":[16.5,88.21],"7899447127707":[16.6,94.82],"7899447127721":[22.4,107.74],"7899447127738":[24.7,110.25],"7899447127752":[22.4,120.48],"7899447127769":[16.8,136.66],"7896112466512":[13.6,11.81],"7896112466529":[13.6,11.81],"7896112466536":[20.6,11.81],"7896112466543":[13.6,11.81],"7896112466550":[20.7,11.81],"7896112466567":[13.6,11.81],"7896112466574":[20.7,11.81],"7896112466581":[20.7,11.81],"7896112466598":[20.7,11.81],"7896112466604":[20.7,11.81],"7896112466314":[13.6,9.92],"7896112466321":[13.6,9.92],"7896112466338":[13.6,9.92],"7896112466345":[31.5,9.92],"7896112466352":[13.6,9.92],"7896112466369":[13.6,9.92],"7896112466376":[31.5,9.92],"7896112466383":[31.5,9.92],"7896112466390":[31.5,9.92],"7896112466406":[31.5,9.92],"7896112467540":[13.6,9.92],"7896112467557":[13.6,9.92],"7896112468622":[13.6,9.92],"7896112467014":[13.6,11.81],"7896112467021":[13.6,11.81],"7896112467038":[20.7,11.81],"7896212466405":[23.9,6.95],"7896212466412":[22.7,6.95],"7896212466429":[22.7,6.95],"7896212466306":[16.1,6.95],"7896212466313":[16.1,6.95],"7896212466320":[22.7,6.95],"7896212466337":[22.7,6.95],"7896212466344":[22.7,6.95],"7896212466351":[22.7,6.95],"7896212466368":[10.2,6.95],"7896212466375":[22.7,6.95],"7896212466382":[22.7,6.95],"7896212466399":[22.7,6.95],"4258":[8.0,416.97],"4266":[8.0,111.19],"7891435955200":[25.2,7.21],"7899612731494":[25.5,1.16],"7899612731524":[25.8,1.16],"7899612731531":[25.8,1.16],"7899612731562":[25.5,1.16],"7891738347542":[14.4,10.62],"7899612715326":[14.6,5.58],"7899612715357":[14.4,6.65],"7899612710192":[14.4,9.67],"7899612736079":[14.4,15.17],"7899612736086":[14.4,15.67],"7899612736123":[14.5,14.81],"7899612736154":[14.5,17.48],"3885000000031":[57.9,33.53],"4302":[8.8,212.86],"4304":[8.8,212.86],"7898659066699":[0.0,22.92],"7908642009036":[28.9,2.47],"7908642009005":[26.5,2.48],"7908642004000":[29.7,4.81],"17898907527412":[33.1,13.51],"7898567705093":[17.1,24.14],"7898003890987":[18.4,3.34],"7898067901933":[2.7,8.01],"7898638112485":[2.7,51.99],"7898638112461":[2.7,169.21],"7898067901971":[2.7,22.79],"7898638110511":[2.7,63.9],"7898067901940":[1.1,8.06],"7898638111587":[1.1,9.13],"7898638111594":[2.7,15.29],"7898638111860":[2.7,3.33],"7898708891579":[26.4,77.38],"7898708891616":[29.1,67.83],"7898708891517":[10.5,94.33],"7898708891593":[26.4,73.66],"0736532119223":[26.1,53.12],"7898003890376":[18.3,5.31],"7898003890352":[18.4,6.28],"7897488009129":[18.1,17.84],"7898708891692":[33.2,110.27],"7891117030799":[18.2,3.02],"7891117030775":[24.4,3.5],"7891117048671":[12.0,35.61],"7891117000945":[14.1,27.79],"7891117003038":[20.1,40.16],"7891117007128":[14.0,23.39],"7891117051404":[18.8,41.18],"7898379890116":[4.8,13.34],"7898379890123":[4.8,17.25],"7898379890130":[4.8,23.45],"7898379890147":[4.8,22.51],"7898379890710":[4.8,16.91],"7898379890161":[4.8,17.52],"7898379890178":[4.7,26.92],"7898379890185":[4.7,27.12],"742832915168":[23.0,0.57],"107428329151968":[27.7,1.15],"7898379891151":[14.3,21.69],"7898379891168":[14.3,46.39],"7898379891175":[14.3,33.3],"7898379890017":[14.3,11.66],"7898379890024":[14.3,12.15],"7898379890031":[14.3,12.63],"7908337100031":[13.0,2.61],"7908337100079":[15.2,2.68],"7908337100116":[17.4,11.8],"7908337100055":[17.5,4.35],"7908337100017":[16.7,6.36],"7899447109543":[41.9,49.61],"7899447109550":[41.2,47.41],"7899447109598":[40.8,39.63],"7899447109567":[42.3,46.07],"7899447109574":[45.6,45.2],"7898133950025":[19.7,9.31],"7898133950032":[21.2,18.39],"7898133950049":[20.0,33.23],"4417":[27.3,7.05],"4418":[44.6,1.02],"4419":[41.3,1.12],"7898659063421":[35.8,2.73],"7898959378003":[45.5,3.17],"7898659060000":[46.9,3.99],"7898659063445":[28.1,9.78],"7898659063452":[23.1,10.52],"4425":[27.9,17.24],"7706912058179":[29.3,27.0],"7908642008541":[30.9,10.48],"7908642008466":[23.4,14.3],"7891435052787":[14.5,9.29],"7891435052848":[13.0,17.37],"7891435052831":[14.8,14.76],"7891435052824":[19.6,14.41],"7891435052800":[15.1,9.64],"7891435052794":[20.8,8.83],"7898692150843":[26.4,20.24],"7898692150850":[21.3,20.24],"7898692150867":[21.3,20.24],"7898959829352":[13.2,14.13],"7898932677444":[19.3,36.88],"7891435054637":[16.2,13.6],"7891638060831":[19.6,24.9],"7896558413286":[33.3,12.9],"7891638017637":[15.5,15.06],"7891638017644":[30.6,17.28],"7891638050924":[32.5,74.15],"7891638050948":[32.5,148.31],"7891638059088":[15.4,49.62],"7891638049843":[13.4,79.16],"7891638049850":[19.6,79.16],"7891638054304":[13.4,79.16],"7891638049904":[20.7,114.33],"7891638049911":[20.4,118.72],"7891638049928":[20.3,67.44],"7891638049935":[13.4,76.23],"7891638049942":[19.1,82.43],"7891638054823":[11.9,39.06],"7891638054267":[15.0,44.44],"4467":[23.1,15.9],"4468":[13.0,28.29],"4469":[13.0,26.35],"4470":[13.0,26.35],"4471":[13.0,26.35],"4477":[0.0,0.0],"4478":[0.0,0.0],"4479":[0.0,0.0],"4480":[0.0,0.0],"4481":[14.4,25.88],"4482":[0.0,0.0],"4483":[0.0,0.0],"4484":[0.0,0.0],"4485":[0.0,0.0],"4486":[0.0,0.0],"4487":[0.0,0.0],"4488":[0.0,0.0],"7898379890543":[4.8,19.61],"4490":[14.4,24.51],"4491":[0.0,0.0],"7898379890109":[4.7,12.53],"4493":[0.0,0.0],"4494":[0.0,0.0],"4495":[0.0,0.0],"4496":[0.0,0.0],"4497":[24.4,4.47],"4498":[27.3,3.86],"17898958256019":[17.1,3.6],"17898958256323":[15.1,2.42],"17898958256385":[15.0,11.25],"17898958256316":[38.5,3.58],"17898958256354":[37.9,15.16],"17898958256026":[19.0,2.5],"17898958256033":[16.4,2.38],"27898958256375":[16.6,11.32],"17898958256361":[13.6,10.7],"17898958256187":[13.0,12.48],"7899612714305":[47.0,26.49],"0618231086856":[29.2,178.63],"0618231086849":[25.8,249.15],"0618231086825":[28.8,181.43],"0618231086818":[29.1,253.55],"0618231086863":[35.7,196.85],"0618231086832":[16.2,253.55],"0618231086870":[13.7,121.27],"0618231086887":[13.4,141.02],"07898911436048":[15.9,183.45],"0618231087402":[22.1,140.38],"0618231087419":[15.9,146.76],"0618231087426":[22.1,204.18],"0618231086900":[15.9,126.12],"0618231086917":[26.2,163.34],"0618231086924":[22.6,205.68],"7908642006264":[27.2,29.98],"7908642006271":[26.4,32.37],"7908642006288":[26.4,35.36],"7908642006295":[26.4,41.78],"7908642006301":[27.0,47.98],"7908642006233":[28.5,5.51],"7908642006240":[21.7,11.07],"7908642006257":[19.1,13.93],"7898684202611":[14.7,39.26],"7898684202628":[21.6,39.46],"7898684202635":[14.1,41.01],"7898684202543":[24.0,39.1],"7898684202550":[14.6,41.41],"7898684202567":[14.6,41.43],"7898684202642":[24.7,38.18],"7898684202659":[28.7,40.05],"7898684202666":[21.2,38.09],"7898684202574":[27.2,42.22],"7898684202581":[14.6,42.03],"7898684202598":[14.4,53.02],"7898684202475":[28.7,41.92],"7898684202482":[14.6,40.99],"7898684202499":[14.5,41.01],"7898684202505":[49.7,41.78],"7898684202512":[24.2,41.61],"7898684202529":[24.6,39.96],"4554":[10.1,10.33],"7898067900332":[1.0,20.53],"7898067907423":[1.1,5.4],"7898067907447":[1.0,20.08],"7898067907461":[1.0,14.94],"7898067907416":[1.0,21.06],"7898067905177":[2.7,22.46],"7898067903531":[0.2,0.48],"7898067903548":[1.4,2.09],"7898067903555":[0.9,2.53],"7898067907225":[1.1,7.46],"7898638110689":[1.1,4.11],"7898638111228":[1.0,9.43],"7898638111310":[1.0,18.27],"7908548601259":[1.0,62.02],"0618341369122":[28.3,10.35],"0618341369139":[24.1,16.4],"7899612796851":[23.2,3.6],"7899612796844":[14.6,3.59],"7899612796837":[31.8,3.59],"7898214272183":[21.0,293.73],"7898214272190":[21.0,268.96],"7898214272664":[21.0,322.31],"7898214272671":[26.3,370.05],"7898214272770":[19.8,336.2],"7898214272787":[26.2,378.18],"7898697090007":[13.3,49.8],"7898697090113":[13.3,49.9],"7898697090014":[14.6,49.9],"7898697090106":[14.6,49.9],"7898921098274":[19.2,17.9],"7898697090717":[19.2,17.9],"7898697090724":[14.5,17.9],"7898697090731":[14.6,20.13],"7898697090694":[14.6,21.5],"7899710006531":[18.3,2.14],"7899710006555":[20.4,3.75],"7899710006579":[20.3,4.68],"7899710009860":[20.4,6.48],"7899710009877":[21.6,10.83],"7899710009884":[21.7,14.73],"7899710010415":[18.7,17.81],"7899710008306":[19.3,10.24],"7899710006975":[15.0,10.48],"7899710013010":[18.6,38.36],"7899710013157":[29.5,14.87],"7899710013164":[19.0,18.74],"7899710013171":[19.1,30.56],"7899710013218":[30.0,16.94],"7899710013225":[21.2,20.33],"7899710013232":[21.7,28.32],"7899710013126":[29.6,14.88],"7899710013133":[21.7,16.85],"7899710013140":[21.7,26.81],"7899710013188":[19.0,17.34],"7899710013195":[39.1,22.38],"7899710013201":[39.1,33.73],"7899710015557":[14.5,16.06],"7899710015540":[26.6,19.87],"7897687412522":[6.5,3.48],"7897150100055":[19.7,1.63],"7897150100079":[19.7,1.63],"7897150100062":[19.7,1.63],"7898994475217":[11.0,6.22],"7898994475248":[8.4,6.22],"7898994475255":[6.0,6.22],"7898958216672":[7.9,14.34],"7898958216641":[7.3,10.13],"7898067902497":[1.0,14.45],"7898395636279":[16.7,72.9],"7894061008982":[14.5,1.17],"7894061003628":[16.9,3.54],"7894061009071":[14.8,3.3],"7894061003635":[23.1,8.0],"7894061012255":[33.6,1.23],"7894061012347":[11.6,3.37],"7894061003116":[7.5,1.86],"7894061002461":[15.3,2.43],"7894061003543":[27.1,8.42],"7894061012323":[34.5,2.11],"7894061012286":[11.2,3.92],"7894061003154":[23.0,4.34],"7896112463740":[13.2,8.62],"7896112463757":[13.2,8.62],"7896112466413":[25.7,8.62],"7896112466420":[5.1,8.62],"7896112466437":[25.7,8.62],"7896112466444":[25.7,8.62],"7896112466451":[25.7,8.62],"7896112466468":[25.7,8.62],"7896112466475":[25.7,8.62],"7896112466482":[25.7,8.62],"7896112466499":[25.7,8.62],"7896112466505":[5.1,8.62],"7896112561309":[13.8,9.85],"7896112561316":[13.8,9.85],"7896112466819":[23.1,9.85],"7896112466826":[25.3,9.85],"7896112466833":[26.2,9.85],"7896112466840":[23.9,9.85],"7896112466857":[23.9,9.85],"7896112466864":[23.9,9.85],"7896112466871":[23.9,9.85],"7896112466888":[23.9,9.85],"7896112466895":[23.9,9.85],"7896112466901":[23.9,9.85],"4696":[11.0,2.37],"7898759180516":[25.2,3.0],"7898759180240":[13.7,0.67],"7898423890055":[23.1,9.68],"7898423890062":[14.9,9.81],"7898423890079":[14.8,10.62],"7898423890086":[20.1,11.02],"7898423890093":[22.2,11.39],"7898423890116":[20.7,11.68],"7898423890123":[23.3,12.78],"7898423890130":[14.7,16.42],"7898423890147":[18.9,16.52],"7898423890154":[20.7,13.66],"7898423890161":[16.7,17.25],"7898423890178":[9.8,15.42],"7898423890185":[20.7,16.42],"7898423890192":[20.6,18.65],"7898423890215":[20.4,18.72],"7898423890222":[13.8,19.83],"7898423890239":[14.2,24.24],"7898423890246":[21.9,25.24],"7898513374014":[35.4,4.51],"7898513374120":[35.5,4.52],"7898513374021":[35.3,5.12],"7898513374137":[35.3,5.12],"7898513374038":[32.4,9.38],"7898513374144":[35.2,9.38],"7898513374052":[32.4,13.74],"7898513374168":[35.1,13.74],"7898513374090":[37.0,24.23],"7898513374205":[37.0,24.23],"7898513374106":[41.7,29.11],"7898122761557":[16.9,8.98],"7898122760536":[17.2,39.83],"7898122760550":[19.3,11.56],"7898122760871":[23.1,18.7],"7898122761014":[20.2,15.86],"7898122760994":[19.5,24.2],"7898122705360":[15.9,11.12],"7898122760642":[23.8,3.0],"7898122760659":[29.2,13.7],"7898122760055":[18.2,18.18],"7898122760581":[22.1,19.82],"7898122760178":[21.1,70.5],"7898122760895":[19.6,4.81],"7898122760802":[21.1,16.17],"7898122760727":[21.1,30.21],"7898122760062":[17.8,5.0],"7898122760079":[21.1,17.7],"7898122760000":[19.1,4.67],"7898122760031":[16.4,4.02],"7898122760277":[6.0,3.32],"7898122760710":[28.6,6.28],"7898122760758":[20.2,17.2],"7898330605131":[5.0,85.99],"7899447151092":[25.7,49.95],"7899447151108":[28.3,49.13],"7899447151115":[25.6,27.03],"7899447151122":[27.7,39.79],"7899447151146":[6.0,49.09],"7899710013348":[24.9,16.6],"7899710013355":[20.7,19.7],"7899710013362":[27.6,21.26],"7899710013379":[32.8,31.06],"7899710013386":[34.4,48.81],"7899710015229":[34.0,136.11],"7899710018114":[32.0,296.94],"7899710018121":[32.1,410.25],"7898067907508":[0.9,8.9],"7898067900431":[0.8,2.37],"7898067900424":[0.2,1.52],"7898067904750":[1.1,7.38],"7898067903210":[1.0,4.89],"7898067900387":[0.9,4.62],"7898067904675":[1.0,4.73],"7898067903227":[1.1,3.22],"7898067903814":[1.0,2.26],"4777":[19.7,4.0],"7891435937114":[20.4,11.31],"7898708891531":[21.4,77.83],"7898708891654":[26.0,72.99],"7899447151078":[25.7,49.78],"4787":[18.8,17.11],"4789":[18.9,42.06],"7899612706089":[15.4,38.04],"7899612706096":[15.4,38.79],"7899612791474":[14.4,62.32],"7897613529034":[14.9,33.79],"7897613533239":[14.7,11.47],"7897613528303":[15.0,19.09],"7897613528181":[17.6,4.41],"7897613514092":[16.7,4.0],"7897613514054":[14.7,2.63],"0192505358134":[25.6,55.41],"0192505358110":[16.9,29.88],"7898003894725":[27.9,7.27],"7898464735254":[20.7,9.82],"7898464735162":[17.8,7.95],"7898464735179":[18.0,8.45],"7898464735193":[19.4,11.42],"7898464737760":[16.8,43.69],"7898464737777":[16.8,43.69],"7899807212883":[25.5,10.5],"7908642008497":[17.7,12.25],"7898330671419":[16.6,17.76],"7898330671426":[16.6,23.31],"7898330671433":[17.2,44.84],"7898330670528":[17.1,15.97],"7898330670573":[16.7,25.8],"7898330670597":[21.7,38.03],"7898698340828":[15.8,33.47],"7898698343782":[30.8,3.38],"7898330607692":[15.0,56.13],"7898330607814":[24.5,106.79],"7898330614508":[17.5,17.72],"7898698346516":[16.7,165.5],"7891249017743":[14.6,7.43],"7891249017781":[19.6,8.87],"7891249017934":[24.8,19.3],"7891249058968":[26.5,58.81],"7899612717382":[25.9,9.46],"7899612717696":[14.4,44.14],"7899612717689":[14.4,39.27],"7899612717672":[14.4,40.34],"7899612717665":[14.4,29.66],"7899612717658":[14.4,25.76],"7899612717634":[12.3,22.21],"7899612706102":[15.4,41.43],"7899612721822":[12.3,21.71],"7899612713421":[12.3,64.31],"7899612730022":[12.3,38.39],"7899612795441":[12.3,44.26],"7899612791795":[12.3,60.87],"7899612712882":[12.3,63.01],"7899612716736":[12.3,87.47],"7899612796943":[16.4,64.67],"4890":[16.9,6.8],"4891":[19.3,52.92],"4892":[3.7,24.03],"7898031547020":[15.7,26.95],"7908642009647":[12.7,3.69],"7908642009685":[13.4,4.82],"7908642008763":[18.1,23.21],"7898409013423":[7.2,17.35],"7899612790323":[14.5,34.01],"7899612709325":[14.5,5.39],"7899612719256":[19.2,46.63],"7899612710338":[19.2,26.64],"7899612780058":[19.1,9.2],"7899612782113":[14.3,4.62],"7899612782212":[13.7,4.88],"7899612782236":[14.3,7.06],"7899612782243":[14.5,8.69],"7899612782250":[14.5,9.33],"7899612708397":[22.6,100.0],"7899612788771":[14.4,53.24],"7899612705570":[17.8,3.44],"7899612731197":[9.4,18.2],"7899612782144":[14.6,5.42],"7899612782168":[14.4,4.73],"7899612782175":[14.4,4.87],"7899612782311":[14.5,12.88],"7899612782298":[14.4,10.08],"7899612782304":[14.4,9.94],"7899612782281":[14.5,12.39],"7899612782274":[14.5,9.91],"7899612783141":[15.7,12.06],"7899612783127":[14.6,7.55],"7899612783134":[16.9,8.97],"7899612725004":[19.2,31.13],"7899612725110":[4.9,7.6],"7899612710352":[19.2,35.96],"7899612791160":[14.4,95.52],"7898395638211":[6.4,135.15],"7898395633346":[13.1,132.47],"7898395632837":[0.1,135.57],"7898395630987":[14.2,139.78],"7908370908496":[5.5,130.18],"7898395631151":[6.8,129.7],"4971000000009":[12.0,4.74],"4972":[0.0,0.0],"7898395639737":[14.2,152.51],"7898395632806":[14.2,134.37],"4976":[17.8,17.83],"7898684202604":[31.1,42.44],"7898684202536":[30.4,44.55],"7898684202468":[14.4,41.79],"7908642000651":[23.7,1.41],"7908642000668":[22.5,2.61],"7908642000675":[23.6,5.6],"7908642008480":[20.7,29.69],"7908642009166":[10.8,6.67],"7908642009159":[9.8,6.68],"7899612717641":[14.4,25.79],"7899612708366":[15.9,43.82],"7899612706041":[15.4,27.49],"7899612706119":[14.4,63.79],"7891738019135":[18.5,13.38],"7891738029028":[16.1,17.73],"7891738029042":[15.2,17.48],"7899710016707":[41.0,13.05],"7899710016691":[40.4,11.14],"7899710016684":[38.2,10.03],"7908642003096":[22.5,16.9],"7899085400064":[19.6,34.95],"5003":[40.9,34.93],"7899085400019":[19.6,34.95],"7899085400026":[19.6,34.95],"7899085400057":[19.6,34.95],"7899085480110":[40.9,50.96],"7899085480059":[40.9,50.97],"7899085480066":[19.6,50.96],"7899085480073":[40.9,50.96],"7899085402884":[40.8,24.56],"7899085402822":[40.8,24.56],"7899085402839":[19.6,24.56],"7899085402846":[40.8,24.56],"7899085402877":[40.8,24.56],"0040141783356":[27.6,83.2],"192505291684":[28.8,63.56],"5018":[26.6,107.85],"7890877000011":[5.2,4.93],"7890877000028":[25.2,5.03],"7898390940371":[17.4,8.07],"7898390941347":[17.4,15.94],"7898390941378":[18.0,18.84],"7898390941682":[17.9,3.96],"7898390942054":[17.9,8.99],"7898390942061":[17.9,8.99],"7898390942078":[18.0,9.62],"7898390943273":[17.9,9.01],"7898390944003":[18.0,6.08],"7898390944379":[18.0,18.84],"7898390944416":[10.3,18.85],"7898622611109":[15.2,16.05],"7898622611123":[11.1,18.13],"7898622611932":[12.7,22.29],"7898622611949":[12.6,23.73],"7898543391890":[16.7,4.52],"7898543380924":[10.2,16.52],"7898543381013":[12.3,17.01],"7898543381105":[19.3,18.76],"7898543380986":[18.2,18.74],"7898543380993":[16.1,18.19],"7898543381006":[18.2,18.74],"7898543380948":[18.2,18.74],"7898543381044":[17.8,18.74],"7898543381051":[17.8,18.74],"7898543380955":[19.3,18.74],"7898423896514":[25.8,17.4],"7898423896545":[27.7,21.67],"7898423896552":[25.8,26.58],"7898423896576":[25.7,33.83],"7898423896606":[25.8,21.75],"7898423896637":[27.7,26.53],"7898423896644":[25.6,34.96],"7898423896651":[25.7,35.44],"7898423896668":[25.6,41.48],"7898423896675":[25.7,44.47],"7898423896682":[25.7,50.83],"7898423896729":[23.2,40.6],"7898423896736":[27.8,44.06],"7898423896750":[27.8,52.04],"7898423896767":[25.7,56.63],"7898423896774":[27.8,27.16],"7898423896811":[25.7,58.24],"7898423896835":[25.7,29.1],"7898423896842":[27.8,33.96],"7899447135030":[24.1,19.17],"7899447135108":[27.7,52.88],"7899447135115":[25.7,29.69],"508900000001":[15.0,12.67],"509000000001":[15.0,13.71],"7891117006961":[19.0,2.83],"7898622611673":[6.6,91.03],"7898622611703":[11.7,154.03],"7898622611710":[11.6,189.08],"7898622611727":[11.6,246.32],"7898622611734":[21.4,379.48],"7898067900172":[0.8,0.93],"7898638116957":[1.0,50.51],"7898067901681":[1.0,2.61],"7898067901711":[1.2,2.13],"7898067900363":[0.7,1.57],"7898067903906":[1.2,2.66],"7899612708786":[18.6,28.32],"7899612795137":[14.4,9.59],"7899612720504":[29.3,1.11],"7899612720511":[28.4,1.26],"7899612723925":[29.4,1.35],"7899612723932":[29.2,1.62],"7899612723161":[27.2,4.22],"7899612723185":[27.3,6.83],"7899612723192":[28.7,7.26],"7899612795083":[14.4,52.08],"7899612795380":[14.4,27.72],"7899612780881":[15.2,53.32],"7898701774503":[10.1,94.27],"7898701774527":[-20.4,20.11],"7898472252552":[15.3,23.35],"7898701774534":[1.0,24.57],"7898701770796":[1.0,77.05],"7898701770178":[13.3,88.05],"7898701770192":[13.3,88.05],"7898701770185":[11.8,86.3],"7898701770208":[1.0,88.05],"7898701770239":[11.8,86.3],"7898701770246":[13.3,88.05],"7898701770222":[1.0,88.05],"7898701770024":[1.0,86.3],"7898701770048":[1.0,86.3],"7898701770062":[13.3,88.05],"7898701770086":[24.2,118.57],"7898701770109":[1.0,86.3],"7898701770130":[1.0,88.05],"7898701770147":[1.0,86.3],"7898701770154":[1.0,86.29],"7898701770284":[-2.0,29.52],"7898701770291":[-2.0,29.52],"7898701770314":[1.0,30.07],"7898701770321":[-0.4,30.07],"7898701770338":[-2.0,29.53],"7898701770345":[-2.0,29.53],"7898701770383":[-1.8,29.58],"7898701770390":[1.0,29.52],"7898701770413":[-2.0,29.52],"7898701770437":[-2.0,29.52],"7898701770451":[1.0,29.52],"7898701770475":[-0.4,30.07],"7898701770482":[1.0,29.52],"7898701770499":[-2.0,29.52],"7898701770406":[-2.0,29.52],"7898701771953":[-0.4,30.07],"7898701770161":[1.0,88.05],"7898701772233":[1.0,46.17],"7898701772257":[1.0,52.63],"7898701772219":[1.0,52.63],"7898701772264":[1.0,175.32],"7898701772493":[1.0,170.51],"7898701772349":[1.0,160.02],"7898701772363":[1.0,160.0],"7898701772370":[1.0,46.17],"7898701771779":[1.0,46.17],"7898701771533":[1.0,171.25],"7898701773711":[1.0,104.45],"7898701773360":[1.0,22.5],"7898701772974":[1.0,65.64],"7898701773070":[1.0,68.21],"7898701773049":[1.0,73.01],"7898701773025":[1.0,73.45],"7898701773506":[1.0,26.2],"7898701773605":[1.0,74.87],"7898701772776":[1.0,77.7],"7898701773674":[29.5,89.31],"7898701772790":[1.0,77.7],"7891230570035":[21.0,57.04],"7891231020034":[19.3,71.42],"7891231050031":[19.2,47.69],"7891231060030":[14.2,48.61],"7891231170036":[6.1,15.73],"7891231200030":[15.8,20.62],"7891240000447":[6.1,15.73],"7891240000461":[15.8,20.62],"7891231320035":[16.1,4.3],"7891230500032":[20.3,8.69],"7891230530039":[-1.0,13.03],"7891230540038":[5.9,9.54],"7891230520030":[3.2,10.64],"7891230560036":[-2.9,13.63],"7891230510031":[16.2,12.41],"7891230550037":[14.6,7.43],"7891231330034":[14.8,8.93],"7891231110032":[14.9,9.66],"7891231120031":[2.8,16.09],"7891231130030":[19.4,12.72],"7891231140039":[16.7,22.15],"7891231150038":[17.4,16.06],"7898684202673":[12.5,5.76],"7898684202680":[12.6,8.21],"7899085400088":[16.8,27.54],"7899085400095":[16.8,27.54],"7899085400132":[16.8,27.54],"7899085400125":[16.8,27.54],"7898488043144":[14.5,10.28],"7898488023665":[14.4,21.26],"7898488023474":[14.4,25.79],"7898488023481":[14.5,23.66],"7898488023719":[14.5,91.11],"7891638043742":[12.7,21.82],"7891638043766":[14.1,43.3],"7891638043773":[14.1,57.63],"7891638044015":[14.1,54.04],"7891638044176":[14.1,86.42],"5340":[21.7,7.54],"7898590590994":[26.6,1.77],"7898590591007":[26.6,1.77],"7898590591014":[26.6,1.77],"7898590591021":[26.6,1.77],"7898590591038":[26.6,1.77],"7898590591045":[26.6,1.77],"7898590591069":[2.2,6.44],"7897488033957":[20.0,12.38],"7897488033964":[15.2,20.27],"7897488033971":[29.0,25.64],"7897488033988":[27.0,33.36],"7897488033995":[15.1,48.11],"7897488034008":[24.4,69.89],"7897488034015":[15.1,88.75],"7898489753844":[14.9,425.17],"7898489753868":[38.0,323.43],"7898489754506":[23.3,15.41],"7898489754513":[20.0,27.4],"7898489754520":[26.4,34.73],"7898489750263":[15.1,35.16],"7898489750515":[20.8,14.64],"7898489750522":[22.1,28.58],"7898489750539":[19.8,32.43],"7898489752786":[15.8,112.35],"7898489752809":[15.4,138.77],"17898489752684":[27.2,58.18],"7898489750676":[20.0,14.41],"7898489750683":[20.0,27.4],"7898489750690":[21.5,33.54],"7891249070939":[22.1,51.14],"7891249072032":[23.2,67.19],"7908608002743":[19.3,7.68],"7908608002750":[19.3,7.68],"7908608002767":[17.5,7.68],"7908608002774":[19.3,7.68],"7908608002781":[19.3,7.68],"7908608002798":[17.1,8.12],"7908608002804":[17.0,8.12],"7908608002811":[17.2,8.12],"7908608003290":[16.0,22.11],"7908608003351":[16.0,39.84],"7908608003382":[15.0,42.02],"7908608003412":[16.0,39.84],"7908608003443":[18.2,65.13],"7908608002828":[15.0,23.67],"7908608002835":[15.0,23.62],"7908608002842":[15.0,23.62],"7908608002859":[17.0,23.61],"7908608002866":[15.0,23.61],"7908608002873":[17.0,23.61],"7908608002880":[15.4,24.28],"7908608002897":[14.9,24.28],"7908608002903":[15.4,24.28],"7908608003313":[20.2,46.57],"7908608003368":[23.6,92.36],"7908608003399":[18.6,85.52],"7908608003429":[13.0,78.65],"7908608003450":[13.0,96.42],"7908608002910":[15.0,43.11],"7908608002927":[16.2,46.06],"7908608002934":[15.0,45.27],"7908608002941":[18.0,44.19],"7908608002958":[15.0,42.32],"7908608002965":[15.0,42.32],"7908608002972":[15.0,44.5],"7908608002989":[18.0,41.36],"7908608002996":[15.0,43.31],"7908608003337":[26.6,73.08],"7908608003375":[17.8,136.78],"7908608003405":[15.0,138.39],"7908608003436":[17.3,136.01],"7908608003467":[29.7,160.36],"7908608004532":[9.7,24.75],"7908608004549":[18.0,32.69],"7908608006659":[17.1,47.38],"7908608004563":[18.2,198.1],"7908608006727":[18.0,61.68],"7908608003580":[18.6,35.22],"7908608003597":[18.6,51.72],"7908608003603":[15.0,242.44],"7908608003610":[18.6,463.05],"7908608003627":[23.8,382.11],"7908608003474":[18.0,82.29],"7908608003481":[17.0,84.0],"7908608003498":[20.0,91.92],"7908608003504":[16.3,190.76],"7908608003511":[16.3,198.52],"7908608003528":[16.3,114.7],"7908608003535":[15.0,105.25],"7908608003542":[19.3,119.46],"7908608003559":[16.3,198.24],"7908608003566":[16.3,245.1],"7908608002736":[17.4,7.68],"17898692150710":[22.3,40.08],"7898692150720":[21.0,39.3],"5444000000007":[11.9,27.57],"7891117043546":[17.2,4.9],"7891117006992":[32.1,5.01],"7898489750294":[15.5,54.3],"7898489750270":[15.4,47.53],"7898472262490":[20.5,4.59],"7898543381174":[16.7,26.09],"7898543382348":[18.9,26.88],"7898904869396":[19.6,17.22],"7898904869150":[17.9,8.96],"7898543383291":[18.5,14.24],"7898472261769":[18.7,6.68],"7898472254921":[19.3,6.32],"7898472263398":[17.3,16.62],"7898472263343":[17.3,16.62],"7898472263350":[17.3,16.62],"7898472263381":[17.2,20.53],"7898472263367":[17.3,16.62],"7891435073614":[13.0,3.92],"7891435043181":[14.8,4.02],"7891435043204":[14.9,5.5],"7891435043211":[14.9,7.85],"7891435046229":[19.1,7.14],"7891435047547":[18.9,7.85],"7891435043228":[15.8,7.85],"7891435043235":[19.0,7.85],"7891435924510":[25.1,4.06],"7891435924527":[14.5,4.59],"7891435924534":[13.7,5.19],"7891435924541":[13.3,4.07],"7891435042979":[14.8,0.93],"7891435042986":[19.6,0.74],"7891435041323":[16.1,1.18],"7891435041330":[15.8,0.61],"7891435041347":[14.4,0.53],"7891435041354":[16.2,0.75],"7891435041361":[17.3,0.6],"7891435052190":[14.5,6.42],"7891435052206":[16.7,5.62],"7891435052213":[15.7,6.16],"7891435934588":[13.6,5.92],"7891435042818":[13.1,14.41],"7891435042825":[14.2,16.59],"7891435053142":[15.0,22.99],"7891435926873":[16.0,6.79],"7891435926842":[13.0,6.26],"7891435043839":[15.0,6.48],"7891435042849":[14.0,6.79],"7891435043259":[15.6,11.26],"7891435043334":[30.0,14.41],"7891435924626":[15.8,7.5],"7891435064131":[13.7,4.74],"7891435945072":[24.8,5.77],"7891435945096":[16.9,5.26],"7891435924633":[20.3,8.08],"7891435924640":[15.6,8.19],"7891435924664":[15.0,13.66],"7891435924671":[15.6,11.84],"7891435042887":[15.7,5.97],"7891435042900":[13.1,8.05],"7891435056907":[13.0,14.2],"7891435966329":[14.0,8.33],"7891435966336":[13.9,9.04],"7891435966343":[12.0,7.95],"7891435966350":[14.1,8.73],"7891435966367":[18.7,8.73],"7891435966374":[24.7,12.64],"7891435966381":[13.0,9.78],"7891435966398":[14.0,10.89],"7891435964356":[17.5,49.43],"7891435964370":[13.0,56.44],"7891435964387":[23.6,54.58],"7891435966435":[13.0,28.28],"7891435966695":[26.6,34.73],"7891435966701":[12.1,29.23],"7891435966718":[12.1,29.23],"7891435966725":[13.0,30.74],"7891435964516":[14.0,110.04],"7891435964547":[22.8,118.44],"7891435967227":[14.9,37.63],"7891435967234":[14.9,37.63],"7891435967241":[14.5,39.91],"7891435967258":[14.9,37.63],"7891435967265":[14.0,42.01],"7891435967272":[14.8,39.68],"7891435967289":[16.4,40.54],"7891435967296":[14.0,44.3],"7891435964707":[22.7,221.39],"7891435960921":[32.7,98.15],"7891435960938":[14.9,202.09],"7891435960952":[14.9,152.23],"7891435960969":[14.9,152.23],"7891435960990":[14.9,236.2],"7891435960235":[14.8,48.52],"7891435960273":[14.9,169.83],"7894061003512":[24.0,5.9],"7896193296398":[17.3,20.58],"5563000000005":[16.4,28.29],"7899829909228":[19.6,6.0],"5565":[6.7,6.09],"7891435964677":[13.0,149.13],"7891435960242":[14.9,55.8],"7891435960259":[14.9,71.47],"7891435960266":[14.9,98.03],"7908642004079":[24.5,8.74],"5343000000003":[44.0,172.09],"5572":[14.9,172.09],"5573":[14.9,172.09],"5574":[14.9,141.13],"5347000000094":[27.2,54.27],"5348000000008":[15.8,51.31],"5349000000005":[15.8,51.31],"5350000000001":[15.8,51.31],"7898543381181":[26.4,21.24],"7898543381259":[28.1,21.87],"7898543381228":[28.1,21.87],"7898543381198":[17.6,31.0],"7898543381204":[20.3,30.09],"7898543381266":[28.1,21.87],"7898543381273":[14.7,21.88],"7898543381235":[28.1,21.87],"7898543381242":[28.1,21.87],"7898543381211":[28.1,21.87],"5338000000009":[14.8,93.52],"7891435966459":[29.9,33.0],"7891435966466":[26.6,34.73],"7899612707253":[19.2,19.43],"5597":[13.8,127.01],"7899612780973":[31.7,7.92],"7899612731180":[20.6,15.12],"7899612731043":[18.2,15.18],"7899612742155":[16.0,94.62],"7899612742858":[15.2,69.87],"7891435966442":[12.0,27.89],"7891435966428":[24.4,38.1],"7891435966312":[24.7,17.09],"7891435966756":[24.2,48.4],"0618231087471":[24.8,170.18],"0618231087488":[27.6,340.36],"7898547051981":[21.4,1.11],"7898547052070":[23.1,1.65],"7898547051837":[31.6,0.9],"7898547050120":[18.7,25.07],"7898547050137":[19.8,25.46],"7898547050144":[24.4,27.35],"7898941889272":[27.6,16.44],"7899829907064":[19.6,186.58],"7899829907071":[17.4,149.29],"7899829907255":[19.4,128.85],"7899829907088":[19.6,128.85],"7899829907286":[19.6,128.85],"7899829911672":[20.4,5.83],"7899829911696":[16.9,5.1],"7899829911719":[16.9,5.1],"7899829911733":[16.9,5.1],"7899829911740":[20.2,9.72],"7899829911757":[17.0,9.72],"7899829911764":[20.3,8.75],"7899829911771":[17.1,8.75],"7899829911788":[20.3,8.75],"7899829911795":[17.1,8.75],"7899829911801":[20.3,8.75],"7898543388180":[23.1,33.18],"7893308002998":[2.2,24.2],"7893308006941":[16.4,18.4],"7893308001397":[2.2,25.89],"7893308001403":[0.2,38.12],"7893308001380":[2.2,30.25],"7893308005906":[15.1,10.19],"7893308005791":[5.6,6.76],"5647":[14.4,517.34],"5648":[14.4,517.34],"5649":[30.8,443.44],"5650":[1.0,27.25],"7898659066729":[54.9,27.86],"7891435960914":[13.0,105.38],"7891435960976":[32.9,152.23],"7891435960983":[14.9,236.2],"7891435960907":[32.8,98.15],"7898684200150":[33.8,5.55],"7891234567451":[25.3,50.31],"5418000000008":[39.4,5.76],"5671":[0.0,0.0],"5430000000000":[20.5,88.09],"5673000000001":[38.3,12.27],"7898708891173":[-15.5,12.38],"7898659067511":[-5.8,11.47],"7898659067177":[47.7,111.12],"7898067900936":[1.0,2.54],"7898067900943":[1.1,5.12],"7898067900950":[1.1,7.46],"7898067900967":[0.9,11.25],"7898067900493":[-0.7,0.39],"7898067903913":[1.2,2.67],"7898067903180":[1.1,6.31],"7898067900295":[0.9,1.59],"7898067900318":[20.8,5.9],"7898067909342":[1.0,6.62],"7898067901988":[0.9,4.61],"7898067902008":[1.0,11.43],"7898067902015":[1.1,10.46],"7898067902039":[1.0,16.91],"7891249089238":[20.0,2.76],"7891249089221":[14.9,7.1],"5414000000000":[33.6,7.7],"7891435964530":[23.2,97.84],"7891435964691":[13.0,163.96],"7891435960945":[33.9,202.09],"7908642001238":[27.6,137.06],"7899811608504":[38.8,28.04],"7898638111525":[0.8,3.67],"7899807213835":[19.1,8.87],"7898094337712":[22.5,101.89],"7908608003917":[17.0,23.52],"7908608003887":[17.1,93.04],"7908608003979":[17.0,30.34],"7908608003962":[17.0,30.34],"7908608003986":[20.0,42.22],"7908608005768":[15.0,23.1],"7908608005751":[25.0,18.57],"7908608005744":[20.0,10.76],"7908608003993":[17.0,8.68],"7908608004211":[19.0,7.99],"7908608004228":[17.9,8.89],"7908608004235":[21.9,12.71],"7908608004204":[22.0,7.48],"7908608004310":[15.0,25.95],"7908608004327":[16.6,18.5],"7908642010476":[24.1,37.14],"5725":[0.0,0.0],"7908642010506":[26.8,56.56],"5727":[0.0,0.0],"7908642007490":[26.4,4.37],"7908642003515":[20.1,18.9],"7908642003607":[21.3,25.46],"7908642011275":[22.6,16.52],"7908642011299":[29.7,47.2],"7908642010643":[25.0,21.93],"7908642010650":[24.1,22.79],"7908642007841":[23.0,37.5],"7908642007506":[18.7,7.83],"7908642002990":[22.2,51.64],"7908642000897":[17.3,213.83],"7908642000903":[17.4,180.15],"7908642005151":[27.5,40.9],"7908642005168":[26.9,58.18],"7899095459281":[8.8,13.99],"7899095459298":[11.2,15.11],"7899095459304":[9.4,17.15],"7908642002730":[16.1,21.65],"7908642010988":[16.6,47.99],"7898701772998":[1.0,68.25],"7896603806292":[14.5,3.99],"7896603806308":[18.5,4.82],"7896603806575":[21.1,10.44],"7898067902251":[43.4,74.66],"7898067902923":[22.5,17.66],"7898067902930":[16.5,18.66],"7898067902947":[22.5,53.61],"7898067902978":[1.0,88.22],"7899706502504":[2.7,64.62],"7899706502511":[1.0,62.29],"7899706502528":[1.0,86.62],"7899706502535":[1.0,72.89],"7908642007803":[32.8,5.59],"7897613526019":[14.7,6.0],"7897613526026":[19.6,5.12],"7897613526033":[31.0,7.57],"7897613526040":[22.5,7.26],"7897613526057":[26.8,8.62],"7897613509081":[16.6,20.53],"7908642007971":[18.7,8.41],"7908642007988":[16.0,9.02],"7908642008015":[12.4,2.86],"7908642008022":[17.4,3.5],"7908642008039":[17.4,4.23],"7908608004259":[21.9,16.93],"17898686540220":[19.3,38.02],"7898686540230":[19.0,134.11],"7898686540179":[16.1,223.8],"7898686540186":[20.6,41.39],"17898686540305":[19.4,55.1],"7898686540438":[25.3,6.21],"17898686540619":[19.9,18.24],"7898338096498":[30.4,4.18],"7898338096504":[30.1,4.01],"7898338096511":[19.7,5.38],"7898338096528":[14.5,12.9],"7899710019937":[14.9,22.03],"7898338090014":[34.7,3.09],"7898338090021":[34.7,4.12],"7898338090045":[30.8,5.62],"7898338090052":[26.8,7.41],"7898338090069":[33.3,10.58],"7898338090076":[40.5,17.41],"7898338090083":[24.5,16.88],"7898338090090":[24.5,21.41],"7898338090106":[24.5,12.28],"7898338090113":[27.2,2.69],"7898338090120":[34.1,4.08],"7898338090137":[36.3,7.14],"7898338090144":[34.1,5.62],"7898338090151":[30.3,7.42],"7898338090168":[33.4,10.59],"7898338090182":[30.4,17.42],"7898338090205":[41.5,12.7],"7898338096368":[51.0,6.87],"7898338096375":[27.3,7.48],"7898338096382":[26.6,9.67],"7898338096399":[31.9,13.6],"7898338096405":[29.1,16.52],"7898338096412":[10.6,18.52],"7898338093855":[21.8,27.47],"7898338093442":[21.1,30.46],"7899710026232":[24.0,6.78],"7898338097563":[22.0,5.14],"7898338097570":[23.9,9.95],"7898338093039":[50.2,7.04],"7898338092964":[40.9,15.27],"7898338092971":[43.3,12.45],"7898338093411":[48.4,17.54],"7898338093374":[17.2,26.72],"7898338093381":[17.2,27.97],"7898338093398":[17.3,46.91],"7898338093404":[17.2,47.84],"7898338098904":[10.1,13.03],"7898338097648":[24.2,23.66],"7898338097693":[15.3,27.18],"7898338097662":[17.5,81.0],"7898338097624":[17.4,67.88],"7898338097785":[16.5,2.4],"7898338097730":[16.7,2.92],"7898338090434":[10.8,14.3],"7898338090519":[19.1,100.53],"7898338091134":[50.0,10.44],"7898338091141":[40.3,9.17],"7898338091158":[43.0,11.11],"7898338091165":[34.6,9.92],"7898338091172":[43.9,9.94],"7898338091189":[39.4,12.34],"7898338091196":[43.1,13.38],"7898338091219":[44.5,13.85],"7898338092711":[44.0,10.45],"7898338092728":[35.9,11.01],"7898338092735":[15.7,12.38],"7898338092186":[17.5,25.01],"7898338092193":[17.7,34.08],"7898338092209":[15.0,39.13],"7898338098850":[24.1,19.56],"7898338098867":[6.0,24.14],"7898338093312":[29.8,39.48],"7898338093329":[21.5,39.81],"7898338093336":[17.2,54.32],"7898338093343":[45.2,63.11],"7898338093459":[13.9,17.37],"7898338093466":[8.7,18.72],"7898338093497":[14.5,6.64],"7898338093978":[37.1,7.64],"7898338093985":[18.6,10.55],"7898338093992":[15.2,18.09],"7898338097723":[25.6,12.99],"7899710020230":[18.5,18.51],"7898338093084":[38.4,24.71],"7899710020247":[18.6,40.69],"7898338093046":[41.6,31.31],"7898338093060":[39.0,32.81],"7898338092797":[53.1,2.77],"7898338099390":[28.1,23.34],"7898472265729":[19.0,13.96],"PY14029":[19.9,3.26],"7898686540094":[18.6,124.63],"7898338090038":[33.8,7.21],"7898338099642":[38.5,15.38],"7898338099659":[41.6,20.48],"7898338099666":[41.6,17.46],"7898338099673":[18.7,19.63],"7898338099680":[40.6,21.12],"7898338093176":[33.9,75.64],"7898338093619":[28.2,23.43],"7898338093626":[30.6,24.59],"5932000000009":[14.4,44.43],"5933000000006":[14.1,40.87],"7898945402880":[27.6,17.28],"7898945402897":[24.2,17.28],"7898698341320":[18.2,114.94],"7908608008363":[18.2,114.94],"7908608004266":[19.5,19.99],"7908608004273":[21.9,37.92],"7908608004280":[21.9,50.9],"7908608004297":[21.9,82.17],"7908608003788":[15.0,7.36],"7908608003825":[20.0,9.24],"7908608003849":[21.9,12.72],"7908608003856":[23.1,18.11],"7891117035039":[19.2,19.56],"7891117111696":[30.2,30.27],"7891117076193":[14.7,251.98],"7891117030539":[21.7,56.63],"7891117051992":[16.1,39.52],"5737000000000":[13.8,7.72],"5738000000007":[18.8,8.93],"5739000000004":[19.3,11.96],"17898958256163":[13.0,12.48],"17898958256224":[13.0,12.48],"17898958256248":[13.0,12.48],"7898701771731":[1.0,50.58],"7898701771793":[1.0,46.17],"7898698347445":[16.7,111.59],"7898698340262":[18.2,111.59],"0751320484673":[20.0,15.11],"17898686540350":[18.9,54.68],"7898686540407":[19.2,134.59],"17898686540381":[21.4,22.28],"17898686540473":[21.8,33.81],"17898686540299":[24.0,47.69],"7898659066712":[14.2,18.62],"7898747320016":[31.4,21.11],"7899807202563":[19.2,6.59],"5765000000003":[18.7,16.33],"7898472261318":[20.7,37.39],"7897613524916":[24.5,68.91],"7897613524923":[24.5,100.67],"7897613524893":[21.5,70.28],"7897533609014":[19.2,152.98],"7897533609038":[20.2,155.97],"7897533609045":[20.2,155.97],"7897533609052":[20.2,316.22],"7897533609069":[20.2,316.22],"7897533609076":[23.6,274.4],"7897533689320":[20.2,274.4],"7898330683610":[18.2,114.94],"7897613523810":[16.6,4.88],"5783000000007":[46.4,15.07],"6000":[43.6,15.07],"6001":[0.0,0.0],"6002":[0.0,0.0],"6003":[0.0,0.0],"6004":[26.2,97.03],"6005":[0.0,0.0],"6006":[0.0,0.0],"7898659066163":[39.7,48.22],"7898659065005":[18.0,27.39],"6009":[12.0,2.76],"6010":[0.0,0.0],"6011":[0.0,0.0],"6012":[0.0,0.0],"6013":[0.0,0.0],"6014":[0.0,0.0],"6015":[0.0,0.0],"6016":[0.0,0.0],"6017":[0.0,0.0],"6018":[0.0,0.0],"6019":[0.0,0.0],"6020":[0.0,0.0],"6021":[22.7,16.23],"6022":[9.5,82.91],"6023":[9.5,93.29],"6024":[0.0,0.0],"6025":[0.0,0.0],"6026":[0.0,0.0],"6027":[0.0,0.0],"6028":[0.0,0.0],"6029":[0.0,0.0],"6030":[0.0,0.0],"6031":[20.0,64.08],"6032":[25.0,97.78],"6033":[36.5,9.98],"6034":[28.9,7.08],"7898659063483":[20.0,12.19],"7898659063490":[19.9,13.69],"7898659063513":[20.1,15.44],"6038":[0.0,0.0],"6039":[20.0,32.05],"6040":[20.0,35.98],"7898659066057":[59.5,15.39],"6042":[0.0,0.0],"6043":[0.0,0.0],"6044":[0.0,0.0],"6045":[0.0,0.0],"6046":[0.0,0.0],"6047":[0.0,0.0],"6048":[0.0,0.0],"6049":[0.0,0.0],"7891117011484":[15.0,94.26],"7891117027522":[13.1,101.11],"7891117053750":[12.6,135.53],"7898542181355":[22.8,59.62],"7898542185612":[24.8,101.38],"7898542182055":[20.9,22.92],"7898542182093":[24.0,34.07],"7898542182079":[27.1,45.63],"7898542182086":[19.9,60.77],"7898542182451":[19.9,906.4],"7898542182499":[19.9,906.4],"7898542186725":[20.7,135.65],"7898542183670":[21.6,259.72],"7898542189320":[24.7,10.96],"7898542188514":[16.7,85.84],"7898542188613":[24.4,8.81],"7899813560367":[20.6,29.2],"7898542183106":[20.6,43.97],"7898542183113":[20.9,63.42],"7898542183120":[18.2,87.83],"7898542180297":[18.5,328.36],"7908642007063":[48.8,12.48],"7908642006622":[61.0,2.61],"7908642006790":[54.1,10.2],"7908642007049":[48.9,11.7],"7908642006998":[50.0,8.65],"7908642007056":[51.1,10.18],"7908642006646":[61.7,3.83],"7908642010384":[9.8,26.95],"7899710021244":[22.3,11.2],"7899710021275":[16.4,28.77],"7899710021268":[25.4,13.18],"7899710021824":[16.4,25.05],"7899710021831":[16.4,32.77],"7898338090571":[13.4,3.03],"7899710021282":[48.5,68.85],"7908319500330":[16.1,7.61],"7899710020209":[10.2,216.16],"7899710020216":[15.0,107.61],"7899710020223":[13.5,85.92],"7899710021015":[14.2,95.59],"7899710021060":[23.3,20.61],"7908319500002":[15.2,40.62],"7899710021213":[22.6,22.14],"7899710019630":[22.4,4.37],"7899710019647":[21.5,5.17],"7899710019654":[22.0,6.55],"7899710019661":[22.4,11.55],"7899710019678":[21.2,14.11],"7898708891494":[26.4,88.75],"7898708891630":[26.4,72.53],"7898708891555":[26.4,89.04],"7899447138529":[20.7,58.77],"7899447138536":[19.7,52.41],"7899447138543":[28.2,63.58],"7899447138468":[20.9,48.06],"7899447138604":[20.0,72.99],"7899447138482":[30.8,49.52],"7899447138550":[19.7,66.04],"7898708891838":[23.5,70.37],"7898708891715":[10.5,74.08],"7898708892170":[10.0,64.54],"7898708892156":[10.9,65.63],"7898708892132":[9.7,70.06],"7898708892118":[13.4,60.93],"7898708892019":[17.5,69.07],"7898708891999":[17.6,70.41],"7898708891975":[16.5,75.36],"7898708891951":[17.7,66.24],"7898708891937":[16.9,71.47],"7898708891913":[21.3,72.36],"7898708891890":[18.3,77.49],"7898708891876":[38.7,67.72],"7891435054934":[18.0,9.87],"7891435043372":[23.5,18.53],"7891435047844":[19.6,20.58],"7891435044577":[14.5,22.91],"7891435070217":[13.0,24.27],"7891435054866":[13.0,17.72],"7891435047837":[18.0,15.89],"7898003890338":[16.6,7.74],"7898003894381":[24.6,7.13],"61480000000001":[39.4,51.91],"7898547057358":[27.1,19.2],"6160":[0.0,0.0],"7897488021039":[19.0,32.97],"7897488001765":[26.4,37.85],"7898701772608":[1.0,279.31],"7898701772561":[1.0,279.31],"7898701772592":[1.0,279.31],"7898701772554":[1.0,279.31],"6170":[11.4,41.27],"7898067904149":[1.0,32.77],"7908642006660":[61.7,9.31],"7908642000804":[47.6,41.83],"7908642000798":[43.8,70.72],"78949461894984":[27.3,7.05],"7898090990140":[28.1,2.36],"7898090990133":[30.1,4.09],"7908608003818":[17.3,11.88],"7908608003832":[14.9,13.88],"7908608003863":[18.0,14.49],"7898994924210":[26.8,60.12],"7908319500354":[39.5,24.9],"7908319500170":[37.5,12.67],"7898338093022":[19.1,16.4],"7898436140581":[22.9,16.47],"7898436141540":[22.3,16.47],"7898436140574":[22.3,16.47],"7898436141618":[22.9,16.47],"7898436140642":[22.9,16.47],"7898436140567":[22.3,16.47],"7898436140550":[23.0,16.49],"7898436146125":[22.3,16.47],"7898436146132":[22.3,16.47],"7898436141557":[22.2,16.46],"7898436140703":[18.1,16.46],"7898436140604":[17.7,16.54],"7898436140826":[22.9,20.72],"7899674039835":[22.9,11.5],"7899674039774":[22.9,11.5],"7899674038876":[20.4,6.1],"7899674039316":[18.0,9.98],"7898730312202":[69.5,1.04],"7899674038715":[20.9,19.53],"7899674039514":[28.2,7.64],"7898436140635":[22.3,16.47],"7898436141656":[17.5,16.47],"7898436147832":[18.4,16.55],"7898436147825":[18.4,19.36],"7899674035011":[14.0,24.87],"7899674038166":[38.5,17.8],"7899674039224":[18.7,24.95],"7899674039330":[18.9,10.54],"7899674039347":[18.8,10.13],"7898307298168":[18.7,24.95],"7899674040381":[18.7,29.63],"7899674041807":[21.9,4.78],"7898436141595":[22.9,16.47],"7898436141632":[22.9,16.47],"7899674039910":[14.0,10.09],"7899674039934":[13.9,10.62],"7899674039811":[13.3,10.09],"6245000000009":[24.7,5.05],"6246000000006":[36.5,5.1],"6247000000003":[20.3,6.13],"7908642003287":[35.4,10.39],"7908642005939":[26.5,50.87],"0619205626603":[31.8,5.83],"7898493998996":[14.2,2.74],"7898493999214":[16.1,2.74],"7898322649457":[22.6,3.46],"7898493997098":[16.9,3.46],"7898493990860":[16.1,3.25],"7898322645411":[15.5,3.25],"7898322647095":[20.1,4.19],"7898542002070":[25.5,4.67],"7898542002179":[22.0,7.46],"7898493990976":[14.8,2.7],"7898322644650":[14.8,2.7],"7898542000175":[12.4,4.18],"7898322641673":[12.4,4.18],"7898322645633":[16.5,4.67],"7898322644247":[16.5,4.67],"7898493995186":[28.9,15.74],"7898493995377":[19.3,22.34],"7898322646845":[16.1,37.46],"7898493995339":[19.3,20.94],"7898322646838":[28.9,32.15],"7898493991546":[19.9,10.74],"7898493990112":[16.0,3.7],"7898493990204":[20.2,3.7],"7898322644643":[32.4,7.04],"7898322641680":[26.4,7.04],"7898322649785":[25.0,5.68],"7898493997432":[16.7,5.68],"7898322649822":[32.5,8.54],"7898493997036":[32.5,8.54],"7898322645435":[19.3,5.79],"7898542006566":[16.6,5.79],"7898542007983":[39.1,7.76],"7898493998170":[21.2,4.73],"7898659061267":[34.3,9.65],"7898659061274":[34.3,9.65],"7898659061281":[47.6,9.65],"7898659061298":[47.6,9.65],"7898659061304":[53.4,11.39],"7898659061311":[47.6,9.65],"7898659061328":[34.3,9.65],"6294":[0.0,0.0],"6295":[0.0,0.0],"7908642009890":[37.6,25.51],"7908642009913":[45.6,29.96],"7908642009982":[34.5,18.49],"6299":[26.3,17.35],"6300":[35.0,15.59],"6301":[19.0,53.06],"6302":[17.3,20.54],"7908237506872":[23.5,18.46],"7908237506919":[23.5,5.08],"7898701774923":[1.0,170.73],"7899447135122":[9.2,24.64],"7899085482794":[19.7,33.05],"7899085482848":[19.7,33.05],"7899085482831":[19.7,33.05],"7899085482800":[19.7,33.05],"7898003896729":[18.5,4.59],"7899085482855":[19.7,33.05],"6313":[0.0,0.0],"7908237507879":[29.7,5.23],"7898322641383":[30.6,15.36],"7898542007198":[30.5,20.49],"7891638038151":[18.8,21.62],"7891638054380":[18.7,60.55],"7891638061449":[14.7,80.57],"7908608002712":[18.2,114.94],"7898495133210":[17.0,19.58],"7898495133227":[18.0,21.56],"7898495133258":[18.0,85.18],"7898495133272":[28.1,40.0],"7898495133289":[17.0,63.59],"7898495133296":[17.0,89.67],"7898495133302":[18.0,85.28],"6328":[17.0,237.42],"6329":[15.0,488.66],"7898495130226":[23.0,7.98],"7898495130240":[19.1,13.88],"7898495132466":[18.6,17.33],"7898495130264":[19.4,0.56],"7898495130295":[24.8,1.15],"7898495130356":[25.1,2.25],"7898495132251":[18.5,1.37],"7898495130400":[21.6,0.5],"7898495130417":[24.6,0.64],"7898495130448":[15.4,4.14],"7898495130509":[19.6,4.3],"7898495130530":[44.8,10.15],"7898495130592":[39.7,0.77],"7898495130714":[16.1,0.86],"7898495130868":[46.0,7.24],"7898495130875":[24.0,28.46],"7898495134224":[24.9,5.9],"7898495131094":[25.5,0.98],"7898495131193":[24.9,0.94],"7898495131476":[38.7,1.18],"7898495131483":[19.0,2.32],"7898495131490":[23.0,3.94],"7898495131506":[8.7,5.15],"7898495132220":[30.1,2.42],"7899710026164":[25.1,30.28],"7899710026157":[25.1,28.64],"7899710021121":[18.7,13.82],"7899710019814":[17.8,5.82],"6360":[11.5,77.09],"6361":[22.5,23.72],"6362":[14.6,40.63],"7898083500349":[23.3,106.59],"6364":[23.8,51.91],"6365":[37.8,98.72],"6366":[20.1,192.35],"6367":[26.0,36.31],"7898495130912":[6.4,0.53],"7898495130936":[18.4,0.49],"7898495132237":[8.7,1.65],"6371":[25.4,2.8],"7898495134231":[21.4,17.54],"7898495131599":[25.2,4.22],"7908237507053":[21.8,1.35],"7908237507060":[15.9,9.33],"7908237507077":[15.9,11.46],"7908237507084":[15.8,14.05],"7908237507091":[15.8,15.93],"7908237507114":[15.9,3.81],"7908237507138":[15.8,4.64],"7908237507145":[15.7,3.25],"7908237507152":[16.9,4.89],"7908237507176":[15.8,12.59],"7908237507183":[15.9,13.45],"7908237507268":[14.2,3.13],"7908237507275":[21.3,3.06],"7908237507282":[20.2,3.03],"7908237507299":[15.6,3.11],"7908237507305":[15.5,7.46],"7908237506858":[16.9,11.51],"7908237506865":[17.0,13.48],"7908237506889":[16.9,19.41],"7908237506896":[10.4,5.2],"7908237506926":[16.9,9.07],"7908237506933":[16.9,12.16],"7908237506940":[17.1,8.77],"7908237506957":[17.0,11.56],"7908237506964":[17.0,14.16],"7908237506971":[16.9,13.2],"7908237506988":[15.8,13.82],"7908237506995":[16.9,7.31],"7908237507015":[16.9,13.84],"7908237507312":[18.6,7.1],"7908237507329":[19.1,7.23],"7908237507336":[21.0,7.87],"7908237506902":[10.9,6.06],"6408":[24.6,57.11],"6409":[15.5,30.06],"7898701775074":[1.0,37.47],"6414":[1.0,86.3],"7898701775050":[1.0,29.52],"7898701775142":[1.0,170.73],"7898701775005":[1.0,170.73],"7898701771748":[1.0,46.17],"7898701771786":[1.0,46.17],"6428":[1.0,46.17],"6431":[1.0,46.17],"7898701774831":[1.0,170.73],"7898701775180":[1.0,46.17],"7898701771854":[1.0,46.17],"7898701771878":[1.0,46.17],"7898701771816":[1.0,46.17],"7898701771885":[1.0,46.17],"7898701771809":[1.0,46.17],"7898701774893":[1.0,170.73],"7898701771823":[1.0,46.17],"7898701775166":[1.0,46.17],"7898701772578":[1.0,279.31],"7898701772653":[1.0,86.29],"7898701772585":[1.0,279.31],"7898701772622":[1.0,86.29],"7898701773834":[1.0,104.45],"17898686540763":[7.4,143.99],"7898686540773":[7.1,494.55],"7898701775098":[1.0,52.62],"7898684202703":[25.4,48.17],"7898684202697":[15.2,10.45],"4840000000015":[13.9,16.72],"7898684202741":[16.2,76.74],"7898684201324":[15.2,22.6],"7898684202727":[18.0,53.09],"7899452035882":[23.7,4.15],"7899452035899":[20.7,7.27],"7899452035905":[16.7,14.56],"7899452035912":[16.8,27.09],"7899452035929":[28.8,4.01],"7899452035936":[16.8,7.53],"7899452035943":[16.7,14.56],"7899452035981":[51.0,9.91],"7899452036056":[16.8,14.85],"7899452038326":[27.6,82.59],"7899452038371":[24.1,4.21],"7899452038333":[40.0,9.75],"7899452038357":[42.0,9.75],"7899452038340":[42.0,9.75],"6502":[10.8,19.18],"7898684202710":[19.2,53.99],"7898747320009":[20.9,18.58],"7898673870593":[14.6,37.08],"7898673871002":[14.6,32.78],"7898673870722":[18.0,59.53],"7898673870357":[16.9,103.92],"7898673870715":[16.8,27.09],"7898673870234":[18.0,153.1],"7898673870463":[18.1,39.4],"6515":[30.7,46.71],"6548":[32.0,32.15],"6549":[29.1,46.71],"6550":[45.4,51.81],"6551":[12.2,155.94],"7896202400921":[17.8,5.32],"7896202401065":[17.7,7.92],"7896202400969":[17.7,3.39],"7896202400938":[17.8,11.75],"7896202401072":[17.8,15.63],"7896202400976":[17.8,8.46],"7896202400907":[17.8,5.32],"7896202401041":[17.7,7.92],"7896202400945":[17.7,3.39],"7896202400914":[17.8,11.76],"7896202401058":[17.8,15.63],"7896202400952":[17.8,8.46],"7898701772646":[1.0,86.29],"7896202401959":[17.7,67.26],"7898701772639":[1.0,86.29],"7896202401935":[17.7,101.17],"7896202400013":[21.2,33.55],"7896202400020":[21.2,88.31],"7896202400464":[16.3,1.51],"7896202400068":[15.5,2.38],"7896202400426":[17.7,7.06],"7898659069980":[32.8,17.67],"7898659069720":[37.1,16.31],"7898659069683":[43.1,1.17],"7898659069690":[43.3,1.53],"7908642010414":[15.7,54.06],"7908642010421":[32.8,53.31],"7908642010438":[14.7,55.96],"7908642010445":[32.1,126.22],"7908642010452":[33.6,77.03],"7908642010469":[17.0,42.7],"7908642010209":[14.1,359.76],"7908642010216":[13.0,326.22],"7908642010223":[17.8,326.16],"7908642010230":[14.1,625.59],"6591":[17.7,59.83],"0000000065931":[34.4,9.78],"7898693158152":[23.6,6.03],"0736532334589":[16.7,5.59],"7898217693244":[16.9,3.7],"7898217693251":[17.4,5.51],"7898217693268":[17.2,6.18],"7897649768629":[13.7,55.76],"7908642006776":[54.3,7.05],"7908642006752":[55.9,5.69],"7908642007483":[41.3,38.37],"7908642003577":[15.7,34.89],"6605":[12.4,37.92],"7899710018404":[15.7,5.26],"7899710019241":[16.3,32.45],"7899710020377":[15.9,18.78],"7899710020391":[16.8,19.12],"7899710021091":[15.8,20.71],"7899710021138":[16.8,20.72],"7899710021145":[16.8,10.61],"7899710021152":[15.8,10.42],"7899710021169":[16.9,10.62],"7899710021176":[15.9,10.43],"7897488069369":[15.3,11.58],"7897488069376":[15.3,13.15],"6620":[35.5,23.0],"6621":[29.8,39.42],"6622":[27.6,74.78],"7898698340798":[18.0,15.62],"7898698341887":[18.6,20.34],"7908608006697":[12.0,23.76],"7908608006703":[12.0,32.26],"7908608003948":[17.1,93.04],"7898567972600":[79.3,20.01],"7898567154280":[79.0,8.38],"7898567968740":[80.3,15.42],"6631":[35.0,41.51],"7898542002568":[27.3,6.41],"7898542002575":[15.0,6.34],"7898493993007":[15.0,4.3],"7898495132138":[21.0,6.87],"7898495132121":[11.6,9.62],"7898495131551":[25.7,15.11],"7898495131612":[50.1,5.82],"7898495131650":[27.3,5.27],"7898495132893":[24.4,140.02],"7898495130257":[21.7,0.57],"7898495132411":[12.1,1.91],"7898495132602":[19.9,3.68],"7898495130387":[16.1,20.78],"7898495134712":[22.5,7.16],"7898495132442":[21.0,10.29],"7898495131698":[15.1,45.87],"7898495131063":[26.5,2.0],"7898495131070":[17.1,4.94],"7898493996114":[15.8,44.85],"7898322647750":[15.8,44.85],"6652":[15.6,19.06],"7894061008906":[4.4,7.91],"7899452031457":[46.3,67.97],"7899452031433":[42.1,32.71],"7908089600940":[17.3,18.99],"7908089600971":[17.3,18.99],"7908089600353":[23.6,8.01],"7908089601756":[17.3,7.47],"7908089601732":[17.1,7.21],"7908089601695":[16.6,5.38],"7908089600322":[17.2,10.38],"7908089600339":[17.2,10.36],"79080896014664":[14.7,25.07],"7908089601473":[17.3,19.14],"7908089600698":[17.4,16.67],"7908089600438":[17.2,3.21],"7908089601787":[16.2,7.33],"7908089601688":[16.2,4.55],"7908089600407":[17.3,17.17],"7908089601060":[17.3,5.81],"79080896010536":[15.3,5.81],"7908089601046":[17.3,5.81],"7908089600278":[17.3,8.77],"7908089600261":[17.3,8.77],"7908089600445":[12.3,3.21],"7908089600056":[17.3,4.39],"7908089601169":[17.2,11.04],"7898684202734":[36.3,52.52],"7898493991874":[25.2,2.07],"7898493991881":[25.2,2.07],"7898493991898":[13.7,1.26],"7898493991904":[17.8,1.26],"7898493991911":[17.8,1.26],"7898493992284":[15.0,11.57],"7898493992291":[17.7,10.63],"7898493992314":[15.0,7.63],"7898493992321":[15.1,8.78],"7898322642533":[15.0,7.91],"7898493992338":[15.1,6.3],"7898493992345":[17.7,7.73],"7898493992444":[13.3,11.47],"7898493992352":[18.0,10.19],"7898493992369":[17.9,7.81],"7898493992383":[17.7,6.66],"7898493992406":[17.7,11.97],"6698":[13.1,98.72],"6699":[16.7,42.61],"7908089601503":[18.2,24.23],"7896027010251":[18.6,4.48],"37896027011150":[18.7,21.99],"17896027011224":[18.7,24.59],"87896027013036":[18.8,29.56],"37896027027007":[18.8,6.83],"37896027037006":[18.8,27.4],"27896027045004":[18.7,196.18],"7896027080018":[16.7,42.69],"37896027013024":[18.6,18.88],"37896027042420":[18.8,37.35],"37896027040013":[18.7,32.06],"47896027010457":[18.7,16.09],"47896027075753":[18.9,5.28],"37896027073011":[18.7,23.48],"37896027079006":[19.1,18.48],"7896027094022":[16.7,34.78],"7896027013153":[16.7,24.31],"37896027075701":[19.0,10.56],"37896027075725":[17.1,9.28],"67896027062184":[19.0,22.66],"37896027079167":[17.2,20.12],"7908089600995":[15.2,8.52],"6755":[15.2,8.51],"7899674043399":[16.8,42.74],"7899674043030":[15.0,15.02],"7898495135870":[25.4,0.96],"7898495130950":[27.1,0.49],"7898495130967":[19.3,0.56],"7898495130974":[6.6,0.61],"7898495130981":[23.9,2.4],"7898495130998":[20.0,3.41],"7898495131001":[30.1,5.1],"7898495131247":[20.9,0.71],"7898495131254":[17.3,1.11],"7898495132206":[30.2,3.1],"7898495132114":[15.4,17.25],"7898495131582":[36.2,5.09],"7898495131605":[25.6,1.86],"7898495131629":[22.0,8.5],"7898495133180":[22.5,8.92],"7898495131636":[17.1,20.19],"7898495131643":[19.8,2.67],"7898495131667":[17.8,11.22],"7898495131681":[22.1,11.0],"7898495133470":[17.1,93.62],"7898495133500":[22.0,4.82],"7898495133395":[22.1,4.26],"7897649766380":[16.6,17.99],"7897649766779":[10.8,35.43],"7897649768216":[23.4,18.53],"7891117054580":[15.4,11.09],"7891117102373":[15.3,52.47],"7891117009115":[14.6,13.68],"7891117100928":[21.2,62.34],"6820":[27.4,42.22],"6821":[28.0,42.22],"6822":[28.0,42.22],"6823":[20.0,48.4],"6824":[20.0,52.83],"682500000001":[17.9,52.17],"6826":[20.0,41.06],"6827":[20.0,45.46],"6828":[20.0,44.16],"6829":[20.0,48.4],"6862":[40.2,66.54],"6863":[14.1,68.91],"7908572100018":[4.2,15.21],"6865":[14.1,92.6],"6866":[10.5,65.91],"6867":[8.6,159.55],"6868":[15.5,35.95],"7898495132619":[8.4,3.72],"7898495130691":[32.3,8.61],"7898495130011":[26.8,2.4],"7898495133364":[31.6,14.55],"7898003891335":[12.0,14.19],"7893223010504":[17.9,147.78],"7899097635409":[28.6,101.35],"7899097635393":[29.8,117.11],"7899097635386":[30.6,132.77],"7899097635379":[30.0,144.92],"7899097635447":[28.6,101.35],"7899097635454":[29.8,117.11],"7899097635461":[30.6,132.77],"7899097635478":[30.0,144.92],"7899097635485":[28.6,101.35],"7899097635492":[29.8,117.11],"7899097635508":[30.6,132.77],"7899097635515":[30.0,144.94],"7899097635522":[28.6,101.35],"7899097635539":[29.8,117.11],"7899097635546":[30.6,132.77],"7899097635553":[30.0,144.92],"7908642001160":[21.7,66.74],"7908642003331":[20.1,14.42],"6446000000000":[15.1,47.67],"6447000000007":[15.1,40.5],"6448000000004":[15.1,45.14],"6449000000001":[15.1,34.03],"6450000000007":[17.3,30.65],"7898036702080":[22.4,54.48],"7898036702066":[22.4,54.48],"7898036718401":[7.9,65.09],"7898036718302":[21.7,53.28],"7898659069775":[28.2,4.02],"7898659069805":[27.0,7.73],"6904":[28.2,6.13],"7898659069782":[27.9,4.65],"7898659069768":[29.8,3.39],"7898659069751":[30.0,2.64],"7898659069744":[30.2,2.12],"7894561237899":[65.2,12.19],"7898495132374":[15.1,7.3],"6911":[15.6,4.57],"7898495131339":[12.7,6.02],"7898495132268":[18.3,1.35],"7898495131452":[18.7,5.7],"7898495131049":[23.8,0.75],"7898495130028":[26.7,6.76],"6949":[30.4,56.55],"7908642010193":[0.0,0.0],"6951":[0.0,0.0],"7891738019432":[26.8,13.35],"7897373138347":[21.7,6.77],"7897373138385":[21.7,6.77],"7893095576696":[21.7,14.83],"602883161337":[21.7,9.48],"6957":[21.4,9.42],"6958":[10.7,51.3],"6959":[50.5,66.79],"7901007600169":[21.4,10.29],"7901007600145":[21.4,10.29],"7901007600152":[25.8,11.32],"7898975551220":[15.3,13.69],"7898586367401":[16.7,13.83],"7898586367388":[16.7,13.83],"7898586366701":[16.6,16.6],"7898693156608":[17.4,15.13],"7898693156615":[17.1,15.22],"7898693156622":[17.4,14.92],"7898693156639":[17.3,15.0],"7898693156646":[17.4,15.5],"7898693150996":[14.9,16.47],"7908886500504":[19.2,15.73],"7908886500511":[19.2,15.73],"7908886500535":[20.1,16.03],"7908886500528":[20.1,16.03],"7908237508609":[17.5,13.37],"7908237508593":[17.5,13.37],"6979":[21.9,14.71],"6980":[21.0,47.89],"7898495130424":[7.1,1.89],"7898495130516":[19.7,5.17],"7898495130615":[15.5,3.16],"7898495135214":[15.5,33.86],"7898495131155":[17.6,1.36],"7898495131025":[14.8,0.98],"7898495132497":[15.1,3.67],"7898495130660":[27.4,3.82],"7899452031471":[17.1,170.08],"7899452037121":[17.0,16.84],"7899452037114":[31.7,21.33],"7899452037107":[17.1,11.16],"7899452037091":[17.1,11.16],"7899452031419":[16.7,16.19],"7899452032706":[24.6,12.54],"7899452032676":[16.1,8.58],"7899452032638":[24.5,6.17],"7899452011428":[15.0,16.9],"7899452011404":[36.0,12.52],"7899452006301":[15.1,13.59],"7899452006288":[14.9,12.51],"7899452002020":[15.0,14.33],"7899452009432":[21.9,25.23],"7899452002044":[21.9,16.28],"7899452032126":[14.9,3.98],"7908319501115":[23.2,6.17],"7898338093428":[31.7,19.59],"7898338099857":[18.0,11.56],"7898338099833":[17.1,11.8],"7898338099840":[18.0,13.38],"7898338099826":[21.9,9.7],"7898338099864":[17.1,16.96],"7898338091202":[26.7,13.18],"7898338097204":[21.9,22.37],"7898338097105":[34.1,3.15],"7898338097129":[21.9,3.64],"0074468051027":[40.4,11.84],"0074468051034":[40.5,11.85],"0074468050570":[24.8,11.85],"0074468050594":[24.8,11.85],"0074468050631":[26.3,11.84],"0074468050655":[40.5,11.85],"0074468050662":[26.8,11.84],"0074468050693":[26.8,11.85],"0074468050709":[26.8,11.85],"0074468050716":[40.4,11.84],"0074468050785":[26.8,11.84],"0074468050679":[40.5,11.85],"0074468050754":[26.8,11.85],"0074468050747":[40.4,11.84],"0074468050617":[26.8,11.85],"7032":[20.3,11.85],"0074468050778":[31.6,18.02],"0074468050587":[31.6,18.02],"0074468050723":[31.6,18.02],"0074468050686":[32.3,18.25],"0074468050600":[18.7,15.75],"0074468050648":[26.0,15.7],"0074468050761":[18.7,15.75],"0074468050792":[23.9,13.44],"7041":[23.1,6.49],"7898495130721":[17.2,6.96],"47899786802318":[2.0,7.82],"7899786807469":[20.0,125.15],"17899786802423":[25.1,97.68],"27899786802260":[23.9,40.16],"27899786802291":[23.8,33.84],"27899786808231":[19.0,18.39],"17899786807480":[20.0,119.65],"17899786808203":[19.0,84.82],"17899786808210":[20.0,80.86],"37899786810934":[15.1,6.37],"27899786806572":[20.0,19.92],"7899786807605":[17.9,44.7],"57899786809390":[21.1,55.14],"57899786809406":[21.1,60.86],"57899786809413":[21.1,67.11],"7899452032737":[26.7,16.47],"7899452009364":[23.2,23.59],"7891234562135":[26.8,14.45],"7891234567505":[25.1,12.26],"7891234567154":[17.1,41.41],"7891234561077":[20.0,13.08],"7891234566843":[30.7,34.91],"7891234566836":[21.9,30.17],"7891234566829":[29.9,30.8],"7068":[0.0,0.0],"7898495132558":[17.1,8.62],"7898495130202":[14.3,7.78],"7898495130196":[17.1,7.33],"7898495130189":[17.1,6.19],"7898036729223":[17.1,126.17],"7898036729933":[26.8,164.57],"7893946602963":[15.7,369.77],"7893946602956":[11.2,178.9],"7893946602949":[17.1,86.63],"7893946635558":[15.0,262.69],"7893946635640":[15.0,277.11],"7893946635633":[15.0,235.2],"7891435938098":[19.9,12.83],"7899674045096":[15.0,14.0],"7898515550010":[23.0,10.72],"7898515550034":[18.2,25.26],"7898515550041":[18.2,116.59],"7898515550676":[23.2,9.8],"7898515550652":[18.2,26.62],"7898515550669":[18.2,94.61],"7898515554704":[20.3,11.44],"7898515550591":[18.2,34.01],"7898515554902":[18.2,145.74],"7898515559426":[23.1,14.3],"7898515559037":[18.2,38.86],"7898515559228":[18.2,177.76],"7898515559235":[18.2,38.86],"7898693150590":[23.1,22.25],"7898693150613":[18.3,14.29],"7898693150729":[18.2,58.77],"7908886503970":[18.3,12.25],"7898693150620":[27.0,54.28],"7898693150637":[26.0,18.44],"7898693155359":[18.1,11.17],"7898693155410":[11.1,11.17],"7898693158466":[24.3,9.89],"7898693158473":[24.3,9.89],"7898693158558":[24.3,9.89],"7898693158565":[24.3,9.89],"7908886500559":[18.2,8.76],"7908886500566":[18.2,15.09],"7898693152402":[6.2,7.71],"7118":[18.6,15.94],"7898693152426":[19.8,13.29],"7121":[0.0,0.0],"7122":[0.0,0.0],"7123":[0.0,0.0],"7124":[0.0,0.0],"7125":[0.0,0.0],"7126":[0.0,0.0],"7127":[0.0,0.0],"7128":[0.0,0.0],"7891222164099":[15.7,275.05],"7891222412367":[23.7,174.07],"7891222105122":[14.5,54.07],"7898950107480":[43.3,272.95],"7133":[11.6,32.51],"7134":[21.7,36.62],"7135":[21.7,33.27],"7136":[21.6,39.25],"7137":[21.7,36.62],"7138":[21.7,33.27],"7899452032133":[16.2,4.86],"7893946126193":[15.6,57.62],"7893946126209":[15.6,54.03],"7893946126247":[15.0,86.42],"7893946126186":[15.6,43.29],"7893946126179":[14.7,32.56],"7891645144852":[13.5,19.55],"7891645144821":[14.7,18.19],"7891645144838":[14.7,18.19],"7891645144753":[14.7,18.19],"7149":[19.7,3.97],"7898072180200":[0.0,0.0],"7898072180637":[21.7,16.62],"7908089601800":[18.2,65.92],"7908089600063":[27.0,4.01],"7908089601480":[15.3,14.61],"7156":[39.0,2.88],"7157":[38.3,4.08],"7158":[35.3,4.5],"7159":[38.3,6.44],"7160":[35.4,6.66],"7161":[35.5,9.35],"7162":[35.4,10.37],"7163":[35.5,10.24],"7164":[35.4,14.51],"7165":[35.5,20.83],"7166":[37.4,32.31],"7167":[36.4,37.8],"7168":[36.0,2.65],"7169":[35.6,3.74],"7170":[35.3,4.5],"7171":[35.4,6.66],"7172":[35.4,5.9],"7174":[36.5,9.62],"7175":[36.4,10.68],"7176":[36.3,10.54],"7177":[36.4,14.93],"7178":[36.4,21.43],"7179":[36.4,31.37],"7180":[35.5,36.73],"7181":[17.3,14.26],"7898495134392":[15.4,15.59],"7898495130271":[24.9,0.43],"17898495132272":[15.2,2.29],"7898113086874":[18.4,185.3],"7898113086867":[18.2,152.88],"7898113086751":[18.2,128.46],"7188":[23.1,105.1],"7898036708969":[21.7,25.99],"7190":[29.8,33.71],"7191":[18.1,15.21],"7192":[0.0,0.0],"7193":[0.0,0.0],"7194":[0.0,0.0],"7195":[0.0,0.0],"7196":[0.0,0.0],"7197":[0.0,0.0],"7198":[23.1,30.83],"7199":[23.1,46.24],"7200":[23.1,92.48],"7201":[23.1,184.96],"7202":[23.1,218.19],"7203":[23.1,327.28],"7204":[23.1,436.37],"7205":[23.1,654.56],"7206":[21.7,18.82],"7207":[21.7,28.22],"7208":[21.7,18.82],"7209":[21.7,28.22],"7210":[21.7,32.6],"7211":[21.7,48.91],"7215":[15.5,7.96],"7216":[15.5,9.32],"7898659064640":[27.9,24.0],"7898659067917":[26.5,40.61],"7219":[20.0,9.52],"78998659069706":[16.3,2.03],"7898659069713":[19.4,3.45],"7898708895034":[24.4,12.9],"7898659069997":[19.9,7.89],"7898659069485":[14.8,26.96],"7898659069492":[14.8,28.08],"7227":[0.0,0.0],"7228":[0.0,0.0],"7229":[0.0,0.0],"7230":[21.7,129.57],"7231":[21.7,194.35],"7232":[21.7,259.14],"7233":[0.0,0.0],"7898495133234":[15.0,54.58],"7898495131278":[30.1,1.1],"7898495131292":[24.9,1.51],"7908642001627":[25.1,6.3],"7908642001610":[24.6,10.45],"7243":[2.7,126.12],"7897649770738":[45.1,45.86],"7891234563880":[35.3,24.66],"7908642008657":[20.0,20.52],"7908642002242":[21.5,3.71],"7898768554728":[47.5,9.99],"7261":[44.1,10.98],"7262":[45.2,19.51],"7263":[45.2,21.9],"7898768554643":[44.9,9.9],"7898768554650":[48.7,10.9],"7898768554667":[54.1,21.25],"7898768554674":[67.0,21.9],"7268":[28.0,27.56],"7269":[28.0,27.56],"7270":[17.4,37.11],"7271":[17.4,37.11],"7898768554681":[60.9,18.9],"7273":[51.9,18.9],"7898768554704":[54.0,21.9],"7898768554636":[34.9,15.9],"7898768554711":[45.8,18.9],"7898768554582":[44.0,4.89],"7898768554599":[44.0,4.89],"7898768554605":[44.0,4.89],"7898768554612":[44.0,4.89],"7898768554629":[44.0,4.89],"7282":[40.6,1.5],"7283":[36.0,5.18],"7898768554827":[36.2,9.73],"7898495130677":[12.3,5.06],"7898495133319":[35.7,0.91],"7898495130288":[30.3,0.67],"7898495132473":[43.0,1.73],"7898495132244":[29.1,1.03],"7898495130479":[25.9,1.73],"7898495130561":[15.0,24.29],"7898495130578":[28.5,1.99],"7898495130585":[31.5,0.43],"7898495132435":[28.6,1.73],"7898495130639":[28.9,1.63],"7898495130646":[29.5,1.54],"7898495130707":[31.1,0.79],"7898495130776":[33.1,7.32],"7898495130783":[24.1,9.13],"7898495130929":[25.5,1.55],"7898495130943":[22.4,0.94],"7898495131179":[44.6,0.99],"7898495131186":[44.1,0.84],"7898495131261":[31.2,0.72],"7898495131285":[30.0,1.31],"7898495131315":[28.7,1.61],"7898495131322":[25.2,3.61],"7898495131520":[25.9,5.34],"7898495131544":[20.0,9.12],"7898495131575":[29.6,0.99],"7898495131711":[25.0,8.94],"7898495136181":[25.3,8.58],"7898495132008":[24.7,3.53],"7898036742017":[12.1,49.24],"7898036752016":[22.2,49.24],"7898036722019":[12.1,49.24],"7898036700666":[29.6,16.95],"7320":[0.0,0.0],"7321":[0.0,0.0],"7322":[0.0,0.0],"7323":[0.0,0.0],"7324":[0.0,0.0],"7899452032119":[16.5,2.81],"7327":[21.7,59.11],"7328":[21.7,73.89],"7329":[21.7,103.44],"7330":[21.7,118.22],"7331":[21.7,133.0],"7332":[21.7,147.77],"7333":[0.0,0.0],"7334":[0.0,0.0],"7335":[0.0,0.0],"7336":[21.7,106.56],"7337":[21.7,159.84],"7338":[21.7,213.11],"7893946635497":[15.0,375.77],"7893946573225":[21.6,6.36],"7898036779808":[0.0,0.0],"7898036749801":[0.0,0.0],"7908642007650":[18.0,15.89],"7908642007339":[20.1,4.04],"7908642003119":[20.0,12.89],"7346":[8.9,91.64],"7347":[15.3,13.69],"7898901274872":[0.0,0.0],"7898901274919":[0.0,0.0],"7898113086843":[19.3,217.79],"7898113086881":[19.3,250.29],"7898768554537":[43.7,23.9],"7893946495954":[0.0,0.0],"7898036732018":[7.0,45.28],"7898036762015":[7.0,45.28],"7357":[-9.1,11.6],"7358":[-9.1,11.6],"7359":[-9.1,11.6],"7360":[-9.1,11.6],"7361":[13.0,38.85],"7362":[13.0,33.92],"7367":[13.0,33.92],"7368":[13.0,33.92],"7365":[13.0,21.24],"7366":[13.0,21.24],"7893946004033":[6.9,3.99],"7898768556678":[49.2,5.89],"7908642008503":[15.0,149.99],"7908642007629":[20.0,14.45],"7378":[23.1,15.9],"7379":[21.6,14.9],"7899710019913":[20.0,10.84],"7899710019906":[13.0,18.91],"7898768550355":[53.7,30.88],"7388":[15.0,71.42],"7899674045331":[16.5,7.81],"7899674033505":[13.8,2.99],"7899674033499":[13.8,2.99],"7899674035752":[13.8,2.99],"7899674033482":[13.8,2.99],"7899674033468":[13.8,2.99],"7899674033451":[7.1,2.99],"7899674033444":[13.8,2.99],"7899674033437":[13.8,2.99],"7899674033420":[13.8,2.99],"7899674044846":[22.2,11.67],"7899674044839":[22.2,11.67],"7401":[25.7,64.14],"7891234564900":[20.5,124.15],"7891234564894":[13.1,122.9],"7891234564979":[22.2,84.9],"7891234564962":[20.7,82.9],"7891234564917":[20.5,71.66],"7891234564924":[20.5,71.66],"7891234564955":[20.6,31.62],"7891234564948":[18.4,39.99],"7891234564931":[21.5,41.9],"7898314119111":[17.3,13.75],"7891222222645":[20.0,54.67],"7891222222652":[20.0,54.67],"7891222222669":[20.0,54.67],"7908089601145":[13.3,5.81],"7418":[12.1,41.48],"7891435938234":[15.0,15.88],"7891435937930":[15.0,15.26],"7891435938128":[15.0,15.66],"7891435979954":[10.3,6.67],"7901007601128":[18.2,4.5],"7901007601111":[18.2,4.5],"7901007601135":[18.2,4.5],"7901007601159":[16.7,4.39],"7898975551213":[14.7,10.83],"7898747320177":[18.0,61.22],"7898747320191":[18.0,61.21],"7898747320467":[18.0,16.61],"7898747320481":[18.0,16.61],"7898945402019":[20.0,18.2],"7898945402026":[18.1,17.67],"7898747320115":[18.0,12.26],"7898747320092":[36.0,14.94],"7436":[29.1,19.56],"7898713884535":[0.0,0.0],"7898713884498":[0.0,0.0],"7898713880025":[23.2,30.88],"7898933076154":[0.0,0.0],"7899674042439":[15.0,17.51],"7899674042453":[15.0,17.51],"7899674042446":[15.0,17.51],"7444":[20.0,8.1],"7445":[20.0,7.9],"7447":[29.2,29.99],"7898768556685":[17.0,12.54],"7898959378768":[39.8,16.09],"7898547057365":[27.1,19.2],"17898567705007":[15.0,10.67],"17898567703331":[15.0,10.48],"7908886504342":[17.5,10.21],"7908886504373":[25.0,11.44],"7908886504366":[25.0,11.44],"7908886504335":[25.0,11.44],"7908886504359":[25.0,11.44],"7898542006757":[19.0,14.02],"7898322644292":[20.0,15.15],"7898322648399":[18.9,14.35],"7898542006603":[19.0,19.08],"7898542006849":[19.0,14.02],"7898322645749":[20.0,15.15],"7898322648542":[18.9,14.35],"7898542006856":[19.0,19.08],"7898515557408":[26.6,11.03],"7468":[0.0,0.0],"7898759180271":[15.6,1.37],"0618231087785":[13.1,12.27],"0618231087792":[15.1,12.27],"0618231087808":[17.5,11.99],"7898547050441":[18.6,33.92],"7898547050458":[18.7,41.34],"7898547050434":[18.6,22.42],"7479":[21.6,59.53],"7898708894983":[40.1,19.9],"7481":[21.7,31.51],"7482":[21.6,47.27],"7483":[21.7,30.94],"7484":[21.7,46.41],"7485":[21.7,44.35],"7486":[21.6,66.53],"7898444401445":[17.0,35.27],"7898444401452":[17.0,35.27],"7898444401476":[17.0,35.27],"7490":[0.0,0.0],"7898495133135":[20.2,0.89],"7495":[-12.6,169.7],"7496":[-12.6,96.0],"7497":[-12.6,92.73],"7498":[-12.6,70.67],"7499":[-12.6,169.7],"7898444400318":[20.6,21.19],"7898444400073":[11.9,4.19],"7504":[14.7,9.94],"7891435980004":[10.0,5.37],"7509":[43.1,37.27],"7899674033475":[7.1,2.99]};
function precoMargemDoProduto(codigoBarras) { return TABELA_PRECOS[codigoBarras] || null; }

// ----------------------------------------------------------------------
// DADOS FICTÍCIOS — visão geral de vendas (aba Vendas)
// Sysemp ainda não expõe vendedor/meta/faturamento por venda individual
// via API; até pedirmos e recebermos esse endpoint, esses números são
// só ilustrativos pro layout. Todo lugar que os usa mostra o selo
// "FICTÍCIO" — nunca aparecem sem esse aviso.
// ----------------------------------------------------------------------
const VENDEDORES_FICTICIOS = [
  { nome: 'Carla Ferreira', iniciais: 'CF', cor: '#a78bfa', faturamento: 238800, qtd: 512, meta: 220000 },
  { nome: 'Júlio Lima', iniciais: 'JL', cor: '#fb7185', faturamento: 177900, qtd: 445, meta: 175000 },
  { nome: 'Gustavo Gomes', iniciais: 'GG', cor: '#34d399', faturamento: 125800, qtd: 381, meta: 128000 },
  { nome: 'Felipe Gonçalves', iniciais: 'FG', cor: '#60a5fa', faturamento: 99600, qtd: 350, meta: 96500 },
  { nome: 'Sofia Ribeiro', iniciais: 'SR', cor: '#fbbf24', faturamento: 82400, qtd: 298, meta: 89000 },
];
const SUPERVISORES_FICTICIOS = [
  { nome: 'Diogo Araújo', time: 'Gerente', ticketMedio: 461.6 },
  { nome: 'Fernando Silva', time: 'Supervisor', ticketMedio: 328.4 },
  { nome: 'Diogo Carvalho', time: 'Supervisor', ticketMedio: 305.1 },
  { nome: 'Emily Rocha', time: 'Supervisora', ticketMedio: 256.3 },
];
const SITUACOES = ['RUPTURA', 'BAIXO', 'EXCESSO', 'OK'];
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}
if (window.Chart) { Chart.defaults.font.family = "'Inter', -apple-system, 'Segoe UI', sans-serif"; }
const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#1c1c21', borderColor: '#26262c', borderWidth: 1, cornerRadius: 8,
  titleColor: '#D4D4D4', bodyColor: '#D4D4D4', padding: 10, displayColors: false,
};

// Plugin custom (sem dependência externa) pra desenhar rótulos fora do
// anel do donut, com uma linha fina conectando cada fatia ao seu texto —
// Chart.js não tem isso nativo. Só desenha fatias com valor > 0 (rótulo de
// fatia vazia não ajuda ninguém) e pula fatias finas demais (< 4% do
// total) pra evitar textos colados/sobrepostos quando uma situação tem
// poucos itens.
// Plugin custom (sem dependência externa): desenha UMA seta com rótulo
// (nome + valor) saindo da fatia sob o mouse — só a fatia ativa, nunca
// todas ao mesmo tempo, o que elimina de vez o problema de colisão entre
// rótulos vizinhos e de texto sendo cortado na borda do canvas (que dava
// problema quando a gente tentava mostrar todos os rótulos sempre juntos).
// activeElements já vem pronto do Chart.js (é o hover nativo, o mesmo que
// dispara hoverOffset/tooltip) — só reaproveita.
const donutSetaHoverPlugin = {
  id: 'donutSetaHover',
  afterDraw(chart) {
    const ativos = chart.getActiveElements();
    if (!ativos || !ativos.length) return;
    const { datasetIndex, index } = ativos[0];
    const meta = chart.getDatasetMeta(datasetIndex);
    const arc = meta.data[index];
    if (!arc) return;
    const dataset = chart.data.datasets[datasetIndex];
    const valor = dataset.data[index];
    if (!valor) return;
    const cor = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[index] : dataset.backgroundColor;
    const { ctx } = chart;
    // IMPORTANTE: usar arc.x/arc.y (centro real do donut, fixo) e não
    // arc.getCenterPoint() — esse último já embute o deslocamento radial
    // do hoverOffset (a fatia "pulando" pra fora no hover), então somar
    // o próprio raio em cima disso aplicava o offset em dobro e fazia a
    // linha nascer bem longe da fatia, solta no meio do card.
    const cx = arc.x, cy = arc.y;
    const angulo = (arc.startAngle + arc.endAngle) / 2;
    const rOut = arc.outerRadius;
    const laDireita = Math.cos(angulo) >= 0;
    // Linha nasce bem na borda externa do anel (onde a cor da fatia
    // termina) e sai lateralmente pra fora — não atravessa a fatia por
    // dentro (isso dava a impressão de "vir de dentro" do donut, mas o
    // pedido era sair da lateral/borda, não do centro).
    const p1x = cx + Math.cos(angulo) * (rOut + 2);
    const p1y = cy + Math.sin(angulo) * (rOut + 2);
    const p2x = cx + Math.cos(angulo) * (rOut + 40);
    const p2y = cy + Math.sin(angulo) * (rOut + 40);

    // Calcula a caixa do rótulo (com clamp de borda) ANTES de desenhar a
    // linha, pra o cotovelo horizontal da linha terminar exatamente onde a
    // caixa começa — antes o clamp só movia a caixa, deixando a linha
    // apontando pra um ponto vazio longe dela (era esse o motivo de a seta
    // "sumir" nos ângulos perto da borda do canvas: linha e caixa paravam
    // em lugares diferentes).
    const rotulo = chart.data.labels[index] + '  ' + valor.toLocaleString('pt-BR');
    ctx.font = "600 12px Inter, -apple-system, 'Segoe UI', sans-serif";
    const largura = ctx.measureText(rotulo).width;
    const padX = 7;
    const alturaCaixa = 22;
    const margemSegura = 4;
    let p3x = p2x + (laDireita ? 22 : -22);
    let textoX = p3x + (laDireita ? 6 : -6);
    let caixaX = laDireita ? textoX - padX : textoX - largura - padX;
    if (laDireita && caixaX + largura + padX * 2 > chart.width - margemSegura) {
      const excesso = (caixaX + largura + padX * 2) - (chart.width - margemSegura);
      caixaX -= excesso; textoX -= excesso; p3x -= excesso;
    } else if (!laDireita && caixaX < margemSegura) {
      const excesso = margemSegura - caixaX;
      caixaX += excesso; textoX += excesso; p3x += excesso;
    }
    const centroY = Math.max(alturaCaixa / 2 + 4, Math.min(chart.height - alturaCaixa / 2 - 4, p2y));

    ctx.save();
    ctx.strokeStyle = cor; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, centroY); ctx.lineTo(p3x, centroY); ctx.stroke();
    ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(p1x, p1y, 2.5, 0, Math.PI * 2); ctx.fill();

    // 'middle' ancora o texto no meio vertical dele mesmo — bem mais fácil
    // de centralizar dentro da caixa do que calcular offset com 'bottom'
    // (era esse cálculo errado que deixava o texto abaixo da caixa antes).
    ctx.textBaseline = 'middle';
    ctx.textAlign = laDireita ? 'left' : 'right';
    // Placa de fundo atrás do texto pra garantir legibilidade em qualquer
    // ponto do card (evita texto claro sumindo contra fundo claro, ou
    // colidindo visualmente com o número central se a seta apontar perto
    // dele) — mede a largura real do texto pra caixa ficar justa.
    ctx.fillStyle = 'rgba(11,11,13,0.92)';
    ctx.beginPath();
    ctx.roundRect(caixaX, centroY - alturaCaixa / 2, largura + padX * 2, alturaCaixa, 6);
    ctx.fill();
    ctx.strokeStyle = cor; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#F0F0F0';
    ctx.fillText(rotulo, textoX, centroY);
    ctx.restore();
  },
};
const rootStyle = getComputedStyle(document.documentElement);
const GOLD_COLOR = rootStyle.getPropertyValue('--gold').trim();
const GOLD_BRIGHT_COLOR = rootStyle.getPropertyValue('--gold-bright').trim();
// Cor dos gráficos "marcas menos vendidas" (aba Vendas) — mesmo azul do
// status EXCESSO, pra não reintroduzir uma cor nova sem passar pelo
// validador de acessibilidade da skill dataviz.
const COLOR_BLUE_VENDAS = donutColors.EXCESSO;
const COLOR_BLUE_VENDAS_ATIVA = '#5598e7';
const badgeClass = s => ({ RUPTURA: 'badge-ruptura', BAIXO: 'badge-baixo', EXCESSO: 'badge-excesso', OK: 'badge-ok' }[s] || 'badge-ok');
// Texto exibido pro usuário — a chave interna continua "RUPTURA" (usada
// em comparações e filtros), só o texto na tela muda.
const situacaoLabel = s => (s === 'RUPTURA' ? 'ESTOQUE ZERADO' : s);


// ----------------------------------------------------------------------
// PAINEL DE DETALHE (dados de exemplo, até a Sysemp liberar o endpoint
// de histórico de compras/vendas — ver Especificacao_Historico_Compras_Vendas.docx)
// ----------------------------------------------------------------------
function hashTexto(txt) {
  let h = 0;
  for (let i = 0; i < txt.length; i++) { h = ((h << 5) - h + txt.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

function gerarComprasExemplo(produto) {
  const seed = hashTexto(produto.produto + produto.marca);
  const rnd = (min, max, offset) => min + ((seed + offset * 977) % 1000) / 1000 * (max - min);
  const fornecedores = ['Distribuidora Central', produto.marca + ' Indústria', 'Comercial Atacado SP', 'Fornecedor Direto'];

  const compras = [];
  let diasAcumulados = Math.floor(rnd(3, 40, 0));
  for (let i = 0; i < 5; i++) {
    const data = new Date(Date.now() - diasAcumulados * 86400000);
    compras.push({
      data: data.toLocaleDateString('pt-BR'),
      numeroNf: 100000 + ((seed + i * 3331) % 899999),
      fornecedor: fornecedores[(seed + i) % fornecedores.length],
      quantidade: Math.max(1, Math.round(rnd(produto.minimo * 0.6, produto.minimo * 2.2, i + 1))),
    });
    diasAcumulados += Math.floor(rnd(15, 60, i + 10));
  }
  return compras;
}

// ----------------------------------------------------------------------
// Busca compras e vendas REAIS na Sysemp (via ponte do Apps Script),
// um produto por vez, sob demanda — só quando o usuário clica no item.
// ----------------------------------------------------------------------
async function buscarComprasVendasReais(codigoBarras, vendasAoVivoLote) {
  const resultado = { compras: null, vendas: null, erro: null };
  if (!codigoBarras) { resultado.erro = 'Produto sem código de barras.'; return resultado; }

  // Cadeia navegador -> Worker -> Sysemp pode travar sem avisar — limita
  // a espera a 30s pra sempre cair no modo de exemplo em vez de ficar
  // preso na tela de carregamento pra sempre.
  const TIMEOUT_MS = 30000;
  function fetchComTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  // A busca de "vendas" AO VIVO na Sysemp (1 produto, 1 ano de historico)
  // e lenta de verdade (5-15s, confirmado 25/08/2026 -- gargalo e a
  // propria Sysemp processando a consulta, nao infraestrutura de
  // transporte, ja trocamos o Apps Script pelo Cloudflare Worker e nao
  // mudou). Mas esse mesmo dado (media mensal, total vendido, ultima
  // venda) ja esta na memoria do navegador -- veio no carregamento
  // inicial do painel, via VendasAoVivo (sincronizada de hora em hora).
  // Entao so busca "vendas" ao vivo se AINDA nao tivermos esse produto
  // no lote (produto novo, fora do ciclo de sincronizacao) -- na maioria
  // dos cliques, isso elimina a chamada mais lenta por completo.
  if (vendasAoVivoLote) {
    resultado.vendas = {
      mediaMensal12M: vendasAoVivoLote.mediaMensal || 0,
      totalVendido12M: vendasAoVivoLote.totalVendido || 0,
      dataUltimaVenda: vendasAoVivoLote.dataUltimaVenda ? new Date(vendasAoVivoLote.dataUltimaVenda + 'T00:00:00').toLocaleDateString('pt-BR') : '—',
      qtdUltimaVenda: vendasAoVivoLote.qtdUltimaVenda || 0,
    };
  }

  try {
    const chamadas = [fetchComTimeout(WEBAPP_URL + '?codBarra=' + encodeURIComponent(codigoBarras) + '&tipo=compras')];
    if (!vendasAoVivoLote) {
      chamadas.push(fetchComTimeout(WEBAPP_URL + '?codBarra=' + encodeURIComponent(codigoBarras) + '&tipo=vendas'));
    }
    const [respCompras, respVendas] = await Promise.all(chamadas);
    const jsonCompras = await respCompras.json();

    if (jsonCompras.ok && jsonCompras.dados && jsonCompras.dados.retorno && jsonCompras.dados.retorno[0]) {
      const itemCompras = jsonCompras.dados.retorno[0];
      resultado.compras = (itemCompras.ultimas_compras || []).map(c => ({
        data: c['Data da Compra'] ? new Date(c['Data da Compra'] + 'T00:00:00').toLocaleDateString('pt-BR') : '—',
        numeroNf: c['Número NF'] || '—',
        fornecedor: c['Fornecedor'] || '—',
        quantidade: parseFloat(c['Quantidade Comprada']) || 0,
        custo: parseFloat(c['Custo Unitário']) || 0,
      }));
    }

    if (respVendas) {
      const jsonVendas = await respVendas.json();
      if (jsonVendas.ok && jsonVendas.dados && jsonVendas.dados.retorno && jsonVendas.dados.retorno[0]) {
        const itemVendas = jsonVendas.dados.retorno[0];
        // A Sysemp atualizou o método listarVendasMediaPorProduto (ago/2026)
        // pra exigir datainicial/datafinal em vez de fixar 12 meses sozinha,
        // e confirmou (suporte, 18/08/2026) que os campos agora são "Média
        // Mensal" e "Total vendido", sem o sufixo "12 Meses". Mantém a
        // grafia antiga como fallback só por segurança.
        const campoVendas = (...chaves) => {
          for (const c of chaves) if (itemVendas[c] !== undefined && itemVendas[c] !== null && itemVendas[c] !== '') return itemVendas[c];
          return undefined;
        };
        resultado.vendas = {
          mediaMensal12M: parseFloat(campoVendas('Média Mensal', 'Média Mensal 12 Meses')) || 0,
          totalVendido12M: parseFloat(campoVendas('Total vendido', 'Total Vendido', 'Total vendido 12 Meses')) || 0,
          dataUltimaVenda: campoVendas('Data Última Venda') ? new Date(campoVendas('Data Última Venda') + 'T00:00:00').toLocaleDateString('pt-BR') : '—',
          qtdUltimaVenda: parseFloat(campoVendas('Quantidade Última Venda')) || 0,
        };
      }
    }

    if (!resultado.compras && !resultado.vendas) {
      resultado.erro = 'Sysemp não retornou dados para este produto.';
    }
  } catch (err) {
    resultado.erro = err.name === 'AbortError'
      ? 'A Sysemp demorou demais para responder (mais de 30s).'
      : 'Falha ao buscar dados reais (' + err.message + ').';
  }

  return resultado;
}

// Calcula o Pedido Sugerido usando o estoque e pedidos em aberto AO VIVO
// (não o valor estático que veio junto com a planilha de análise) — usada
// tanto no painel de detalhe quanto na geração do arquivo pro Sysemp, pra
// nunca mostrar números diferentes em lugares diferentes do painel.
// Ponto de Pedido/Estoque de Segurança/Lote continuam vindo da planilha
// (não dependem do estoque do momento, só a Necessidade depende).
// Extrai o múltiplo de compra do NOME do produto — a Sysemp/fornecedor
// costuma colocar entre parênteses no final, ex.: "...BRASFORT (6)" =
// só pode comprar em múltiplos de 6. É o dado mais confiável que existe
// (vem direto da embalagem do fornecedor), então essa regra vale sempre,
// mesmo quando a planilha Excel tiver um Lote Mínimo diferente cadastrado.
function extrairLoteDoNome(nomeProduto) {
  // Procura "(N)" em QUALQUER lugar do nome — a Sysemp às vezes coloca no
  // final ("...BRASFORT (6)"), às vezes no meio ("...LATÃO (20) REF:...
  // - TAF"). Pega a primeira ocorrência de um número puro entre parênteses.
  const match = String(nomeProduto || '').match(/\((\d+)\)/);
  if (!match) return null;
  const lote = parseInt(match[1], 10);
  return lote > 0 ? lote : null;
}

// Arredonda uma quantidade sugerida PRA CIMA, pro múltiplo do lote do
// produto (se o nome tiver um). Não mexe em quantidade 0 (nada a comprar
// continua sendo nada a comprar).
function ajustarParaLoteDoNome(quantidade, produto) {
  if (!quantidade || quantidade <= 0) return quantidade;
  const lote = extrairLoteDoNome(produto.produto);
  if (!lote) return quantidade;
  return Math.ceil(quantidade / lote) * lote;
}

function calcularPedidoSugeridoAoVivo(produto) {
  const an = produto.analise;
  if (!an || an.descontinuada || an.pontoPedido == null || an.estoqueSeguranca == null) return null;
  const emAbertoAoVivo = pedidosEmAberto.get(normalizarProduto(produto.produto)) || 0;
  const pedidoCalculado = an.pontoPedido - an.estoqueSeguranca;
  const estoqueConsolidadoAoVivo = produto.estoque + emAbertoAoVivo;
  const necessidadeAoVivo = Math.max(0, an.pontoPedido - estoqueConsolidadoAoVivo + pedidoCalculado);
  if (necessidadeAoVivo === 0) return 0;
  const adicionaisAoVivo = necessidadeAoVivo < an.loteMinimo ? 0 : Math.ceil((necessidadeAoVivo - an.loteMinimo) / an.loteEconomico) * an.loteEconomico;
  return ajustarParaLoteDoNome(an.loteMinimo + adicionaisAoVivo, produto);
}

async function abrirDetalheProduto(produto) {
  const painel = document.getElementById('modal-panel');

  // Guarda o elemento com foco antes de abrir, pra devolver o foco pra ele
  // quando o modal fechar (senão o teclado "perde o lugar" na página).
  elementoFocoAntesDoModal = document.activeElement;

  // Mostra o modal já, com uma tela de carregamento — a busca na Sysemp
  // passa pelo Google e pode levar um segundo ou dois.
  painel.innerHTML =
    '<div class="modal-header">' +
      '<div><div class="modal-title">' + escapeHtml(produto.produto) + '</div>' +
      '<div class="modal-sub">' + escapeHtml(produto.marca) + ' · ' + escapeHtml(produto.grupo) + '</div></div>' +
      '<button class="modal-close" id="modal-close-btn" aria-label="Fechar">' + icon('x', 'icon-sm') + '</button>' +
    '</div>' +
    '<div class="loading" style="padding:40px 20px;"><div class="spinner"></div>Buscando compras e vendas na Sysemp...</div>';
  document.getElementById('modal-close-btn').addEventListener('click', fecharDetalheProduto);
  document.getElementById('modal-backdrop').classList.add('open');
  painel.focus();

  const dadosReais = await buscarComprasVendasReais(produto.codigoBarras, produto.vendasAoVivoLote);

  montarConteudoModal(produto, dadosReais);
}

function montarConteudoModal(produto, dadosReais) {
  const painel = document.getElementById('modal-panel');
  const an = produto.analise; // dados reais da planilha de análise (Média, Desvio, Ponto de Pedido, Pedido Sugerido), quando disponível

  // ---- Últimas compras: real (Sysemp) quando disponível, senão exemplo ----
  let blocoCompras;
  if (dadosReais.compras && dadosReais.compras.length > 0) {
    blocoCompras =
      '<div class="modal-section">' +
        '<div class="modal-section-title">Últimas compras <span style="color:var(--green-a);font-size:11px;font-weight:600;">● AO VIVO — SYSEMP</span></div>' +
        '<table class="modal-table"><thead><tr><th>Data</th><th>NF</th><th>Fornecedor</th><th class="num">Qtd</th><th class="num">Custo</th></tr></thead><tbody>' +
          dadosReais.compras.map(c =>
            '<tr><td>' + escapeHtml(c.data) + '</td><td>Nº ' + escapeHtml(c.numeroNf) + '</td><td>' + escapeHtml(c.fornecedor) + '</td><td class="num">' + fmtNum(c.quantidade) + '</td><td class="num">' + fmtMoeda(c.custo) + '</td></tr>'
          ).join('') +
        '</tbody></table>' +
      '</div>';
  } else if (dadosReais.compras && dadosReais.compras.length === 0) {
    blocoCompras =
      '<div class="modal-section">' +
        '<div class="modal-section-title">Últimas compras <span style="color:var(--green-a);font-size:11px;font-weight:600;">● AO VIVO — SYSEMP</span></div>' +
        '<p class="hint" style="margin:0;">Nenhuma compra registrada para este produto na Sysemp.</p>' +
      '</div>';
  } else {
    const comprasExemplo = gerarComprasExemplo(produto);
    blocoCompras =
      '<div class="modal-section">' +
        '<div class="modal-section-title">Últimas 5 compras</div>' +
        '<div class="mock-warning" style="margin-bottom:10px;">' + icon('warning', 'icon-sm') + ' ' + (dadosReais.erro || 'Não consegui buscar os dados reais agora') + ' — mostrando dados de exemplo.</div>' +
        '<table class="modal-table"><thead><tr><th>Data</th><th>NF</th><th>Fornecedor</th><th class="num">Qtd</th></tr></thead><tbody>' +
          comprasExemplo.map(c =>
            '<tr><td>' + escapeHtml(c.data) + '</td><td>Nº ' + escapeHtml(c.numeroNf) + '</td><td>' + escapeHtml(c.fornecedor) + '</td><td class="num">' + fmtNum(c.quantidade) + '</td></tr>'
          ).join('') +
        '</tbody></table>' +
      '</div>';
  }

  // ---- Vendas ao vivo (Sysemp), quando disponível ----
  let blocoVendasAoVivo = '';
  if (dadosReais.vendas) {
    const v = dadosReais.vendas;
    blocoVendasAoVivo =
      '<div class="modal-section">' +
        '<div class="modal-section-title">Vendas <span style="color:var(--green-a);font-size:11px;font-weight:600;">● AO VIVO — SYSEMP (12 meses)</span></div>' +
        '<div class="modal-grid">' +
          '<div class="modal-stat"><div class="k">Média mensal (12M)</div><div class="v">' + v.mediaMensal12M.toFixed(1) + ' un/mês</div></div>' +
          '<div class="modal-stat"><div class="k">Total vendido (12M)</div><div class="v">' + fmtNum(Math.round(v.totalVendido12M)) + ' un</div></div>' +
          '<div class="modal-stat"><div class="k">Última venda</div><div class="v">' + v.dataUltimaVenda + '</div></div>' +
          '<div class="modal-stat"><div class="k">Qtd. última venda</div><div class="v">' + fmtNum(Math.round(v.qtdUltimaVenda)) + ' un</div></div>' +
        '</div>' +
      '</div>';
  }

  let blocoVendas, blocoSugestao, blocoDetalhes = '';

  if (an && an.descontinuada) {
    blocoVendas =
      '<div class="modal-section">' +
        '<div class="modal-section-title">Vendas (calculado — 14 meses de histórico)</div>' +
        '<div class="modal-grid">' +
          '<div class="modal-stat"><div class="k">Média mensal</div><div class="v">' + fmtNum(Math.round(an.mediaMensal)) + ' un/mês</div></div>' +
          '<div class="modal-stat"><div class="k">Desvio padrão</div><div class="v">' + fmtNum(Math.round(an.desvioPadrao)) + '</div></div>' +
        '</div>' +
      '</div>';
    blocoSugestao =
      '<div class="mock-warning" style="margin-top:18px;">' + icon('prohibit', 'icon-sm') + ' Marca descontinuada — não é feita reposição automática deste item.</div>';
  } else if (dadosReais.vendas) {
    // Fonte principal: média real (AO VIVO, Sysemp) × lead time da marca
    // — mesma fórmula usada na geração do pedido. Decidido (19/08/2026)
    // que é melhor que o Ponto de Pedido estático da planilha de análise,
    // mesmo quando o produto bate com ela (ver CONTEXTO.md).
    const v = dadosReais.vendas;
    const marcaNormalizada = normalizarFornecedor(produto.marca);
    const leadTimeMarca = LEAD_TIME_POR_MARCA[marcaNormalizada];
    const temLeadTime = leadTimeMarca !== undefined && leadTimeMarca !== null;
    const sugestaoReal = calcularSugestaoSemPlanilha(produto, v.mediaMensal12M);
    const loteDoNome = extrairLoteDoNome(produto.produto);
    const coberturaLoteNome = (loteDoNome && v.mediaMensal12M > 0) ? loteDoNome / v.mediaMensal12M : null;
    blocoVendas = coberturaLoteNome !== null ?
      '<div class="modal-section">' +
        '<div class="modal-grid">' +
          '<div class="modal-stat"><div class="k">Lote (do nome do produto)</div><div class="v">' + fmtNum(loteDoNome) + ' un</div></div>' +
          '<div class="modal-stat"><div class="k">Cobertura desse lote</div><div class="v">' + coberturaLoteNome.toFixed(1) + ' meses</div></div>' +
        '</div>' +
      '</div>' : '';
    blocoSugestao =
      '<div class="suggestion-box">' +
        '<span class="k">SUGESTÃO DE COMPRA<br>(' + (temLeadTime ? 'média real × lead time da marca (' + fmtNum(leadTimeMarca) + ' dias), sem estoque de segurança' : 'média real, lead time da marca desconhecido — assumindo 1 mês') + ')</span>' +
        '<span class="v">' + fmtNum(sugestaoReal) + ' un</span>' +
      '</div>';

    // Contexto extra da planilha de análise (Curva ABC etc.), só
    // informativo — NÃO alimenta a sugestão acima, que já usa AO VIVO.
    if (an && !an.descontinuada) {
      const diasEstoque = an.vendaMediaDia3M > 0 ? produto.estoque / an.vendaMediaDia3M : null;
      blocoDetalhes =
        '<div class="modal-section">' +
          '<div class="modal-section-title">Detalhes da planilha de análise <span style="color:var(--text-muted);font-size:11px;font-weight:600;">(contexto — não usado na sugestão acima)</span></div>' +
          '<div class="modal-grid">' +
            '<div class="modal-stat"><div class="k">Curva ABC</div><div class="v">' + escapeHtml(an.curva) + '</div></div>' +
            '<div class="modal-stat"><div class="k">Nível de atendimento</div><div class="v">' + fmtNum(Math.round(an.nivelAtendimento * 100)) + '%</div></div>' +
            '<div class="modal-stat"><div class="k">Estoque de segurança</div><div class="v">' + fmtNum(an.estoqueSeguranca) + ' un</div></div>' +
            '<div class="modal-stat"><div class="k">Lote mínimo</div><div class="v">' + fmtNum(an.loteMinimo) + ' un</div></div>' +
            '<div class="modal-stat"><div class="k">Lote econômico</div><div class="v">' + fmtNum(an.loteEconomico) + ' un</div></div>' +
            '<div class="modal-stat"><div class="k">Dias de estoque</div><div class="v">' + (diasEstoque !== null ? fmtNum(Math.round(diasEstoque)) + ' dias' : '—') + '</div></div>' +
          '</div>' +
        '</div>';
    }
  } else if (an && !an.descontinuada) {
    // Fallback: sem venda AO VIVO disponível agora (busca falhou ou deu
    // timeout), mas o produto bate com a planilha de análise — usa o
    // cálculo estático dela em vez de não sugerir nada.
    const pedidoSugeridoAoVivo = calcularPedidoSugeridoAoVivo(produto);

    blocoVendas =
      '<div class="modal-section">' +
        '<div class="modal-section-title">Vendas (calculado — 14 meses de histórico)</div>' +
        '<div class="modal-grid">' +
          '<div class="modal-stat"><div class="k">Média mensal</div><div class="v">' + fmtNum(Math.round(an.mediaMensal)) + ' un/mês</div></div>' +
          '<div class="modal-stat"><div class="k">Desvio padrão</div><div class="v">' + fmtNum(Math.round(an.desvioPadrao)) + '</div></div>' +
          '<div class="modal-stat"><div class="k">Curva ABC</div><div class="v">' + escapeHtml(an.curva) + '</div></div>' +
          '<div class="modal-stat"><div class="k">Lead time total</div><div class="v">' + fmtNum(an.leadTimeTotal) + ' dias</div></div>' +
        '</div>' +
      '</div>';
    blocoSugestao =
      '<div class="suggestion-box">' +
        '<span class="k">PEDIDO SUGERIDO<br>(ponto de pedido: ' + fmtNum(Math.round(an.pontoPedido)) + ' · sem venda AO VIVO disponível agora, usando planilha de análise)</span>' +
        '<span class="v">' + fmtNum(pedidoSugeridoAoVivo) + ' un</span>' +
      '</div>';
  } else {
    // Sem match na planilha E sem venda real da Sysemp nos últimos 12
    // meses — ou seja, sem histórico de venda nenhum. Sem venda recente,
    // não há necessidade de sugerir compra (mesmo que o Mínimo Parametrizado
    // diga o contrário) — não sugere nada nesse caso.
    blocoVendas =
      '<div class="modal-section">' +
        '<div class="mock-warning">' + icon('warning', 'icon-sm') + ' Sem vendas recentes registradas para este produto — sem necessidade de reposição.</div>' +
      '</div>';
    blocoSugestao = '';
  }

  painel.innerHTML =
    '<div class="modal-header">' +
      '<div><div class="modal-title">' + escapeHtml(produto.produto) + '</div>' +
      '<div class="modal-sub">' + escapeHtml(produto.marca) + ' · ' + escapeHtml(produto.grupo) + '</div></div>' +
      '<button class="modal-close" id="modal-close-btn" aria-label="Fechar">' + icon('x', 'icon-sm') + '</button>' +
    '</div>' +

    blocoCompras +

    blocoVendasAoVivo +

    blocoVendas +

    '<div class="modal-section">' +
      '<div class="modal-section-title">Estoque atual</div>' +
      '<div class="modal-grid">' +
        '<div class="modal-stat"><div class="k">Em estoque</div><div class="v">' + fmtNum(produto.estoque) + '</div></div>' +
        '<div class="modal-stat"><div class="k">Mínimo parametrizado</div><div class="v">' + fmtNum(produto.minimo) + '</div></div>' +
      '</div>' +
    '</div>' +

    blocoDetalhes +

    blocoSugestao;

  document.getElementById('modal-close-btn').addEventListener('click', fecharDetalheProduto);
  document.getElementById('modal-backdrop').classList.add('open');
}

function fecharDetalheProduto() {
  document.getElementById('modal-backdrop').classList.remove('open');
  if (elementoFocoAntesDoModal && elementoFocoAntesDoModal.isConnected) elementoFocoAntesDoModal.focus();
  elementoFocoAntesDoModal = null;
}

document.getElementById('modal-backdrop').addEventListener('click', e => {
  if (e.target.id === 'modal-backdrop') fecharDetalheProduto();
});
document.addEventListener('keydown', e => {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop.classList.contains('open')) return;
  if (e.key === 'Escape') { fecharDetalheProduto(); return; }
  if (e.key !== 'Tab') return;
  // Prende o foco dentro do modal enquanto ele estiver aberto (senão o Tab
  // vaza pro conteúdo por trás, que fica visualmente escondido pelo overlay).
  const painel = document.getElementById('modal-panel');
  const focaveis = painel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focaveis.length === 0) return;
  const primeiro = focaveis[0];
  const ultimo = focaveis[focaveis.length - 1];
  if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
});

// ---- Modal "detalhe de marca" (mesmo padrão do modal de produto) ----
// Estático no HTML, fora de #app/.scene-3d — evita de vez os bugs de
// will-change:transform quebrando position:fixed que a tentativa anterior
// (mover o card via appendChild, tentando um overlay "inline") enfrentou.
let elementoFocoAntesDoModalMarca = null;

function abrirDetalheMarca(marca, posicao, valor, pctDoTotal, cor, itensDaMarca, porSituacao, yClique) {
  elementoFocoAntesDoModalMarca = document.activeElement;
  // Abre o modal na mesma altura vertical de onde o usuário clicou, não no
  // centro absoluto da tela — em monitores grandes, o centro fica longe do
  // que a pessoa estava olhando/clicando, dando a sensação de "sumir no
  // meio do nada". Clampa pra não deixar o modal colado na borda superior
  // (mín. 24px) nem vazar embaixo em telas curtas (máx. ajustado pela
  // altura estimada do modal, ~420px, com folga).
  const backdrop = document.getElementById('modal-marca-backdrop');
  if (typeof yClique === 'number') {
    const alturaModalEstimada = 520;
    const topoMax = Math.max(24, window.innerHeight - alturaModalEstimada - 24);
    const topo = Math.min(Math.max(24, yClique - 60), topoMax);
    backdrop.style.setProperty('--marca-modal-top', topo + 'px');
  } else {
    backdrop.style.removeProperty('--marca-modal-top');
  }
  const medalha = MEDALHA_CORES[posicao + 1];
  const posLabel = '#' + (posicao + 1);
  const badgePos = medalha
    ? '<div class="marca-medalha" style="--medalha-a:' + medalha[0] + ';--medalha-b:' + medalha[1] + ';">' + icon('trophy', 'icon-md') + '<span>' + posLabel + '</span></div>'
    : '<div class="marca-medalha marca-medalha-simples">' + posLabel + '</div>';

  const painel = document.getElementById('modal-marca-panel');
  painel.innerHTML =
    '<div class="modal-header">' +
      '<div class="modal-title">Detalhe da marca</div>' +
      '<button class="modal-close" id="modal-marca-close-btn" aria-label="Fechar">' + icon('x', 'icon-sm') + '</button>' +
    '</div>' +
    '<div class="modal-marca-topo">' + badgePos +
      '<div class="modal-marca-nome">' + escapeHtml(marca) + '</div>' +
    '</div>' +
    '<div class="modal-marca-barra-track"><div class="modal-marca-barra-fill" style="background:linear-gradient(90deg,' + cor + ',' + GOLD_BRIGHT_COLOR + ');"></div></div>' +
    '<div class="modal-marca-valor">' + fmtMoeda(valor) + '</div>' +
    '<div class="modal-marca-pct">' + pctDoTotal.toFixed(1) + '% do valor total em estoque</div>' +
    '<div class="modal-marca-stats">' +
      '<div class="modal-marca-stat"><span class="k">SKUs</span><span class="v">' + fmtNum(itensDaMarca.length) + '</span></div>' +
      '<div class="modal-marca-stat" style="--stat-cor:' + donutColors.RUPTURA + ';"><span class="k">Zerado</span><span class="v">' + fmtNum(porSituacao.RUPTURA) + '</span></div>' +
      '<div class="modal-marca-stat" style="--stat-cor:' + donutColors.BAIXO + ';"><span class="k">Baixo</span><span class="v">' + fmtNum(porSituacao.BAIXO) + '</span></div>' +
      '<div class="modal-marca-stat" style="--stat-cor:' + donutColors.EXCESSO + ';"><span class="k">Excesso</span><span class="v">' + fmtNum(porSituacao.EXCESSO) + '</span></div>' +
    '</div>';
  document.getElementById('modal-marca-close-btn').addEventListener('click', () => fecharDetalheMarca(marca));
  document.getElementById('modal-marca-backdrop').classList.add('open');
  // preventScroll: true é essencial aqui — sem isso, o navegador tenta
  // rolar a página até o elemento focado ficar visível, e como esse
  // clique acabou de rodar renderizar() (que pode ter mudado bastante a
  // altura da página, ex. abrindo a tabela "Itens de [marca]" embaixo), o
  // cálculo de onde rolar fica instável — foi essa a causa do scroll
  // automático indesejado ao abrir o modal.
  painel.focus({ preventScroll: true });
}

function fecharDetalheMarca(marca) {
  document.getElementById('modal-marca-backdrop').classList.remove('open');
  if (elementoFocoAntesDoModalMarca && elementoFocoAntesDoModalMarca.isConnected) elementoFocoAntesDoModalMarca.focus();
  elementoFocoAntesDoModalMarca = null;
  // Limpa o painel de itens também — o mesmo backdrop cobre os dois
  // modais, então fechar um fecha ambos; sem isso, a próxima marca
  // clicada mostraria por um instante os itens da marca anterior.
  document.getElementById('modal-itens-panel').innerHTML = '';
  // Fechar o modal também desmarca o filtro da tabela (a marca só fica
  // filtrada enquanto o modal de detalhe dela está aberto).
  if (filtroMarca === marca) {
    filtroMarca = '';
    marcaExpandidaTabela = '';
    renderizar();
  }
}

document.getElementById('modal-marca-backdrop').addEventListener('click', e => {
  if (e.target.id === 'modal-marca-backdrop') fecharDetalheMarca(filtroMarca);
});
document.addEventListener('keydown', e => {
  const backdrop = document.getElementById('modal-marca-backdrop');
  if (!backdrop.classList.contains('open')) return;
  if (e.key === 'Escape') { fecharDetalheMarca(filtroMarca); return; }
  if (e.key !== 'Tab') return;
  // Prende o foco considerando os DOIS painéis juntos (detalhe da marca +
  // itens mais vendidos), já que compartilham o mesmo backdrop/abertura.
  const grupo = document.querySelector('.modal-marca-grupo');
  const focaveis = grupo.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focaveis.length === 0) return;
  const primeiro = focaveis[0];
  const ultimo = focaveis[focaveis.length - 1];
  if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
});

// ---- Modal "itens mais vendidos da marca" (abre junto com o detalhe) ----
function abrirRankingItensMarca(marca, maisVendidosDaMarca, totalValorVendidoMarca) {
  const painel = document.getElementById('modal-itens-panel');
  if (!maisVendidosDaMarca.length) {
    painel.innerHTML = '';
    return;
  }
  const maiorMedia = maisVendidosDaMarca[0].analise.mediaMensal;
  painel.innerHTML =
    '<div class="modal-itens-titulo">' + icon('trendUp', 'icon-sm') + ' Mais vendidos — ' + escapeHtml(marca) + '</div>' +
    '<div class="modal-itens-sub">Top ' + maisVendidosDaMarca.length + ' por média mensal vendida</div>' +
    '<div class="modal-itens-lista">' +
      maisVendidosDaMarca.map((d, i) => {
        const media = d.analise.mediaMensal;
        const pctDaBarra = maiorMedia > 0 ? (media / maiorMedia) * 100 : 0;
        const cor = corMarca(i);
        // % que o valor vendido desse item (preço real da TABELA_PRECOS ×
        // média mensal) representa do valor total vendido da marca — não é
        // margem/lucro, é participação no faturamento da marca. Só mostra
        // quando o produto tem preço de venda cadastrado (>0).
        const temValor = d.precoVenda > 0 && totalValorVendidoMarca > 0;
        const pctDoValorMarca = temValor ? (media * d.precoVenda / totalValorVendidoMarca) * 100 : 0;
        const linhaValor = temValor
          ? '<div class="modal-itens-margem"><span>% do valor vendido da marca</span><span class="v">' + pctDoValorMarca.toFixed(1).replace('.', ',') + '%</span></div>'
          : '';
        return '<div class="modal-itens-row">' +
          '<div class="modal-itens-top">' +
            '<div class="modal-itens-nome"><span class="modal-itens-pos">#' + (i + 1) + '</span>' +
              '<span class="modal-itens-label" title="' + escapeHtml(d.produto) + '">' + escapeHtml(d.produto) + '</span></div>' +
            '<span class="modal-itens-valor">' + media.toFixed(1) + ' un/mês</span>' +
          '</div>' +
          '<div class="modal-itens-track"><div class="modal-itens-fill" style="--pct-barra:' + pctDaBarra.toFixed(1) + '%;background:' + cor + ';"></div></div>' +
          linhaValor +
        '</div>';
      }).join('') +
    '</div>';
}

// ---- Menu de navegação lateral (overlay escondido por padrão) ----
let elementoFocoAntesDoNav = null;
document.getElementById('nav-close-btn').innerHTML = icon('x', 'icon-sm');

function abrirNavSidebar() {
  elementoFocoAntesDoNav = document.activeElement;
  document.getElementById('nav-sidebar').classList.add('open');
  document.getElementById('nav-sidebar').setAttribute('aria-hidden', 'false');
  document.getElementById('nav-backdrop').classList.add('open');
  document.getElementById('scene-3d').classList.add('nav-open');
  document.getElementById('nav-toggle-btn').setAttribute('aria-expanded', 'true');
  const primeiroItem = document.querySelector('#nav-sidebar-body .nav-item');
  if (primeiroItem) primeiroItem.focus();
}
function fecharNavSidebar() {
  document.getElementById('nav-sidebar').classList.remove('open');
  document.getElementById('nav-sidebar').setAttribute('aria-hidden', 'true');
  document.getElementById('nav-backdrop').classList.remove('open');
  document.getElementById('scene-3d').classList.remove('nav-open');
  document.getElementById('nav-toggle-btn').setAttribute('aria-expanded', 'false');
  if (elementoFocoAntesDoNav && elementoFocoAntesDoNav.isConnected) elementoFocoAntesDoNav.focus();
  elementoFocoAntesDoNav = null;
}
document.getElementById('nav-toggle-btn').addEventListener('click', abrirNavSidebar);
document.getElementById('nav-close-btn').addEventListener('click', fecharNavSidebar);
document.getElementById('nav-backdrop').addEventListener('click', fecharNavSidebar);
document.addEventListener('keydown', e => {
  const sidebar = document.getElementById('nav-sidebar');
  if (!sidebar.classList.contains('open')) return;
  if (e.key === 'Escape') { fecharNavSidebar(); return; }
  if (e.key !== 'Tab') return;
  const focaveis = sidebar.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focaveis.length === 0) return;
  const primeiro = focaveis[0];
  const ultimo = focaveis[focaveis.length - 1];
  if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
});

// Fecha a lista de sugestões de marca ao clicar fora dela.
document.addEventListener('click', e => {
  if (mostrarSugestoesMarca && !e.target.closest('.autocomplete-wrap')) {
    mostrarSugestoesMarca = false;
    renderizar();
  }
});

// ----------------------------------------------------------------------
// Exportação no formato de importação de pedido do Sysemp
// (tela "Pedido Importar Texto": separador ; , decimal com vírgula,
// sem cabeçalho, layout "Codigo, Quantidade, Preço (Custo)", usando
// Código de Barras).
// ----------------------------------------------------------------------
// Sugestão de compra pra quando NÃO tem match na planilha de análise, mas
// temos venda real (ao vivo) da Sysemp — Média × Lead Time da marca menos
// o estoque atual. Mesma função usada no modal e na geração do pedido.
function calcularSugestaoSemPlanilha(produto, mediaMensal12M) {
  const marcaNormalizada = normalizarFornecedor(produto.marca);
  const leadTimeMarca = LEAD_TIME_POR_MARCA[marcaNormalizada];
  const temLeadTime = leadTimeMarca !== undefined && leadTimeMarca !== null;
  const tempoReposicaoMeses = temLeadTime ? leadTimeMarca / DIAS_POR_MES_SYSEMP : 1;
  const emAberto = pedidosEmAberto.get(normalizarProduto(produto.produto)) || 0;
  const bruto = Math.max(0, Math.round(mediaMensal12M * tempoReposicaoMeses - produto.estoque - emAberto));
  return ajustarParaLoteDoNome(bruto, produto);
}

async function gerarPedidoSysemp(marca, itens) {
  const btn = document.getElementById('gerar-pedido-btn');
  const textoOriginalBtn = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Calculando...'; }

  const linhasCalculadas = await Promise.all(itens.map(async d => {
    let qtd;
    if (d.vendasAoVivoLote) {
      // Fonte principal: média mensal real (12 meses) coletada em lote
      // pra todo o catálogo — mesma fórmula do modal (média × lead time
      // da marca), sem precisar de chamada individual à Sysemp aqui.
      qtd = calcularSugestaoSemPlanilha(d, d.vendasAoVivoLote.mediaMensal);
    } else if (d.analise && !d.analise.descontinuada && d.analise.pontoPedido != null) {
      // Fallback: produto ainda não coberto pelo lote AO VIVO (ex. deploy
      // recente, antes do 1º ciclo completar) — usa a planilha de análise.
      qtd = calcularPedidoSugeridoAoVivo(d) || 0;
    } else {
      // Último recurso: busca a venda real ao vivo, um produto por vez.
      const dadosVendas = await buscarComprasVendasReais(d.codigoBarras, d.vendasAoVivoLote);
      if (dadosVendas.vendas) {
        qtd = calcularSugestaoSemPlanilha(d, dadosVendas.vendas.mediaMensal12M);
      } else {
        // Sem histórico de venda nenhum (nem lote, nem Excel, nem Sysemp)
        // — sem necessidade de repor, não sugere nada (mesma regra do modal).
        qtd = 0;
      }
    }
    const custoFormatado = (d.custo || 0).toFixed(2).replace('.', ',');
    return { codigo: d.codigoBarras, produto: d.produto, qtd, custo: d.custo || 0, custoFormatado };
  }));

  if (btn && textoOriginalBtn !== null) { btn.disabled = false; btn.textContent = textoOriginalBtn; }

  const linhas = linhasCalculadas.filter(l => l.codigo && l.qtd > 0);

  if (linhas.length === 0) {
    alert('Nenhum item de ' + marca + ' tem quantidade sugerida maior que zero — nada para exportar.');
    return;
  }

  mostrarResumoPedido(marca, linhas);
}

// Mostra o pedido calculado (itens, quantidades, valor) num modal ANTES de
// baixar o CSV -- reaproveita o mesmo modal-backdrop/modal-panel do
// detalhe de produto (fecharDetalheProduto/Esc/click-fora já funcionam).
function mostrarResumoPedido(marca, linhas) {
  const painel = document.getElementById('modal-panel');
  elementoFocoAntesDoModal = document.activeElement;
  const valorTotal = linhas.reduce((s, l) => s + l.qtd * l.custo, 0);

  painel.innerHTML =
    '<div class="modal-header">' +
      '<div><div class="modal-title">Resumo do pedido — ' + escapeHtml(marca) + '</div>' +
      '<div class="modal-sub">' + fmtNum(linhas.length) + ' item(ns) · ' + fmtMoeda(valorTotal) + '</div></div>' +
      '<button class="modal-close" id="modal-close-btn" aria-label="Fechar">' + icon('x', 'icon-sm') + '</button>' +
    '</div>' +
    '<div class="modal-section">' +
      '<table class="modal-table"><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Custo unit.</th><th class="num">Subtotal</th></tr></thead><tbody>' +
        linhas.map(l =>
          '<tr><td>' + escapeHtml(l.produto) + '</td><td class="num">' + fmtNum(l.qtd) + '</td>' +
          '<td class="num">' + fmtMoeda(l.custo) + '</td><td class="num">' + fmtMoeda(l.qtd * l.custo) + '</td></tr>'
        ).join('') +
      '</tbody></table>' +
    '</div>' +
    '<div style="display:flex;justify-content:flex-end;padding:16px 20px 4px;">' +
      '<button class="refresh-btn" id="baixar-pedido-csv-btn" style="background:var(--gold);border:1px solid var(--gold);color:#000;font-weight:700;">' +
        icon('downloadSimple', 'icon-sm') + ' Baixar CSV (' + fmtMoeda(valorTotal) + ')' +
      '</button>' +
    '</div>';

  document.getElementById('modal-close-btn').addEventListener('click', fecharDetalheProduto);
  document.getElementById('baixar-pedido-csv-btn').addEventListener('click', () => baixarCsvPedido(marca, linhas));
  document.getElementById('modal-backdrop').classList.add('open');
  painel.focus({ preventScroll: true });
}

function baixarCsvPedido(marca, linhas) {
  // Sem BOM aqui de proposito -- o arquivo so tem codigo de barras/numero,
  // sem acento nenhum, e o importador de pedido do Sysemp nao remove o
  // BOM: ele gruda no codigo de barras da primeira linha, corrompendo so
  // esse item na hora de importar (as demais linhas ficam intactas).
  const conteudo = linhas.map(l => l.codigo + ';' + l.qtd + ';' + l.custoFormatado).join('\n');
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dataHoje = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = 'pedido_' + marca.replace(/[^a-zA-Z0-9]+/g, '_') + '_' + dataHoje + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------------
// Importação de Pedidos em Aberto (CSV exportado do Sysemp) — o
// arquivo vem com um cabeçalho de 2 linhas meio bagunçado (seção +
// nomes de coluna), então procuramos a linha real de cabeçalho em vez
// de assumir que é sempre a primeira.
// ----------------------------------------------------------------------
// Divide um texto de largura fixa (colunas alinhadas com espaços, como
// o TXT exportado pelo Sysemp) em linhas de campos — corta em qualquer
// sequência de 2+ espaços, preservando espaços simples dentro do texto
// de cada campo (ex.: nomes de produto com espaço entre palavras).
function parseLarguraFixa(texto) {
  return texto.split(/\r\n|\r|\n/)
    .map(l => l.trim())
    .filter(l => l !== '')
    .map(l => l.split(/\s{2,}/).map(c => c.trim()));
}

function acharCabecalho(linhas) {
  for (let i = 0; i < Math.min(linhas.length, 5); i++) {
    const linha = linhas[i].map(c => String(c).trim().toLowerCase());
    const idxProduto = linha.findIndex(c => c === 'produto');
    const idxQtde = linha.findIndex(c => c === 'qtde' || c === 'quantidade');
    if (idxProduto !== -1 && idxQtde !== -1) {
      return { linhaHeaderIdx: i, colProduto: idxProduto, colQtde: idxQtde };
    }
  }
  return null;
}

function processarArquivoPedidosAberto(texto) {
  // Tenta primeiro como CSV (vírgula/ponto e vírgula); se não achar as
  // colunas certas, tenta como texto de largura fixa (colunas alinhadas
  // com espaços — formato do botão "TXT" do Sysemp).
  let linhas = parseCSV_bruto(texto);
  let cabecalho = acharCabecalho(linhas);
  if (!cabecalho) {
    linhas = parseLarguraFixa(texto);
    cabecalho = acharCabecalho(linhas);
  }

  if (!cabecalho) {
    return { ok: false, erro: 'Não encontrei as colunas "Produto" e "Qtde" nas primeiras linhas do arquivo.' };
  }
  const { linhaHeaderIdx, colProduto, colQtde } = cabecalho;

  let importados = 0;
  for (let i = linhaHeaderIdx + 1; i < linhas.length; i++) {
    const linha = linhas[i];
    const produto = linha[colProduto];
    // ignora a linha de rodapé "Itens: N" e afins
    if (!produto || /^itens\s*:/i.test(String(produto).trim())) continue;
    const qtde = parseNumeroBR(linha[colQtde]);
    if (produto && String(produto).trim() && qtde > 0) {
      const chave = normalizarProduto(produto);
      pedidosEmAberto.set(chave, (pedidosEmAberto.get(chave) || 0) + qtde);
      importados++;
    }
  }

  return { ok: true, importados };
}

// Parser CSV que devolve linhas cruas (array de arrays). Detecta
// sozinho se o separador é vírgula ou ponto e vírgula — o Excel em
// português normalmente usa ; mesmo quando o menu diz "separado por
// vírgulas", porque a vírgula já é o separador decimal no Brasil.
function parseCSV_bruto(texto) {
  const primeiraLinha = texto.split(/\r?\n/, 1)[0] || '';
  const qtdVirgulas = (primeiraLinha.match(/,/g) || []).length;
  const qtdPontoVirgula = (primeiraLinha.match(/;/g) || []).length;
  const separador = qtdPontoVirgula > qtdVirgulas ? ';' : ',';

  const linhas = [];
  let campo = '', linhaAtual = [], dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i], prox = texto[i + 1];
    if (dentroAspas) {
      if (c === '"' && prox === '"') { campo += '"'; i++; }
      else if (c === '"') { dentroAspas = false; }
      else { campo += c; }
    } else {
      if (c === '"') { dentroAspas = true; }
      else if (c === separador) { linhaAtual.push(campo); campo = ''; }
      else if (c === '\r') { /* ignora */ }
      else if (c === '\n') { linhaAtual.push(campo); campo = ''; linhas.push(linhaAtual); linhaAtual = []; }
      else { campo += c; }
    }
  }
  if (campo !== '' || linhaAtual.length > 0) { linhaAtual.push(campo); linhas.push(linhaAtual); }
  return linhas.filter(l => l.some(v => v !== ''));
}

// Remove o texto entre parênteses (nome do distribuidor/observação) pra
// comparar só o nome da marca — ex.: "AGUIA FORCE (PYRAMID)" -> "AGUIA FORCE"
function normalizarFornecedor(texto) {
  return String(texto || '').split('(')[0].trim().toUpperCase().replace(/\s+/g, ' ');
}

function diaSemanaAtual() {
  const dias = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  return dias[new Date().getDay()];
}

// Semana do mês: dias 1-7 = semana 1, 8-14 = semana 2, 15-21 = semana 3,
// 22 em diante = semana 4 (regra simples por faixa de data).
function semanaDoMesAtual() {
  return Math.min(4, Math.ceil(new Date().getDate() / 7));
}

function calcularFornecedoresPorDia(diaAlvo) {
  const semanaHoje = semanaDoMesAtual();
  return ROTINA_COMPRAS.filter(r => {
    if (r.d !== diaAlvo) return false;
    if (r.t === 'SEMANAL') return true;
    if (r.t === 'QUINZENAL') {
      if (r.s === 'S1+S3') return semanaHoje === 1 || semanaHoje === 3;
      if (r.s === 'S2+S4') return semanaHoje === 2 || semanaHoje === 4;
      return false;
    }
    if (r.t === 'MENSAL') return r.s === semanaHoje;
    return false;
  });
}

function renderizarAbaVendas() {
  // Consumo único da flag: só anima as tabelas se a renderização foi
  // disparada por uma troca de filtro real (grupo ou marca), mesma
  // convenção do donut/gráficos.
  const animarTabelasVendasAgora = animarTabelasVendasNoProximoRender;
  animarTabelasVendasNoProximoRender = false;
  // Só considera produtos com Média Mensal disponível (batem com a
  // planilha de análise) — os ~10% sem match ficam de fora, mesma
  // limitação de sempre (aceita, conforme combinado).
  const todosGruposVenda = [...new Set(dadosCompletos.map(d => d.grupo))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const comVenda = dadosCompletos.filter(d => d.analise && !d.analise.descontinuada && d.analise.mediaMensal > 0 && (!filtroGrupoVendas || d.grupo === filtroGrupoVendas));
  const maisVendidos = [...comVenda].sort((a, b) => b.analise.mediaMensal - a.analise.mediaMensal).slice(0, 15);
  const menosVendidos = [...comVenda].sort((a, b) => a.analise.mediaMensal - b.analise.mediaMensal).slice(0, 15);

  const porMarca = {};
  comVenda.forEach(d => {
    const chave = normalizarFornecedor(d.marca);
    if (!porMarca[chave]) porMarca[chave] = { marca: d.marca, totalMedia: 0, qtdProdutos: 0 };
    porMarca[chave].totalMedia += d.analise.mediaMensal;
    porMarca[chave].qtdProdutos++;
  });
  const marcasArray = Object.values(porMarca);
  const marcasMaisVendidas = [...marcasArray].sort((a, b) => b.totalMedia - a.totalMedia).slice(0, 10);
  const marcasMenosVendidas = [...marcasArray].sort((a, b) => a.totalMedia - b.totalMedia).slice(0, 10);

  // ---- Qtd. vendida por grupo/linha de produto (real) ----
  const porGrupoVenda = {};
  comVenda.forEach(d => { porGrupoVenda[d.grupo] = (porGrupoVenda[d.grupo] || 0) + d.analise.mediaMensal; });
  const gruposVendaOrdenados = Object.entries(porGrupoVenda).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // ---- Visão geral (cartões do topo) ----
  // Faturamento é uma ESTIMATIVA real (média mensal vendida × custo unitário
  // de cada produto) — os demais números dessa seção (meta, vendedor,
  // ticket médio) são fictícios, ver aviso na tela e comentário na
  // declaração de VENDEDORES_FICTICIOS lá em cima.
  const faturamentoEstimado = comVenda.reduce((s, d) => s + d.analise.mediaMensal * d.custo, 0);
  const metaFicticia = VENDEDORES_FICTICIOS.reduce((s, v) => s + v.meta, 0);
  const atingimentoMetaFicticio = metaFicticia > 0 ? (VENDEDORES_FICTICIOS.reduce((s, v) => s + v.faturamento, 0) / metaFicticia) * 100 : 0;
  const qtdVendidaFicticia = VENDEDORES_FICTICIOS.reduce((s, v) => s + v.qtd, 0);
  const ticketMedioFicticio = qtdVendidaFicticia > 0 ? VENDEDORES_FICTICIOS.reduce((s, v) => s + v.faturamento, 0) / qtdVendidaFicticia : 0;

  // ---- Relatório: itens mais vendidos de uma marca escolhida ----
  const todasMarcasComVenda = [...new Set(comVenda.map(d => d.marca))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const itensRelatorioMarca = marcaRelatorioVendas
    ? comVenda
        .filter(d => normalizarFornecedor(d.marca) === normalizarFornecedor(marcaRelatorioVendas))
        .sort((a, b) => b.analise.mediaMensal - a.analise.mediaMensal)
    : [];

  // Sem giro: tem estoque físico, mas média de venda zero (ou sem dado
  // nenhum de venda) — capital parado. Ordenado pelo valor parado, do
  // maior pro menor.
  const semGiro = dadosCompletos
    .filter(d => d.estoque > 0 && (!d.analise || !d.analise.mediaMensal || d.analise.mediaMensal === 0) && !(d.analise && d.analise.descontinuada))
    .sort((a, b) => b.valorEstoque - a.valorEstoque)
    .slice(0, 20);
  const valorTotalSemGiro = dadosCompletos
    .filter(d => d.estoque > 0 && (!d.analise || !d.analise.mediaMensal || d.analise.mediaMensal === 0) && !(d.analise && d.analise.descontinuada))
    .reduce((s, d) => s + d.valorEstoque, 0);
  const qtdSemGiro = dadosCompletos.filter(d => d.estoque > 0 && (!d.analise || !d.analise.mediaMensal || d.analise.mediaMensal === 0) && !(d.analise && d.analise.descontinuada)).length;

  const tabelaProdutos = (lista, colunaValor, attrNome) =>
    '<table class="' + (animarTabelasVendasAgora ? 'tabela-animada' : '') + '"><thead><tr><th>Produto</th><th>Marca</th><th class="num">' + colunaValor + '</th></tr></thead><tbody>' +
      (lista.map((d, i) => '<tr class="clickable" data-' + attrNome + '="' + i + '"><td>' + escapeHtml(d.produto) + '</td><td>' + escapeHtml(d.marca) + '</td><td class="num">' + d.analise.mediaMensal.toFixed(1) + ' un/mês</td></tr>').join('')
        || '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">Sem dados suficientes.</td></tr>') +
    '</tbody></table>';

  // Guarda os <canvas> dos gráficos de marca ANTES de reescrever o
  // innerHTML — mesmo motivo/mesma técnica da aba Estoque (ver comentário
  // lá): sem isso, o Chart.js nunca tem um estado anterior de onde animar.
  const canvasMarcasMaisAntigo = document.getElementById('marcas-mais-vendas-chart');
  const canvasMarcasMenosAntigo = document.getElementById('marcas-menos-vendas-chart');

  document.getElementById('app').innerHTML =
    barraAbas() +

    '<div class="vendas-bi-header">' +
      '<div class="marca-header"><span class="icone">' + icon('chartBar', 'icon-lg') + '</span><div><h1>Visão geral de vendas</h1><div class="sub">Baseado em ' + fmtNum(comVenda.length) + ' produtos com Média Mensal disponível, de ' + fmtNum(dadosCompletos.length) + ' no total</div></div></div>' +
      '<div class="vendas-bi-filtros">' +
        '<div class="vendas-bi-filtro-grupo"><span class="rotulo">Linha / Grupo de produto</span>' +
          '<select class="vendas-bi-select" id="select-grupo-vendas" aria-label="Filtrar por grupo de produto">' +
            '<option value="">Todos</option>' +
            todosGruposVenda.map(g => '<option value="' + escapeHtml(g) + '" ' + (g === filtroGrupoVendas ? 'selected' : '') + '>' + escapeHtml(g) + '</option>').join('') +
          '</select>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="vendas-ficticio-aviso">' + icon('warning', 'icon-sm') + ' <b>Meta, vendedor, ticket médio, % de meta, evolução por trimestre e ticket médio por ano são dados FICTÍCIOS</b> — a Sysemp ainda não tem um endpoint de vendas por vendedor/período. ' +
      'Assim que pedirmos e recebermos essa API, esses cartões passam a usar dado real. <b>Faturamento</b>, <b>marca líder</b> e <b>quantidade vendida por marca/grupo</b> abaixo já são reais.</div>' +

    '<div class="vendas-kpi-grid">' +
      '<div class="vendas-kpi-card gradiente-roxo">' +
        '<div class="icone-kpi">' + icon('wallet', 'icon-lg') + '</div>' +
        '<div class="corpo-kpi"><div class="label">Faturamento estimado</div>' +
        '<div class="valor">' + fmtMoeda(faturamentoEstimado) + '</div>' +
        '<div class="variacao">por mês, base custo unitário</div></div>' +
      '</div>' +
      '<div class="vendas-kpi-card gradiente-rosa">' +
        '<span class="selo-ficticio">fictício</span>' +
        '<div class="icone-kpi">' + icon('target', 'icon-lg') + '</div>' +
        '<div class="corpo-kpi"><div class="label">Atingimento de meta</div>' +
        '<div class="valor">' + atingimentoMetaFicticio.toFixed(1).replace('.', ',') + '%</div>' +
        '<div class="variacao">meta fictícia: ' + fmtMoeda(metaFicticia) + '</div></div>' +
      '</div>' +
      '<div class="vendas-kpi-card gradiente-verde">' +
        '<span class="selo-ficticio">fictício</span>' +
        '<div class="icone-kpi">' + icon('receipt', 'icon-lg') + '</div>' +
        '<div class="corpo-kpi"><div class="label">Ticket médio</div>' +
        '<div class="valor">' + fmtMoeda(ticketMedioFicticio) + '</div>' +
        '<div class="variacao">' + fmtNum(qtdVendidaFicticia) + ' vendas fictícias no mês</div></div>' +
      '</div>' +
      '<div class="vendas-kpi-card gradiente-azul">' +
        '<div class="icone-kpi">' + icon('trophy', 'icon-lg') + '</div>' +
        '<div class="corpo-kpi"><div class="label">Marca líder</div>' +
        '<div class="valor" style="font-size:17px;">' + (marcasMaisVendidas[0] ? escapeHtml(marcasMaisVendidas[0].marca) : '—') + '</div>' +
        '<div class="variacao">' + (marcasMaisVendidas[0] ? marcasMaisVendidas[0].totalMedia.toFixed(0) + ' un/mês (real)' : '') + '</div></div>' +
      '</div>' +
    '</div>' +

    '<div class="panels" style="margin-bottom:16px;">' +
      '<div class="vendas-bi-panel">' +
        '<h2>' + icon('trendUp', 'icon-sm') + ' Evolução de vendas <span class="selo-ficticio">fictício</span></h2>' +
        '<p class="hint">Faturamento por trimestre x meta — ilustrativo</p>' +
        '<div class="chart-box" style="height:230px;"><canvas id="vendas-evolucao-chart"></canvas></div>' +
      '</div>' +
      '<div class="vendas-bi-panel">' +
        '<h2>' + icon('calendar', 'icon-sm') + ' Ticket médio por ano <span class="selo-ficticio">fictício</span></h2>' +
        '<p class="hint">Ilustrativo — sem histórico de vendas por ano ainda</p>' +
        '<div class="chart-box" style="height:230px;"><canvas id="vendas-ticket-ano-chart"></canvas></div>' +
      '</div>' +
    '</div>' +

    '<div class="panels" style="margin-bottom:16px;align-items:start;">' +
      '<div class="vendas-bi-panel">' +
        '<h2>' + icon('trophy', 'icon-sm') + ' Ranking de vendedores <span class="selo-ficticio">fictício</span></h2>' +
        '<p class="hint">Dados de exemplo — aguardando API de vendas por vendedor da Sysemp</p>' +
        '<table class="tabela-ranking"><thead><tr><th></th><th>Vendedor</th><th class="num">Faturamento</th><th class="num">Qtd</th><th class="num">% Meta</th></tr></thead><tbody>' +
        VENDEDORES_FICTICIOS.map((v, i) => {
          const corRank = ['#FFB800', '#B8B8C0', '#C27A3F'][i] || 'var(--glass-border)';
          const rankBadge = '<span class="rank-badge" style="background:' + corRank + ';">' + (i + 1) + '</span>';
          const bateu = v.faturamento >= v.meta;
          return '<tr>' +
            '<td class="ranking-medalha">' + rankBadge + '</td>' +
            '<td><div class="ranking-nome-cel"><span class="ranking-avatar" style="background:' + v.cor + ';">' + v.iniciais + '</span>' + escapeHtml(v.nome) + '</div></td>' +
            '<td class="num">' + fmtMoeda(v.faturamento) + '</td>' +
            '<td class="num">' + fmtNum(v.qtd) + '</td>' +
            '<td class="num"><span class="meta-badge ' + (bateu ? 'bateu' : 'nao-bateu') + '">' + icon(bateu ? 'checkCircle' : 'xCircle', 'icon-sm') + ' ' + ((v.faturamento / v.meta) * 100).toFixed(1).replace('.', ',') + '%</span></td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:16px;">' +
        '<div class="vendas-bi-panel">' +
          '<h2>' + icon('users', 'icon-sm') + ' Ticket médio por supervisor <span class="selo-ficticio">fictício</span></h2>' +
          '<p class="hint">Dados de exemplo — aguardando API de vendas da Sysemp</p>' +
          SUPERVISORES_FICTICIOS.map((s, i) => {
            const cor = ['#7c3aed', '#059669', '#d97706', '#db2777'][i % 4];
            return '<div class="supervisor-linha">' +
              '<div><span class="dot" style="background:' + cor + ';"></span><span class="nome">' + escapeHtml(s.nome) + '</span><span class="time">' + escapeHtml(s.time) + '</span></div>' +
              '<div class="valor" style="background:' + cor + '22;color:' + cor + ';">' + fmtMoeda(s.ticketMedio) + '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="vendas-bi-panel">' +
          '<h2>' + icon('package', 'icon-sm') + ' Qtd. vendida por marca <span style="font-size:9px;font-weight:700;color:var(--vendas-real-badge);background:#05966915;padding:2px 7px;border-radius:999px;text-transform:uppercase;">real</span></h2>' +
          '<p class="hint">Top 8 marcas, em unidades/mês</p>' +
          '<div class="chart-box" style="height:190px;"><canvas id="vendas-qtd-marca-chart"></canvas></div>' +
        '</div>' +
        '<div class="vendas-bi-panel">' +
          '<h2>' + icon('folders', 'icon-sm') + ' Qtd. vendida por grupo <span style="font-size:9px;font-weight:700;color:var(--vendas-real-badge);background:#05966915;padding:2px 7px;border-radius:999px;text-transform:uppercase;">real</span></h2>' +
          '<p class="hint">Top 10 grupos/linhas de produto, em unidades/mês</p>' +
          '<div class="chart-box" style="height:220px;"><canvas id="vendas-qtd-grupo-chart"></canvas></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="panel" style="margin-bottom:16px;">' +
      '<h2>Itens mais vendidos por marca</h2>' +
      '<p class="hint">Selecione uma marca pra ver os itens dela ordenados por média mensal de venda.</p>' +
      '<div class="filters" style="margin-bottom:' + (marcaRelatorioVendas ? '14px' : '0') + ';">' +
        '<select id="select-marca-vendas" aria-label="Selecionar marca para o relatório">' +
          '<option value="">Selecione uma marca...</option>' +
          todasMarcasComVenda.map(m => '<option value="' + escapeHtml(m) + '" ' + (m === marcaRelatorioVendas ? 'selected' : '') + '>' + escapeHtml(m) + '</option>').join('') +
        '</select>' +
        (marcaRelatorioVendas ? '<button class="refresh-btn" id="baixar-csv-marca-vendas">' + icon('downloadSimple', 'icon-sm') + ' Baixar CSV</button>' : '') +
      '</div>' +
      (marcaRelatorioVendas ? (
        '<table class="' + (animarTabelasVendasAgora ? 'tabela-animada' : '') + '"><thead><tr><th>Produto</th><th>Curva</th><th class="num">Média mensal</th><th class="num">Estoque atual</th><th class="num">Valor em estoque</th></tr></thead><tbody>' +
          (itensRelatorioMarca.map((d, i) =>
            '<tr class="clickable" data-idx-relatorio-marca="' + i + '"><td>' + escapeHtml(d.produto) + '</td>' +
            '<td>' + escapeHtml(d.analise.curva || '—') + '</td>' +
            '<td class="num">' + d.analise.mediaMensal.toFixed(1) + ' un/mês</td>' +
            '<td class="num">' + fmtNum(d.estoque) + '</td>' +
            '<td class="num">' + (d.valorEstoque > 0 ? fmtMoeda(d.valorEstoque) : '—') + '</td></tr>'
          ).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Nenhum item com venda registrada para essa marca.</td></tr>') +
        '</tbody></table>'
      ) : '') +
    '</div>' +

    '<div class="panels">' +
      '<div class="panel"><h2>Produtos mais vendidos</h2><p class="hint">Top 15 por média mensal</p>' + tabelaProdutos(maisVendidos, 'Média mensal', 'idx-mais') + '</div>' +
      '<div class="panel"><h2>Produtos menos vendidos</h2><p class="hint">Top 15 com menor média (excluindo zero)</p>' + tabelaProdutos(menosVendidos, 'Média mensal', 'idx-menos') + '</div>' +
    '</div>' +

    '<div class="panels">' +
      '<div class="panel"><h2>Marcas mais vendidas</h2><p class="hint">Soma da média mensal de todos os produtos da marca — clique numa barra pra ver os itens</p>' +
        '<div class="chart-box chart-box-vendas"><canvas id="marcas-mais-vendas-chart"></canvas></div></div>' +
      '<div class="panel"><h2>Marcas menos vendidas</h2><p class="hint">Entre as que têm alguma venda registrada — clique numa barra pra ver os itens</p>' +
        '<div class="chart-box chart-box-vendas"><canvas id="marcas-menos-vendas-chart"></canvas></div></div>' +
    '</div>' +

    '<div class="panel">' +
      '<h2>' + icon('hourglass', 'icon-sm') + ' Produtos sem giro de estoque (' + fmtNum(qtdSemGiro) + ')</h2>' +
      '<p class="hint">Têm estoque físico mas média de venda zero — ' + fmtMoeda(valorTotalSemGiro) + ' de capital parado no total. Mostrando os 20 de maior valor.</p>' +
      '<table class="' + (animarTabelasVendasAgora ? 'tabela-animada' : '') + '"><thead><tr><th>Produto</th><th>Marca</th><th class="num">Estoque</th><th class="num">Valor parado</th></tr></thead><tbody>' +
        (semGiro.map((d, i) => '<tr class="clickable" data-idx-semgiro="' + i + '"><td>' + escapeHtml(d.produto) + '</td><td>' + escapeHtml(d.marca) + '</td><td class="num">' + fmtNum(d.estoque) + '</td><td class="num">' + fmtMoeda(d.valorEstoque) + '</td></tr>').join('')
          || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Nenhum produto parado encontrado.</td></tr>') +
      '</tbody></table>' +
    '</div>' +

    '<footer>SYSEMP → GOOGLE SHEETS → PAINEL · atualização automática a cada ' + Math.round(AUTO_REFRESH_MS / 60000) + ' min</footer>';

  // Devolve os <canvas> antigos (com a instância do Chart.js ainda viva) no
  // lugar dos novos placeholders — mesma técnica usada no donut da aba
  // Estoque (ver comentário detalhado na captura de canvasDonutAntigo),
  // permite usar chart.update() e ter uma animação de verdade.
  if (canvasMarcasMaisAntigo) document.getElementById('marcas-mais-vendas-chart').replaceWith(canvasMarcasMaisAntigo);
  if (canvasMarcasMenosAntigo) document.getElementById('marcas-menos-vendas-chart').replaceWith(canvasMarcasMenosAntigo);

  const animarMarcasVendasAgora = animarMarcasVendasNoProximoRender;
  animarMarcasVendasNoProximoRender = false;
  // Mesmo gate de motion reduzido do donut — é animação de biblioteca, o
  // @media do CSS não alcança. Duração igual à do donut (420ms): dois
  // gráficos do mesmo painel entrando em ritmos diferentes (1400 vs 420)
  // lia como inconsistência, não como intenção.
  const marcasVendasAnimConfig = (animarMarcasVendasAgora && !motionReduzido()) ? { duration: 420, easing: 'easeOutQuart' } : false;

  // ---- gráfico: marcas mais vendidas ----
  const labelsMarcasMais = marcasMaisVendidas.map(m => m.marca);
  const valoresMarcasMais = marcasMaisVendidas.map(m => m.totalMedia);
  const bgMarcasMais = marcasMaisVendidas.map(m => normalizarFornecedor(m.marca) === normalizarFornecedor(marcaRelatorioVendas) ? GOLD_BRIGHT_COLOR : GOLD_COLOR);
  if (marcasMaisVendasChartInstance && marcasMaisVendasChartInstance.canvas.isConnected) {
    marcasMaisVendasChartInstance.data.labels = labelsMarcasMais;
    marcasMaisVendasChartInstance.data.datasets[0].data = valoresMarcasMais;
    marcasMaisVendasChartInstance.data.datasets[0].backgroundColor = bgMarcasMais;
    marcasMaisVendasChartInstance.options.animation = marcasVendasAnimConfig;
    marcasMaisVendasChartInstance.update();
  } else {
    if (marcasMaisVendasChartInstance) marcasMaisVendasChartInstance.destroy();
    marcasMaisVendasChartInstance = new Chart(document.getElementById('marcas-mais-vendas-chart'), {
      type: 'bar',
      data: { labels: labelsMarcasMais, datasets: [{ data: valoresMarcasMais, backgroundColor: bgMarcasMais, borderRadius: 4, maxBarThickness: 20 }] },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        animation: marcasVendasAnimConfig,
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const marca = marcasMaisVendasChartInstance.data.labels[elements[0].index];
          marcaRelatorioVendas = normalizarFornecedor(marcaRelatorioVendas) === normalizarFornecedor(marca) ? '' : marca;
          animarMarcasVendasNoProximoRender = true;
          renderizar();
        },
        onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, CHART_TOOLTIP_STYLE, { callbacks: { label: ctx => ctx.parsed.x.toFixed(1) + ' un/mês' } }),
        },
        scales: {
          x: { ticks: { color: '#8A8A8A' }, grid: { color: '#26262c' } },
          y: { ticks: { color: '#D4D4D4', font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  // ---- gráfico: marcas menos vendidas ----
  const labelsMarcasMenos = marcasMenosVendidas.map(m => m.marca);
  const valoresMarcasMenos = marcasMenosVendidas.map(m => m.totalMedia);
  const bgMarcasMenos = marcasMenosVendidas.map(m => normalizarFornecedor(m.marca) === normalizarFornecedor(marcaRelatorioVendas) ? COLOR_BLUE_VENDAS_ATIVA : COLOR_BLUE_VENDAS);
  if (marcasMenosVendasChartInstance && marcasMenosVendasChartInstance.canvas.isConnected) {
    marcasMenosVendasChartInstance.data.labels = labelsMarcasMenos;
    marcasMenosVendasChartInstance.data.datasets[0].data = valoresMarcasMenos;
    marcasMenosVendasChartInstance.data.datasets[0].backgroundColor = bgMarcasMenos;
    marcasMenosVendasChartInstance.options.animation = marcasVendasAnimConfig;
    marcasMenosVendasChartInstance.update();
  } else {
    if (marcasMenosVendasChartInstance) marcasMenosVendasChartInstance.destroy();
    marcasMenosVendasChartInstance = new Chart(document.getElementById('marcas-menos-vendas-chart'), {
      type: 'bar',
      data: { labels: labelsMarcasMenos, datasets: [{ data: valoresMarcasMenos, backgroundColor: bgMarcasMenos, borderRadius: 4, maxBarThickness: 20 }] },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        animation: marcasVendasAnimConfig,
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const marca = marcasMenosVendasChartInstance.data.labels[elements[0].index];
          marcaRelatorioVendas = normalizarFornecedor(marcaRelatorioVendas) === normalizarFornecedor(marca) ? '' : marca;
          animarMarcasVendasNoProximoRender = true;
          renderizar();
        },
        onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, CHART_TOOLTIP_STYLE, { callbacks: { label: ctx => ctx.parsed.x.toFixed(1) + ' un/mês' } }),
        },
        scales: {
          x: { ticks: { color: '#8A8A8A' }, grid: { color: '#26262c' } },
          y: { ticks: { color: '#D4D4D4', font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  // Os cartões dessa seção (vendas-bi-panel) são claros de propósito (ver
  // comentário no CSS), então os gráficos aqui usam cores escuras pro texto
  // (eixos/legenda), diferente do resto do app que é sempre texto claro
  // sobre fundo escuro.
  const CHART_TOOLTIP_STYLE_CLARO = { backgroundColor: '#1f2937', borderColor: '#374151', borderWidth: 1, cornerRadius: 8, titleColor: '#f9fafb', bodyColor: '#f9fafb', padding: 10, displayColors: false };

  // ---- donut: qtd. vendida por marca (real, top 8) — nunca anima, sem
  // interação de clique, então destruir e recriar direto é seguro e simples
  // (não precisa da técnica de preservar canvas usada nos outros gráficos).
  if (vendasQtdMarcaChartInstance) vendasQtdMarcaChartInstance.destroy();
  const top8MarcasQtd = marcasMaisVendidas.slice(0, 8);
  const paletaQtdMarca = ['#7c3aed', '#db2777', '#059669', '#2563eb', '#d97706', '#e11d48', '#0d9488', '#4338ca'];
  const canvasQtdMarca = document.getElementById('vendas-qtd-marca-chart');
  if (canvasQtdMarca) {
    vendasQtdMarcaChartInstance = new Chart(canvasQtdMarca, {
      type: 'doughnut',
      data: {
        labels: top8MarcasQtd.map(m => m.marca),
        datasets: [{ data: top8MarcasQtd.map(m => m.totalMedia), backgroundColor: paletaQtdMarca, borderWidth: 0 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '58%',
        animation: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#4b5563', boxWidth: 10, font: { size: 10 }, padding: 8 } },
          tooltip: Object.assign({}, CHART_TOOLTIP_STYLE_CLARO, { callbacks: { label: ctx => ctx.label + ': ' + ctx.parsed.toFixed(0) + ' un/mês' } }),
        },
      },
    });
  }

  // ---- barra horizontal: qtd. vendida por grupo/linha de produto (real) ----
  if (vendasQtdGrupoChartInstance) vendasQtdGrupoChartInstance.destroy();
  const canvasQtdGrupo = document.getElementById('vendas-qtd-grupo-chart');
  if (canvasQtdGrupo) {
    vendasQtdGrupoChartInstance = new Chart(canvasQtdGrupo, {
      type: 'bar',
      data: {
        labels: gruposVendaOrdenados.map(([g]) => g),
        datasets: [{ data: gruposVendaOrdenados.map(([, v]) => v), backgroundColor: '#2563eb', borderRadius: 4, maxBarThickness: 16 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, CHART_TOOLTIP_STYLE_CLARO, { callbacks: { label: ctx => ctx.parsed.x.toFixed(0) + ' un/mês' } }),
        },
        scales: {
          x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#374151', font: { size: 10.5 } }, grid: { display: false } },
        },
      },
    });
  }

  // ---- evolução de vendas (fictício): barras de faturamento + linha de meta ----
  if (vendasEvolucaoChartInstance) vendasEvolucaoChartInstance.destroy();
  const canvasEvolucao = document.getElementById('vendas-evolucao-chart');
  if (canvasEvolucao) {
    const fatoresTrimestre = [0.88, 0.97, 1.04, 1.11];
    const faturamentoPorTrimestre = fatoresTrimestre.map(f => faturamentoEstimado * f);
    const metaPorTrimestre = faturamentoPorTrimestre.map(() => faturamentoEstimado * 1.03);
    vendasEvolucaoChartInstance = new Chart(canvasEvolucao, {
      type: 'bar',
      data: {
        labels: ['Trim 1', 'Trim 2', 'Trim 3', 'Trim 4'],
        datasets: [
          { type: 'bar', label: 'Faturamento', data: faturamentoPorTrimestre, backgroundColor: '#7c3aed', borderRadius: 4, maxBarThickness: 40 },
          { type: 'line', label: 'Meta', data: metaPorTrimestre, borderColor: '#e11d48', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, tension: 0 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { position: 'top', align: 'end', labels: { color: '#4b5563', boxWidth: 10, font: { size: 10.5 }, usePointStyle: true } },
          tooltip: Object.assign({}, CHART_TOOLTIP_STYLE_CLARO, { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmtMoedaCompacta(ctx.parsed.y) } }),
        },
        scales: {
          x: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: '#6b7280', font: { size: 10 }, callback: v => fmtMoedaCompacta(v) }, grid: { color: '#f1f5f9' } },
        },
      },
    });
  }

  // ---- ticket médio por ano (fictício) ----
  if (vendasTicketAnoChartInstance) vendasTicketAnoChartInstance.destroy();
  const canvasTicketAno = document.getElementById('vendas-ticket-ano-chart');
  if (canvasTicketAno) {
    const anosFicticios = ['2024', '2025', '2026'];
    const ticketsPorAno = [ticketMedioFicticio * 0.94, ticketMedioFicticio * 0.98, ticketMedioFicticio];
    vendasTicketAnoChartInstance = new Chart(canvasTicketAno, {
      type: 'bar',
      data: { labels: anosFicticios, datasets: [{ data: ticketsPorAno, backgroundColor: '#059669', borderRadius: 6, maxBarThickness: 60 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, CHART_TOOLTIP_STYLE_CLARO, { callbacks: { label: ctx => fmtMoeda(ctx.parsed.y) } }),
        },
        scales: {
          x: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: '#6b7280', font: { size: 10 }, callback: v => fmtMoedaCompacta(v) }, grid: { color: '#f1f5f9' } },
        },
      },
    });
  }

  const selectGrupoVendas = document.getElementById('select-grupo-vendas');
  if (selectGrupoVendas) selectGrupoVendas.addEventListener('change', e => { filtroGrupoVendas = e.target.value; animarTabelasVendasNoProximoRender = true; renderizar(); });

  const abaEstoqueEl2 = document.getElementById('aba-estoque');
  if (abaEstoqueEl2) abaEstoqueEl2.addEventListener('click', () => { abaSelecionada = 'estoque'; fecharNavSidebar(); renderizar(); });
  const abaVendasEl2 = document.getElementById('aba-vendas');
  if (abaVendasEl2) abaVendasEl2.addEventListener('click', () => { abaSelecionada = 'vendas'; fecharNavSidebar(); renderizar(); });

  const selectMarcaVendas = document.getElementById('select-marca-vendas');
  if (selectMarcaVendas) selectMarcaVendas.addEventListener('change', e => { marcaRelatorioVendas = e.target.value; animarTabelasVendasNoProximoRender = true; renderizar(); });
  document.querySelectorAll('tbody tr.clickable[data-idx-relatorio-marca]').forEach(tr => tr.addEventListener('click', () => {
    const item = itensRelatorioMarca[parseInt(tr.dataset.idxRelatorioMarca, 10)];
    if (item) abrirDetalheProduto(item);
  }));
  const baixarCsvMarcaBtn = document.getElementById('baixar-csv-marca-vendas');
  if (baixarCsvMarcaBtn) baixarCsvMarcaBtn.addEventListener('click', () => {
    const linhas = itensRelatorioMarca.map(d => [
      d.produto, d.marca, d.analise.curva || '',
      d.analise.mediaMensal.toFixed(1).replace('.', ','),
      d.estoque,
      d.valorEstoque.toFixed(2).replace('.', ','),
    ]);
    const nomeArquivo = 'itens_mais_vendidos_' + normalizarFornecedor(marcaRelatorioVendas).replace(/\s+/g, '_') + '.csv';
    baixarCSV(nomeArquivo,
      ['Produto', 'Marca', 'Curva ABC', 'Média mensal (un)', 'Estoque atual', 'Valor em estoque (R$)'],
      linhas);
  });

  document.querySelectorAll('tbody tr.clickable[data-idx-mais]').forEach(tr => tr.addEventListener('click', () => {
    const item = maisVendidos[parseInt(tr.dataset.idxMais, 10)];
    if (item) abrirDetalheProduto(item);
  }));
  document.querySelectorAll('tbody tr.clickable[data-idx-menos]').forEach(tr => tr.addEventListener('click', () => {
    const item = menosVendidos[parseInt(tr.dataset.idxMenos, 10)];
    if (item) abrirDetalheProduto(item);
  }));
  document.querySelectorAll('tbody tr.clickable[data-idx-semgiro]').forEach(tr => tr.addEventListener('click', () => {
    const item = semGiro[parseInt(tr.dataset.idxSemgiro, 10)];
    if (item) abrirDetalheProduto(item);
  }));

  tornarClicaveisAcessiveis(document.getElementById('app'));
}

function barraAbas() {
  document.getElementById('nav-sidebar-body').innerHTML =
    '<button class="nav-item' + (abaSelecionada === 'estoque' ? ' active' : '') + '" id="aba-estoque">' + icon('package', 'icon-md') + '<span>Estoque</span></button>' +
    '<button class="nav-item' + (abaSelecionada === 'vendas' ? ' active' : '') + '" id="aba-vendas">' + icon('chartBar', 'icon-md') + '<span>Vendas</span></button>';
  return '';
}

// Medalha (ouro/prata/bronze) só faz sentido visual pras 3 primeiras
// posições — do 4º em diante mostra a posição numérica mesmo, sem medalha.
const MEDALHA_CORES = { 1: ['#FFD700', '#B8860B'], 2: ['#E8E8E8', '#9A9A9A'], 3: ['#CD7F32', '#8B5A2B'] };

// Ranking "Valor em estoque por marca" — lista de barras de progresso em
// HTML/CSS (não Chart.js): cada linha mostra posição, nome, valor em R$ e
// % do total sempre visíveis, sem precisar de hover. Lê as mesmas variáveis
// de estado que o resto de renderizar() usa (marcasOrdenadas, filtroMarca,
// etc.) — chamada de dentro do template principal, então precisa vir
// depois delas serem calculadas (ver ordem em renderizar()).
// Clicar numa linha abre um modal (abrirDetalheMarca, mesmo padrão do
// modal de produto) com a barra tombando lá dentro — a lista em si não
// muda de layout nem esconde outras linhas.
function montarRankingMarcas(marcasOrdenadas, todasMarcasOrdenadas, totalGeral, filtroMarca, animarAgora) {
  if (!marcasOrdenadas.length) {
    return '<p class="hint">Nenhuma marca encontrada com os filtros atuais.</p>';
  }
  // Barra de cada linha é sempre 100% do trilho — não representa mais
  // proporção do valor (isso já está no texto: R$ e %). Vira um elemento
  // puramente decorativo/identidade de cor da marca, uniforme entre as 10.
  //
  // Cor e posição (#N) usam o índice REAL da marca em todasMarcasOrdenadas,
  // não o índice dentro de marcasOrdenadas — quando uma marca está
  // filtrada (filtroMarca ativo), marcasOrdenadas contém só ela, então seu
  // índice local sempre seria 0. Usar esse índice local pra cor/posição
  // fazia toda marca filtrada aparecer como "#1" e com a cor da 1ª posição
  // (dourado) — era esse o bug de "todas as barras ficam amarelas".
  return '<div class="marca-ranking' + (animarAgora ? ' anima-entrada' : '') + '">' +
    marcasOrdenadas.map(([marca, valor]) => {
      const posicaoReal = todasMarcasOrdenadas.findIndex(([m]) => m === marca);
      const cor = corMarca(posicaoReal);
      const pctDoTotal = totalGeral > 0 ? (valor / totalGeral) * 100 : 0;
      return '<button class="marca-rank-row" data-marca="' + escapeHtml(marca) + '">' +
        '<div class="marca-rank-top">' +
          '<div class="marca-rank-nome"><span class="marca-rank-pos">#' + (posicaoReal + 1) + '</span>' +
            '<span class="marca-rank-label" title="' + escapeHtml(marca) + '">' + escapeHtml(marca) + '</span></div>' +
          '<div class="marca-rank-nums"><span class="marca-rank-valor">' + fmtMoedaCompacta(valor) + '</span>' +
            '<span class="marca-rank-pct">' + pctDoTotal.toFixed(1) + '%</span></div>' +
        '</div>' +
        '<div class="marca-rank-track"><div class="marca-rank-fill" style="background:' + cor + ';"></div></div>' +
      '</button>';
    }).join('') +
  '</div>';
}

function renderizar() {
  if (abaSelecionada === 'vendas') { renderizarAbaVendas(); return; }
  if (diaRotinaSelecionado === null) diaRotinaSelecionado = diaSemanaAtual() || 'SEG';

  let dados = dadosCompletos.filter(d =>
    (!filtroGrupo || d.grupo === filtroGrupo) &&
    (!filtroSituacao || d.situacao === filtroSituacao) &&
    (!buscaTexto || d.produto.toLowerCase().includes(buscaTexto.toLowerCase())) &&
    (!filtroMarca || d.marca.trim().toLowerCase() === filtroMarca.trim().toLowerCase())
  );

  const totalSkus = dados.length;
  const valorTotal = dados.reduce((s, d) => s + d.valorEstoque, 0);
  const ruptura = dados.filter(d => d.situacao === 'RUPTURA').length;
  const baixo = dados.filter(d => d.situacao === 'BAIXO').length;
  const excesso = dados.filter(d => d.situacao === 'EXCESSO').length;
  const valorRepor = dados.reduce((s, d) => s + d.valorRepor, 0);

  const porMarca = {};
  // Não filtramos pela própria marca aqui — calculamos o valor de TODAS as
  // marcas primeiro (pra achar a posição/valor certo mesmo se a marca
  // escolhida não estiver no top 10) e só isolamos ela depois, na hora de
  // montar marcasOrdenadas.
  const dadosParaBarra = dadosCompletos.filter(d =>
    (!filtroGrupo || d.grupo === filtroGrupo) &&
    (!filtroSituacao || d.situacao === filtroSituacao) &&
    (!buscaTexto || d.produto.toLowerCase().includes(buscaTexto.toLowerCase()))
  );
  dadosParaBarra.forEach(d => { porMarca[d.marca] = (porMarca[d.marca] || 0) + d.valorEstoque; });
  const todasMarcasOrdenadas = Object.entries(porMarca).sort((a, b) => b[1] - a[1]);
  // Total de TODAS as marcas (não só o top 10 exibido) — é essa a base
  // usada pro % de cada linha, senão as porcentagens não somariam 100%
  // dentro da leitura do gráfico com marcas fora do top 10.
  const totalGeralMarcas = todasMarcasOrdenadas.reduce((s, [, v]) => s + v, 0);
  // Sempre as 10 marcas — mesmo com filtroMarca ativo. O detalhe da marca
  // filtrada aparece no modal (abrirDetalheMarca), não substituindo a
  // lista, então ela não precisa mais ser isolada aqui.
  const marcasOrdenadas = todasMarcasOrdenadas.slice(0, 10);
  // Consumo único da flag: só anima em cascata se a renderização foi
  // disparada por um clique real (mesma convenção do donut/gráficos).
  const animarBarraAgora = animarBarraNoProximoRender;
  animarBarraNoProximoRender = false;
  const animarRotinaAgora = animarRotinaNoProximoRender;
  animarRotinaNoProximoRender = false;

  // Mesma lógica para o donut de situação: ignora o próprio filtroSituacao,
  // pra continuar mostrando todas as fatias mesmo com uma selecionada.
  const dadosParaDonut = dadosCompletos.filter(d =>
    (!filtroGrupo || d.grupo === filtroGrupo) &&
    (!buscaTexto || d.produto.toLowerCase().includes(buscaTexto.toLowerCase())) &&
    (!filtroMarca || d.marca.trim().toLowerCase() === filtroMarca.trim().toLowerCase())
  );
  const situacaoCount = {
    RUPTURA: dadosParaDonut.filter(d => d.situacao === 'RUPTURA').length,
    BAIXO: dadosParaDonut.filter(d => d.situacao === 'BAIXO').length,
    EXCESSO: dadosParaDonut.filter(d => d.situacao === 'EXCESSO').length,
    OK: dadosParaDonut.filter(d => d.situacao === 'OK').length,
  };

  const todosGrupos = [...new Set(dadosCompletos.map(d => d.grupo))].sort();

  // Quando o usuário está buscando ou filtrando ativamente, mostramos
  // QUALQUER item que bata (inclusive OK/Excesso) e com limite maior.
  // Na visão padrão (sem busca/filtro), continua mostrando só os
  // itens críticos (que precisam de reposição), como uma lista curada.
  const buscaAtiva = !!(buscaTexto || filtroGrupo || filtroSituacao || filtroMarca);
  let listaTabela = [...dados].filter(d => buscaAtiva || d.valorRepor > 0 || ordemCol !== 'valorRepor');
  listaTabela.sort((a, b) => {
    const va = a[ordemCol], vb = b[ordemCol];
    if (typeof va === 'string') return va.localeCompare(vb) * ordemDir;
    return (va - vb) * ordemDir;
  });
  const limiteTabela = buscaAtiva ? 200 : 20;
  const totalEncontrado = listaTabela.length;
  listaTabela = listaTabela.slice(0, limiteTabela);


  // Troca o critério de "valor a repor > 0" por "situação é zerado ou
  // baixo" — um item com Mínimo cadastrado como 0 no Sysemp fica com
  // valor a repor R$0 mesmo estando zerado de verdade, e antes ficava
  // invisível aqui mesmo contando no card da Rotina.
  // TAMBÉM entra na lista se a sugestão de compra AO VIVO (média real de
  // venda × lead time da marca) for maior que zero, mesmo com situação
  // OK/EXCESSO — o mínimo/máximo parametrizado no Sysemp fica desatualizado
  // em itens de giro alto (ex. vendendo 2.700un/mês com mínimo de 56un),
  // e sem isso o item nunca aparecia na lista nem saía no CSV do pedido,
  // apesar de precisar de compra de verdade.
  const precisaReporAoVivo = d => {
    if (d.situacao === 'RUPTURA' || d.situacao === 'BAIXO') return true;
    if (d.vendasAoVivoLote) {
      return calcularSugestaoSemPlanilha(d, d.vendasAoVivoLote.mediaMensal) > 0;
    }
    return false;
  };
  // Lista COMPLETA (sem filtro de busca) — usada pro botão "Gerar pedido"
  // e pro total de "em pedido aberto", que precisam considerar tudo.
  const itensDaMarcaExpandida = marcaExpandidaTabela
    ? dados.filter(d => d.marca === marcaExpandidaTabela && precisaReporAoVivo(d)).sort((a, b) => b.valorRepor - a.valorRepor)
    : [];
  // Lista filtrada pela busca da seção — só pra EXIBIÇÃO na tabela.
  const itensDaMarcaExibidos = buscaItensCriticosTexto
    ? itensDaMarcaExpandida.filter(d => d.produto.toLowerCase().includes(buscaItensCriticosTexto.toLowerCase()))
    : itensDaMarcaExpandida;
  // sem limite — mostra todas as marcas que precisam de reposição

  // Segunda seção: itens da mesma marca que NÃO precisam de compra
  // (estoque normal ou em excesso, e sem sugestão AO VIVO) — só
  // informativo, sem ação sugerida.
  const itensNormaisDaMarcaCompleto = marcaExpandidaTabela
    ? dados.filter(d => d.marca === marcaExpandidaTabela && (d.situacao === 'OK' || d.situacao === 'EXCESSO') && !precisaReporAoVivo(d)).sort((a, b) => b.valorEstoque - a.valorEstoque)
    : [];
  const itensNormaisDaMarca = buscaItensNormaisTexto
    ? itensNormaisDaMarcaCompleto.filter(d => d.produto.toLowerCase().includes(buscaItensNormaisTexto.toLowerCase()))
    : itensNormaisDaMarcaCompleto;

  // ---- Rotina de Compras: quem revisar no dia selecionado ----
  const NOMES_DIA = { SEG: 'Segunda-feira', TER: 'Terça-feira', QUA: 'Quarta-feira', QUI: 'Quinta-feira', SEX: 'Sexta-feira' };
  const diaHojeReal = diaSemanaAtual();
  const diaSelecionadoLabel = NOMES_DIA[diaRotinaSelecionado];
  const porMarcaCompleto = {};
  dadosCompletos.forEach(d => {
    const chave = normalizarFornecedor(d.marca);
    if (!porMarcaCompleto[chave]) porMarcaCompleto[chave] = { marcaOriginal: d.marca, qtdRuptura: 0, qtdBaixo: 0, valorRepor: 0 };
    const m = porMarcaCompleto[chave];
    if (d.situacao === 'RUPTURA') m.qtdRuptura++;
    if (d.situacao === 'BAIXO') m.qtdBaixo++;
    m.valorRepor += d.valorRepor;
  });
  let rotinaHoje = calcularFornecedoresPorDia(diaRotinaSelecionado).map(r => {
    const chave = normalizarFornecedor(r.f);
    const encontrado = porMarcaCompleto[chave];
    return {
      fornecedor: r.f, tipo: r.t,
      marcaOriginal: encontrado ? encontrado.marcaOriginal : null,
      qtdRuptura: encontrado ? encontrado.qtdRuptura : 0,
      qtdBaixo: encontrado ? encontrado.qtdBaixo : 0,
      valorRepor: encontrado ? encontrado.valorRepor : 0,
      encontrado: !!encontrado,
    };
  });
  rotinaHoje.sort((a, b) => (b.qtdRuptura - a.qtdRuptura) || (b.qtdBaixo - a.qtdBaixo) || (b.valorRepor - a.valorRepor));

  // ---- Marcas com compra urgente: estoque vai acabar ANTES do lead
  // time — ou seja, mesmo comprando hoje, vai faltar produto no meio do
  // caminho. Só considera produtos que batem com a planilha de análise
  // (é o único lugar com Venda Média Dia e Lead Time disponíveis pra
  const todasMarcas = [...new Set(dadosCompletos.map(d => d.marca).filter(Boolean))].sort();
  const sugestoesMarca = buscaMarcaTexto
    ? todasMarcas.filter(m => m.toLowerCase().includes(buscaMarcaTexto.toLowerCase())).slice(0, 8)
    : todasMarcas.slice(0, 8);

  // Guarda o <canvas> do donut ANTES de reescrever o innerHTML (que o
  // destrói) — assim conseguimos devolvê-lo pro DOM depois e usar
  // chart.update() em vez de destruir/recriar a instância. Sem isso, o
  // Chart.js trata toda renderização como "primeira vez" e não tem um
  // estado anterior pra fazer a transição (a fatia só troca na hora, sem
  // animar), mesmo com a duração/easing configurados certinho.
  // O gráfico de "Valor em estoque por marca" não usa mais Chart.js (virou
  // uma lista HTML/CSS de barras de progresso), então não precisa mais
  // dessa preservação — só o donut ainda é canvas.
  const canvasDonutAntigo = document.getElementById('donut-chart');

  document.getElementById('app').innerHTML =
    barraAbas() +
    '<div class="filters">' +
      '<select id="filtro-grupo" aria-label="Filtrar por grupo"><option value="">Todos os grupos</option>' +
        todosGrupos.map(g => '<option value="' + escapeHtml(g) + '" ' + (g === filtroGrupo ? 'selected' : '') + '>' + escapeHtml(g) + '</option>').join('') +
      '</select>' +
      '<div class="autocomplete-wrap">' +
        '<input type="search" id="busca-marca" placeholder="Marca..." aria-label="Buscar marca" autocomplete="off" value="' + escapeHtml(filtroMarca || buscaMarcaTexto) + '">' +
        (mostrarSugestoesMarca ? (
          '<div class="autocomplete-list" id="lista-sugestoes-marca">' +
            (sugestoesMarca.length
              ? sugestoesMarca.map(m => '<div class="autocomplete-item" data-marca="' + escapeHtml(m) + '">' + escapeHtml(m) + '</div>').join('')
              : '<div class="autocomplete-empty">Nenhuma marca encontrada</div>') +
          '</div>'
        ) : '') +
      '</div>' +
      '<input type="search" id="busca" placeholder="Buscar produto..." aria-label="Buscar produto" value="' + escapeHtml(buscaTexto) + '">' +
      ['RUPTURA', 'BAIXO', 'EXCESSO', 'OK'].map(s => '<span class="chip ' + (filtroSituacao === s ? 'active' : '') + '" data-sit="' + s + '">' + situacaoLabel(s) + '</span>').join('') +
      ((filtroGrupo || filtroSituacao || buscaTexto || filtroMarca) ? '<span class="clear-link" id="clear-filters">limpar filtros</span>' : '') +
      '<button class="refresh-btn" id="exportar-zerados-btn" style="margin-left:auto;">' + icon('downloadSimple', 'icon-sm') + ' Exportar zerados (Excel)</button>' +
    '</div>' +

    '<div class="kpi-grid">' +
      '<div class="kpi-card hero"><div class="label">Total de SKUs</div><div class="value" id="kpi-total">0</div></div>' +
      '<div class="kpi-card accent-gold"><div class="label">Valor em estoque</div><div class="value" id="kpi-valor" title="' + fmtMoeda(valorTotal) + '">R$ 0</div></div>' +
      '<div class="kpi-card accent-red clickable' + (filtroSituacao === 'RUPTURA' ? ' active' : '') + '" data-sit="RUPTURA"><div class="label">Estoque zerado</div><div class="value" id="kpi-ruptura">0</div></div>' +
      '<div class="kpi-card accent-amber clickable' + (filtroSituacao === 'BAIXO' ? ' active' : '') + '" data-sit="BAIXO"><div class="label">Abaixo do mínimo</div><div class="value" id="kpi-baixo">0</div></div>' +
      '<div class="kpi-card accent-blue clickable' + (filtroSituacao === 'EXCESSO' ? ' active' : '') + '" data-sit="EXCESSO"><div class="label">Excesso</div><div class="value" id="kpi-excesso">0</div></div>' +
      '<div class="kpi-card hero"><div class="label">Valor p/ repor mínimos</div><div class="value" id="kpi-repor" title="' + fmtMoeda(valorRepor) + '">R$ 0</div></div>' +
    '</div>' +

    '<div class="panel" style="margin-bottom:16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
        '<h2 style="margin:0;">' + icon('calendarCheck', 'icon-sm') + 'Rotina de Compras — ' + diaSelecionadoLabel + (diaRotinaSelecionado === diaHojeReal ? ' (hoje)' : '') + '</h2>' +
        '<div style="display:flex;gap:6px;">' +
          ['SEG', 'TER', 'QUA', 'QUI', 'SEX'].map(d =>
            '<span class="chip' + (d === diaRotinaSelecionado ? ' active' : '') + '" data-dia-rotina="' + d + '" style="position:relative;">' + d +
              (d === diaHojeReal ? '<span style="position:absolute;top:-3px;right:-3px;width:6px;height:6px;border-radius:50%;background:' + donutColors.OK + ';"></span>' : '') +
            '</span>'
          ).join('') +
        '</div>' +
      '</div>' +
      '<p class="hint" style="margin-top:10px;">' + (rotinaHoje.length ? fmtNum(rotinaHoje.length) + ' fornecedor(es) programado(s) · clique num cartão pra ver os itens' : 'Nenhum fornecedor programado pra ' + diaSelecionadoLabel.toLowerCase() + ' na rotina.') + '</p>' +
      (rotinaHoje.length ? (
        '<div class="rotina-grid' + (animarRotinaAgora ? ' rotina-grid-animada' : '') + '">' +
          rotinaHoje.map(r => {
            const temPendencia = r.encontrado && (r.qtdRuptura > 0 || r.qtdBaixo > 0);
            const cor = r.qtdRuptura > 0 ? donutColors.RUPTURA : (r.qtdBaixo > 0 ? donutColors.BAIXO : 'transparent');
            const tipoLabel = { SEMANAL: 'Semanal', QUINZENAL: 'Quinzenal', MENSAL: 'Mensal' }[r.tipo];
            let statusHtml;
            if (!r.encontrado) {
              statusHtml = '<span class="rotina-status-nao-encontrado">não encontrado</span>';
            } else if (r.qtdRuptura > 0) {
              statusHtml = '<span class="badge badge-ruptura">' + fmtNum(r.qtdRuptura) + ' zerado' + (r.qtdRuptura > 1 ? 's' : '') + '</span>';
            } else if (r.qtdBaixo > 0) {
              statusHtml = '<span class="badge badge-baixo">' + fmtNum(r.qtdBaixo) + ' baixo' + (r.qtdBaixo > 1 ? 's' : '') + '</span>';
            } else {
              statusHtml = '<span class="badge badge-ok">em dia</span>';
            }
            return '<div class="rotina-card' + (temPendencia ? ' clickable' : '') + '" ' +
              (temPendencia ? 'data-rotina-marca="' + escapeHtml(r.marcaOriginal) + '"' : '') +
              ' style="border-left-color:' + cor + ';">' +
                '<div class="rc-nome">' + escapeHtml(r.fornecedor) + '</div>' +
                '<div class="rc-rodape"><span class="rotina-tipo">' + tipoLabel + '</span>' + statusHtml + '</div>' +
            '</div>';
          }).join('') +
        '</div>'
      ) : '') +
    '</div>' +

    '<div class="panels">' +
      '<div class="panel" id="painel-ranking-marcas"><h2>Valor em estoque por marca</h2><p class="hint">Clique numa marca para filtrar a tabela abaixo</p>' +
        montarRankingMarcas(marcasOrdenadas, todasMarcasOrdenadas, totalGeralMarcas, filtroMarca, animarBarraAgora) +
      '</div>' +
      '<div class="panel"><h2>SKUs por situação</h2><p class="hint">Clique numa fatia ou na legenda para filtrar</p>' +
        '<div class="donut-wrap"><div class="donut-glow" id="donut-glow"></div><div class="donut-ring-wrap"><canvas id="donut-chart"></canvas>' +
        '<div class="donut-center"><div class="l">Total de SKUs</div><div class="n" id="donut-center-n">0</div></div></div>' +
        '<div class="legend" id="donut-legend"></div></div></div>' +
    '</div>' +

    (buscaAtiva && !marcaExpandidaTabela ?
      '<div class="panel" id="painel-resultados-busca">' +
        '<h2>Resultados (' + fmtNum(totalEncontrado) + (totalEncontrado > limiteTabela ? ', mostrando ' + limiteTabela : '') + ')</h2>' +
        '<p class="hint">Clique no cabeçalho de uma coluna para ordenar</p>' +
        '<table><thead><tr>' +
          '<th data-col="produto">Produto<span class="arrow">' + (ordemCol === 'produto' ? (ordemDir > 0 ? '▲' : '▼') : '') + '</span></th>' +
          '<th data-col="marca">Marca<span class="arrow">' + (ordemCol === 'marca' ? (ordemDir > 0 ? '▲' : '▼') : '') + '</span></th>' +
          '<th data-col="situacao">Situação<span class="arrow">' + (ordemCol === 'situacao' ? (ordemDir > 0 ? '▲' : '▼') : '') + '</span></th>' +
          '<th class="num" data-col="estoque">Estoque<span class="arrow">' + (ordemCol === 'estoque' ? (ordemDir > 0 ? '▲' : '▼') : '') + '</span></th>' +
          '<th class="num" data-col="minimo">Mínimo<span class="arrow">' + (ordemCol === 'minimo' ? (ordemDir > 0 ? '▲' : '▼') : '') + '</span></th>' +
          '<th class="num" data-col="valorEstoque">Valor em estoque<span class="arrow">' + (ordemCol === 'valorEstoque' ? (ordemDir > 0 ? '▲' : '▼') : '') + '</span></th>' +
          '<th class="num" data-col="valorRepor">Valor a repor<span class="arrow">' + (ordemCol === 'valorRepor' ? (ordemDir > 0 ? '▲' : '▼') : '') + '</span></th>' +
        '</tr></thead><tbody>' +
          (listaTabela.map((d, i) =>
            '<tr class="clickable" data-idx="' + i + '"><td>' + escapeHtml(d.produto) + '</td><td>' + escapeHtml(d.marca) + '</td>' +
            '<td><span class="badge ' + badgeClass(d.situacao) + '">' + situacaoLabel(d.situacao) + '</span></td>' +
            '<td class="num">' + fmtNum(d.estoque) + '</td><td class="num">' + fmtNum(d.minimo) + '</td>' +
            '<td class="num">' + (d.valorEstoque > 0 ? fmtMoeda(d.valorEstoque) : '—') + '</td>' +
            '<td class="num">' + (d.valorRepor > 0 ? fmtMoeda(d.valorRepor) : '—') + '</td></tr>'
          ).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Nenhum item para os filtros escolhidos.</td></tr>') +
        '</tbody></table>' +
      '</div>'
    :
      (marcaExpandidaTabela ?
        (() => {
          const itensDaMarca = itensDaMarcaExibidos;
          const totalEmAberto = itensDaMarcaExpandida.reduce((s, d) => s + (pedidosEmAberto.get(normalizarProduto(d.produto)) || 0), 0);
          return '<div class="panel" id="painel-resultados-busca">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
              '<h2 style="margin:0;">Itens de ' + escapeHtml(marcaExpandidaTabela) + '</h2>' +
              '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button class="refresh-btn" id="importar-pedidos-btn">' + icon('uploadSimple', 'icon-sm') + ' Importar pedidos em aberto</button>' +
                '<input type="file" id="input-pedidos-aberto" accept=".csv,.txt" style="display:none;">' +
                '<button class="refresh-btn" id="gerar-pedido-btn" style="background:var(--gold);border:1px solid var(--gold);color:#000;font-weight:700;">' + icon('downloadSimple', 'icon-sm') + ' Gerar pedido (Sysemp)</button>' +
              '</div>' +
            '</div>' +
            '<p class="hint"><span class="clear-link" id="fechar-marca-expandida">‹ voltar para todas as marcas</span>' +
              (totalEmAberto > 0 ? ' · ' + fmtNum(totalEmAberto) + ' un já em pedido aberto (descontadas da sugestão)' : '') +
            '</p>' +
            '<input type="text" id="busca-itens-criticos" placeholder="Buscar item nesta lista..." aria-label="Buscar item nesta lista" autocomplete="off" value="' + escapeHtml(buscaItensCriticosTexto) + '" style="margin-bottom:12px;width:280px;">' +
            '<table><thead><tr><th>Produto</th><th>Situação</th><th class="num">Estoque</th><th class="num">Mín.</th><th class="num">Pedido</th><th class="num">A repor</th></tr></thead><tbody>' +
              (itensDaMarca.map((d, i) => {
                const emAberto = pedidosEmAberto.get(normalizarProduto(d.produto)) || 0;
                // Itens que só entram aqui pela sugestão AO VIVO (situação
                // OK/EXCESSO, mas média real de venda pede reposição) têm
                // valorRepor = 0 pelo cálculo antigo — usa a quantidade AO
                // VIVO × custo pra "A repor" não ficar zerado à toa.
                const valorReporExibido = d.valorRepor > 0 ? d.valorRepor
                  : (d.vendasAoVivoLote ? calcularSugestaoSemPlanilha(d, d.vendasAoVivoLote.mediaMensal) * (d.custo || 0) : 0);
                return '<tr class="clickable" data-idx-marca="' + i + '"><td>' + escapeHtml(d.produto) + '</td>' +
                '<td><span class="badge ' + badgeClass(d.situacao) + '">' + situacaoLabel(d.situacao) + '</span></td>' +
                '<td class="num">' + fmtNum(d.estoque) + '</td><td class="num">' + fmtNum(d.minimo) + '</td>' +
                '<td class="num"><input type="number" class="input-pedido-aberto" data-idx-marca-pedido="' + i + '" min="0" step="1" placeholder="—" value="' + (emAberto > 0 ? emAberto : '') + '" style="width:80px;text-align:right;"></td>' +
                '<td class="num">' + fmtMoeda(valorReporExibido) + '</td></tr>';
              }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Nenhum item encontrado.</td></tr>') +
            '</tbody></table>' +
          '</div>' +
          '<div class="panel" style="margin-top:16px;">' +
            '<h2 class="clickable" id="toggle-itens-normais" style="cursor:pointer;user-select:none;">' +
              (mostrarItensNormaisMarca ? '▾' : '▸') + ' Demais itens de ' + escapeHtml(marcaExpandidaTabela) + ' (' + fmtNum(itensNormaisDaMarcaCompleto.length) + ')' +
            '</h2>' +
            (mostrarItensNormaisMarca ? (
              '<p class="hint">Estoque normal ou em excesso — sem necessidade de compra no momento</p>' +
              '<input type="text" id="busca-itens-normais" placeholder="Buscar item nesta lista..." aria-label="Buscar item nesta lista" autocomplete="off" value="' + escapeHtml(buscaItensNormaisTexto) + '" style="margin-bottom:12px;width:280px;">' +
              '<table><thead><tr><th>Produto</th><th>Situação</th><th class="num">Estoque</th><th class="num">Mínimo</th><th class="num">Valor em estoque</th></tr></thead><tbody>' +
                (itensNormaisDaMarca.map((d, i) =>
                  '<tr class="clickable" data-idx-normal="' + i + '"><td>' + escapeHtml(d.produto) + '</td>' +
                  '<td><span class="badge ' + badgeClass(d.situacao) + '">' + situacaoLabel(d.situacao) + '</span></td>' +
                  '<td class="num">' + fmtNum(d.estoque) + '</td><td class="num">' + fmtNum(d.minimo) + '</td>' +
                  '<td class="num">' + (d.valorEstoque > 0 ? fmtMoeda(d.valorEstoque) : '—') + '</td></tr>'
                ).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Nenhum item encontrado.</td></tr>') +
              '</tbody></table>'
            ) : '<p class="hint">Clique para expandir</p>') +
          '</div>';
        })()
      : '')
    );

  // Devolve o <canvas> antigo do donut (com a instância do Chart.js ainda
  // viva) no lugar do novo placeholder recém-criado pelo innerHTML acima —
  // é o que permite usar chart.update() daqui pra frente em vez de destruir
  // e recriar (ver comentário na captura de canvasDonutAntigo). O ranking
  // de marcas não usa mais canvas, então não precisa dessa técnica.
  if (canvasDonutAntigo) document.getElementById('donut-chart').replaceWith(canvasDonutAntigo);

  animarNumero(document.getElementById('kpi-total'), totalSkus, v => fmtNum(Math.round(v)), 600, animarKpiNoProximoRender);
  animarNumero(document.getElementById('kpi-valor'), valorTotal, v => fmtMoedaCompacta(Math.round(v)), 700, animarKpiNoProximoRender);
  animarNumero(document.getElementById('kpi-ruptura'), ruptura, v => fmtNum(Math.round(v)), 600, animarKpiNoProximoRender);
  animarNumero(document.getElementById('kpi-baixo'), baixo, v => fmtNum(Math.round(v)), 600, animarKpiNoProximoRender);
  animarNumero(document.getElementById('kpi-excesso'), excesso, v => fmtNum(Math.round(v)), 600, animarKpiNoProximoRender);
  animarNumero(document.getElementById('kpi-repor'), valorRepor, v => fmtMoedaCompacta(Math.round(v)), 700, animarKpiNoProximoRender);
  animarKpiNoProximoRender = false;

  const abaEstoqueEl = document.getElementById('aba-estoque');
  if (abaEstoqueEl) abaEstoqueEl.addEventListener('click', () => { abaSelecionada = 'estoque'; fecharNavSidebar(); renderizar(); });
  const abaVendasEl = document.getElementById('aba-vendas');
  if (abaVendasEl) abaVendasEl.addEventListener('click', () => { abaSelecionada = 'vendas'; fecharNavSidebar(); renderizar(); });
  document.getElementById('filtro-grupo').addEventListener('change', e => { filtroGrupo = e.target.value; renderizar(); });
  const aplicarBuscaProduto = debounce(e => {
    const cursorPos = e.target.selectionStart;
    buscaTexto = e.target.value;
    renderizar();
    const novoInput = document.getElementById('busca');
    if (novoInput) {
      novoInput.focus();
      novoInput.setSelectionRange(cursorPos, cursorPos);
    }
    if (buscaTexto) rolarParaResultadosBusca();
  }, 250);
  document.getElementById('busca').addEventListener('input', aplicarBuscaProduto);
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    filtroSituacao = filtroSituacao === c.dataset.sit ? '' : c.dataset.sit;
    animarDonutNoProximoRender = true;
    animarBarraNoProximoRender = true;
    animarKpiNoProximoRender = true;
    renderizar();
  }));
  document.querySelectorAll('.kpi-card[data-sit]').forEach(c => c.addEventListener('click', () => {
    filtroSituacao = filtroSituacao === c.dataset.sit ? '' : c.dataset.sit;
    animarDonutNoProximoRender = true;
    animarBarraNoProximoRender = true;
    animarKpiNoProximoRender = true;
    renderizar();
  }));
  const clearEl = document.getElementById('clear-filters');
  if (clearEl) clearEl.addEventListener('click', () => {
    filtroGrupo = ''; filtroSituacao = ''; buscaTexto = ''; filtroMarca = ''; buscaMarcaTexto = ''; mostrarSugestoesMarca = false; marcaExpandidaTabela = '';
    animarDonutNoProximoRender = true;
    animarBarraNoProximoRender = true;
    animarKpiNoProximoRender = true;
    renderizar();
  });
  const exportarZeradosEl = document.getElementById('exportar-zerados-btn');
  if (exportarZeradosEl) exportarZeradosEl.addEventListener('click', exportarZeradosExcel);

  // ---- autocomplete de marca ----
  const inputMarca = document.getElementById('busca-marca');
  const aplicarBuscaMarca = debounce(e => {
    const cursorPos = e.target.selectionStart;
    buscaMarcaTexto = e.target.value;
    filtroMarca = ''; // digitar de novo invalida a marca já selecionada
    marcaExpandidaTabela = '';
    mostrarSugestoesMarca = true;
    renderizar();
    const novoInput = document.getElementById('busca-marca');
    if (novoInput) { novoInput.focus(); novoInput.setSelectionRange(cursorPos, cursorPos); }
  }, 250);
  inputMarca.addEventListener('input', aplicarBuscaMarca);
  inputMarca.addEventListener('focus', () => {
    if (!mostrarSugestoesMarca) {
      mostrarSugestoesMarca = true;
      renderizar();
      const novoInput = document.getElementById('busca-marca');
      if (novoInput) novoInput.focus();
    }
  });

  document.querySelectorAll('.autocomplete-item').forEach(item => item.addEventListener('click', () => {
    filtroMarca = item.dataset.marca;
    marcaExpandidaTabela = item.dataset.marca; // mesma visão de 2 abas + botões de pedido
    mostrarItensNormaisMarca = false;
    buscaItensCriticosTexto = ''; buscaItensNormaisTexto = '';
    buscaMarcaTexto = '';
    mostrarSugestoesMarca = false;
    renderizar();
    rolarParaResultadosBusca();
  }));

  document.querySelectorAll('thead th').forEach(th => th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (buscaAtiva) {
      if (ordemCol === col) ordemDir *= -1; else { ordemCol = col; ordemDir = -1; }
      renderizar();
    }
  }));
  document.querySelectorAll('tbody tr.clickable[data-idx]').forEach(tr => tr.addEventListener('click', () => {
    const item = listaTabela[parseInt(tr.dataset.idx, 10)];
    if (item) abrirDetalheProduto(item);
  }));
  document.querySelectorAll('tbody tr.clickable[data-idx-marca]').forEach(tr => tr.addEventListener('click', () => {
    const item = itensDaMarcaExibidos[parseInt(tr.dataset.idxMarca, 10)];
    if (item) abrirDetalheProduto(item);
  }));
  document.querySelectorAll('.input-pedido-aberto').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('change', e => {
      e.stopPropagation();
      const item = itensDaMarcaExibidos[parseInt(inp.dataset.idxMarcaPedido, 10)];
      if (!item) return;
      const chave = normalizarProduto(item.produto);
      const valor = Math.max(0, Math.round(parseFloat(e.target.value) || 0));
      if (valor > 0) pedidosEmAberto.set(chave, valor);
      else pedidosEmAberto.delete(chave);
      salvarPedidosEmAbertoNoLocalStorage();
      renderizar();
    });
  });
  document.querySelectorAll('tbody tr.clickable[data-idx-normal]').forEach(tr => tr.addEventListener('click', () => {
    const item = itensNormaisDaMarca[parseInt(tr.dataset.idxNormal, 10)];
    if (item) abrirDetalheProduto(item);
  }));
  const toggleNormaisEl = document.getElementById('toggle-itens-normais');
  if (toggleNormaisEl) toggleNormaisEl.addEventListener('click', () => {
    mostrarItensNormaisMarca = !mostrarItensNormaisMarca;
    renderizar();
  });
  const buscaCriticosEl = document.getElementById('busca-itens-criticos');
  if (buscaCriticosEl) buscaCriticosEl.addEventListener('input', debounce(e => {
    const cursorPos = e.target.selectionStart;
    buscaItensCriticosTexto = e.target.value;
    renderizar();
    const novoInput = document.getElementById('busca-itens-criticos');
    if (novoInput) { novoInput.focus(); novoInput.setSelectionRange(cursorPos, cursorPos); }
  }, 250));
  const buscaNormaisEl = document.getElementById('busca-itens-normais');
  if (buscaNormaisEl) buscaNormaisEl.addEventListener('input', debounce(e => {
    const cursorPos = e.target.selectionStart;
    buscaItensNormaisTexto = e.target.value;
    renderizar();
    const novoInput = document.getElementById('busca-itens-normais');
    if (novoInput) { novoInput.focus(); novoInput.setSelectionRange(cursorPos, cursorPos); }
  }, 250));
  document.querySelectorAll('[data-rotina-marca]').forEach(el => el.addEventListener('click', () => {
    // Limpa outros filtros antes de expandir, pra garantir que os itens
    // mostrados batam com o que o card da Rotina contou (que sempre olha
    // o painel inteiro, sem filtro nenhum).
    filtroGrupo = ''; filtroSituacao = ''; buscaTexto = '';
    marcaExpandidaTabela = el.dataset.rotinaMarca;
    mostrarItensNormaisMarca = false;
    buscaItensCriticosTexto = ''; buscaItensNormaisTexto = '';
    renderizar();
    document.querySelector('.container').scrollIntoView({ behavior: 'smooth' });
  }));
  document.querySelectorAll('[data-dia-rotina]').forEach(el => el.addEventListener('click', () => {
    diaRotinaSelecionado = el.dataset.diaRotina;
    animarRotinaNoProximoRender = true;
    renderizar();
  }));
  const fecharMarcaEl = document.getElementById('fechar-marca-expandida');
  if (fecharMarcaEl) fecharMarcaEl.addEventListener('click', () => {
    marcaExpandidaTabela = '';
    filtroMarca = '';
    mostrarItensNormaisMarca = false;
    buscaItensCriticosTexto = ''; buscaItensNormaisTexto = '';
    renderizar();
  });
  const gerarPedidoBtn = document.getElementById('gerar-pedido-btn');
  if (gerarPedidoBtn) gerarPedidoBtn.addEventListener('click', () => {
    gerarPedidoSysemp(marcaExpandidaTabela, itensDaMarcaExpandida);
  });
  const importarBtn = document.getElementById('importar-pedidos-btn');
  const inputArquivo = document.getElementById('input-pedidos-aberto');
  if (importarBtn && inputArquivo) {
    importarBtn.addEventListener('click', () => inputArquivo.click());
    inputArquivo.addEventListener('change', e => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      const impressaoDigital = arquivo.name + '|' + arquivo.size + '|' + arquivo.lastModified;
      if (arquivosPedidosAbertoImportados.has(impressaoDigital)) {
        const continuar = confirm(
          'Esse arquivo ("' + arquivo.name + '") já foi importado antes nesta sessão.\n\n' +
          'Importar de novo vai SOMAR os valores em cima do que já foi importado, ' +
          'duplicando o pedido em aberto.\n\nTem certeza que quer importar mesmo assim?'
        );
        if (!continuar) { e.target.value = ''; return; }
      }
      arquivosPedidosAbertoImportados.add(impressaoDigital);
      const leitor = new FileReader();
      leitor.onload = evt => {
        // Detecta a codificação automaticamente:
        // - UTF-16 (BOM FF FE ou FE FF) — formato do botão "TXT" do Sysemp
        // - Senão, tenta UTF-8; se aparecer o caractere de erro (�),
        //   refaz como Windows-1252 (formato do "Salvar Como CSV" do Excel-BR)
        const bytes = new Uint8Array(evt.target.result);
        let texto;
        if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
          texto = new TextDecoder('utf-16le').decode(bytes.subarray(2));
        } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
          texto = new TextDecoder('utf-16be').decode(bytes.subarray(2));
        } else {
          texto = new TextDecoder('utf-8').decode(bytes);
          if (texto.includes('\ufffd')) {
            texto = new TextDecoder('windows-1252').decode(bytes);
          }
        }
        const resultado = processarArquivoPedidosAberto(texto);
        if (resultado.ok) {
          salvarPedidosEmAbertoNoLocalStorage();
          alert(resultado.importados + ' produto(s) com pedido em aberto importado(s). A sugestão de compra já foi ajustada.');
        } else {
          alert('Não consegui ler o arquivo: ' + resultado.erro);
        }
        renderizar();
      };
      leitor.readAsArrayBuffer(arquivo);
    });
  }

  // ---- ranking de marcas (lista HTML/CSS de barras de progresso) ----
  // Não é mais Chart.js — trocado por uma lista de barras de progresso
  // (ver montarRankingMarcas()) pra dar espaço a valor + % sempre visíveis
  // por linha, sem precisar de hover. Clicar numa linha abre o modal de
  // detalhe (abrirDetalheMarca, mesmo padrão do modal de produto — estático
  // no HTML, fora de .scene-3d/#app) e filtra a tabela abaixo; fechar o
  // modal (X, Escape, clique fora) desfaz o filtro.
  document.querySelectorAll('.marca-rank-row').forEach(row => row.addEventListener('click', e => {
    const marca = row.dataset.marca;
    const yClique = e.clientY;
    const posicaoReal = todasMarcasOrdenadas.findIndex(([m]) => m === marca);
    if (posicaoReal === -1) return;
    const [, valor] = todasMarcasOrdenadas[posicaoReal];
    const cor = corMarca(posicaoReal);
    const pctDoTotal = totalGeralMarcas > 0 ? (valor / totalGeralMarcas) * 100 : 0;
    const itensDaMarca = dadosCompletos.filter(d => d.marca === marca);
    const porSituacao = { RUPTURA: 0, BAIXO: 0, EXCESSO: 0, OK: 0 };
    itensDaMarca.forEach(d => { porSituacao[d.situacao]++; });
    // Top 10 produtos mais vendidos DESSA marca — mesma métrica (Média
    // Mensal, da planilha de análise) usada em "mais vendidos" na aba
    // Vendas, só que filtrada pra uma marca em vez do painel inteiro. O
    // gráfico em si mostra quantidade vendida, não valor financeiro — o %
    // que cada item representa do valor total vendido da marca (preço real
    // da TABELA_PRECOS × média mensal) aparece à parte, como linha de texto
    // abaixo da barra de cada item.
    const itensVendidosDaMarca = itensDaMarca.filter(d => d.analise && !d.analise.descontinuada && d.analise.mediaMensal > 0);
    const totalValorVendidoMarca = itensVendidosDaMarca.reduce((s, d) => s + (d.precoVenda > 0 ? d.analise.mediaMensal * d.precoVenda : 0), 0);
    const maisVendidosDaMarca = itensVendidosDaMarca
      .sort((a, b) => b.analise.mediaMensal - a.analise.mediaMensal)
      .slice(0, 10);

    filtroMarca = marca;
    marcaExpandidaTabela = marca;
    mostrarItensNormaisMarca = false;
    buscaItensCriticosTexto = ''; buscaItensNormaisTexto = '';
    buscaMarcaTexto = '';
    renderizar();
    abrirDetalheMarca(marca, posicaoReal, valor, pctDoTotal, cor, itensDaMarca, porSituacao, yClique);
    abrirRankingItensMarca(marca, maisVendidosDaMarca, totalValorVendidoMarca);
  }));

  // ---- donut (por situação) — Chart.js ----
  const situTotalReal = SITUACOES.reduce((s, k) => s + situacaoCount[k], 0);
  const donutValues = SITUACOES.map(k => situacaoCount[k]);
  const donutBg = SITUACOES.map(k => filtroSituacao && filtroSituacao !== k ? hexToRgba(donutColors[k], 0.35) : donutColors[k]);
  const donutOffset = SITUACOES.map(k => filtroSituacao === k ? 10 : 0);
  // Consumo único da flag: só anima se a renderização foi disparada por uma
  // seleção de verdade (ver comentário na declaração da variável lá em cima).
  const animarDonutAgora = animarDonutNoProximoRender;
  animarDonutNoProximoRender = false;
  // Só varre em rotação (animateRotate), sem animateScale: com scale ligado
  // as fatias nasciam com raio zero — ou seja, surgiam do nada, e o anel
  // inteiro "inflava" na entrada. Curva easeOutQuart no lugar de easeOutBack
  // porque o overshoot elástico do Back não combina com um painel
  // operacional de estoque. Delay de 60ms por fatia (mesma cascata do
  // ranking de marcas): com 4 situações, tudo assenta em ~600ms.
  const donutAnimationConfig = (animarDonutAgora && !motionReduzido()) ? {
    duration: 420, easing: 'easeOutQuart', animateRotate: true, animateScale: false,
    delay: ctx => ctx.type === 'data' ? ctx.dataIndex * 60 : 0,
  } : false;

  // Número central: conta gradualmente só quando o donut de fato anima
  // (clique real) — em renders passivos (ex.: digitar na busca) o valor só
  // é escrito direto, sem contagem, seguindo a mesma convenção dos outros
  // gráficos (nunca animar em renderização que não veio de interação).
  const donutCenterEl = document.getElementById('donut-center-n');
  if (donutCenterEl) {
    if (animarDonutAgora) animarNumero(donutCenterEl, situTotalReal, v => fmtNum(Math.round(v)), 900);
    else donutCenterEl.textContent = fmtNum(situTotalReal);
  }
  // Auréola atrás do anel: acompanha a cor da fatia filtrada (ou volta pro
  // dourado padrão sem filtro nenhum) — reforço visual sutil de qual
  // situação está em destaque.
  const donutGlowEl = document.getElementById('donut-glow');
  if (donutGlowEl) donutGlowEl.style.setProperty('--glow-cor', filtroSituacao ? donutColors[filtroSituacao] : GOLD_COLOR);
  // Mesmo cuidado do gráfico de barras: só atualiza se o canvas atual é
  // mesmo o que essa instância está desenhando (sobrevive a troca de aba);
  // senão é uma instância órfã e precisa ser destruída, não atualizada.
  if (donutChartInstance && donutChartInstance.canvas.isConnected) {
    donutChartInstance.data.datasets[0].data = donutValues;
    donutChartInstance.data.datasets[0].backgroundColor = donutBg;
    donutChartInstance.data.datasets[0].offset = donutOffset;
    // Mutar a propriedade diretamente (não reatribuir chart.options inteiro
    // com Object.assign) — reatribuir corrompe os "resolvers" internos do
    // Chart.js e quebra o gráfico (erro "Cannot convert object to primitive
    // value"), como descobrimos da primeira vez que ligamos essa animação.
    donutChartInstance.options.animation = donutAnimationConfig;
    donutChartInstance.update();
  } else {
    if (donutChartInstance) donutChartInstance.destroy();
    donutChartInstance = new Chart(document.getElementById('donut-chart'), {
      type: 'doughnut',
      data: {
        labels: SITUACOES.map(k => situacaoLabel(k)),
        datasets: [{
          data: donutValues, backgroundColor: donutBg, offset: donutOffset, borderWidth: 0,
          spacing: 6, hoverOffset: 14, hoverBorderColor: 'rgba(255,255,255,0.5)', hoverBorderWidth: 2,
        }],
      },
      plugins: [donutSetaHoverPlugin],
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '72%',
        layout: { padding: { top: 34, bottom: 34, left: 92, right: 92 } },
        animation: donutAnimationConfig,
        transitions: { active: { animation: { duration: 220, easing: 'easeOutQuart' } } },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const s = SITUACOES[elements[0].index];
          filtroSituacao = filtroSituacao === s ? '' : s;
          animarDonutNoProximoRender = true;
          animarBarraNoProximoRender = true;
          animarKpiNoProximoRender = true;
          renderizar();
        },
        onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
        plugins: {
          legend: { display: false },
          // Tooltip nativo desligado — a seta customizada (donutSetaHoverPlugin)
          // já mostra nome + valor ao passar o mouse, então o tooltip padrão
          // do Chart.js só duplicaria a mesma informação numa caixa separada.
          tooltip: { enabled: false },
        },
      },
    });
  }

  document.getElementById('donut-legend').innerHTML = SITUACOES.map(k => {
    const pct = situTotalReal > 0 ? (situacaoCount[k] / situTotalReal) * 100 : 0;
    return '<div class="legend-item ' + (filtroSituacao === k ? 'active' : '') + '" data-sit="' + k + '" style="--legend-cor:' + donutColors[k] + ';">' +
      '<div class="legend-item-top">' +
        '<span><span class="legend-dot" style="background:' + donutColors[k] + '"></span>' + situacaoLabel(k) + '</span>' +
        '<span class="legend-valor">' + fmtNum(situacaoCount[k]) + ' <span class="legend-pct">(' + pct.toFixed(0) + '%)</span></span>' +
      '</div>' +
      '<div class="legend-bar-track"><div class="legend-bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + donutColors[k] + ';"></div></div>' +
    '</div>';
  }).join('');
  document.querySelectorAll('.legend-item').forEach(li => li.addEventListener('click', () => {
    const s = li.dataset.sit;
    filtroSituacao = filtroSituacao === s ? '' : s;
    animarDonutNoProximoRender = true;
    animarBarraNoProximoRender = true;
    animarKpiNoProximoRender = true;
    renderizar();
  }));

  tornarClicaveisAcessiveis(document.getElementById('app'));
}

// ----------------------------------------------------------------------
// Login Google (Nivel A -- protecao so na tela, ver CONTEXTO.md).
// NAO esconde a URL bruta dos dados da planilha (CSV publico do
// gviz, ja usado em CSV_URL/ANALISE_CSV_URL/VENDAS_VIVO_CSV_URL) --
// so bloqueia quem entra pela tela normal do painel. Protecao de
// verdade exigiria mover a hospedagem pro Apps Script (Nivel B,
// nao implementado ainda).
// ----------------------------------------------------------------------
const GOOGLE_CLIENT_ID = '590352840411-7m1aq5q5limp271h49iasmsq5d0v4llr.apps.googleusercontent.com';
const EMAILS_PERMITIDOS = [
  'marcusmatos19@gmail.com',
  'bradisferdistribuuidora@gmail.com',
];
const CHAVE_LOCALSTORAGE_LOGIN = 'bradisfer_login';
const VALIDADE_LOGIN_MS = 12 * 60 * 60 * 1000; // 12h -- depois disso pede login de novo

function emailPermitido(email) {
  const alvo = String(email || '').toLowerCase().trim();
  return EMAILS_PERMITIDOS.some(e => e.toLowerCase().trim() === alvo);
}

// Decodifica so a parte de dados (payload) de um JWT -- nao valida a
// assinatura (nao da pra validar de verdade sem backend). Suficiente
// pro Nivel A: o objetivo aqui e so ler o e-mail que o Google devolveu.
function decodificarJwt(token) {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const texto = decodeURIComponent(
      atob(base64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
    return JSON.parse(texto);
  } catch (erro) {
    return null;
  }
}

function mostrarErroLogin(mensagem) {
  const el = document.getElementById('login-erro');
  el.textContent = mensagem;
  el.style.display = 'block';
}

function iniciarPainelAutenticado() {
  document.getElementById('login-overlay').style.display = 'none';
  carregarDados();
  setInterval(carregarDados, AUTO_REFRESH_MS);
}

function handleGoogleLogin(response) {
  const dados = decodificarJwt(response.credential);
  if (!dados || !dados.email) {
    mostrarErroLogin('Não consegui ler os dados do login. Tente de novo.');
    return;
  }
  if (!emailPermitido(dados.email)) {
    mostrarErroLogin('Acesso negado para ' + dados.email + '. Peça pro administrador liberar esse e-mail.');
    return;
  }
  localStorage.setItem(CHAVE_LOCALSTORAGE_LOGIN, JSON.stringify({ email: dados.email, expira: Date.now() + VALIDADE_LOGIN_MS }));
  iniciarPainelAutenticado();
}

function loginSalvoValido() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_LOCALSTORAGE_LOGIN) || 'null');
    return !!(salvo && salvo.expira > Date.now() && emailPermitido(salvo.email));
  } catch (erro) {
    return false;
  }
}

if (loginSalvoValido()) {
  iniciarPainelAutenticado();
} else {
  window.addEventListener('load', () => {
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleLogin });
      google.accounts.id.renderButton(document.getElementById('google-signin-button'), {
        theme: 'filled_black', size: 'large', text: 'signin_with', locale: 'pt-BR',
      });
    } else {
      mostrarErroLogin('Não consegui carregar o login do Google. Verifique sua conexão e recarregue a página.');
    }
  });
}
