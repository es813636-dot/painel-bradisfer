'use strict';
const fs = require('node:fs');
const API = 'https://public-api.gamma.app/v1.0';
async function request(path, key, body, fetcher = fetch) {
  const response = await fetcher(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error(`Gamma HTTP ${response.status}`);
  return response.json();
}
async function executar() {
  const key = process.env.GAMMA_API_KEY;
  if (!key) throw Error('GAMMA_API_KEY ausente');
  let id = process.env.GENERATION_ID;
  const state = process.env.RUNNER_TEMP + '/gamma-generation.json';
  if (!id) {
    const input = fs.readFileSync(process.env.RUNNER_TEMP + '/gamma-input.md', 'utf8');
    const result = await request('/generations/from-template', key, {
      gammaId: process.env.GAMMA_TEMPLATE_ID || 'g_1nbzbz920ocjuts',
      title: 'Reunião de Indicadores de Vendas — ' + process.env.REPORT_MONTH,
      prompt: 'Preserve o formato, estilo e as 12 seções desta apresentação. Substitua todos os dados e períodos pelo conteúdo abaixo. Use somente João Gregório, Guilherme Santos, Alexandre Mario e Cristina Fabri. Preserve os valores exatos, sem inventar informações. Atualize tabelas e gráficos com os novos valores. Não mantenha valores do modelo e não acrescente imagens decorativas.\n\n' + input,
      sharingOptions: { externalAccess: 'noAccess', workspaceAccess: 'noAccess' },
    });
    id = result.generationId;
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('Gamma não retornou ID válido');
    fs.writeFileSync(state, JSON.stringify({ month: process.env.REPORT_MONTH, generationId: id }));
    console.log('Geração iniciada. ID: ' + id);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('ID de geração inválido');
  for (let attempt = 0; attempt < 120; attempt++) {
    const result = await request('/generations/' + id, key);
    if (result.status === 'failed') throw Error('Gamma não concluiu a geração');
    if (result.status === 'completed') {
      const url = new URL(result.gammaUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'gamma.app') throw Error('Link de apresentação inválido');
      const safe = { month: process.env.REPORT_MONTH, generationId: id, status: result.status, gammaUrl: result.gammaUrl, credits: result.credits };
      fs.writeFileSync(state, JSON.stringify(safe));
      console.log('Apresentação concluída: ' + safe.gammaUrl);
      if (safe.credits) console.log('Créditos de geração: ' + JSON.stringify(safe.credits));
      if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `[Abrir apresentação privada de ${safe.month}](${safe.gammaUrl})\n\nRevisar os dados antes da reunião.\n`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw Error('Geração ainda pendente; retome pelo ID existente');
}
module.exports = { request };
if (require.main === module) executar().catch(() => {
  console.error('A geração não foi confirmada. Confira o ID registrado e retome a consulta; não repita a criação automaticamente.');
  process.exitCode = 1;
});
