// Sonda as 2 APIs novas da Sysemp (documentação de 02/09/2026) só pra
// descobrir o FORMATO da resposta -- a doc que veio mostra só o request,
// não lista os campos que voltam. Não escreve em planilha nenhuma, não
// altera nada: só busca 1 página de cada e salva o JSON em disco.
//
// Como rodar (o token NUNCA entra no código nem no repositório):
//   1. Salve o token da Sysemp num arquivo, ex.:  %USERPROFILE%\.sysemp_token
//   2. node automacao-vendas/testar-apis-novas.js
//
// Alternativa: definir a variável de ambiente SYSEMP_TOKEN antes de rodar.
const fs = require('fs');
const os = require('os');
const path = require('path');

const METODOS = {
  listarPedidoCompras: 'https://api.sysemp.com.br/163/listarPedidoCompras',
  listarVendasPorVendedor: 'https://api.sysemp.com.br/163/listarVendasPorVendedor',
};

function lerToken() {
  if (process.env.SYSEMP_TOKEN) return process.env.SYSEMP_TOKEN.trim();
  const arquivo = path.join(os.homedir(), '.sysemp_token');
  if (fs.existsSync(arquivo)) return fs.readFileSync(arquivo, 'utf8').trim();
  throw new Error(
    'Token não encontrado. Salve o token em ' + arquivo + ' ou defina SYSEMP_TOKEN no ambiente.'
  );
}

function dataISO(offsetDias) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

async function sondar(nome, url, token, corpo) {
  process.stdout.write('\n=== ' + nome + ' ===\n');
  process.stdout.write('body: ' + JSON.stringify(corpo) + '\n');
  const t0 = Date.now();
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Token: token },
      body: JSON.stringify(corpo),
    });
  } catch (err) {
    process.stdout.write('FALHOU na conexão: ' + err.message + '\n');
    return;
  }
  const ms = Date.now() - t0;
  const texto = await resp.text();
  process.stdout.write('HTTP ' + resp.status + ' em ' + ms + 'ms · ' + texto.length + ' bytes\n');

  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    process.stdout.write('Resposta não é JSON. Primeiros 500 caracteres:\n' + texto.slice(0, 500) + '\n');
    return;
  }

  const destino = path.join(__dirname, '..', 'amostra_' + nome.replace(/[^A-Za-z0-9]+/g, '_') + '.json');
  fs.writeFileSync(destino, JSON.stringify(dados, null, 2), 'utf8');
  process.stdout.write('Salvo em ' + destino + '\n');

  // Descobre a forma do retorno: array direto? objeto com uma chave de lista?
  const lista = Array.isArray(dados)
    ? dados
    : Object.values(dados).find(v => Array.isArray(v)) || null;
  if (!lista) {
    process.stdout.write('Chaves do objeto: ' + JSON.stringify(Object.keys(dados)) + '\n');
    return;
  }
  process.stdout.write('Registros nesta página: ' + lista.length + '\n');
  if (lista.length) {
    process.stdout.write('Campos do 1º registro:\n');
    Object.entries(lista[0]).forEach(([k, v]) => {
      const tipo = v === null ? 'null' : typeof v;
      const amostra = String(v === null ? '' : v).slice(0, 60);
      process.stdout.write('  - ' + k + ' (' + tipo + '): ' + amostra + '\n');
    });
  }
}

async function main() {
  const token = lerToken();
  // ATENÇÃO a estes 2 parâmetros (testado em 02/09/2026):
  //
  // offset: a documentação mostra "" no exemplo, mas com string vazia os
  //   dois métodos respondem HTTP 200 com {"status":true,"qtde":0,
  //   "retorno":[]} -- silenciosamente vazio, sem erro nenhum. Precisa ser
  //   "0". Foi o que fez a primeira rodada de teste parecer "API sem dado".
  //
  // id_empresa: aqui NÃO segue a convenção de "" = todos que o
  //   listarVendasMediaPorProduto usa com cod_barra. Vazio devolve zero;
  //   é obrigatório passar o id. As empresas com dado hoje são a 1 e a 3
  //   (a 2 devolve vazio nos dois métodos).
  const base = { datainicial: dataISO(-30), datafinal: dataISO(0), offset: '0' };
  for (const [nome, url] of Object.entries(METODOS)) {
    for (const empresa of ['1', '3']) {
      await sondar(nome + ' (empresa ' + empresa + ')', url, token, { ...base, id_empresa: empresa });
    }
  }
}

main().catch(err => {
  process.stderr.write(String(err && err.message ? err.message : err) + '\n');
  process.exit(1);
});
