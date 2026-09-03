// ----------------------------------------------------------------------
// Atualiza a aba "VendasBradisfer" da planilha do painel, buscando as
// vendas B2B da BRADISFER DISTRIBUIDORA (id_empresa "1") via
// listarVendasPorVendedor -- alimenta o dashboard Power BI separado
// ("Dados BI", C:\Users\Admin\Documents\Dados BI), substituindo o Excel
// manual (Fact_Vendas/Fact_Pedidos) que era a fonte até 03/09/2026.
//
// Aba separada de "VendasOnline" de propósito: Bradisfer é B2B
// (aplicativo/site/vendedor de carteira), Construbrag/SS Construcasa são
// marketplace (Shopee/TikTok/Mercado Livre) -- modelos de negócio
// diferentes, não misturar (ver CONTEXTO.md, achado das 132 linhas
// vazadas que confirmou que não existe pipeline nenhuma pra id_empresa
// "1" antes desta).
//
// Mesmo padrão v2 de atualizar-vendas-online.js: carga histórica 1x +
// incremental por checkpoint, append sem sobrescrever, dedup por chave
// recalculada. Diferença: aqui a chave usa `id_pedido` (a Sysemp
// acrescentou esse campo em 03/09/2026, destravando a migração que
// estava pausada -- ver Dados BI/CLAUDE.md) -- muito mais robusto que a
// composta por vendedor+marca+cliente+data+valor usada em VendasOnline
// antes do id_pedido existir.
//
// Descoberta de performance (03/09/2026): o limite de janela de ~2 dias
// documentado antes pra essa empresa (acima disso dava HTTP 500) não
// existe mais -- testado ao vivo até a janela completa desde 01/01/2026
// (8+ meses, 15.837 linhas), 200 OK em 2,6s. Carga histórica em 1
// chamada só, sem precisar quebrar em janelas pequenas.
// ----------------------------------------------------------------------

const { google } = require('googleapis');

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const NOME_ABA = 'VendasBradisfer';
const NOME_ABA_CONTROLE = 'VendasBradisferControle';
const URL_VENDAS_POR_VENDEDOR = 'https://api.sysemp.com.br/163/listarVendasPorVendedor';
const ID_EMPRESA = '1';

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

// A API às vezes varia grafia/acento entre campos -- aceita variantes em
// vez de assumir uma só (mesmo cuidado de atualizar-vendas-online.js).
function campoVenda(venda, ...chaves) {
  for (const c of chaves) if (venda[c] !== undefined && venda[c] !== null && venda[c] !== '') return venda[c];
  return undefined;
}

async function buscarVendas(token, datainicial, datafinal) {
  const resp = await fetch(URL_VENDAS_POR_VENDEDOR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: token },
    body: JSON.stringify({ id_empresa: ID_EMPRESA, datainicial, datafinal, offset: '0' }),
  });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '(sem corpo)');
    throw new Error('HTTP ' + resp.status + ' — resposta: ' + corpo);
  }
  const dados = await resp.json();
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
// checkpoint mesmo quando toda linha da rodada já existia.
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
      const quantidade = Number(venda.quantidade) || 0;
      const canal = venda['canal de venda'] || '';
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

// Checkpoint: maior "data de emissão" já processada com sucesso, numa
// aba pequena separada (não escaneia a VendasBradisfer inteira toda
// rodada -- ela só tende a crescer). 1 linha, já que é 1 empresa só.
async function lerCheckpoint(sheets) {
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: NOME_ABA_CONTROLE + '!A2:B' }).catch(() => null);
  const linha = resp && resp.data.values ? resp.data.values[0] : null;
  return linha && linha[1] ? String(linha[1]) : null;
}

async function gravarCheckpoint(sheets, ultimaData) {
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: NOME_ABA_CONTROLE + '!A2:B' });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA_CONTROLE + '!A1',
    valueInputOption: 'RAW',
    resource: { values: [['IdEmpresa', 'UltimaDataEmissaoProcessada'], [ID_EMPRESA, ultimaData]] },
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

async function main() {
  const sysempToken = process.env.SYSEMP_TOKEN;
  if (!sysempToken) throw new Error('SYSEMP_TOKEN não configurado (variável de ambiente/secret).');

  const chaveServico = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(chaveServico.client_email, null, chaveServico.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  const abaVendasCriadaAgora = await garantirAba(sheets, NOME_ABA);
  await garantirAba(sheets, NOME_ABA_CONTROLE);
  await garantirCabecalho(sheets);

  const checkpoint = await lerCheckpoint(sheets);
  const hoje = dataISO(new Date());
  const datainicial = checkpoint ? somarDias(checkpoint, -MARGEM_SEGURANCA_DIAS) : DATA_INICIO_HISTORICO;
  const datafinal = hoje;

  console.log('Buscando vendas Bradisfer (empresa ' + ID_EMPRESA + '), ' + datainicial + ' a ' + datafinal +
    (checkpoint ? ' (incremental)' : ' (carga histórica -- sem checkpoint ainda)') + '...');

  if (!checkpoint && !abaVendasCriadaAgora) {
    // Carga inicial de verdade (nunca rodou essa v2 antes, mas a aba já
    // existia por algum motivo) -- limpa antes de recarregar, evita
    // misturar schema.
    console.log('Sem checkpoint -- limpando dado antigo da aba ' + NOME_ABA + ' antes de recarregar do zero...');
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: NOME_ABA + '!A2:Z' });
  }

  const chavesExistentes = checkpoint ? await lerChavesExistentes(sheets) : new Set();
  console.log('Chaves já gravadas (pra dedup): ' + chavesExistentes.size);

  const vendedores = await buscarVendas(sysempToken, datainicial, datafinal);
  const { linhas, maiorDataEmissao } = montarLinhas(vendedores, datainicial, datafinal);

  const novas = linhas.filter((l) => !chavesExistentes.has(l.chave));
  console.log(vendedores.length + ' vendedor(es)/grupo(s), ' + linhas.length + ' linha(s) no período, ' +
    novas.length + ' nova(s) (' + (linhas.length - novas.length) + ' já existiam)');

  if (novas.length > 0) {
    console.log('Gravando ' + novas.length + ' linha(s) nova(s) na aba ' + NOME_ABA + ' (append)...');
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: NOME_ABA + '!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: novas.map((l) => l.linha) },
    });
  } else {
    console.log('Nenhuma linha nova -- nada pra gravar nesta rodada.');
  }

  // Avança o checkpoint pela maior data vista, mesmo que toda linha já
  // existisse (senão o job reprocessa a mesma janela pra sempre num dia
  // sem venda nova).
  const novoCheckpoint = maiorDataEmissao && (!checkpoint || maiorDataEmissao > checkpoint)
    ? maiorDataEmissao
    : (checkpoint || hoje);
  await gravarCheckpoint(sheets, novoCheckpoint);
  console.log('Checkpoint atualizado: ' + novoCheckpoint);
  console.log('Concluído.');
}

main().catch((err) => {
  console.error('Falhou:', err.message || err);
  process.exit(1);
});
