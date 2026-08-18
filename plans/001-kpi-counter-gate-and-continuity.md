# 001 — Gate the KPI count-up animation and animate from the last value, not zero

- **Status**: DONE
- **Commit**: 35dab74 (working tree has substantial uncommitted changes on top of this — the file:line references below are against the *current working tree* state of `index.html`, not this commit. If a referenced line doesn't match the excerpt shown, STOP per Boundaries.)
- **Severity**: HIGH
- **Category**: Purpose & frequency / Interruptibility
- **Estimated scope**: 1 file (`index.html`), ~10 small edits (1 function + 6 call-site pairs)

## Problem

`animarNumero` drives the count-up animation for the six always-visible KPI cards at the top of the dashboard (Total de SKUs, Valor em estoque, Estoque zerado, Abaixo do mínimo, Excesso, Valor p/ repor mínimos).

```js
// index.html:1449-1467 — current
function animarNumero(el, valorFinal, formatador, duracaoMs) {
  // Garante o valor certo mesmo se a página estiver em segundo plano —
  // navegadores pausam requestAnimationFrame em abas/telas não visíveis,
  // então sem isso o cartão fica travado em 0 até alguém focar a aba.
  el.textContent = formatador(valorFinal);
  ajustarFonteParaCaber(el);
  if (document.hidden) return;

  const inicio = performance.now();
  const de = 0;
  function passo(agora) {
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = formatador(de + (valorFinal - de) * ease);
    ajustarFonteParaCaber(el);
    if (t < 1) requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
}
```

It is called unconditionally on every `renderizar()` call:

```js
// index.html:3382-3387 — current
  animarNumero(document.getElementById('kpi-total'), totalSkus, v => fmtNum(Math.round(v)), 600);
  animarNumero(document.getElementById('kpi-valor'), valorTotal, v => fmtMoedaCompacta(Math.round(v)), 700);
  animarNumero(document.getElementById('kpi-ruptura'), ruptura, v => fmtNum(Math.round(v)), 600);
  animarNumero(document.getElementById('kpi-baixo'), baixo, v => fmtNum(Math.round(v)), 600);
  animarNumero(document.getElementById('kpi-excesso'), excesso, v => fmtNum(Math.round(v)), 600);
  animarNumero(document.getElementById('kpi-repor'), valorRepor, v => fmtMoedaCompacta(Math.round(v)), 700);
```

Two problems, both in scope for this plan:

1. **No frequency gating.** `renderizar()` runs on every product-search keystroke (250ms debounce — see `aplicarBuscaProduto` near index.html:3395), the marca-autocomplete input, every filter/chip click, and the 5-10 minute auto-refresh poll (`carregarDados()` → `renderizar()`). None of that is gated — unlike the donut/bar/marca-ranking charts, which only animate when a flag set inside a real click handler says so (see Repo conventions below). Every one of those triggers replays a 600-700ms count-up on all six KPI cards.
2. **Always animates from `0`** (`const de = 0;` at index.html:1458), never from the value already on screen. Even a filter tweak that moves "Total de SKUs" from 4130 to 4136 sweeps the visible number from 0 → 4136 over 600ms — physically wrong (nothing actually went to zero) and, combined with #1, produces a distracting flicker while someone is actively typing in the search box.

## Target

```js
// index.html:1449-1467 — target
// id do elemento -> último valor numérico que ele terminou de mostrar.
// Chave por el.id (string), não por referência ao nó: renderizar() reescreve
// #app inteiro via innerHTML a cada chamada, então o <div id="kpi-total">
// de agora é sempre um objeto DOM novo — uma chave por referência nunca
// bateria entre renders, e a barra sempre recomeçaria do zero mesmo com
// esse Map. animarAgora segue a mesma convenção de animarDonutNoProximoRender:
// true só quando a renderização veio de uma seleção real do usuário.
const ultimoValorKpi = {};

function animarNumero(el, valorFinal, formatador, duracaoMs, animarAgora) {
  const chave = el.id;
  if (!animarAgora || document.hidden) {
    el.textContent = formatador(valorFinal);
    ajustarFonteParaCaber(el);
    if (chave) ultimoValorKpi[chave] = valorFinal;
    return;
  }

  const de = (chave && chave in ultimoValorKpi) ? ultimoValorKpi[chave] : 0;
  const inicio = performance.now();
  function passo(agora) {
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = formatador(de + (valorFinal - de) * ease);
    ajustarFonteParaCaber(el);
    if (t < 1) {
      requestAnimationFrame(passo);
    } else if (chave) {
      ultimoValorKpi[chave] = valorFinal;
    }
  }
  requestAnimationFrame(passo);
}
```

```js
// index.html:3382-3387 — target
  animarNumero(document.getElementById('kpi-total'), totalSkus, v => fmtNum(Math.round(v)), 600, animarKpiNoProximoRender);
  animarNumero(document.getElementById('kpi-valor'), valorTotal, v => fmtMoedaCompacta(Math.round(v)), 700, animarKpiNoProximoRender);
  animarNumero(document.getElementById('kpi-ruptura'), ruptura, v => fmtNum(Math.round(v)), 600, animarKpiNoProximoRender);
  animarNumero(document.getElementById('kpi-baixo'), baixo, v => fmtNum(Math.round(v)), 600, animarKpiNoProximoRender);
  animarNumero(document.getElementById('kpi-excesso'), excesso, v => fmtNum(Math.round(v)), 600, animarKpiNoProximoRender);
  animarNumero(document.getElementById('kpi-repor'), valorRepor, v => fmtMoedaCompacta(Math.round(v)), 700, animarKpiNoProximoRender);
  animarKpiNoProximoRender = false;
```

## Repo conventions to follow

This codebase already has the exact gating pattern needed — reuse its shape exactly, don't invent a new one:

```js
// index.html:1088-1092 — existing exemplar (donut chart's flag)
// Liga a animação do donut só quando a mudança veio de uma seleção de
// verdade (fatia, legenda, chip, card) — não em toda renderização (senão o
// anel "recarregaria" a cada tecla digitada na busca, já que ela também
// chama renderizar()). É lido e resetado uma única vez dentro de renderizar().
let animarDonutNoProximoRender = false;
```

```js
// index.html:3405-3423 — existing exemplar (where the donut/barra flags get set true, all three sites in the same function)
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    filtroSituacao = filtroSituacao === c.dataset.sit ? '' : c.dataset.sit;
    animarDonutNoProximoRender = true;
    animarBarraNoProximoRender = true;
    renderizar();
  }));
  document.querySelectorAll('.kpi-card[data-sit]').forEach(c => c.addEventListener('click', () => {
    filtroSituacao = filtroSituacao === c.dataset.sit ? '' : c.dataset.sit;
    animarDonutNoProximoRender = true;
    animarBarraNoProximoRender = true;
    renderizar();
  }));
  const clearEl = document.getElementById('clear-filters');
  if (clearEl) clearEl.addEventListener('click', () => {
    filtroGrupo = ''; filtroSituacao = ''; buscaTexto = ''; filtroMarca = ''; buscaMarcaTexto = ''; mostrarSugestoesMarca = false; marcaExpandidaTabela = '';
    animarDonutNoProximoRender = true;
    animarBarraNoProximoRender = true;
    renderizar();
  });
```

```js
// index.html:3030-3032 — existing exemplar (single-consumption of a flag, right before the code that reads it)
  const animarBarraAgora = animarBarraNoProximoRender;
  animarBarraNoProximoRender = false;
```

## Steps

1. **Add the new flag declaration.** In `index.html`, immediately after the `animarBarraNoProximoRender` declaration block (after line 1096, before the `animarMarcasVendasNoProximoRender` comment/declaration at 1097-1099), insert:
   ```js
   // Mesma lógica, agora pros 6 contadores de KPI no topo — liga só em
   // seleções reais (chip, card, clear-filters, donut, legenda), nunca em
   // toda renderização (senão os números "recarregariam" a cada tecla
   // digitada na busca).
   let animarKpiNoProximoRender = false;
   ```

2. **Rewrite `animarNumero`** (index.html:1449-1467) to exactly the Target code above. Place the `const ultimoValorKpi = {};` line immediately before the `function animarNumero(...)` declaration, replacing the whole function body as shown.

3. **Add `animarKpiNoProximoRender = true;`** in each of these 5 existing handlers, on its own line immediately after the existing `animarBarraNoProximoRender = true;` line in each:
   - index.html:3408 (situação chip click)
   - index.html:3414 (kpi-card click)
   - index.html:3421 (clear-filters click)
   - index.html:3693 (donut chart `onClick`)
   - index.html:3722 (legend-item click)

   Example for the first site (chip click), full resulting block:
   ```js
   document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
     filtroSituacao = filtroSituacao === c.dataset.sit ? '' : c.dataset.sit;
     animarDonutNoProximoRender = true;
     animarBarraNoProximoRender = true;
     animarKpiNoProximoRender = true;
     renderizar();
   }));
   ```
   Repeat the same one-line insertion (`animarKpiNoProximoRender = true;` directly under the existing `animarBarraNoProximoRender = true;` line) at the other 4 sites.

4. **Update the 6 `animarNumero` call sites** (index.html:3382-3387) to the Target code above: add `, animarKpiNoProximoRender` as the 5th argument to each call, and add the line `animarKpiNoProximoRender = false;` immediately after the 6th call (after the `kpi-repor` line, before the blank line that currently precedes `const abaEstoqueEl = ...`).

## Boundaries

- Do NOT touch the donut, bar/marca-ranking, or Vendas-tab chart animation code (`animarDonutNoProximoRender`, `animarBarraNoProximoRender`, `animarMarcasVendasNoProximoRender` and their consumers) beyond adding the one new line at each of the 5 sites in Step 3.
- Do NOT add `animarKpiNoProximoRender = true;` anywhere other than the 5 sites listed in Step 3 — in particular, do NOT add it to the `.marca-rank-row` click handler (around index.html:3594) or to any Vendas-tab handler. That's deliberately out of scope for this plan.
- Do NOT change `ajustarFonteParaCaber` or any other function.
- Do NOT change the 600ms/700ms durations on the 6 call sites.
- If any cited line's current content doesn't match the excerpt shown above (i.e. the file has drifted since this plan was written), STOP and report the mismatch instead of improvising a fix.

## Verification

- **Mechanical**: this is a static HTML file with no build step. Open `index.html` in a browser (via a local static server — `python -m http.server 8080`, then `http://localhost:8080/index.html`; opening as a bare `file://` URL breaks the Google Sheets `fetch`) and confirm the page loads with no console errors.
- **Feel check**:
  - Type in the "Buscar produto..." search box for a few seconds (multiple keystrokes, letting the 250ms debounce fire repeatedly). The 6 KPI numbers at the top should update their **text instantly** on each debounced update — no visible count-up sweep while typing.
  - Click a situação chip (e.g. "Baixo") to filter. The KPI numbers should now visibly count up/down from their previous displayed value to the new one over ~600-700ms — not flash to 0 first.
  - Click the same chip again to unfilter, then immediately click a different chip before the first count-up likely finishes. Confirm the numbers land correctly on the final value with no visible flicker or wrong intermediate value stuck on screen.
  - In DevTools, set the Animations panel (or just watch normally) — the KPI numbers should never visibly touch `0` mid-animation when their real values are in the thousands.
  - Toggle `prefers-reduced-motion` (Rendering panel in DevTools) and confirm the KPI numbers still update correctly (they use JS `requestAnimationFrame`, not CSS `animation`, so this plan does not need to branch on `prefers-reduced-motion` — just confirm nothing breaks).
- **Done when**: KPI numbers update instantly on typing/auto-refresh, animate smoothly from their prior displayed value (not from 0) only on a real chip/card/donut/legend/clear-filters selection, and no console errors appear during either flow.
