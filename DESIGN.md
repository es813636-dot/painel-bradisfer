---
name: Bradisfer — Painel de Estoque
description: Console noturno de decisão de reposição de estoque, em vidro fosco sobre preto quase absoluto, com dourado reservado só pro que importa agora.
colors:
  ledger-gold: "#FFB800"
  ledger-gold-bright: "#FFC933"
  ledger-gold-dark: "#B88600"
  near-black-void: "#0b0b0d"
  smoked-glass: "#131316"
  smoked-glass-border: "#26262c"
  smoked-glass-hover: "#1c1c21"
  soft-silver: "#D4D4D4"
  muted-steel: "#8A8A8A"
  faint-steel: "#808080"
  alert-coral: "#e66767"
  warning-mustard: "#a87c0e"
  signal-blue: "#3987e5"
  stock-green: "#008300"
typography:
  display:
    fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.2px"
  title:
    fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.8px"
  body:
    fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.5px"
  numeral:
    fontFamily: "'IBM Plex Mono', Consolas, 'Courier New', monospace"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.smoked-glass}"
    textColor: "{colors.soft-silver}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "{colors.smoked-glass-hover}"
    textColor: "{colors.soft-silver}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  chip:
    backgroundColor: "{colors.smoked-glass}"
    textColor: "{colors.muted-steel}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  chip-active:
    backgroundColor: "{colors.ledger-gold}"
    textColor: "#000000"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  card-panel:
    backgroundColor: "{colors.smoked-glass}"
    rounded: "{rounded.md}"
    padding: "18px 20px"
  card-kpi-hero:
    backgroundColor: "{colors.smoked-glass}"
    textColor: "{colors.ledger-gold}"
    rounded: "{rounded.md}"
    padding: "16px 18px"
  card-kpi-accent-gold:
    backgroundColor: "{colors.ledger-gold}"
    textColor: "#000000"
    rounded: "{rounded.md}"
    padding: "16px 18px"
  badge-status:
    rounded: "{rounded.pill}"
    padding: "2px 9px"
---

# Design System: Bradisfer — Painel de Estoque

## Overview

**Creative North Star: "The Gold Ledger"**

A ledger read at night: near-black pages, smoked-glass panels stacked like index cards on a console, and exactly one color — gold — reserved for the number that matters right now. Everything else stays in silver and steel so the gold never has competition. This is an operations tool for a small buying team deciding what to reorder, not a marketing surface; the aesthetic is restrained and instrumental, closer to a trading terminal than a consumer dashboard. Every quantity, currency value, and date renders in a monospace face, because a ledger's numbers must line up in columns whether or not anyone consciously notices.

