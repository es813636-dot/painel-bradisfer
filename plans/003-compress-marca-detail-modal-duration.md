# 003 — Compress the marca-detail modal's animation sequence from ~4.5s to ~1.8s

- **Status**: DONE
- **Commit**: 35dab74 (working tree has substantial uncommitted changes on top of this — references are against the current working tree. If a cited line doesn't match, STOP per Boundaries.)
- **Severity**: HIGH
- **Category**: Easing & duration
- **Estimated scope**: 1 file (`index.html`), 3 CSS rule edits (one keyframe attachment, one keyframe attachment, one stagger table of 10 delays)

## Problem

Clicking a marca in the ranking list (or a rank row, or a Vendas-tab bar) opens two modals side-by-side: "Detalhe da marca" and "Itens mais vendidos". Their combined entrance sequence takes far longer than the 200-500ms modal/drawer budget:

```css
/* index.html:328 — current: the bar physically tips from 0° to 90° */
    animation: marcaBarraTombaModal 1.4s cubic-bezier(0.65,0,0.35,1) forwards;
```

```css
/* index.html:271-276 — current: the "itens mais vendidos" panel emerges from the first modal, same duration/curve so the two finish together (see comment at 273-274) */
  .modal-itens-panel:not(:empty) {
    transform-origin: 0% 50%;
    /* Mesma duração/curva da barra que tomba no 1º modal (ver
       marcaBarraTombaModal) — os dois efeitos terminam juntos. */
    animation: itensPainelEmerge 1.4s cubic-bezier(0.65,0,0.35,1) forwards;
  }
```

```css
/* index.html:385-392 — current: each of the up to 10 item bars inside the second modal */
    width: var(--pct-barra, 0%);
    /* Bem mais lenta (1.1s por barra) e com cascata bem espaçada (220ms
       entre uma e outra) — pra ficar claramente um carregamento
       progressivo item por item, não um preenchimento quase instantâneo.
       "both" aplica o frame 0% (width:0) durante o delay inicial também,
       não só depois — sem isso a barra ficaria no width base (o valor
       final) visível enquanto espera a vez de animar. */
    animation: itensBarraCresce 1.1s cubic-bezier(0.22,1,0.36,1) both;
```

```css
/* index.html:398-410 — current: the stagger table, base delay matches the 1.4s panel-emerge duration, then 220ms apart */
  /* +1400ms em cada delay — só começam a crescer depois que o popup
     inteiro termina de "emergir" de dentro do 1º modal (mesma duração de
     itensPainelEmerge), não simultâneo a esse movimento. */
  .modal-itens-row:nth-child(1) .modal-itens-fill { animation-delay: 1400ms; }
  .modal-itens-row:nth-child(2) .modal-itens-fill { animation-delay: 1620ms; }
  .modal-itens-row:nth-child(3) .modal-itens-fill { animation-delay: 1840ms; }
  .modal-itens-row:nth-child(4) .modal-itens-fill { animation-delay: 2060ms; }
  .modal-itens-row:nth-child(5) .modal-itens-fill { animation-delay: 2280ms; }
  .modal-itens-row:nth-child(6) .modal-itens-fill { animation-delay: 2500ms; }
  .modal-itens-row:nth-child(7) .modal-itens-fill { animation-delay: 2720ms; }
  .modal-itens-row:nth-child(8) .modal-itens-fill { animation-delay: 2940ms; }
  .modal-itens-row:nth-child(9) .modal-itens-fill { animation-delay: 3160ms; }
  .modal-itens-row:nth-child(10) .modal-itens-fill { animation-delay: 3380ms; }
```

Timeline today: bar tips over 1.4s, panel emerges over the same 1.4s (parallel), then the 10 item bars start at a 1400ms base delay and step 220ms apart, each animating for 1.1s — the 10th bar starts at 3380ms and finishes at **3380 + 1100 = 4480ms**. A buyer comparing several brands in one session triggers this full sequence every time they open a marca's detail — nearly 4.5 seconds before the view fully "settles" is well past what AUDIT.md's duration table allows even for modals (200-500ms), and the 220ms item-to-item stagger is roughly 3-7× AUDIT.md's recommended 30-80ms stagger window.

## Target

Keep the same sequencing *idea* (bar tips + panel emerges together, then items cascade in after), but compress every duration/stagger so the whole thing settles in ~1.84s instead of ~4.48s. New base delay for the item bars is 800ms — chosen to match the new (compressed) panel-emerge duration, preserving the original "items only start after the panel finishes emerging" logic.

```css
/* index.html:328 — target */
    animation: marcaBarraTombaModal 0.8s cubic-bezier(0.65,0,0.35,1) forwards;
```

```css
/* index.html:271-276 — target */
  .modal-itens-panel:not(:empty) {
    transform-origin: 0% 50%;
    /* Mesma duração/curva da barra que tomba no 1º modal (ver
       marcaBarraTombaModal) — os dois efeitos terminam juntos. */
    animation: itensPainelEmerge 0.8s cubic-bezier(0.65,0,0.35,1) forwards;
  }
```

```css
/* index.html:385-392 — target */
    width: var(--pct-barra, 0%);
    /* Cascata de 60ms entre barras (mesmo valor já usado no ranking de
       marcas — ver .marca-ranking.anima-entrada, index.html:210-219),
       0.5s por barra. "both" aplica o frame 0% (width:0) durante o delay
       inicial também, não só depois — sem isso a barra ficaria no width
       base (o valor final) visível enquanto espera a vez de animar. */
    animation: itensBarraCresce 0.5s cubic-bezier(0.22,1,0.36,1) both;
```

```css
/* index.html:398-410 — target */
  /* +800ms em cada delay — só começam a crescer depois que o popup
     inteiro termina de "emergir" de dentro do 1º modal (mesma duração de
     itensPainelEmerge), não simultâneo a esse movimento. Cascata de 60ms
     entre barras, mesmo valor do ranking de marcas. */
  .modal-itens-row:nth-child(1) .modal-itens-fill { animation-delay: 800ms; }
  .modal-itens-row:nth-child(2) .modal-itens-fill { animation-delay: 860ms; }
  .modal-itens-row:nth-child(3) .modal-itens-fill { animation-delay: 920ms; }
  .modal-itens-row:nth-child(4) .modal-itens-fill { animation-delay: 980ms; }
  .modal-itens-row:nth-child(5) .modal-itens-fill { animation-delay: 1040ms; }
  .modal-itens-row:nth-child(6) .modal-itens-fill { animation-delay: 1100ms; }
  .modal-itens-row:nth-child(7) .modal-itens-fill { animation-delay: 1160ms; }
  .modal-itens-row:nth-child(8) .modal-itens-fill { animation-delay: 1220ms; }
  .modal-itens-row:nth-child(9) .modal-itens-fill { animation-delay: 1280ms; }
  .modal-itens-row:nth-child(10) .modal-itens-fill { animation-delay: 1340ms; }
```

New total: last bar starts at 1340ms, finishes at 1340 + 500 = **1840ms** (was 4480ms — a 59% reduction), while every individual duration and the 60ms stagger stay well inside AUDIT.md's guidance.

## Repo conventions to follow

The 60ms stagger step is not invented for this plan — it's the value this same codebase already uses for the marca-ranking list's own entrance:

```css
/* index.html:210-219 — existing exemplar, same 60ms-per-item stagger reused above */
  .marca-ranking.anima-entrada .marca-rank-row:nth-child(1) .marca-rank-fill { animation-delay: 0ms; }
  .marca-ranking.anima-entrada .marca-rank-row:nth-child(2) .marca-rank-fill { animation-delay: 60ms; }
  .marca-ranking.anima-entrada .marca-rank-row:nth-child(3) .marca-rank-fill { animation-delay: 120ms; }
  .marca-ranking.anima-entrada .marca-rank-row:nth-child(4) .marca-rank-fill { animation-delay: 180ms; }
  .marca-ranking.anima-entrada .marca-rank-row:nth-child(5) .marca-rank-fill { animation-delay: 240ms; }
  .marca-ranking.anima-entrada .marca-rank-row:nth-child(6) .marca-rank-fill { animation-delay: 300ms; }
  .marca-ranking.anima-entrada .marca-rank-row:nth-child(7) .marca-rank-fill { animation-delay: 360ms; }
  .marca-ranking.anima-entrada .marca-rank-row:nth-child(8) .marca-rank-fill { animation-delay: 420ms; }
  .marca-ranking.anima-entrada .marca-rank-row:nth-child(9) .marca-rank-fill { animation-delay: 480ms; }
  .marca-ranking.anima-entrada .marca-rank-row:nth-child(10) .marca-rank-fill { animation-delay: 540ms; }
```

## Steps

1. Change index.html:328 (`.modal-marca-barra-fill`'s `animation:` line) from `1.4s` to `0.8s`. Do not change the curve (`cubic-bezier(0.65,0,0.35,1)`) or the `forwards` fill mode.
2. Change index.html:275 (`.modal-itens-panel:not(:empty)`'s `animation:` line) from `1.4s` to `0.8s`. Do not change the curve or `forwards`.
3. Change index.html:392 (`.modal-itens-fill`'s `animation:` line) from `1.1s` to `0.5s`. Do not change the curve (`cubic-bezier(0.22,1,0.36,1)`) or `both`.
4. Replace the 10 `animation-delay` values at index.html:401-410 with the Target values above (800ms, 860ms, ... 1340ms — each 60ms more than the previous, starting at 800ms).
5. Update the two comments shown in the Target blocks (index.html:398-400 and, optionally, a short note near 386-391) to match the new values — don't leave stale "1400ms"/"220ms" language after the code changes.

## Boundaries

- Do NOT change `transform-origin`, the `scaleX`/`rotate` keyframe shapes themselves (`marcaBarraTombaModal`, `itensPainelEmerge`, `itensBarraCresce` keyframe *bodies* stay as-is — only the `animation:` shorthand's duration values change), or the mobile variant (`itensPainelEmergeVertical`, index.html:287-294) beyond the parallel duration change needed for consistency — if you touch it, only change its implicit duration (it currently references `.modal-itens-panel:not(:empty)`'s `animation-name` override, so changing `.modal-itens-panel:not(:empty)` in Step 2 already fixes both directions; do not add a separate duration override for the mobile block).
- Do NOT change the `.modal-marca-panel`'s own open transition (`transform 0.3s cubic-bezier(0.22,1,0.36,1)`, index.html:258) — that's a separate, already-reasonable animation, out of scope.
- Do NOT change `abrirDetalheMarca`/`abrirRankingItensMarca` JS logic — this is a CSS-only timing change.
- If any cited line's current content doesn't match what's shown above, STOP and report instead of improvising.

## Verification

- **Mechanical**: serve `index.html` via a local static server and confirm no console errors on load.
- **Feel check**:
  - Click a marca row in the "Valor em estoque por marca" ranking list. Confirm both modals still appear in the same relative order/choreography as before (bar tips + second panel emerges together, then the item bars cascade in) — just noticeably faster.
  - Time it by eye or with DevTools Performance recording: the whole sequence (bar fully tipped, both panels fully settled, last item bar fully grown) should complete in well under 2 seconds, not ~4.5.
  - In DevTools, set the Animations panel playback to 10% and scrub through: confirm the bar-tip and panel-emerge still visually finish at the same moment as each other (they share the same 0.8s duration), and the item bars still visibly cascade one after another rather than all appearing at once.
  - Toggle `prefers-reduced-motion` (DevTools Rendering panel) and reopen a marca's detail: confirm the existing reduced-motion overrides (index.html:296-298, 343-344, 411-412) still suppress all three animations correctly — this plan doesn't touch those blocks, so they should be unaffected.
- **Done when**: the marca-detail + itens-mais-vendidos sequence settles in ~1.8s total, the 60ms stagger matches the marca-ranking list's own cadence, and no reduced-motion behavior regressed.
