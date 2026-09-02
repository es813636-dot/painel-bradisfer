// ----------------------------------------------------------------------
// Atualiza a aba "VendasOnline" da planilha do painel, buscando as vendas
// de marketplace (Shopee, TikTok, Mercado Livre) das empresas CONSTRUBRAG
// e SS CONSTRUCASA via listarVendasPorVendedor.
//
// Alimenta um dashboard Power BI separado, não o painel HTML em si (ver
// CONTEXTO.md, migração da aba Vendas pro Power BI) — por isso a aba fica
// só como fonte de dado bruto, sem consumo em script.js.
//
// v2 (02/09/2026) -- reescrito de "sobrescreve tudo, 1x por mês" pra
// "carga histórica 1x + incremental por checkpoint", depois que a Sysemp
// (a pedido nosso) acrescentou o campo "data de emissão" por linha de
// venda -- antes disso o endpoint só agregava tudo no período pedido, sem
// dar pra saber quando cada venda aconteceu, o que inviabilizava
// incremental de verdade.
//
// Descobertas da sondagem original (ver testar-apis-novas.js): offset
// precisa ser "0" (com "" volta vazio, sem erro), id_empresa é
// obrigatório (sem "todas"), e offset pagina por VENDEDOR internamente,
// não por 100 registros -- 1 chamada já traz tudo, sem paginação nossa.
//
// Descoberta de performance (02/09/2026): o tempo de resposta escala com
// o TAMANHO DA JANELA pedida, não é fixo por chamada -- 8 meses de
// histórico leva 20-45s por empresa, mas uma janela de ~14 dias (o que o
// modo incremental realmente pede a cada rodada) leva as 2 empresas
// juntas uns 5s no total. É isso que torna viável rodar com frequência.
// ----------------------------------------------------------------------

const { google } = require('googleapis');

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const NOME_ABA = 'VendasOnline';
const NOME_ABA_CONTROLE = 'VendasOnlineControle';
const URL_VENDAS_POR_VENDEDOR = 'https://api.sysemp.com.br/163/listarVendasPorVendedor';

// id -> nome só pra log/diagnóstico; a coluna Empresa da planilha vem do
// campo "empresa" de cada linha de venda, não daqui. id_empresa "1"
// (Bradisfer Distribuidora, B2B) fica de fora de propósito -- já é
// coberta por outro fluxo.
const EMPRESAS_MARKETPLACE = { '3': 'CONSTRUBRAG', '4': 'SS CONSTRUCASA' };

// Início do histórico pra carga inicial (1ª vez que o checkpoint de uma
// empresa não existe ainda).
const DATA_INICIO_HISTORICO = '2026-01-01';
// Reprocessa 1 dia pra trás do checkpoint em toda rodada incremental, pra
// cobrir venda cuja nota fiscal/"data de emissão" só é lançada na Sysemp
// com atraso -- o dedup por ChaveDedup evita duplicar o que já foi
// gravado antes nessa margem.
const MARGEM_SEGURANCA_DIAS = 1;

const CABECALHO = [
  'PeriodoInicio', 'PeriodoFim', 'IdVendedor', 'Vendedor', 'Marca', 'Cliente',
  'Empresa', 'Cidade', 'UF', 'Quantidade', 'Canal', 'ValorFaturado', 'DataEmissao',
  'ChaveDedup', // coluna técnica, uso interno do script -- ignorar no Power Query
];

