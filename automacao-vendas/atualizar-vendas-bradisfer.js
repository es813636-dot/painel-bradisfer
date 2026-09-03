// ----------------------------------------------------------------------
// Atualiza a aba "VendasBradisfer" da planilha do painel, buscando vendas
// B2B via listarVendasPorVendedor -- alimenta o dashboard Power BI
// separado ("Dados BI", C:\Users\Admin\Documents\Dados BI), substituindo
// o Excel manual (Fact_Vendas/Fact_Pedidos) que era a fonte até 03/09/2026.
//
// Duas fontes gravam na MESMA aba:
//   - id_empresa "1" (BRADISFER DISTRIBUIDORA) -- todo canal, é B2B pura.
//   - id_empresa "3" (CONSTRUBRAG) -- só os canais B2B (CANAIS_B2B_CONSTRUBRAG
//     abaixo). Construbrag é majoritariamente marketplace (Shopee/TikTok),
//     mas uma fração pequena (confirmado 03/09/2026: ~1,5% do volume, R$
//     95,6 mil/mês) usa os MESMOS canais B2B da Bradisfer -- essas vendas
//     não apareciam em nenhuma planilha antes. `Empresa` continua vindo
//     como "CONSTRUBRAG" (campo da própria API) -- não sobrescrever pra
//     "BRADISFER". A aba `VendasOnline` (marketplace) continua intocada,
//     essa é uma coleta paralela e adicional.
//
// Aba separada de "VendasOnline" de propósito: modelo de negócio diferente
// (B2B vs. marketplace) -- não misturar (ver CONTEXTO.md, achado das 132
// linhas vazadas que confirmou não existir pipeline nenhuma pra id_empresa
// "1" antes desta).
//
// Mesmo padrão v2 de atualizar-vendas-online.js: carga histórica 1x +
// incremental por checkpoint (agora por EMPRESA, não só 1 valor -- ver
// lerCheckpoints/gravarCheckpoints), append sem sobrescrever, dedup por
// chave recalculada usando `id_pedido` (a Sysemp acrescentou esse campo
// em 03/09/2026, confirmado presente em 100% das linhas testadas nas
// duas empresas) -- bem mais robusto que a composta sem esse campo usada
// em VendasOnline antes de existir (que colidiu de verdade, ver
// CONTEXTO.md).
//
// Descobertas de performance (03/09/2026):
//   - Bradisfer (1): o limite de janela de ~2 dias documentado antes
//     (acima disso dava HTTP 500) não existe mais -- testado até a janela
//     completa desde 01/01/2026 (8+ meses, 15.837 linhas), 200 OK em
//     2,6s. Carga histórica numa chamada só.
//   - Construbrag (3): CONTINUA instável em janela larga -- testado ao
//     vivo, janela de 8 meses devolveu HTML/erro em vez de JSON (mesma
//     lentidão/instabilidade já documentada antes pra essa empresa em
//     outros contextos). Por isso a busca dessa empresa é sempre
//     QUEBRADA EM PEDAÇOS MENSAIS (TAMANHO_PEDACO_DIAS), mesmo na carga
//     histórica -- cada pedaço isolado por try/catch, uma falha não
//     derruba os pedaços seguintes nem a outra empresa.
// ----------------------------------------------------------------------

const { google } = require('googleapis');

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const NOME_ABA = 'VendasBradisfer';
const NOME_ABA_CONTROLE = 'VendasBradisferControle';
const URL_VENDAS_POR_VENDEDOR = 'https://api.sysemp.com.br/163/listarVendasPorVendedor';

// canaisPermitidos: null = todo canal (Bradisfer, já é 100% B2B). Set =
// só esses canais entram (Construbrag, filtra o B2B de dentro do
// marketplace). Comparação sempre case-insensitive/trim.
const FONTES = [
  { idEmpresa: '1', nome: 'BRADISFER DISTRIBUIDORA', canaisPermitidos: null, tamanhoPedacoDias: null },
  { idEmpresa: '3', nome: 'CONSTRUBRAG (só canais B2B)', canaisPermitidos: new Set(['APLICATIVO', 'SITE', 'VENDAS INTERNA', 'MOBWIT']), tamanhoPedacoDias: 30 },
];

