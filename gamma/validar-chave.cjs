'use strict';

async function validarChave(key, request = fetch) {
  if (!key || !key.trim()) throw new Error('O segredo GAMMA_API_KEY não está configurado.');
  const response = await request('https://public-api.gamma.app/v1.0/themes', {
    headers: { 'X-API-KEY': key.trim(), Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('O Gamma recusou a chave ou o acesso à API. Verifique GAMMA_API_KEY e a permissão da conta.');
  }
  if (!response.ok) throw new Error(`A consulta ao Gamma falhou (HTTP ${response.status}).`);
  await response.json();
  return 'Acesso à API do Gamma confirmado. Nenhuma apresentação foi gerada.';
}

if (require.main === module) {
  validarChave(process.env.GAMMA_API_KEY).then(console.log).catch(() => {
    // Não imprimir respostas remotas ou exceções que possam conter credenciais.
    console.error('Não foi possível validar a chave do Gamma. Confira o segredo e o acesso à API da conta.');
    process.exitCode = 1;
  });
}

module.exports = { validarChave };