function dataISO(data) {
  return data.toISOString().slice(0, 10);
}
function somarDias(dataISOStr, dias) {
  const d = new Date(dataISOStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return dataISO(d);
}

// A API às vezes varia grafia/acento entre campos (visto antes em outros
// endpoints da Sysemp) -- aceita variantes em vez de assumir uma só.
function campoVenda(venda, ...chaves) {
  for (const c of chaves) if (venda[c] !== undefined && venda[c] !== null && venda[c] !== '') return venda[c];
  return undefined;
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

function montarChaveDedup(idVendedor, vendedor, marca, cliente, dataEmissao, valorFaturado) {
  return [idVendedor, vendedor, marca, cliente, dataEmissao, valorFaturado].join('|');
}

// Retorna { linhas, maiorDataEmissao } -- maiorDataEmissao serve pra
// avançar o checkpoint mesmo quando uma venda especifica for descartada
// no dedup (ela ainda "conta" como já vista).
function montarLinhas(vendedores, datainicial, datafinal) {
  const linhas = [];
  let maiorDataEmissao = null;
  vendedores.forEach((v) => {
    const idVendedor = v.id_vendedor == null ? '' : String(v.id_vendedor);
    const nomeVendedor = v.vendedor == null ? '' : String(v.vendedor).trim();
    (v.vendas || []).forEach((venda) => {
      const [cidade, uf] = separarCidadeUf(venda['cidade/uf']);
      const marca = venda.marca || '';
      const cliente = venda.cliente || '';
      const valorFaturado = Number(venda['valor faturado']) || 0;
      const dataEmissao = String(campoVenda(venda, 'data de emissão', 'data de emissao', 'Data de Emissão') || '').trim();
      if (dataEmissao && (!maiorDataEmissao || dataEmissao > maiorDataEmissao)) maiorDataEmissao = dataEmissao;
      const chave = montarChaveDedup(idVendedor, nomeVendedor, marca, cliente, dataEmissao, valorFaturado);
      linhas.push({
        chave,
        linha: [
          datainicial, datafinal, idVendedor, nomeVendedor, marca, cliente,
          venda.empresa || '', cidade, uf, Number(venda.quantidade) || 0,
          venda['canal de venda'] || '', valorFaturado, dataEmissao, chave,
        ],
      });
    });
  });
  return { linhas, maiorDataEmissao };
}

async function garantirAba(sheets, nomeAba) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  const existe = meta.data.sheets.some((s) => s.properties.title === nomeAba);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { requests: [{ addSheet: { properties: { title: nomeAba } } }] },
    });
    console.log('Aba "' + nomeAba + '" criada.');
  }
  return !existe; // true = acabou de ser criada agora
}

// Checkpoint por empresa: maior "data de emissão" já processada com
// sucesso. Guardado numa aba pequena separada (não escaneando a
// VendasOnline inteira toda rodada, que só tende a crescer) -- 2 linhas
// hoje, 1 por empresa marketplace.
async function lerCheckpoints(sheets) {
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: NOME_ABA_CONTROLE + '!A2:B' }).catch(() => null);
  const mapa = new Map();
  (resp && resp.data.values ? resp.data.values : []).forEach((linha) => {
    const [idEmpresa, ultimaData] = linha;
    if (idEmpresa && ultimaData) mapa.set(String(idEmpresa), String(ultimaData));
  });
  return mapa;
}

async function gravarCheckpoints(sheets, mapa) {
  const linhas = [...mapa.entries()].map(([idEmpresa, ultimaData]) => [idEmpresa, ultimaData]);
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: NOME_ABA_CONTROLE + '!A2:B' });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA_CONTROLE + '!A1',
    valueInputOption: 'RAW',
    resource: { values: [['IdEmpresa', 'UltimaDataEmissaoProcessada'], ...linhas] },
  });
}

// Lê só a coluna ChaveDedup (N) inteira -- mais barato que ler a aba toda,
// e cresce bem devagar mesmo com muita linha (é só texto curto).
async function lerChavesExistentes(sheets) {
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: NOME_ABA + '!N2:N' }).catch(() => null);
  const valores = resp && resp.data.values ? resp.data.values : [];
  return new Set(valores.map((l) => l[0]).filter(Boolean));
}

// Sempre reescreve a linha 1 com o cabeçalho atual -- não fica checando
// "já tem cabeçalho?" antes. Um bug real aconteceu aqui: a v1 (schema de
// 12 colunas) tinha deixado um cabeçalho de 12 colunas gravado; a v1ª
// rodada da v2 (14 colunas) só checava "a linha 1 tem ALGUMA coisa?" —
// via que sim (as 12 colunas antigas) e pulava a atualização, deixando
// "DataEmissao"/"ChaveDedup" sem rótulo em M1/N1 mesmo com o dado certo
// nas células de baixo. Reescrever sempre é idempotente (rótulo nunca
// muda) e custa 1 chamada pequena — mais barato que arriscar esse bug de
// novo se o schema crescer de novo no futuro.
async function garantirCabecalho(sheets) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A1',
    valueInputOption: 'RAW',
    resource: { values: [CABECALHO] },
  });
}