const DATA_INICIO_HISTORICO = '2026-01-01';
// Reprocessa 1 dia pra trás do checkpoint em toda rodada incremental, pra
// cobrir venda cuja nota fiscal/"data de emissão" só é lançada com
// atraso -- o dedup evita duplicar o que a margem já reprocessou.
const MARGEM_SEGURANCA_DIAS = 1;

const CABECALHO = [
  'PeriodoInicio', 'PeriodoFim', 'IdVendedor', 'Vendedor', 'Marca', 'Cliente',
  'Empresa', 'Cidade', 'UF', 'Quantidade', 'Canal', 'ValorFaturado', 'DataEmissao',
  'IdPedido',
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
// Quebra [datainicial, datafinal] em pedaços de no máximo `dias`, em
// ordem cronológica -- usado só pra fontes instáveis em janela larga.
function quebrarEmPedacos(datainicial, datafinal, dias) {
  const pedacos = [];
  let ini = datainicial;
  while (ini <= datafinal) {
    const fim = somarDias(ini, dias - 1) > datafinal ? datafinal : somarDias(ini, dias - 1);
    pedacos.push([ini, fim]);
    ini = somarDias(fim, 1);
  }
  return pedacos;
}

// A API às vezes varia grafia/acento entre campos -- aceita variantes em
// vez de assumir uma só (mesmo cuidado de atualizar-vendas-online.js).
function campoVenda(venda, ...chaves) {
  for (const c of chaves) if (venda[c] !== undefined && venda[c] !== null && venda[c] !== '') return venda[c];
  return undefined;
}

async function buscarVendas(token, idEmpresa, datainicial, datafinal) {
  const resp = await fetch(URL_VENDAS_POR_VENDEDOR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: token },
    body: JSON.stringify({ id_empresa: idEmpresa, datainicial, datafinal, offset: '0' }),
  });
  const texto = await resp.text();
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' — resposta: ' + texto.slice(0, 300));
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    // Visto ao vivo em 03/09/2026: a Sysemp às vezes devolve uma página
    // HTML de erro com HTTP 200 numa janela larga pra Construbrag --
    // trata como falha (não um catálogo vazio), pra não confundir "sem
    // venda no período" com "a busca quebrou".
    throw new Error('Resposta não é JSON (provável erro/timeout da Sysemp): ' + texto.slice(0, 300));
  }
  return dados.retorno || [];
}

// "Cidade/UF" -> ["Cidade", "UF"], separando pelo ÚLTIMO '/' (mesma
// lógica de atualizar-vendas-online.js).
function separarCidadeUf(texto) {
  const valor = String(texto || '');
  const i = valor.lastIndexOf('/');
  if (i === -1) return [valor, ''];
  return [valor.slice(0, i), valor.slice(i + 1)];
}

// Com id_pedido disponível, a chave fica bem mais robusta que a composta
// usada em VendasOnline (que colidiu de verdade sem esse campo, ver
// CONTEXTO.md) -- IdPedido identifica a transação real; os outros campos
// distinguem as diferentes linhas (marcas) dentro do mesmo pedido.
function montarChaveDedup(idPedido, marca, cliente, dataEmissao, valorFaturado, quantidade, canal) {
  return [idPedido, marca, cliente, dataEmissao, valorFaturado, quantidade, canal].join('|');
}

