# 005 — Gate transform-based hover states behind `(hover: hover) and (pointer: fine)`

- **Status**: DONE
- **Commit**: 35dab74 (working tree has substantial uncommitted changes on top of this — references are against the current working tree. If a cited line doesn't match, STOP per Boundaries.)
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (`index.html`), 2 CSS rules moved into a media query

## Problem

Two rules apply a `transform` on `:hover` with no pointer/hover-capability gating:

```css
/* index.html:132-136 — current */
  .kpi-card:hover {
    background: var(--glass-hover); border-color: #333339;
    transform: perspective(700px) rotateX(3deg) translateY(-4px) translateZ(6px);
    box-shadow: var(--shadow-elevation-2), var(--glass-highlight);
  }
```

```css
/* index.html:810 — current */
  .rotina-card.clickable:hover { background: var(--glass-hover); border-color: var(--gold); transform: translateY(-1px); box-shadow: var(--shadow-elevation-2); }
```

Both are transform-based hover states on tappable cards (the KPI cards for RUPTURA/BAIXO/EXCESSO filters, and the supplier cards in Rotina de Compras). On touch devices, tapping a `:hover`-styled element fires a "false hover" that persists (sticky hover) until the user taps elsewhere — the KPI card's 3D tilt and the rotina card's lift can visibly stay applied after the tap that was meant to just select the filter/open the card, until another element is touched.

## Target

```css
/* index.html:130-136 — target */
    transition: background 0.18s, border-color 0.18s, transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s;
  }
  @media (hover: hover) and (pointer: fine) {
    .kpi-card:hover {
      background: var(--glass-hover); border-color: #333339;
      transform: perspective(700px) rotateX(3deg) translateY(-4px) translateZ(6px);
      box-shadow: var(--shadow-elevation-2), var(--glass-highlight);
    }
  }
```

```css
/* index.html:809-810 — target */
  .rotina-card.clickable { cursor: pointer; }
  @media (hover: hover) and (pointer: fine) {
    .rotina-card.clickable:hover { background: var(--glass-hover); border-color: var(--gold); transform: translateY(-1px); box-shadow: var(--shadow-elevation-2); }
  }
```

## Repo conventions to follow

The exact media query to use — this codebase doesn't have a prior example of it, so use the canonical form:

```css
@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); } /* touch fires false hovers on tap */
}
```

The file already wraps other conditional CSS in `@media` blocks at the same nesting level as `:root`-level rules (e.g. the existing `@media (prefers-reduced-motion: reduce)` blocks at index.html:221-223, 296-299, 343-345, 411-413, 462-466, 944-950) — follow the same indentation/placement style: the media block sits directly after the base rule it modifies, at the same 2-space top-level indent as other rules in this `<style>` block.

## Steps

1. In `index.html`, locate the `.kpi-card:hover` rule at lines 132-136. Wrap it in `@media (hover: hover) and (pointer: fine) { ... }`, keeping the rule's body exactly as-is (do not change `background`, `border-color`, `transform`, or `box-shadow` values). Leave the base `.kpi-card { ... }` rule (lines 125-131, including its `transition:` line) untouched and outside the media query — only the `:hover` rule itself moves inside.

2. Locate the `.rotina-card.clickable:hover` rule at line 810. Wrap it in `@media (hover: hover) and (pointer: fine) { ... }`, keeping the rule's body exactly as-is. Leave `.rotina-card.clickable { cursor: pointer; }` (line 809) outside the media query — `cursor: pointer` is meaningless on touch and harmless to leave ungated, only the `:hover` transform rule needs gating.

## Boundaries

- Do NOT gate any other `:hover` rule in the file — this plan is scoped to exactly these two (the only two hover rules that animate `transform`). Rules like `.marca-rank-row:hover`, `.chip:hover`, `.nav-item:hover` etc. only change `background`/`border-color`/`color` (no transform), which don't cause the sticky-hover *motion* problem this plan addresses — leave them as they are.
- Do NOT change the `transition:` declarations on `.kpi-card` or `.rotina-card` (lines 130 and 807) — those stay outside the media query so the transition is still defined; only whether the `:hover` rule's declarations ever apply is gated.
- Do NOT touch the `.kpi-card.clickable.active` or `.kpi-card.clickable::after` rules (lines 137-144) — those are not `:hover` rules and are out of scope.
- If either cited line's current content doesn't match what's shown above, STOP and report instead of improvising.

## Verification

- **Mechanical**: serve `index.html` via a local static server and confirm no console errors, and that the page's overall layout is unaffected (media-query wrapping a `:hover` rule doesn't change layout).
- **Feel check**:
  - On a real trackpad/mouse (desktop Chrome/Firefox/Safari), hover over a KPI card and a Rotina de Compras card — both should still tilt/lift exactly as before this change.
  - Using Chrome DevTools' device toolbar (or a real touch device / phone via the dev server on the same network), tap a KPI card and a rotina card. Confirm neither one visibly stays tilted/lifted after the tap — the hover effect should simply not trigger on touch at all.
  - In DevTools, use the Rendering panel's "Emulate CSS media feature `hover`" (or `pointer`) to force `hover: none` / `pointer: coarse`, then hover with the mouse — confirm the transform no longer applies (matching real touch-device behavior), while `background`/`cursor` affordances (if any left ungated) still work.
- **Done when**: both cards' transform-based hover effects apply only under `(hover: hover) and (pointer: fine)`, verified by DevTools media-feature emulation, with no change to mouse/trackpad behavior.