async function main() {
  const sysempToken = process.env.SYSEMP_TOKEN;
  if (!sysempToken) throw new Error('SYSEMP_TOKEN não configurado (variável de ambiente/secret).');

  const chaveServico = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(chaveServico.client_email, null, chaveServico.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  const abaVendasCriadaAgora = await garantirAba(sheets, NOME_ABA);
  const abaControleCriadaAgora = await garantirAba(sheets, NOME_ABA_CONTROLE);

  const checkpoints = await lerCheckpoints(sheets);

  // Carga inicial geral: controle não tinha NENHUMA empresa registrada
  // ainda (1ª vez que essa v2 roda) -- limpa a VendasOnline antes de
  // escrever, porque a versão anterior (mensal, schema sem
  // DataEmissao/ChaveDedup) pode ter deixado dado com formato antigo lá,
  // e misturar os dois schemas quebraria o dedup. Se só uma empresa nova
  // for adicionada no futuro (checkpoints.size > 0 mas essa empresa não
  // está no Map), NÃO limpa a aba toda -- só faz a carga histórica dela
  // e o dedup cuida de não duplicar o resto.
  const cargaInicialGeral = checkpoints.size === 0;
  if (cargaInicialGeral && !abaVendasCriadaAgora) {
    console.log('Carga inicial detectada (sem checkpoint algum) -- limpando dado antigo da aba ' + NOME_ABA + ' antes de recarregar do zero...');
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: NOME_ABA + '!A2:Z' });
  }
  await garantirCabecalho(sheets);

  const chavesExistentes = cargaInicialGeral ? new Set() : await lerChavesExistentes(sheets);
  console.log('Chaves já gravadas (pra dedup): ' + chavesExistentes.size);

  const hoje = dataISO(new Date());
  let todasNovas = [];
  const novosCheckpoints = new Map(checkpoints);

  for (const [idEmpresa, nomeEmpresa] of Object.entries(EMPRESAS_MARKETPLACE)) {
    const checkpoint = checkpoints.get(idEmpresa);
    const datainicial = checkpoint ? somarDias(checkpoint, -MARGEM_SEGURANCA_DIAS) : DATA_INICIO_HISTORICO;
    const datafinal = hoje;
    console.log('Buscando vendas da empresa ' + idEmpresa + ' (' + nomeEmpresa + '), ' + datainicial + ' a ' + datafinal +
      (checkpoint ? ' (incremental)' : ' (carga histórica -- sem checkpoint ainda)') + '...');

    const vendedores = await buscarVendasEmpresa(sysempToken, idEmpresa, datainicial, datafinal);
    const { linhas, maiorDataEmissao } = montarLinhas(vendedores, datainicial, datafinal);

    const novas = linhas.filter((l) => !chavesExistentes.has(l.chave));
    novas.forEach((l) => chavesExistentes.add(l.chave)); // evita duplicar dentro da mesma rodada também
    console.log('  -> ' + vendedores.length + ' vendedor(es)/grupo(s), ' + linhas.length + ' linha(s) no período, ' +
      novas.length + ' nova(s) (' + (linhas.length - novas.length) + ' já existiam)');

    todasNovas = todasNovas.concat(novas.map((l) => l.linha));

    // Avança o checkpoint pela maior data vista, mesmo que toda linha
    // dessa rodada já existisse (senão o job reprocessa a mesma janela
    // pra sempre quando não há venda nova).
    if (maiorDataEmissao && (!checkpoint || maiorDataEmissao > checkpoint)) {
      novosCheckpoints.set(idEmpresa, maiorDataEmissao);
    } else if (!checkpoint) {
      // Sem nenhuma venda com data de emissão no período histórico
      // inteiro (catálogo muito novo, por ex.) -- marca "hoje" pra não
      // ficar refazendo carga histórica completa pra sempre.
      novosCheckpoints.set(idEmpresa, hoje);
    }
  }

  if (todasNovas.length > 0) {
    console.log('Gravando ' + todasNovas.length + ' linha(s) nova(s) na aba ' + NOME_ABA + ' (append)...');
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: NOME_ABA + '!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: todasNovas },
    });
  } else {
    console.log('Nenhuma linha nova -- nada pra gravar nesta rodada.');
  }

  await gravarCheckpoints(sheets, novosCheckpoints);
  console.log('Checkpoints atualizados: ' + JSON.stringify([...novosCheckpoints.entries()]));
  console.log('Concluído.');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