// Retorna { linhas, maiorDataEmissao } -- maiorDataEmissao avança o
// checkpoint mesmo quando toda linha da rodada já existia. `canaisPermitidos`
// (Set ou null) filtra vendas antes de virarem linha -- usado só pra
// Construbrag, isolar o B2B de dentro do marketplace.
function montarLinhas(vendedores, datainicial, datafinal, canaisPermitidos) {
  const linhas = [];
  let maiorDataEmissao = null;
  vendedores.forEach((v) => {
    const idVendedor = v.id_vendedor == null ? '' : String(v.id_vendedor);
    const nomeVendedor = v.vendedor == null ? '' : String(v.vendedor).trim();
    (v.vendas || []).forEach((venda) => {
      const canal = venda['canal de venda'] || '';
      if (canaisPermitidos && !canaisPermitidos.has(String(canal).toUpperCase().trim())) return;
      const [cidade, uf] = separarCidadeUf(venda['cidade/uf']);
      const marca = venda.marca || '';
      const cliente = venda.cliente || '';
      const valorFaturado = Number(venda['valor faturado']) || 0;
      const quantidade = Number(venda.quantidade) || 0;
      const idPedido = venda.id_pedido == null ? '' : String(venda.id_pedido);
      const dataEmissao = String(campoVenda(venda, 'data de emissão', 'data de emissao', 'Data de Emissão') || '').trim();
      if (dataEmissao && (!maiorDataEmissao || dataEmissao > maiorDataEmissao)) maiorDataEmissao = dataEmissao;
      const chave = montarChaveDedup(idPedido, marca, cliente, dataEmissao, valorFaturado, quantidade, canal);
      linhas.push({
        chave,
        linha: [
          datainicial, datafinal, idVendedor, nomeVendedor, marca, cliente,
          venda.empresa || '', cidade, uf, quantidade, canal, valorFaturado, dataEmissao, idPedido, chave,
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
  return !existe;
}

// Checkpoint por empresa (Map idEmpresa -> maior "data de emissão" já
// processada com sucesso), numa aba pequena separada -- não escaneia a
// VendasBradisfer inteira toda rodada, ela só tende a crescer.
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

// Lê só a coluna ChaveDedup (O) inteira -- mais barato que ler a aba
// toda; cresce bem devagar mesmo com muita linha (texto curto).
async function lerChavesExistentes(sheets) {
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: NOME_ABA + '!O2:O' }).catch(() => null);
  const valores = resp && resp.data.values ? resp.data.values : [];
  return new Set(valores.map((l) => l[0]).filter(Boolean));
}

// Sempre reescreve o cabeçalho (idempotente, custa pouco) -- evita o bug
// já visto em VendasOnline (cabeçalho antigo mais curto "escondendo" a
// necessidade de atualizar quando o schema cresce).
async function garantirCabecalho(sheets) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A1',
    valueInputOption: 'RAW',
    resource: { values: [CABECALHO] },
  });
}

// Busca uma fonte inteira, dividindo em pedaços quando `tamanhoPedacoDias`
// for definido (Construbrag). Pra pra no primeiro pedaço que falhar --
// não avança pros pedaços mais novos, pra não deixar buraco no meio do
// histórico com o checkpoint pulando por cima dele (ver comentário em
// main() sobre como o checkpoint é calculado a partir do que retorna
// aqui). Retorna { linhas, maiorDataEmissao, completo } -- completo=false
// quando parou antes do fim por causa de erro num pedaço.
async function buscarFonteCompleta(token, fonte, datainicial, datafinal) {
  const pedacos = fonte.tamanhoPedacoDias
    ? quebrarEmPedacos(datainicial, datafinal, fonte.tamanhoPedacoDias)
    : [[datainicial, datafinal]];

  let todasLinhas = [];
  let maiorDataEmissaoGeral = null;
  for (const [ini, fim] of pedacos) {
    console.log('  pedaço ' + ini + ' a ' + fim + '...');
    let vendedores;
    try {
      vendedores = await buscarVendas(token, fonte.idEmpresa, ini, fim);
    } catch (erro) {
      console.error('  -> FALHOU nesse pedaço, parando aqui (pedaços mais novos ficam pra próxima rodada): ' + erro.message);
      return { linhas: todasLinhas, maiorDataEmissao: maiorDataEmissaoGeral, completo: false };
    }
    const { linhas, maiorDataEmissao } = montarLinhas(vendedores, ini, fim, fonte.canaisPermitidos);
    console.log('    -> ' + vendedores.length + ' vendedor(es)/grupo(s), ' + linhas.length + ' linha(s) (após filtro de canal, se houver)');
    todasLinhas = todasLinhas.concat(linhas);
    if (maiorDataEmissao && (!maiorDataEmissaoGeral || maiorDataEmissao > maiorDataEmissaoGeral)) {
      maiorDataEmissaoGeral = maiorDataEmissao;
    }
  }
  return { linhas: todasLinhas, maiorDataEmissao: maiorDataEmissaoGeral, completo: true };
}

async function main() {
  const sysempToken = process.env.SYSEMP_TOKEN;
  if (!sysempToken) throw new Error('SYSEMP_TOKEN não configurado (variável de ambiente/secret).');

  const chaveServico = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(chaveServico.client_email, null, chaveServico.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  const abaVendasCriadaAgora = await garantirAba(sheets, NOME_ABA);
  await garantirAba(sheets, NOME_ABA_CONTROLE);
  await garantirCabecalho(sheets);

  const checkpoints = await lerCheckpoints(sheets);

  // Carga inicial geral (nenhuma fonte tem checkpoint ainda) -- limpa a
  // aba antes de escrever, evita misturar com dado antigo de formato
  // diferente. Se só uma fonte NOVA for adicionada depois (outras já com
  // checkpoint), NÃO limpa -- só faz a carga histórica dela, dedup cuida
  // do resto (mesmo padrão de atualizar-vendas-online.js).
  const cargaInicialGeral = checkpoints.size === 0;
  if (cargaInicialGeral && !abaVendasCriadaAgora) {
    console.log('Carga inicial detectada (sem checkpoint algum) -- limpando dado antigo da aba ' + NOME_ABA + ' antes de recarregar do zero...');
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: NOME_ABA + '!A2:Z' });
  }

  const chavesExistentes = cargaInicialGeral ? new Set() : await lerChavesExistentes(sheets);
  console.log('Chaves já gravadas (pra dedup): ' + chavesExistentes.size);

  const hoje = dataISO(new Date());
  let todasNovas = [];
  const novosCheckpoints = new Map(checkpoints);
  const fontesComErro = [];

  for (const fonte of FONTES) {
    const checkpoint = checkpoints.get(fonte.idEmpresa);
    const datainicial = checkpoint ? somarDias(checkpoint, -MARGEM_SEGURANCA_DIAS) : DATA_INICIO_HISTORICO;
    const datafinal = hoje;
    console.log('Buscando ' + fonte.nome + ' (empresa ' + fonte.idEmpresa + '), ' + datainicial + ' a ' + datafinal +
      (checkpoint ? ' (incremental)' : ' (carga histórica -- sem checkpoint ainda)') + '...');

    const { linhas, maiorDataEmissao, completo } = await buscarFonteCompleta(sysempToken, fonte, datainicial, datafinal);
    if (!completo) fontesComErro.push(fonte.nome);

    const novas = linhas.filter((l) => !chavesExistentes.has(l.chave));
    novas.forEach((l) => chavesExistentes.add(l.chave)); // evita duplicar dentro da mesma rodada também
    console.log('  -> total ' + fonte.nome + ': ' + linhas.length + ' linha(s) no período, ' +
      novas.length + ' nova(s) (' + (linhas.length - novas.length) + ' já existiam)' + (completo ? '' : ' [PARCIAL -- parou num pedaço com erro]'));

    todasNovas = todasNovas.concat(novas.map((l) => l.linha));

    // Avança o checkpoint pela maior data vista, mesmo que toda linha já
    // existisse (senão o job reprocessa a mesma janela pra sempre num dia
    // sem venda nova). Se a busca foi PARCIAL (parou num pedaço com
    // erro), maiorDataEmissao já reflete só os pedaços que deram certo
    // (buscarFonteCompleta para antes de processar os pedaços mais
    // novos) -- então avançar até ali é seguro, a próxima rodada retoma
    // do pedaço que falhou.
    if (maiorDataEmissao && (!checkpoint || maiorDataEmissao > checkpoint)) {
      novosCheckpoints.set(fonte.idEmpresa, maiorDataEmissao);
    } else if (!checkpoint && completo) {
      // Sem nenhuma venda no período histórico inteiro (fonte nova, por
      // ex.) -- marca "hoje" pra não ficar refazendo carga histórica
      // completa pra sempre. Só faz isso se a busca foi completa (senão
      // ainda não sabemos se há dado além do que falhou).
      novosCheckpoints.set(fonte.idEmpresa, hoje);
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

  if (fontesComErro.length > 0) {
    // Progresso das fontes/pedaços saudáveis já foi salvo acima (append +
    // checkpoint) -- só marca a rodada como falha (job vermelho no
    // Actions, visível) sem derrubar nada que já deu certo.
    throw new Error('Busca parcial (parou num pedaço com erro) pra: ' + fontesComErro.join(', ') + ' -- retoma sozinho na próxima rodada.');
  }
  console.log('Concluído.');
}

main().catch((err) => {
  console.error('Falhou:', err.message || err);
  process.exit(1);
});
