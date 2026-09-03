// ----------------------------------------------------------------------
// Limpeza pontual (rodar 1x via workflow_dispatch, não faz parte do cron
// regular) -- remove duplicata real da aba "VendasOnline", causada por 2
// bugs que se combinaram em 02/09/2026:
//
// 1. A API listarVendasPorVendedor NÃO respeitou a janela de data pedida
//    numa chamada da empresa 4 (SS CONSTRUCASA) -- pedimos 1-2 dias e ela
//    devolveu ~10 meses de histórico. Reportado à Sysemp pelo usuário.
// 2. O formato do ChaveDedup mudou (6 campos -> 8 campos, ver commit
//    2361029) ENTRE a carga inicial e essa rodada incremental -- o dedup
//    comparou chave nova contra chave antiga, nunca bateu, e quase todo
//    aquele histórico de 10 meses foi duplicado na planilha (~61 mil
//    linhas, das quais só 37 eram de verdade novas -- canal MERCADO LIVRE,
//    que não aparecia antes).
//
// Esse script NÃO confia na coluna ChaveDedup já gravada (pode estar no
// formato antigo OU novo, dependendo de quando a linha foi escrita) --
// recalcula a chave de verdade a partir das colunas de dado de cada linha,
// e usa ISSO pra decidir o que é duplicata. Mantém a PRIMEIRA ocorrência
// de cada chave (ordem de leitura da planilha) e descarta o resto.
// ----------------------------------------------------------------------

const { google } = require('googleapis');

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const NOME_ABA = 'VendasOnline';

// Índices de coluna (0-based) na aba VendasOnline, mesma ordem do
// CABECALHO em atualizar-vendas-online.js.
const COL = {
  PeriodoInicio: 0, PeriodoFim: 1, IdVendedor: 2, Vendedor: 3, Marca: 4,
  Cliente: 5, Empresa: 6, Cidade: 7, UF: 8, Quantidade: 9, Canal: 10,
  ValorFaturado: 11, DataEmissao: 12, ChaveDedup: 13,
};

function chaveDeVerdade(linha) {
  return [
    linha[COL.IdVendedor], linha[COL.Vendedor], linha[COL.Marca], linha[COL.Cliente],
    linha[COL.DataEmissao], linha[COL.ValorFaturado], linha[COL.Quantidade], linha[COL.Canal],
  ].join('|');
}

async function main() {
  const chaveServico = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT(chaveServico.client_email, null, chaveServico.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('Lendo aba ' + NOME_ABA + ' inteira...');
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: NOME_ABA + '!A1:N' });
  const todas = resp.data.values || [];
  const cabecalho = todas[0];
  const linhas = todas.slice(1);
  console.log('Total de linhas lidas (sem cabeçalho): ' + linhas.length);

  const vistas = new Set();
  const mantidas = [];
  let duplicatas = 0;
  linhas.forEach((linha) => {
    const chave = chaveDeVerdade(linha);
    if (vistas.has(chave)) { duplicatas++; return; }
    vistas.add(chave);
    // Reescreve a coluna ChaveDedup (N) com a chave de verdade recalculada
    // -- garante formato consistente daqui pra frente, mesmo pra linha
    // que tinha sido gravada com o formato antigo.
    const linhaCorrigida = linha.slice();
    linhaCorrigida[COL.ChaveDedup] = chave;
    mantidas.push(linhaCorrigida);
  });

  console.log('Duplicatas removidas: ' + duplicatas);
  console.log('Linhas mantidas: ' + mantidas.length);

  const canaisMantidos = {};
  mantidas.forEach((l) => { const c = l[COL.Canal] || '(vazio)'; canaisMantidos[c] = (canaisMantidos[c] || 0) + 1; });
  console.log('Canais nas linhas mantidas: ' + JSON.stringify(canaisMantidos));

  if (process.env.SO_SIMULAR === '1') {
    console.log('SO_SIMULAR=1 -- não grava nada, só mostra o resultado acima.');
    return;
  }

  console.log('Gravando ' + mantidas.length + ' linha(s) limpa(s) de volta na planilha...');
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: NOME_ABA + '!A2:Z' });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A1',
    valueInputOption: 'RAW',
    resource: { values: [cabecalho, ...mantidas] },
  });
  console.log('Concluído.');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
