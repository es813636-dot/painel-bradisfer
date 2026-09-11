const { test } = require('node:test');
const assert = require('node:assert/strict');
const { windows, equalRows, validateExisting, totals } = require('./reprocessar-historico-vendas');
const b2b = require('./atualizar-vendas-bradisfer');
test('janelas cobrem meses sem lacunas ou sobreposição', () => {
  assert.deepEqual(windows('2026-01-30', '2026-03-02'), [['2026-01-30', '2026-01-31'], ['2026-02-01', '2026-02-28'], ['2026-03-01', '2026-03-02']]);
});
test('conferência detecta mudança de valor e duplicata', () => {
  assert.equal(equalRows([[1, 'a', '']], [[1, 'a']]), true);
  assert.equal(equalRows([[1, 'a']], [[2, 'a']]), false);
  assert.equal(equalRows([[1]], [[1], [1]]), false);
});
test('base inesperada não é silenciosamente descartada', () => {
  assert.throws(() => validateExisting('VendasBradisfer', [b2b.CABECALHO, []], '2026-09-11'));
});
test('conciliação separa empresa e mês em centavos', () => {
  const row = (company, date, value) => ['', '', '', '', '', '', company, '', '', 1, '', value, date];
  const result = totals([row('A', '2026-01-01', 0.1), row('A', '2026-01-02', 0.2), row('B', '2026-01-01', 1)]);
  assert.equal(result['A|2026-01'].centavos, 30);
  assert.equal(result['B|2026-01'].centavos, 100);
});
