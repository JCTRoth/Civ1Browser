# AI vs AI Session Analysis & Improvements

Generated: 2026-08-08 · Mode: `AI_VS_AI` (Computer vs Computer, 40x40, auto-playing)

## Infrastructure built

1. **`AI_VS_AI` map type** — selectable under *Fine-tune Your Challenge → Map Type*.
   - 40x40 map, all civilizations are AI-controlled (no human player).
   - Starts automatically and keeps playing via the normal turn chain.
   - Auto-enables dev mode so the whole map is observable.
2. **Move-by-move log file** — every move, combat, city event and AI decision is
   recorded as structured JSONL into `game-logs/<sessionId>.log`.
   - `src/utils/GameLogger.ts` (browser singleton, batches lines).
   - Vite dev-server middleware `/__game_log` persists them to disk
     (`vite.config.js`).
   - Wired via `src/hooks/UseGameEngine.ts` (event tap) and `src/App.tsx`
     (session start on game start).
3. **Session driver** — `scripts/run-ai-session.mjs` starts a Computer vs
   Computer game headlessly, lets it run N seconds, prints a summary.

## Diagnosis from the first 488-round session

| Metric | Before fixes |
|--------|--------------|
| Unit moves | 269 |
| Combat events | 0 |
| Unit skips | 7,997 (7,993 were "Move failed") |
| Browser errors | n/a |

Root causes found in the log:

- **Terrain-blind pathfinding**: `HexGrid.findPath` (A*) ignored terrain
  passability. The AI repeatedly tried to step into ocean tiles (row 0 / col 0
  are ocean on the 40x40 map), `moveUnit` rejected the step, and the unit was
  permanently skipped every round (7,993 failed moves to ocean).
- **Dead scout enemy search**: `GameEngine.measurePerformance` did not exist →
  every scout's enemy scan threw and was swallowed by try/catch.
- **Missing `recordEnemyLocation`**: removed from GameEngine but still called by
  the scout → enemy intelligence was never stored, so no offensive plans.
- **Broken produced units**: `TurnManager.createProducedUnit` created units
  WITHOUT `attack`/`defense`/`maxMoves`. `attacker.attack` was `undefined` →
  combat strength `NaN` → produced units ALWAYS lost combat (624 defeats,
  0 victories).
- **Dead city combat**: `moveUnit` called the legacy `Unit.attackCity()` class
  API which is incompatible with engine plain-object units → `TypeError`
  every time an AI unit attacked a city.

## Fixes applied

1. `HexGrid.findPath` — added optional `isPassable(col,row)` callback; A*
   never routes through impassable terrain, and targets on impassable tiles
   yield no path.
2. `GameEngine.isTilePassable` / `getPassabilityFilter` helpers.
3. `AIManager` — all pathfinding calls now terrain-aware; scout exploration
   targets and nearby-unexplored picks filter to passable tiles.
4. `AIManager.tryFallbackMove` — when the primary move/path step/no-path fails,
   the unit moves to the best passable unoccupied neighbor instead of being
   skipped (units no longer get permanently stuck).
5. `GameEngine.measurePerformance` — implemented (was missing).
6. `GameEngine.recordEnemyLocation` — restored (scout intelligence works).
7. `GameEngine.resolveCityCombat` — native city combat (replaces dead
   `Unit.attackCity` call): attacker attack vs city defense (population,
   doubled with walls); captures/destroys cities and damages attackers.
8. `TurnManager.createProducedUnit` — produced units now carry full stats
   (`attack`, `defense`, `maxMoves`, `isVeteran`) mirroring `createUnit`.

## Round 2 improvements (stalemate & logistics)

Long-session analysis (996 rounds, 4 min) revealed two further issues:

- **City-siege starvation**: combat units chased the nearest roaming enemy
  unit (scout/archer) instead of converging on enemy cities → `CITY_ATTACKED`
  never fired and games ended in stalemate (no civ eliminated).
  - FIX (`AIManager.chooseAITarget`): when at war, the wide-area scan now
    prioritises the closest enemy **city** over units. Exception: an
    ADJACENT enemy unit is still engaged first (defence) so units don't
    march past an immediate threat.
- **Log-field mismatch for wars**: `WAR_DECLARED` events were emitted with
  `aggressorId`/`targetId` but the logger read `civilizationId`/
  `targetCivilizationId` → every war logged "civ undefined vs civ undefined".
  - FIX (`GameLogger`): read the correct fields; also added human-readable
    formatting for `CITY_DESTROYED` and `CITY_ATTACKED`.

## Results after fixes (fresh sessions)

| Metric | Before | After |
|--------|--------|-------|
| Unit moves (45–75s session) | 269 | 2,298–3,438 |
| Combat events | 0 | 73W / 78L (balanced) |
| Unit skips | 7,997 | 226–306 |
| Cities founded | 9 | 8–9 |
| City captures | 0 | ✅ observed |
| Wars declared | — | 6–12 (correctly logged) |
| Browser errors | — | 0 |

Behavior observed: civilizations expand with settlers, found cities, build
scout/archer armies, declare war, engage in balanced combat, and capture enemy
cities — all while every move is logged.

## Verification

- `npm run type-check` ✅ · `npm run knip` ✅ · `npm run build` ✅
- 208 AI-related unit tests ✅ (the single failing test `cityTileGrowth` is
  pre-existing and unrelated — verified via baseline stash).
- `npm run lint` still reports the 515 pre-existing `no-explicit-any` warnings
  (0 errors); no new warnings introduced.
