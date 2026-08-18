# 004 — Gate the Vendas-tab table row cascade behind a real filter selection

- **Status**: DONE
- **Commit**: 35dab74 (working tree has substantial uncommitted changes on top of this — references are against the current working tree. If a cited line doesn't match, STOP per Boundaries.)
- **Severity**: MEDIUM
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file (`index.html`), ~6 small edits

## Problem

Three tables in the Vendas tab share an unconditional entrance-animation class:

```css
/* index.html:415-417 — current */
  /* ---- linhas de tabela entrando com fade + leve deslize (aba Vendas) ---- */
  @keyframes filaEntrada { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .tabela-animada tbody tr { animation: filaEntrada 0.35s ease-out backwards; }
```

Applied unconditionally at all three usage sites:

```js
// index.html:2533 — current ("Produtos mais/menos vendidos")
    '<table class="tabela-animada"><thead><tr><th>Produto</th><th>Marca</th><th class="num">' + colunaValor + '</th></tr></thead><tbody>' +
```
```js
// index.html:2659 — current ("Itens mais vendidos por marca" report)
        '<table class="tabela-animada"><thead><tr><th>Produto</th><th>Curva</th><th class="num">Média mensal</th><th class="num">Estoque atual</th><th class="num">Valor em estoque</th></tr></thead><tbody>' +
```
```js
// index.html:2686 — current ("Produtos sem giro de estoque")
      '<table class="tabela-animada"><thead><tr><th>Produto</th><th>Marca</th><th class="num">Estoque</th><th class="num">Valor parado</th></tr></thead><tbody>' +
```

`renderizarAbaVendas()` rebuilds these tables on every call, including the 5-10 minute auto-refresh poll (`carregarDados()` → `renderizar()` → `renderizarAbaVendas()` when the Vendas tab is active) and both filter dropdowns' `change` events:

```js
// index.html:2895-2896, 2903-2904 — current: neither sets any animation flag
  const selectGrupoVendas = document.getElementById('select-grupo-vendas');
  if (selectGrupoVendas) selectGrupoVendas.addEventListener('change', e => { filtroGrupoVendas = e.target.value; renderizar(); });
  ...
  const selectMarcaVendas = document.getElementById('select-marca-vendas');
  if (selectMarcaVendas) selectMarcaVendas.addEventListener('change', e => { marcaRelatorioVendas = e.target.value; renderizar(); });
```

This tab has no text-search input (unlike the Estoque tab), so the frequency here is lower than plan 002's rotina-card issue — but the cascade still replays on the passive auto-refresh poll, which the user didn't trigger, and there's no reason a grupo/marca filter change and a background data refresh should look identical.

## Target

```js
// index.html:2895-2896, 2903-2904 — target
  const selectGrupoVendas = document.getElementById('select-grupo-vendas');
  if (selectGrupoVendas) selectGrupoVendas.addEventListener('change', e => { filtroGrupoVendas = e.target.value; animarTabelasVendasNoProximoRender = true; renderizar(); });
  ...
  const selectMarcaVendas = document.getElementById('select-marca-vendas');
  if (selectMarcaVendas) selectMarcaVendas.addEventListener('change', e => { marcaRelatorioVendas = e.target.value; animarTabelasVendasNoProximoRender = true; renderizar(); });
```

Same pattern as plan 002 used for `rotina-grid-animada`: make `tabela-animada` itself conditional rather than adding a second class.

```js
// index.html:2533 — target
    '<table class="' + (animarTabelasVendasAgora ? 'tabela-animada' : '') + '"><thead><tr><th>Produto</th><th>Marca</th><th class="num">' + colunaValor + '</th></tr></thead><tbody>' +
```
```js
// index.html:2659 — target
        '<table class="' + (animarTabelasVendasAgora ? 'tabela-animada' : '') + '"><thead><tr><th>Produto</th><th>Curva</th><th class="num">Média mensal</th><th class="num">Estoque atual</th><th class="num">Valor em estoque</th></tr></thead><tbody>' +
```
```js
// index.html:2686 — target
      '<table class="' + (animarTabelasVendasAgora ? 'tabela-animada' : '') + '"><thead><tr><th>Produto</th><th>Marca</th><th class="num">Estoque</th><th class="num">Valor parado</th></tr></thead><tbody>' +
```

## Repo conventions to follow

Same flag-lifecycle pattern as the donut/bar charts, scoped to `renderizarAbaVendas()` (which already declares and consumes its own `animarMarcasVendasNoProximoRender` flag for the two Chart.js bar charts in that same function — follow that exact local pattern, not the Estoque-tab one):

```js
// index.html:1097-1099 — existing exemplar (declaration, module scope, sibling to add the new flag next to)
// Mesma lógica, agora pros gráficos da aba Vendas (marcas mais/menos
// vendidas) — liga só ao clicar numa barra desses gráficos.
let animarMarcasVendasNoProximoRender = false;
```

```js
// index.html:2701-2703 — existing exemplar (single-consumption inside renderizarAbaVendas, before the flag is needed)
  const animarMarcasVendasAgora = animarMarcasVendasNoProximoRender;
  animarMarcasVendasNoProximoRender = false;
  const marcasVendasAnimConfig = animarMarcasVendasAgora ? { duration: 1400, easing: 'easeOutQuart' } : false;
```

## Steps

1. **Add the flag declaration.** Immediately after the `animarMarcasVendasNoProximoRender` declaration (index.html:1097-1099), insert:
   ```js
   // Mesma lógica, pras 3 tabelas com entrada animada da aba Vendas
   // (produtos mais/menos vendidos, relatório por marca, sem giro) — liga
   // só ao trocar um filtro de verdade (grupo, marca), nunca em toda
   // renderização (senão as linhas "recarregariam" a cada atualização
   // automática).
   let animarTabelasVendasNoProximoRender = false;
   ```

2. **Set the flag in both Vendas-tab filter handlers.** Change index.html:2896 from:
   ```js
   if (selectGrupoVendas) selectGrupoVendas.addEventListener('change', e => { filtroGrupoVendas = e.target.value; renderizar(); });
   ```
   to:
   ```js
   if (selectGrupoVendas) selectGrupoVendas.addEventListener('change', e => { filtroGrupoVendas = e.target.value; animarTabelasVendasNoProximoRender = true; renderizar(); });
   ```
   And change index.html:2904 from:
   ```js
   if (selectMarcaVendas) selectMarcaVendas.addEventListener('change', e => { marcaRelatorioVendas = e.target.value; renderizar(); });
   ```
   to:
   ```js
   if (selectMarcaVendas) selectMarcaVendas.addEventListener('change', e => { marcaRelatorioVendas = e.target.value; animarTabelasVendasNoProximoRender = true; renderizar(); });
   ```

3. **Consume the flag once, near the top of `renderizarAbaVendas()`** — same spot conventions as the existing `animarMarcasVendasAgora` read at index.html:2701-2703. Add, right before or right after that existing pair:
   ```js
   const animarTabelasVendasAgora = animarTabelasVendasNoProximoRender;
   animarTabelasVendasNoProximoRender = false;
   ```

4. **Make the class conditional at all three usage sites.** Change index.html:2533, 2659, and 2686 from `'<table class="tabela-animada">'` (adjust surrounding string concatenation as needed per each line's exact current text) to `'<table class="' + (animarTabelasVendasAgora ? 'tabela-animada' : '') + '">'`, preserving everything else on each line exactly as it is.

## Boundaries

- Do NOT touch `animarMarcasVendasNoProximoRender` or the two Chart.js bar-chart configs (index.html:2701-2762 area) beyond what's needed to place the new flag declaration/consumption near them for locality — their own gating already works correctly and is out of scope.
- Do NOT add `animarTabelasVendasNoProximoRender = true` to the tab-switch handlers (`aba-estoque`/`aba-vendas` clicks) — switching into the Vendas tab should NOT trigger the cascade, consistent with how the donut/bar charts never animate on their first paint either.
- Do NOT touch the Estoque tab's `renderizar()` function or plan 002's `rotina-grid-animada` work — this plan is scoped to `renderizarAbaVendas()` only.
- If any cited line's current content doesn't match what's shown above, STOP and report instead of improvising.

## Verification

- **Mechanical**: serve `index.html` via a local static server and confirm no console errors on load, including after switching to the Vendas tab.
- **Feel check**:
  - Switch to the Vendas tab. The three tables should populate **without** the row-by-row fade/slide cascade (instant), matching the "no animation on first paint" convention used elsewhere.
  - Change the grupo filter dropdown, then the marca filter dropdown. Each change should now visibly cascade the affected tables' rows in with the fade+slide.
  - Trigger `carregarDados()` manually from the DevTools console while sitting on the Vendas tab with no filter change. Tables should update instantly, no cascade.
  - Toggle `prefers-reduced-motion` and change a filter — confirm the existing override (`.tabela-animada tbody tr { animation: none; }`, index.html:463) still applies whenever the class is present.
- **Done when**: the row cascade plays only immediately after changing the grupo or marca filter dropdown, never on tab-switch or the auto-refresh poll.
