# Round Manager and Automated Path Following Implementation

## Overview
This document describes the implementation of automated unit path following and the dedicated Round Manager system.

## Components Created/Modified

### 1. RoundManager (`src/game/engine/RoundManager.ts`)
**Purpose**: Manages turn execution and ensures all players (human and AI) complete their moves properly.

**Key Features**:
- **Path Storage**: Maintains a Map of unit paths (unitId -> array of {col, row} positions)
- **Automated Movement**: Processes unit movements at the start of each turn
- **Path Management**: Set, get, clear, and cleanup paths for units
- **Turn Execution**: Handles civilization turns and triggers AI moves when appropriate

**Main Methods**:
```typescript
setUnitPath(unitId, path)           // Store a path for a unit
getUnitPath(unitId)                 // Retrieve a unit's path
clearUnitPath(unitId)               // Remove a unit's path
getAllUnitPaths()                   // Get all stored paths
processAutomatedMovements(civId)    // Execute automated movements for a civilization
executeCivilizationTurn(civId)      // Execute complete turn for a civilization
startNewRound(activePlayer)         // Start a new round (called on turn advance)
cleanupDestroyedUnits(unitIds)      // Remove paths for destroyed units
```

**Path Following Logic**:
1. At the start of each turn, checks all units for the active civilization
2. For each unit with a stored path and remaining moves:
   - Attempts to move to the next position in the path
   - If successful: removes that step from the path and continues
   - If movement fails: clears the entire path
   - Continues until unit runs out of moves or path is complete

### 2. GameEngine Integration (`src/game/engine/GameEngine.ts`)

**Changes Made**:
- Added `import { RoundManager } from './RoundManager'`
- Added `roundManager: RoundManager` property
- Initialized RoundManager in constructor: `this.roundManager = new RoundManager(this)`
- Modified `processTurn()` to:
  - Log turn processing steps
  - Clean up paths for destroyed units
  - Call `roundManager.startNewRound()` to execute automated movements

**Turn Flow**:
```
processTurn() called
  ↓
Advance to next player
  ↓
Reset unit moves
  ↓
Clean up destroyed unit paths
  ↓
RoundManager.startNewRound(activePlayer)
  ↓
  → processAutomatedMovements (follow paths)
  → executeCivilizationTurn (handle AI if needed)
  ↓
Continue with city production, etc.
```

### 3. GameCanvas Integration (`src/components/game/GameCanvas.tsx`)

**Changes Made**:
- Added sync with RoundManager when setting paths
- Added sync when updating paths after movement
- Added useEffect to sync paths from RoundManager on turn changes

**Path Synchronization Points**:
1. **When setting GoTo destination**: Syncs path to RoundManager
2. **After automatic movement**: Syncs remaining path to RoundManager
3. **When continuing existing path**: Syncs updated path to RoundManager
4. **On turn change**: Loads all paths from RoundManager to update UI

**Example Code**:
```typescript
// Setting path
if (gameEngine && gameEngine.roundManager) {
  gameEngine.roundManager.setUnitPath(gotoUnit.id, pathToFollow);
}

// Syncing on turn change
useEffect(() => {
  if (gameEngine && gameEngine.roundManager) {
    const paths = gameEngine.roundManager.getAllUnitPaths();
    setUnitPaths(paths);
  }
}, [gameState.currentTurn, gameEngine]);
```

### 4. SettlementEvaluator Extended Logging (`src/game/engine/SettlementEvaluator.ts`)

**Enhanced Logging Added**:
- **getTileYields**: Changed `console.log` to `console.warn` for unknown terrain, improved yield logging format
- **hasWaterAccess**: Added checkmark/cross symbols (✓/✗) for better visual scanning of logs
- **evaluateArea**: Added detailed score calculation formula in logs

**Example Log Output**:
```
[SettlementEvaluator] getTileYields: Terrain 'GRASSLAND' => food:2, shields:1, gold:0
[SettlementEvaluator] hasWaterAccess: ✓ Found water at adjacent tile (5, 4) - OCEAN
[SettlementEvaluator] evaluateArea: Final score = (12*2.0) + (6*1.0) + (3*0.5) + 2 = 33.5
```

## How It Works

### User Workflow
1. User selects a unit and clicks "Go To" from context menu
2. User clicks destination tile
3. Path is calculated using Pathfinding.ts
4. Path is stored in both GameCanvas state and RoundManager
5. Unit automatically moves first step (if has moves)
6. Path is displayed as red line with arrow

### Automated Turn Flow
1. When player ends turn, `processTurn()` is called
2. Active player advances to next civilization
3. All unit moves are reset for the new active player
4. RoundManager cleans up paths for destroyed units
5. RoundManager processes automated movements:
   - For each unit with a path:
     - Move along path while unit has moves
     - Update path after each successful move
     - Clear path if movement fails or completes
6. If AI civilization, trigger AI turn processing
7. Continue with city production and other game mechanics

### Path Persistence
- Paths are stored in RoundManager (game engine level)
- Paths persist across turns
- Paths are synchronized to GameCanvas for UI display
- Only displayed for selected units (red line with arrow)
- Automatically cleared when:
  - Unit reaches destination
  - Movement fails (blocked terrain, enemy unit, etc.)
  - Unit is destroyed

## Benefits

1. **Automated Movement**: Units follow their set paths automatically each turn
2. **Reduced Micromanagement**: Players don't need to manually move units every turn
3. **Clear Visual Feedback**: Red path lines show unit destinations
4. **Robust Path Management**: Handles failures gracefully
5. **Clean Architecture**: Centralized turn management in RoundManager
6. **Better Debugging**: Enhanced logging in SettlementEvaluator

## Future Enhancements

Possible improvements:
- Add UI button to cancel unit paths
- Show path ETA (estimated turns to arrival)
- Alert player when path is blocked
- Allow path modification without canceling
- Support waypoints for complex paths
- Add path preview before confirming

## Testing Recommendations

1. **Basic Path Following**:
   - Set path for unit
   - End turn
   - Verify unit moves along path

2. **Multiple Units**:
   - Set paths for multiple units
   - Verify each follows its path independently

3. **Path Obstacles**:
   - Set path that becomes blocked
   - Verify path is cleared appropriately

4. **Turn Changes**:
   - Set path, end turn multiple times
   - Verify path persists and continues

5. **AI Players**:
   - Verify AI turns execute after automated movements
   - Check that AI doesn't interfere with path following

6. **Unit Destruction**:
   - Set path for unit
   - Destroy unit
   - Verify path is cleaned up

## Console Logging

All major operations are logged with `[RoundManager]` or `[SettlementEvaluator]` prefixes for easy filtering:

```javascript
// Filter RoundManager logs in browser console
console.log = (function(log) {
  return function() {
    if (arguments[0] && arguments[0].includes('[RoundManager]')) {
      log.apply(console, arguments);
    }
  };
})(console.log);
```
