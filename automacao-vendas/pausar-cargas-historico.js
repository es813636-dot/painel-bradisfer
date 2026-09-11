'use strict';
const fs = require('node:fs');
const file = 'historico-estados.json';
const names = ['atualizar-vendas-bradisfer.yml', 'atualizar-vendas-online.yml'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function request(name, suffix = '', method = 'GET') {
  const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/${name}${suffix}`, {
    method, headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error('GitHub HTTP ' + r.status);
  return r.status === 204 ? null : r.json();
}
(async () => {
  if (process.argv[2] === 'resume') {
    if (!fs.existsSync(file)) return;
    for (const [name, active] of Object.entries(JSON.parse(fs.readFileSync(file)))) {
      if (active) await request(name, '/enable', 'PUT');
    }
    console.log('Estados das cargas automáticas restaurados.'); return;
  }
  const states = {};
  for (const name of names) {
    const { state } = await request(name);
    if (!['active', 'disabled_manually'].includes(state)) throw new Error('Estado inesperado: ' + state);
    states[name] = state === 'active';
    fs.writeFileSync(file, JSON.stringify(states));
    if (states[name]) await request(name, '/disable', 'PUT');
  }
  for (let i = 0; i < 60; i++) {
    const runs = await Promise.all(names.map(n => request(n, '/runs?per_page=100')));
    if (runs.every(v => v.workflow_runs.every(r => r.status === 'completed'))) { console.log('Cargas pausadas e sem execuções pendentes.'); return; }
    await sleep(10000);
  }
  throw new Error('Ainda há cargas em andamento; nenhuma venda será alterada.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