The system rejects two things explicitly: decorative color (status hues are functional, never picked for vibrancy) and emoji-as-iconography (every glyph is a hand-drawn stroke-based SVG, so the interface never depends on how an OS happens to render a font's emoji set).

**Key Characteristics:**
- Near-black canvas with translucent, blurred glass panels (not flat dark fills)
- One accent color (gold) used sparingly, never as a default UI color
- All quantitative data in monospace with tabular figures; all labels/prose in Inter
- A four-color status vocabulary (red / mustard / blue / green) that never means anything else
- Motion is earned, not ambient: it plays only when the user makes a real selection

## Colors

The palette is almost monochrome by design — the "color" of the system is really a value scale from black to silver, with a single warm accent and a four-hue status vocabulary that exists purely to encode inventory state.

### Primary
- **Ledger Gold** (`#FFB800`): The one warm color in the system. Used for the brand mark, the single "hero" KPI that matters most (valor em estoque), active/selected filter states, and the primary CTA (Gerar pedido). Never used as a default button or panel color — its rarity is what makes it read as "pay attention here."
  - **Ledger Gold Bright** (`#FFC933`): Hover/active variant of gold, and the "leading" end of gradients that start at Ledger Gold.
  - **Ledger Gold Dark** (`#B88600`): Reserved for gold-on-gold contexts (e.g. a dark outline against a gold fill) — rare.

### Neutral
- **Near-Black Void** (`#0b0b0d`): The base canvas. Not pure black — carries the faintest warm/cool radial gradients (gold at top-left, blue at top-right, both under 6% opacity) so the page never feels like a flat void up close.
- **Smoked Glass** (`#131316`, translucent form `rgba(19,19,22,0.72)`): The surface color for every card, panel, and modal. Always paired with `backdrop-filter: blur(14px)` (7px on mobile, for scroll performance) and a soft inset highlight (`rgba(255,255,255,0.045)`) along the top edge — the glass reads as glass, not as a slightly-lighter black rectangle.
- **Smoked Glass Border** (`#26262c` solid / `rgba(255,255,255,0.08)` soft): Panel and input borders.
- **Smoked Glass Hover** (`#1c1c21`): Hover state for cards, buttons, chips, and table rows.
- **Soft Silver** (`#D4D4D4`): Primary text color.
- **Muted Steel** (`#8A8A8A`): Secondary text — status line, KPI labels, table headers on the lighter end.
- **Faint Steel** (`#808080`): Tertiary text — hints, footers, faint captions. (Deliberately lighter than a typical "faint" gray: an earlier, darker faint-gray failed a 4.5:1 contrast check against the glass surface and was corrected.)

### Status Quartet (functional, not decorative)
- **Alert Coral** (`#e66767`): RUPTURA — stock at zero. The most urgent state.
- **Warning Mustard** (`#a87c0e`): BAIXO — below minimum. Deliberately moved off a "safe-reading" green to a mustard/amber so it reads as an active warning, not a passive info state.
- **Signal Blue** (`#3987e5`): EXCESSO — overstocked.
- **Stock Green** (`#008300`): OK — within healthy range.

### Named Rules
**The One Ledger Line Rule.** Gold marks exactly one thing per view — the single most important number or the single active selection. If two elements compete for gold in the same screen, one of them is wrong.

**The Status Hue Lock Rule.** Coral, mustard, blue, and green mean RUPTURA / BAIXO / EXCESSO / OK and nothing else, anywhere in the product. Don't borrow the status quartet for unrelated badges, charts, or brand moments — introduce a new hue instead.

## Typography

**Display Font:** Inter (with -apple-system, 'Segoe UI', sans-serif fallback)
**Body Font:** Inter (same family — display and body are the same face at different weights/sizes, not a paired duo)
**Numeral Font:** IBM Plex Mono (with Consolas, 'Courier New' fallback)

**Character:** Inter carries every word in the interface — labels, headings, prose — at a fairly tight, utilitarian scale (nothing above 19px). IBM Plex Mono exists for exactly one job: numbers. The pairing reads as "instrument panel," not "editorial."

### Hierarchy
- **Display** (700, 19px, 1.2 line-height): Brand wordmark in the top bar only.
- **Title** (600, 12px, uppercase, 0.8px tracking): Panel headings (`<h2>`) and modal section titles. Paired with a small inline SVG icon at 15×15px.
- **Body** (400, 13px, 1.4 line-height): Table cells, list text, general prose.
- **Label** (600, 10px, uppercase, 0.5px tracking): KPI card labels, table column headers, badges.
- **Numeral** (600–700, 13–30px depending on context, tabular figures): Every currency value, count, percentage, and date-like ID. The donut's center total goes up to 30px/700; KPI hero values sit at 25px/700; table cells sit at 13px/600.

### Named Rules
**The Numeral Discipline Rule.** Any value that is counted, measured, or priced renders in IBM Plex Mono with tabular numerals — never in Inter. If it's a quantity, it's mono; if it's a word, it's Inter. No exceptions, no mixing within one stat.

## Layout

No framework grid — panels compose with CSS Grid/Flexbox per-section. KPI cards use `repeat(auto-fit, minmax(170px, 1fr))`; the two-column chart/table panels use a fixed `1.3fr 1fr` split above 860px, collapsing to a single column below it. Container padding is `22px 32px 60px` on desktop, `16px 12px 40px` on mobile. There's no formal spacing token scale in the codebase (values are set per rule, not through `--space-*` variables), but the observed rhythm clusters around 6 / 8 / 12 / 16 / 20 / 24px — that's the scale recorded in this file's frontmatter for future consistency, not an existing enforced token.

Breakpoints: 860px (two-column panels collapse to one), 700px (mobile layout: stacked filters, card-ized tables, reduced blur), 420px (KPI grid drops to 2 columns, modal grid drops to 1).

## Elevation & Depth

Glassmorphism, not flat design and not heavy skeuomorphism — a middle path. Every panel, card, and modal sits on translucent smoked glass with `backdrop-filter: blur()`, a soft top-edge inset highlight, and one of three layered shadow tokens (`--shadow-elevation-1/2/3`, each combining a tight near-shadow with a broader diffuse one). Depth increases on interaction, not at rest: KPI cards lift with a `perspective()` + `rotateX()` micro-tilt and elevation-2 shadow on hover; the nav sidebar and its "porta abrindo" (door-opening) 3D rotation use the deepest shadow tier. Blur intensity is explicitly reduced on mobile (14px → 7px) as a performance trade-off, documented inline as a deliberate concession, not an oversight.

### Shadow Vocabulary
- **Elevation 1** (`0 1px 2px rgba(0,0,0,0.35), 0 1px 1px rgba(0,0,0,0.2)`): Resting state for panels, cards, KPI tiles.
- **Elevation 2** (`0 8px 24px -8px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)`): Hover/lift state — cards, buttons on press-adjacent hover.
- **Elevation 3** (`0 20px 48px -12px rgba(0,0,0,0.65), 0 4px 12px rgba(0,0,0,0.4)`): Overlays with real spatial separation — the nav sidebar.
- **Glass Highlight** (`inset 0 1px 0 rgba(255,255,255,0.045)`): Always paired with a glass surface, never used alone — it's what sells the "pane of glass" read rather than "dark rectangle."

### Named Rules
**The Earned-Depth Rule.** Elevation increases with interaction state (rest → hover → active overlay), never at rest for its own sake. A static card that doesn't respond to anything stays at Elevation 1.

## Shapes

Corner radius scales in three steps — `--radius-sm` (8px) for buttons and small controls, `--radius-md` (12px) for cards and panels, `--radius-lg` (16px) for the largest surfaces (nav sidebar). Anything meant to read as a toggle or status pill (chips, badges, the segmented tab bar) goes fully round at `999px` instead of using the radius scale — pills are a distinct shape language from cards, not a maxed-out radius step. Modals are a slight outlier at a fixed 14px, between md and lg. Borders are hairline (1px) and low-contrast (`--glass-border-soft` at 8% white, or `--glass-border` solid `#26262c`) — they separate surfaces without competing with the glass edge highlight.

## Components

### Buttons
- **Shape:** 8px radius (`--radius-sm`), same as most small controls.
- **Primary/Utility** (`.refresh-btn`): Smoked-glass background, soft border, silver text, 600 weight, 12px. This is the default button everywhere — there is no separate "primary" button color; emphasis comes from placement and icon, not a filled color, except for the one or two gold CTAs below.
- **Gold CTA** (e.g. "Gerar pedido"): Solid gold background, black text, gold border — reserved for the single most consequential action on a screen (see The One Ledger Line Rule).
- **Hover:** Background shifts to `--glass-hover`, border shifts to gold on the utility variant. Transition 0.15s.
- **Disabled:** 0.4 opacity, default cursor.

### Chips (segmented filters, status filters, tab bar)
- **Style:** Smoked-glass background, muted-steel text, fully round (999px), 11px/5px×12px padding.
- **Selected/Active:** Solid gold background, black text, 700 weight — plus a small `chipPop` scale-bounce (0.88 → 1.06 → 1) on the transition into active state, skipped under `prefers-reduced-motion`.
- **Tab bar variant** (`.tab-chip`): Same active treatment, but larger touch target (8px×18px padding) and pairs an inline icon at 85% opacity (100% when active).

### Cards / Panels
- **Corner Style:** 12px (`--radius-md`).
- **Background:** Smoked glass (`--glass-bg`, translucent) with 14px backdrop blur.
- **Shadow Strategy:** Elevation 1 at rest; KPI cards add a 3D micro-tilt + Elevation 2 on hover (see Elevation & Depth).
- **Border:** 1px `--glass-border-soft`.
- **Internal Padding:** 18px 20px for panels; 16px 18px for KPI cards (12px 14px on mobile).
- **Hero/accent variants:** `.kpi-card.hero` adds a 2px gold left border and renders its value in gold at 25px; `.kpi-card.accent-gold` inverts to a full gold-gradient fill with black text — the one card per KPI row allowed to claim gold as a fill rather than an accent.

### Inputs / Selects
- **Style:** Smoked-glass background, 1px `--glass-border`, 8px radius, 13px Inter text.
- **Focus:** 1px gold outline, 1px offset — no glow, no border-color animation, just a hard focus ring.
- **Placeholder:** Faint-steel text.

### Badges (status pills)
- **Style:** Fully round, 2px×9px padding, 10px/700 uppercase label, prefixed with a filled-dot glyph (`●`). Background is the status color at 14% opacity; text is the full-strength status color. Never filled solid — the low-opacity fill keeps badges legible against both the dark glass and (in the Vendas tab exception) light panels.

### Navigation (sidebar)
- Full-height fixed sidebar, strongest glass (`--glass-bg-strong`, 86% opacity) and Elevation 3. Enters with a real 3D door-opening rotation (`rotateY(-100deg) → 0deg` with `perspective(1600px)`) on desktop; the main content scene tilts and dims in tandem (`rotateY(-9deg) scale(0.94) brightness(0.55)`) to sell the sense that the sidebar is a physical panel swinging open in front of it. On screens ≤700px the 3D transform is disabled entirely in favor of a plain opacity fade — the 3D version caused a Safari iOS repaint flash, so mobile intentionally trades the spatial effect for stability.

### Signature Component: Marca Ranking Row
The "valor em estoque por marca" ranking replaced a bar chart with a list of HTML/CSS progress rows (`.marca-rank-row`) — a real `<button>`, not a div, so it's keyboard-operable by default. Each row shows rank (`#N`, mono, faint-steel), marca name, formatted currency, and percentage of total, over a uniform-width track filled in a per-marca categorical color (10-color palette, assigned by real rank position — never by a filtered subset's local index, which previously caused every filtered marca to render as gold "#1"). On a real selection, rows cascade in with staggered fill-grow animation (60ms stagger, 700ms cubic-bezier ease); on passive re-render (typing in search), no animation plays.

