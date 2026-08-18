# 002 — Gate the Rotina de Compras card cascade behind a real day-selection

- **Status**: DONE
- **Commit**: 35dab74 (working tree has substantial uncommitted changes on top of this — references are against the current working tree. If a cited line doesn't match, STOP per Boundaries.)
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file (`index.html`), ~4 small edits

## Problem

The "Rotina de Compras" section (always visible on the Estoque tab) renders its supplier cards inside a grid with an unconditional stagger-entrance class:

```js
// index.html:3243 — current
        '<div class="rotina-grid rotina-grid-animada">' +
```

```css
/* index.html:440-461 — current */
  @keyframes cartaoEntrada { from { opacity: 0; transform: translateY(16px) scale(0.92); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .rotina-grid-animada .rotina-card { animation: cartaoEntrada 0.9s cubic-bezier(0.22,1,0.36,1) backwards; }
  .rotina-grid-animada .rotina-card:nth-child(n+1) { animation-delay: 0ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+2) { animation-delay: 70ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+3) { animation-delay: 140ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+4) { animation-delay: 210ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+5) { animation-delay: 280ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+6) { animation-delay: 350ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+7) { animation-delay: 420ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+8) { animation-delay: 490ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+9) { animation-delay: 560ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+10) { animation-delay: 630ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+11) { animation-delay: 700ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+12) { animation-delay: 770ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+13) { animation-delay: 840ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+14) { animation-delay: 910ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+15) { animation-delay: 980ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+16) { animation-delay: 1050ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+17) { animation-delay: 1120ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+18) { animation-delay: 1190ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+19) { animation-delay: 1260ms; }
  .rotina-grid-animada .rotina-card:nth-child(n+20) { animation-delay: 1330ms; }
```

`renderizar()` rebuilds `#app`'s entire `innerHTML` on every call — including the 250ms-debounced product-search keystroke handler and the 5-10 minute auto-refresh poll (`carregarDados()` → `renderizar()`). Because `rotina-grid-animada` is applied unconditionally whenever any suppliers are scheduled for the selected day (essentially always), the full ~0.9s-per-card, up to 20-card, 1.33s-staggered cascade (last card finishes at 1330ms + 900ms ≈ 2.23s) replays on every one of those triggers — not just when the user picks a different day.

The donut, bar/marca-ranking, and (per plan 001) KPI counters already solve this exact problem with a per-chart boolean flag read once per render and set only inside real click handlers. This section never got the same treatment.

## Target

```js
// index.html:3243 — target
        '<div class="rotina-grid' + (animarRotinaAgora ? ' rotina-grid-animada' : '') + '">' +
```

No CSS changes — the existing `@keyframes cartaoEntrada`, delays, and the `@media (prefers-reduced-motion: reduce) { ... .rotina-grid-animada .rotina-card { animation: none; } ... }` block at index.html:462-465 stay exactly as they are; only whether the class is applied changes.

## Repo conventions to follow

Same flag-lifecycle pattern used for the donut/bar charts — declare, consume-once, set-true-on-real-selection:

```js
// index.html:1088-1092 — existing exemplar (declaration)
// Liga a animação do donut só quando a mudança veio de uma seleção de
// verdade (fatia, legenda, chip, card) — não em toda renderização (senão o
// anel "recarregaria" a cada tecla digitada na busca, já que ela também
// chama renderizar()). É lido e resetado uma única vez dentro de renderizar().
let animarDonutNoProximoRender = false;
```

```js
// index.html:3030-3032 — existing exemplar (single-consumption, right before the code that reads it)
  const animarBarraAgora = animarBarraNoProximoRender;
  animarBarraNoProximoRender = false;
```

The day-of-week chip click handler that should set the new flag:

```js
// index.html:3529-3532 — current
  document.querySelectorAll('[data-dia-rotina]').forEach(el => el.addEventListener('click', () => {
    diaRotinaSelecionado = el.dataset.diaRotina;
    renderizar();
  }));
```

## Steps

1. **Add the flag declaration.** In `index.html`, immediately after the `animarBarraNoProximoRender` declaration (after line 1096, before the `animarMarcasVendasNoProximoRender` block at 1097-1099 — or, if plan 001 has already been executed, immediately after its new `animarKpiNoProximoRender` declaration), insert:
   ```js
   // Mesma lógica, agora pro grid da Rotina de Compras — liga só ao trocar
   // o dia da semana selecionado, nunca em toda renderização (senão os
   // cartões "recarregariam" a cada tecla digitada na busca ou a cada
   // atualização automática).
   let animarRotinaNoProximoRender = false;
   ```

2. **Set the flag on day selection.** Change index.html:3529-3532 to:
   ```js
   document.querySelectorAll('[data-dia-rotina]').forEach(el => el.addEventListener('click', () => {
     diaRotinaSelecionado = el.dataset.diaRotina;
     animarRotinaNoProximoRender = true;
     renderizar();
   }));
   ```

3. **Consume the flag inside `renderizar()`, once, before it's used to build the grid markup.** Find the line building the rotina grid opening tag (index.html:3243, currently `'<div class="rotina-grid rotina-grid-animada">' +`). Immediately before the `document.getElementById('app').innerHTML =` assignment that contains this line (i.e. before the big template-string expression begins — look for wherever `rotinaHoje` is fully computed but before it's used in that template, which is earlier in `renderizar()`), insert:
   ```js
   const animarRotinaAgora = animarRotinaNoProximoRender;
   animarRotinaNoProximoRender = false;
   ```
   Place it near the other single-consumption reads (e.g. right after the `animarBarraAgora`/`animarBarraNoProximoRender = false;` pair at index.html:3031-3032 is a reasonable, conventional spot — both are read-once-and-reset flags consumed before the same big template string is built).

