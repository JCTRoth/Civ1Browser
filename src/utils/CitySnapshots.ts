/**
 * Shared helpers to produce JSON-safe snapshots of city objects, used by the
 * game progression exporter (GameProgression) and the game log (GameLogger).
 *
 * Live City objects carry method references (e.g. `processTurn`) that would be
 * dropped silently by JSON.stringify, so the serializable fields are extracted
 * explicitly here.
 */

export interface CitySnapshot {
  id: string;
  name: string;
  civilizationId: number;
  col: number;
  row: number;
  population: number;
  production: number;
  food: number;
  gold: number;
  science: number;
  productionProgress?: number;
  buildQueue?: unknown[];
  currentProduction?: unknown;
  carriedOverProgress?: number;
  isCapital?: boolean;
  yields?: { food: number; production: number; trade: number };
  foodStored?: number;
  foodNeeded?: number;
  foodRequired?: number;
  productionStored?: number;
  buildings?: unknown[];
  shields?: number;
  productionQueue?: unknown[];
  autoProduction?: boolean;
  output?: unknown;
}

/** Convert a live City object into a plain JSON-safe snapshot. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeCity(city: any): CitySnapshot {
  return {
    id: String(city?.id ?? ''),
    name: city?.name ?? '',
    civilizationId: city?.civilizationId ?? 0,
    col: city?.col ?? 0,
    row: city?.row ?? 0,
    population: city?.population ?? 0,
    production: city?.production ?? 0,
    food: city?.food ?? 0,
    gold: city?.gold ?? 0,
    science: city?.science ?? 0,
    productionProgress: city?.productionProgress,
    buildQueue: city?.buildQueue ? [...city.buildQueue] : undefined,
    currentProduction: city?.currentProduction ?? undefined,
    carriedOverProgress: city?.carriedOverProgress,
    isCapital: city?.isCapital,
    yields: city?.yields ? { ...city.yields } : undefined,
    foodStored: city?.foodStored,
    foodNeeded: city?.foodNeeded,
    foodRequired: city?.foodRequired,
    productionStored: city?.productionStored,
    buildings: city?.buildings ? [...city.buildings] : undefined,
    shields: city?.shields,
    productionQueue: city?.productionQueue ? [...city.productionQueue] : undefined,
    autoProduction: city?.autoProduction,
    output: city?.output,
  };
}

/** Convert an array of live City objects into JSON-safe snapshots. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeCities(cities: any[]): CitySnapshot[] {
  return (cities ?? []).map((c) => serializeCity(c));
}

/** Engine event names whose payload carries a city object. */
export const CITY_EVENTS: ReadonlySet<string> = new Set<string>([
  'CITY_FOUNDED',
  'CITY_CAPTURED',
  'CITY_DESTROYED',
  'CITY_ATTACKED',
  'CITY_PRODUCTION_CHANGED',
  'CITY_PRODUCTION_PHASE',
  'CITY_DISORDER',
  'BUILDING_COMPLETED',
  'BUILDING_PURCHASED',
  'UNIT_PRODUCED',
  'UNIT_PURCHASED',
]);

export function isCityEvent(event: string): boolean {
  return CITY_EVENTS.has(event);
}

/** Turn boundary events that should carry the active player's full city JSONs. */
export function isTurnBoundaryEvent(event: string): boolean {
  return event === 'TURN_START' || event === 'TURN_END';
}
