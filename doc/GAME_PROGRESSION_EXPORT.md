# Game Progression Export

The **Info → Download Game Progression List** action exports the current game
as a single JSON file (`civ1-progression-<sessionId>.json`) intended for
post-game analysis and AI improvement.

## What the file contains

```jsonc
{
  "meta": {
    "sessionId": "aivsai-2026-08-14T12-15-39-521Z",
    "mapType": "AI_VS_AI",
    "difficulty": "PRINCE",
    "numberOfCivilizations": 2,
    "playerCivilization": 6,
    "startedAt": "...",
    "exportedAt": "..."
  },
  "summary": {
    "roundsRecorded": 42,
    "civilizations": ["Germans", "Russians"],
    "eventCounts": { "UNIT_MOVED": 1234, "COMBAT_VICTORY": 12, /* ... */ }
  },
  "progression": [
    {
      "round": 1,
      "year": -3980,
      "yearLabel": "3980 BC",
      "civs": {
        "0": {
          "id": "0",
          "name": "Germans",
          "leaderName": "Frederick the Great",
          "color": "...",
          "isHuman": false,
          "alive": true,
          "gold": 50,
          "science": 0,
          "taxRate": 50,
          "scienceRate": 50,
          "luxuryRate": 0,
          "government": "despotism",
          "cities": 1,
          "cityData": [
            {
              "id": "city-3",
              "name": "Berlin",
              "civilizationId": 0,
              "col": 12,
              "row": 8,
              "population": 1,
              "production": 0,
              "food": 0,
              "gold": 0,
              "science": 0,
              "productionProgress": 0.25,
              "currentProduction": "warrior",
              "isCapital": true,
              "foodStored": 0,
              "foodNeeded": 2,
              "productionStored": 0,
              "buildings": [],
              "autoProduction": false
            }
          ],
          "units": 1,
          "technologies": 3,
          "techList": ["irrigation", "mining", "roads"],
          "currentResearch": "pottery",
          "researchProgress": 12,
          "warWith": [],
          "personality": { "aggression": 50, "expansion": 60, /* ... */ },
          "priorities": { "militaryUnits": 20, "settlers": 35, /* ... */ }
        }
      }
    }
  ],
  "log": [
    {
      "ts": "...",
      "round": 1,
      "player": 0,
      "event": "TURN_START",
      "message": "▶ Turn start — civ 0 (round 1)",
      "detail": {
        "data": { "civilizationId": 0, "roundNumber": 1, "cities": "[array:1]" },
        "cities": [
          {
            "id": "city-3",
            "name": "Berlin",
            "civilizationId": 0,
            "col": 12,
            "row": 8,
            "population": 1,
            "production": 0,
            "food": 0,
            "gold": 0,
            "science": 0,
            "productionProgress": 0.25,
            "currentProduction": "warrior",
            "isCapital": true,
            "foodStored": 0,
            "foodNeeded": 2,
            "productionStored": 0,
            "buildings": [],
            "autoProduction": false
          }
        ]
      }
    },
    { "ts": "...", "round": 1, "player": 0, "event": "UNIT_MOVED", "message": "...", "detail": { } }
  ]
}
```

## How it works

- **`src/utils/GameProgression.ts`** — singleton tracker. Hooks into the engine
  event tap in `src/hooks/UseGameEngine.ts` and records **one snapshot per
  round** (cities, units, techs, gold, science, research, diplomacy, AI
  personality/priorities per civilisation). Each snapshot also includes the
  full per-player city JSONs under `civs.<id>.cityData` (all cities owned by
  that civ at that round, JSON-safe and stripped of function references), so
  the progression file regularly contains the city state of every player.
  `startSession()` is called from `App.tsx` on game start and on auto-restart.
- **`src/utils/GameLogger.ts` → `getAllEntries()`** — returns the full session
  log by fetching `GET /__game_log?session=<id>` and merging with any lines
  still buffered in memory.
- **`vite.config.js`** — the dev-server middleware already persisted log lines
  (POST `/__game_log`); it now also serves them back (GET) as a JSON array.
- **`src/components/ui/GameMenuSheet.tsx`** — the `INFO` menu item
  "📜 Download Game Progression List" triggers the export in `App.tsx`.

## Using it for AI analysis

- `summary.eventCounts` gives a quick overview (how many moves, combats, cities
  founded/captured/destroyed, war declarations, …).
- `progression` is the timeline: compare how each civ's cities/units/techs grow
  round by round, who fell behind in research, when wars started, etc.
- `civs.<id>.cityData` carries the full JSON of each city per round, so you can
  track individual city growth (population, buildings, production queue, food
  storage) turn by turn — not just counts.
- `log` is the raw event stream with timestamps for deep-dive debugging.
  City-related entries carry the full JSON-safe city snapshot under
  `detail.city`, and every `TURN_START` / `TURN_END` carries the active
  player's complete city JSONs under `detail.cities` — so the log regularly
  contains the full city state of every player.
- Economy events: `RATES_CHANGED` (Tax/Science/Luxury changes), `CITY_DISORDER`
  (city enters/leaves disorder), `UNIT_DISBANDED` (upkeep bankruptcy), and
  `economy` log lines (per-turn upkeep/deficit/disbanded totals). Each civ
  snapshot also carries `taxRate` / `scienceRate` / `luxuryRate` / `government`
  so you can correlate rate choices with research and gold over time.

## Notes

- Works for human games and AI-vs-AI sessions. AI-vs-AI sessions get a
  dedicated `aivsai-<timestamp>` session id (see `App.tsx`).
- If the dev server is unreachable, `getAllEntries()` falls back to the
  in-memory buffer, so the export still works (with fewer log lines).
