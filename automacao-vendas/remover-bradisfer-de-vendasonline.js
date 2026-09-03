// ----------------------------------------------------------------------
// Limpeza pontual (rodar 1x via workflow_dispatch, não faz parte do cron
// regular) -- remove da aba "VendasOnline" as linhas com Empresa =
// "BRADISFER DISTRIBUIDORA" (132 confirmadas via =COUNTIF(G:G;"BRADISFER
// DISTRIBUIDORA") direto na planilha, 03/09/2026).
//
// Origem dessas linhas: NÃO existe nenhum script neste repositório que
// consulte id_empresa "1" (Bradisfer B2B) -- atualizar-vendas-online.js
// só busca as empresas 3 (CONSTRUBRAG) e 4 (SS CONSTRUCASA), confirmado
// lendo o código antes de qualquer suposição. As 132 linhas vieram como
// vazamento entre empresas na resposta da API durante a janela em que o
// filtro de data estava com bug (mesmo bug já corrigido pela Sysemp e
// documentado no CONTEXTO.md) -- todas datadas 2026-09-01/09-02 e com
// IdVendedor/Vendedor vazios, batendo exatamente com a rodada com
// problema (run #4). Não são fruto de um pipeline ativo.
//
// Usa sheets.spreadsheets.values.get (API autenticada), NÃO a exportação
// pública gviz -- que se mostrou não confiável pra essa aba grande
// (às vezes devolve CSV corrompido com HTTP 200, ver CONTEXTO.md).
// ----------------------------------------------------------------------

const { google } = require('googleapis');

const SHEET_ID = '1KThPNCmslfoK3zpzxhK6Jh8taj5tKEiNkmsbHTWnV-A';
const NOME_ABA = 'VendasOnline';
const COL_EMPRESA = 6; // G, 0-based -- ver CABECALHO em atualizar-vendas-online.js
const EMPRESA_A_REMOVER = 'BRADISFER DISTRIBUIDORA';

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

  const removidas = linhas.filter((l) => l[COL_EMPRESA] === EMPRESA_A_REMOVER);
  const mantidas = linhas.filter((l) => l[COL_EMPRESA] !== EMPRESA_A_REMOVER);
  console.log('Linhas com Empresa="' + EMPRESA_A_REMOVER + '": ' + removidas.length);
  console.log('Linhas mantidas: ' + mantidas.length);

  if (removidas.length === 0) {
    console.log('Nenhuma linha pra remover -- nada a fazer.');
    return;
  }

  if (process.env.SO_SIMULAR === '1') {
    console.log('SO_SIMULAR=1 -- não grava nada, só mostra o resultado acima.');
    console.log('Amostra do que seria removido:', JSON.stringify(removidas.slice(0, 3), null, 1));
    return;
  }

  console.log('Gravando ' + mantidas.length + ' linha(s) de volta na planilha...');
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: NOME_ABA + '!A2:Z' });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: NOME_ABA + '!A1',
    valueInputOption: 'RAW',
    resource: { values: [cabecalho, ...mantidas] },
  });
  console.log('Concluído: ' + removidas.length + ' linha(s) removida(s).');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
