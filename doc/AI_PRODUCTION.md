# AI Production Profiles & Expansion-First AutoProduction

AutoProduction now gives every civilization a distinct, expansion-leaning
identity, and reacts to key game events immediately.

## Per-civ production profile

Each civ gets a **fixed `productionProfile`** (assigned by civ index at game
start — `GameEngine.createCivilizations` → `getCivProductionProfile` in
`src/game/engine/AITypes.ts`). It reuses the existing `StrategyProfile` union:

| Index | Profile | Expansion cadence (settlers kept on hand) |
|---|---|---|
| 0 | `early_expansion` | 1 per 2 cities (up to 6), +1 while tiny |
| 1 | `military_expansion` | 1 per 3 cities (up to 4) |
| 2 | `science_focus` | 1 per 4 cities (up to 3) |
| 3 | `defensive_turtle` | 1 per 5 cities (up to 3) |
| 4 | `wonder_rush` | 1 per 4 cities (up to 3) |
| 5 | `balanced_growth` | 1 per 3 cities (up to 4), +1 while tiny |

The settler corps is a **scaling target** (`ceil(cities / settlersPerCities)`,
clamped) — expansion **never hard-stops**; a big empire still replaces consumed
settlers instead of freezing at a city cap. Profiles only differ in how fast
they expand.

- `AutoProduction.determineProductionItem` reads the civ's profile
  (`AutoProduction.getStrategyForCiv` → `civ.productionProfile`), so each AI
  builds a different mix of settlers/units/buildings — which shapes its
  behavior.
- Research is **seeded** from the same profile (`AIManager.runAITurn` sets
  `aiState.strategyProfile`), so research starts aligned with production.
  (Full production+research coupling is a later step.)

## Expansion-first

- The first AI city now starts a **settler** (`GameEngine.pickInitialAIProduction`),
  so a capital expands instead of building infrastructure (e.g. a hospital).
- The settler branch in AutoProduction allows `population >= 1` and is tuned
  by `EXPANSION_PARAMS` — `defensive_turtle` is no longer excluded from
  settler production (it expands modestly instead of stagnating at 1 city).
- The old `maxCities` hard ceiling was removed: a civ keeps a settler corps
  proportional to its city count, so expansion continues at every empire size.
- The existing economy unit-cap still stops settler/army spam when the civ
  can't afford upkeep.

## Event-reactive production

`AutoProduction.onGameEvent(eventType, data)` is wired into the engine event
tap in `src/hooks/UseGameEngine.ts`:

- `UNIT_PRODUCED` / `BUILDING_COMPLETED` → top up the city's queue immediately.
- `CITY_CAPTURED` / `CITY_DESTROYED` → re-pick production for the affected
  civ(s) so they rebuild or reinforce.
- `WAR_DECLARED` → re-pick production for both sides (fresh threat eval).
- New research: `TurnManager.processCivilizationResearch` re-picks production
  after a tech completes (newly unlocked units/buildings become available).

## Files

- `types/game.ts` — `AIProductionProfile`, `Civilization.productionProfile`,
  `GameEngine.autoProduction`
- `src/game/engine/AITypes.ts` — `CIV_PRODUCTION_PROFILES`, `getCivProductionProfile`
- `src/game/engine/GameEngine.ts` — profile assignment, settler-first initial production
- `src/game/engine/AutoProduction.ts` — `EXPANSION_PARAMS`, profile-driven
  settler cadence, `onGameEvent`
- `src/game/engine/AIManager.ts` — research seeded from profile
- `src/game/engine/TurnManager.ts` — research completion → production re-pick
- `src/hooks/UseGameEngine.ts` — event tap → `onGameEvent`

Tests: `tests/ai/productionProfiles.test.ts` (+ `tests/aiSimulation.test.ts` and
`tests/humanVsAI.test.ts` seed a scout since the AI now expands before scouting).
