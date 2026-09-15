const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarChave } = require('./validar-chave.cjs');

test('consulta somente os temas, usando a chave no cabeçalho', async () => {
  let calls = 0;
  const message = await validarChave(' teste ', async (url, options) => {
    calls++;
    assert.equal(url, 'https://public-api.gamma.app/v1.0/themes');
    assert.equal(options.headers['X-API-KEY'], 'teste');
    assert.equal(options.method, undefined);
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
  assert.equal(calls, 1);
  assert.match(message, /confirmado/);
});

test('não expõe a resposta remota quando a chave é recusada', async () => {
  await assert.rejects(validarChave('secreto', async () => ({ ok: false, status: 401 })), /recusou/);
  await assert.rejects(validarChave(''), /não está configurado/);
});
