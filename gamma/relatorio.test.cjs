const {test} = require('node:test');
const assert = require('node:assert/strict');
const {periodo, csv, lerMetas, indicadores, montar, centavos} = require('./relatorio.cjs');
const names = ['JOAO VICTOR GREGORIO RICARDO', 'GUILHERME PERES DOS SANTOS', 'ALEXANDRE MARIO BERNARDINI', 'CRISTINA FABRI'];
test('calendário atravessa ano e fevereiro bissexto', () => {
  assert.equal(periodo('2026-01').previous, '2025-12');
  assert.equal(periodo('2024-02').end, '2024-02-29');
  assert.throws(() => periodo('2026-13'));
});
test('metas somam marcas e respeitam vírgula decimal entre aspas', () => {
  const text = 'Vendedor,Marca,AnoMes,MetaValor\n' + names.map(n => `${n},Marca,2026-08,"100,50"`).join('\n') + '\n' + names[0] + ',Outra,2026-08,20';
  assert.equal(lerMetas(text, '2026-08').get(names[0]), 12050);
  assert.throws(() => lerMetas(text, '2026-07'), /ausente/);
  assert.deepEqual(csv('"a,b","c""d"\r\n'), [['a,b','c"d']]);
  assert.throws(() => centavos(''));
});
test('duas NFs do mesmo pedido contam uma venda e duas empresas contam duas', () => {
  const base = {seller:names[0], clientId:'10', orderId:'20', emissionDate:'2026-08-05', gross:1000};
  const team = indicadores([{...base,companyId:'1'},{...base,companyId:'1'},{...base,companyId:'3'}], [], new Map(names.map(n => [n,10000])));
  assert.equal(team[0].sales,2);
  assert.equal(team[0].value,3000);
  const content = montar('2026-08',team);
  assert.equal(content.split('\n\n---\n\n').length,12);
  assert.doesNotMatch(content, /NaN|Infinity/);
  assert.match(content,/Cristina Fabri/);
  assert.match(content,/replicadas/);
  assert.throws(() => indicadores([{...base,companyId:'1',orderId:''}],[],new Map()), /identificação/);
});
