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
const PAUSA_ENTRE_PAGINAS_MS = 400;

function formatarDataBR(data) {
  const dd = String(data.getDate()).padStart(2, '0');
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  const yyyy = data.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  let offset = 0;
  let todos = [];

  while (true) {
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
    const pagina = dados.retorno || [];
    console.log('offset ' + offset + ': ' + pagina.length + ' registros (total: ' + (todos.length + pagina.length) + ')');

    if (pagina.length === 0) break;
    todos = todos.concat(pagina);
    offset += pagina.length;

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
  existentes.forEach((linha, i) => mapaLinhas.set(String(linha[0]), i));

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
    const codBarra = String(campo(item, 'Codigo barras', 'Código Barras') || '').trim();
    if (!codBarra) return;
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
    if (mapaLinhas.has(codBarra)) {
      existentes[mapaLinhas.get(codBarra)] = linhaNova;
    } else {
      mapaLinhas.set(codBarra, existentes.length);
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
