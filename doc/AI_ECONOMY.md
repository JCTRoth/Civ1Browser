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

- **Luxury stays at 0% while cities are content.** The AI only spends commerce
  on luxury when at least one city is actually in (or approaching) disorder
  (`cityHappiness`: `disorder || unhappiness >= happiness`); otherwise the
  luxury rate is kept at exactly **0%** and all commerce goes to tax + science.
  When a city does have a problem, `luxuryNeedPct()` returns the amount needed
  to stop the disorder (a disordered city produces 0 commerce, so happiness is
  then the highest-value use of commerce). Luxury is capped so it never leaves
  room below the floors.
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
- **Disbanding is a LAST RESORT, not the first-line tool.** The AI is *planned*
  (via the real-income army cap in §5) so it doesn't over-build, which means it
  rarely needs to disband.
- It fires only when the AI is genuinely **bankrupt** (`gold < 0`, i.e. it
  can't cover this turn's upkeep) **and** has no surplus (`upkeep ≥ taxIncome`)
  to recover on its own. A positive-but-below-floor treasury is rebuilt by the
  tax planner's reserve contribution, *not* by disbanding.
- When it does fire, `disbandUnitsToCoverDeficit()`:
  - Disbands the **most expensive** units first (by maintenance, then shield
    cost), so cheap scouts/warriors survive.
  - **Scouts are kept last** — they're the civ's eyes on the map and nearly
    free to run.
  - Defeated units (health ≤ 0, awaiting death animation) are never disbanded.
  - **Never below one garrison per city** (`maxDisbandable = units − cities`),
    so a bankrupt civ isn't left defenceless.
- **Catastrophic deficit** (`gold < −upkeep * 3`) triggers the same disband
  routine for any civ (including a human after a catastrophe).
- After disbanding, the treasury is **forgiven back to the 8-gold floor**
  (`gold = max(gold, 8)` for the AI, `0` for a human) so the civ gets a fresh
  start instead of a permanent death spiral.
- Verified: a 40-round AI-vs-AI simulation holds **both** civs at or above the
  8-gold floor with **zero** disband events (previously one civ ran to −12 and
  disbanded repeatedly).

## 5. Prevention by planning: real-income army cap — `sustainableUnits()` + AutoProduction

The real fix is to never over-produce in the first place:

- `sustainableUnits(civ)` now plans the army against the civ's **actual tax
  income** (`maxTaxIncome × current taxRate`, after the luxury it must keep
  for happiness) instead of an assumed 100% tax. Assuming 100% tax
  over-estimated the affordable army, so the AI built units it couldn't
  maintain and then had to disband them. Planning with the real tax rate means
  the AI simply never builds an army it can't afford — disbanding becomes a
  rare last resort.
- `AutoProduction.ensureProductionQueue()` refuses to queue more **military**
  units once `currentUnits + queuedUnits >= sustainableUnits`. It falls back
  to buildings; if no building is available it queues the already-chosen unit
  (or, for a brand-new city, a settler/scout) so the queue never looks empty.
- **Scouts and settlers are exempt** from the military cap — they're cheap and
  grow the economy (a settler founds a city that adds free support + income),
  so expansion never stalls. Settler count is still bounded by the per-profile
  expansion params.
- Urgent defenders (a city under threat) are still produced via
  `determineProductionItem` regardless of the cap — only queue *follow-ups* are
  capped, so immediate defense is never blocked.
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
