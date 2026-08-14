# Scout Unit and Enemy Search Implementation

## Overview
This document describes the implementation of the Scout unit and the EnemySearcher system for AI reconnaissance.

## Components Added

### 1. Scout Unit (`src/data/UnitConstants.ts`)

**Unit Properties:**
- **Name:** Scout
- **Icon:** 👁️ (eye emoji)
- **Type:** military
- **Movement:** 2 tiles per turn
- **Attack:** 0.5 (half of warrior)
- **Defense:** 1
- **Cost:** 15 shields
- **Maintenance:** 1 gold per turn
- **Sight Range:** 2 tiles (enhanced vision)

**Unit Constant:**
```typescript
UNIT_TYPES.SCOUT: 'scout'
```

**Production Requirements:**
```typescript
[UNIT_TYPES.SCOUT]: { shields: 15 }
```

### 2. EnemySearcher Class (`src/game/engine/EnemySearcher.ts`)

A sophisticated enemy detection system using a hybrid search algorithm.

**Search Strategy:**
1. **Spiral Search** - Prioritizes nearby enemies by searching outward in expanding square rings
2. **Row-Major Fallback** - Ensures complete coverage by scanning remaining tiles systematically

**Key Methods:**

#### `findNearestEnemy()`
```typescript
public static findNearestEnemy(
  startCol: number,
  startRow: number,
  mapWidth: number,
  mapHeight: number,
  getUnitAt: (col: number, row: number) => any,
  getCityAt: (col: number, row: number) => any,
  isVisible: (col: number, row: number) => boolean,
  civilizationId: number,
  maxRadius?: number
): SearchResult | null
```

Returns the nearest enemy unit or city within visible range.

#### `findAllEnemiesInRadius()`
```typescript
public static findAllEnemiesInRadius(
  centerCol: number,
  centerRow: number,
  radius: number,
  mapWidth: number,
  mapHeight: number,
  getUnitAt: (col: number, row: number) => any,
  getCityAt: (col: number, row: number) => any,
  isVisible: (col: number, row: number) => boolean,
  civilizationId: number
): SearchResult[]
```

Returns all enemies within a specified radius, sorted by distance.

#### `hasVisibleEnemy()`
```typescript
public static hasVisibleEnemy(
  centerCol: number,
  centerRow: number,
  radius: number,
  mapWidth: number,
  mapHeight: number,
  getUnitAt: (col: number, row: number) => any,
  getCityAt: (col: number, row: number) => any,
  isVisible: (col: number, row: number) => boolean,
  civilizationId: number
): boolean
```

Quick check for enemy presence without returning specific location.

**Search Result Interface:**
```typescript
interface SearchResult {
  col: number;           // Enemy tile column
  row: number;           // Enemy tile row
  distance: number;      // Square distance from search origin
  targetType: 'unit' | 'city';  // Type of enemy found
  targetId: string;      // ID of the enemy unit/city
}
```

**Features:**
- Respects fog of war - only searches visible tiles
- Uses visited Set to avoid duplicate checks
- Optimized for medium-size maps (70x50)
- Detailed logging with statistics

### 3. AI Scout Behavior (`src/game/engine/GameEngine.ts`)

**Scout Reconnaissance Flow:**

1. **Enemy Search Phase**
   - Scout uses `EnemySearcher.findNearestEnemy()` to scan for enemies
   - Searches only visible/explored tiles
   - When enemy found, stores location in `unit.enemyFound` and `unit.enemyLocation`

2. **Return to City Phase**
   - Scout identifies nearest own city using `findNearestOwnCity()`
   - Pathfinds back to the city
   - Upon arrival, scout fortifies and triggers warrior production

3. **Warrior Deployment**
   - City production switched to Warrior
   - Enemy location stored in city's `enemyTarget` property
   - Warrior will be sent to stored enemy location upon completion

**New Helper Methods:**

#### `findNearestOwnCity(unit)`
Finds the closest city owned by the unit's civilization using square distance calculation.

#### `triggerWarriorProduction(city, enemyLocation)`
- Sets city production to Warrior
- Stores enemy location for future warrior deployment
- Updates build queue

**AI Production Changes:**
- Human cities: Build Warrior first (default)
- AI cities: Build Scout first (reconnaissance priority)

**Scout Logic in `chooseAITarget()`:**
```typescript
if (unit.type === 'scout') {
  // Check if returning to city after finding enemy
  if (unit.enemyFound) {
    // Return to nearest city, fortify upon arrival, trigger warrior
  }
  
  // Search for enemies
  const enemyResult = EnemySearcher.findNearestEnemy(...);
  if (enemyResult) {
    // Mark enemy found, start returning to city
  }
  
  // Continue exploration if no enemy found
}
```

## Workflow

### AI Turn Processing
1. AI founds city → City builds Scout (not Warrior)
2. Scout completes production → Deploys from city
3. Scout explores map using standard exploration AI
4. Scout uses EnemySearcher during each turn
5. When enemy detected:
   - Scout stores enemy location
   - Scout pathfinds to nearest own city
   - Scout fortifies at city
   - City switches production to Warrior
   - Enemy location stored for warrior deployment

### Key State Management
- `unit.enemyFound` (boolean) - Flag indicating scout found enemy
- `unit.enemyLocation` ({col, row}) - Stored enemy coordinates
- `city.enemyTarget` ({col, row}) - Target for next warrior to attack

## Technical Details

### Search Algorithm Performance
- **Spiral Search:** O(r²) where r is radius to enemy
- **Row-Major Fallback:** O(w×h) worst case where w=width, h=height
- **Early Exit:** Returns immediately upon finding nearest enemy
- **Visited Set:** Prevents redundant tile checks

### Visibility Integration
- Uses tile.visible and tile.explored for visibility checks
- Scouts have enhanced sight range (2 tiles)
- EnemySearcher respects fog of war boundaries
- Only visible enemies can be detected

### Logging Prefixes
- `[AI-SCOUT]` - Scout behavior and decisions
- `[AI-CITY]` - City production changes
- `[EnemySearcher]` - Search progress and results

## Future Enhancements

Possible improvements:
1. **Warrior Deployment:** Implement logic to send produced warriors to stored enemy locations
2. **Multi-Scout Coordination:** Prevent multiple scouts from targeting same enemy
3. **Threat Assessment:** Prioritize high-value targets (cities over units)
4. **Scout Retreat:** Return to city if scout health is low
5. **Patrol Routes:** Define systematic exploration patterns
6. **Intelligence Sharing:** Share discovered enemy locations between units

## Files Modified

- `src/data/UnitConstants.ts` - Added Scout unit definition
- `src/game/engine/EnemySearcher.ts` - New file, enemy search system
- `src/game/engine/GameEngine.ts` - Scout AI behavior, helper methods, production logic

## Testing Recommendations

1. Start game as human player
2. Wait for AI to found first city
3. Observe AI building Scout instead of Warrior
4. Watch scout exploration patterns
5. Monitor console for `[AI-SCOUT]` messages
6. Verify scout returns to city when enemy found
7. Confirm city switches to Warrior production
8. Check warrior deployment to enemy location (future)

## Related Documentation

- `doc/AI_SETTLER_INTEGRATION.md` - AI settler behavior using SettlementEvaluator
- `doc/GOTO_MANAGER_IMPLEMENTATION.md` - Pathfinding system used by scouts
- `GAMEPLAY.md` - Overall game mechanics