4. **Make the class conditional.** Change index.html:3243 from:
   ```js
   '<div class="rotina-grid rotina-grid-animada">' +
   ```
   to:
   ```js
   '<div class="rotina-grid' + (animarRotinaAgora ? ' rotina-grid-animada' : '') + '">' +
   ```

## Boundaries

- Do NOT modify the `cartaoEntrada` keyframe, any `animation-delay` value, or the `prefers-reduced-motion` override block (index.html:462-465) — this plan only changes *whether* the class is applied, not the animation itself.
- Do NOT touch `mostrarMarcasUrgentes` or the "Ver marcas com compra urgente" table — that's a separate, unanimated block (see the improve-animations audit's "missed opportunities" list; not part of this plan).
- Do NOT add `animarRotinaNoProximoRender = true` anywhere other than the day-chip click handler in Step 2.
- If the cited lines don't match current file content, STOP and report instead of improvising.

## Verification

- **Mechanical**: serve `index.html` via a local static server (`python -m http.server 8080`; `file://` breaks the Google Sheets fetch) and confirm no console errors on load.
- **Feel check**:
  - On first page load, the Rotina de Compras cards for today's day should appear **without** the cascading fade/scale-in (instant, matching how the donut doesn't animate on first paint either).
  - Type in the product search box for a few seconds. The Rotina cards should stay static/instant on each debounced re-render — no cascading re-entrance while typing.
  - Click a different day-of-week chip (e.g. from "hoje" to "SEX"). The cards for that day should now visibly cascade in with the fade+scale stagger, same as before this change.
  - Wait for (or manually trigger, e.g. via DevTools by calling `carregarDados()` in the console) an auto-refresh poll while NOT touching any day chip. Cards should update instantly, no cascade.
  - Toggle `prefers-reduced-motion` (DevTools Rendering panel), click a day chip, and confirm the cards appear instantly with no animation (existing override at index.html:463 already handles this — just confirm it still applies).
- **Done when**: the cascade plays only immediately after clicking a day-of-week chip, and never on search typing, filter changes, or the auto-refresh poll.