## Do's and Don'ts

### Do:
- **Do** keep gold to one thing per screen (The One Ledger Line Rule) — a second gold element competing for attention is a bug, not a style choice.
- **Do** render every quantity, price, and count in IBM Plex Mono with tabular numerals (The Numeral Discipline Rule).
- **Do** use inline stroke-based SVG for every icon, wrapped in `<span class="icon" aria-hidden="true">` when it sits beside visible text — never an emoji, icon font, or `<img>`.
- **Do** gate every non-trivial animation behind an explicit user-selection flag, and give every animation a `prefers-reduced-motion` fallback that snaps straight to the end state.
- **Do** pair any new glass surface with `backdrop-filter: blur()` and the glass highlight inset — a flat `--glass` fill without blur reads as "dark box," not "glass."

### Don't:
- **Don't** extend the Vendas tab's light indigo/white "BI" theme (`--vendas-*` tokens) to any other part of the product. It's a deliberate, contained exception scoped to that one tab's KPI/ranking section — not a second design system to build on. Unifying it into the dark Gold Ledger system is tracked as pending work (see PRODUCT.md / CONTEXTO.md "Fase 4"); until then, new Estoque-tab work follows the dark system, full stop.
- **Don't** repurpose the status quartet (coral/mustard/blue/green) for anything other than RUPTURA/BAIXO/EXCESSO/OK.
- **Don't** replay entrance animations on a passive render (search debounce, auto-refresh poll). Motion fires only on a real click/selection — see each chart/list's `animar*NoProximoRender` flag pattern.
- **Don't** fill a card or badge with a status color at full opacity as a background — the established pattern is low-opacity tint (~14%) with full-strength text/icon, so badges stay legible on both dark glass and the Vendas tab's light panels.
