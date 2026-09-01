# AI Economy & Budget Management

How the AI keeps itself solvent (and, since 2026-09, above a hard **8-gold**
reserve). All logic lives in `src/game/engine/EconomicManager.ts`, with the
army-size cap shared with `src/game/engine/AutoProduction.ts`.

The AI does **not** manage its rates like a player. Each turn
`EconomicManager.processTurn()` runs `raiseTaxForAI()` first, then collects
commerce, pays upkeep, and (only in a deep crisis) disbands units.

---

## 1. Dynamic tax / science / luxury rebalancing — `raiseTaxForAI()`

Every turn the AI recomputes a target rate split and moves toward it gradually:

- **Luxury first** — `luxuryNeedPct()` is the amount needed to stop disorder
  (a disordered city produces 0 commerce, so happiness is the highest-value use
  of commerce). Luxury is capped so it never leaves room below the floors.
- **Floors** — `AI_MIN_TAX = 10` (tax never drops below this while commerce
  exists) and `AI_SCIENCE_FLOOR = 20` (science protected unless in a real
  deficit).
- **Gradual movement** — rates change at most `10` pts/turn normally, `50` in a
  mild crisis, `100` in a deep crisis. This deliberately avoids the old
  `0 ↔ 100` oscillation that caused disorder / bankruptcy cycles.

## 2. Treasury solvency floor — `AI_MIN_GOLD_RESERVE` (8)

The AI always aims to keep **at least 8 gold** in the treasury:

- `reserveTarget = max(AI_MIN_GOLD_RESERVE, upkeep * reserveTurns)`.
- `reserveTurns` comes from `AI_RESERVE_TURNS` per strategy (military / defensive
  hold a bigger war chest: 2 turns; science / wonder civs: 1).
- If gold is **below** the reserve (and not in a real deficit), the AI adds a
  small `AI_RESERVE_REBUILD` (10% of the shortfall) to its tax target each turn,
  trimming science — it prioritizes rebuilding the cushion over research.
- Only when gold is **at or above** the reserve is the AI considered "healthy"
  and allowed to invest surplus back into science.

## 3. Upkeep model — `unitUpkeep` / `cityUpkeep` / `totalUpkeep`

- **Free unit support**: each city supports one unit for free.
- **Extra units** cost `UNIT_MAINTENANCE` (1 gold)/turn each.
- **NONE units** (no home city — starting/hut units, settlers from a destroyed
  size-1 city) are free of upkeep.
- **Cities** cost `CITY_MAINTENANCE` each.
- `totalUpkeep = unitUpkeep + cityUpkeep`.

## 4. Deficit handling — `processTurn()`

- Treasury each turn: `gold += taxIncome − upkeep`. **Ordinary** deficits are
  allowed to go negative — the auto-tax recovers them next turn.
- **Catastrophic deficit** (`gold < −upkeep * 3`) triggers emergency
  `disbandUnitsToCoverDeficit()`:
  - Disbands the **most expensive** units first (by maintenance, then shield
    cost), so cheap scouts/warriors survive.
  - **Scouts are kept last** — they're the civ's eyes on the map and nearly
    free to run.
  - Defeated units (health ≤ 0, awaiting death animation) are never disbanded.
  - **Never below one garrison per city** (`maxDisbandable = units − cities`),
    so a bankrupt civ isn't left defenceless.
- After disbanding, the accumulated debt is **forgiven** (`gold = 0`) so the
  civ gets a fresh start instead of a permanent death spiral.

## 5. Prevention: sustainable army cap — `sustainableUnits()` + AutoProduction

The best way to stay in budget is to never over-produce in the first place:

- `sustainableUnits(civ) = max(cityCount, affordable)`, where `affordable` is
  the full-tax income left after the luxury the civ must keep for happiness.
- `AutoProduction.ensureProductionQueue()` refuses to queue more military units
  once `currentUnits + queuedUnits >= sustainableUnits` (this stops the
  "produce → disband for upkeep" churn in AI-vs-AI). It falls back to buildings;
  if no building is available it queues the already-chosen unit (or, for a
  brand-new city, a settler/scout) so the queue never looks empty.
- **Scouts are exempt** from the unit cap (cheap, essential for exploration).
- `determineProductionItem()` also checks a **gold crisis**
  (`gold < −upkeep`): in a crisis it only allows the minimum settler count (1),
  so the civ doesn't add more upkeep it can't afford.

---

## Summary diagram

```
          ┌────────────────────────────────────────────────┐
          │  processTurn(civ)                              │
          │  1. raiseTaxForAI → target rates (floors,      │
          │     reserve=8, luxury need, gradual change)    │
          │  2. collect commerce → tax/science/luxury      │
          │  3. gold += taxIncome − upkeep                 │
          │  4. if gold < −3×upkeep → disband expensive    │
          │     units (scouts last, keep 1/city), forgive  │
          └────────────────────────────────────────────────┘
```

Related docs: `AI_PRODUCTION.md` (what the AI builds), `AI_SETTLER_INTEGRATION.md`.
