/// <reference types="vite/client" />

import type { Unit, City, MapState } from '../../../../types/game';

export class HexDetailModalLogic {
  private readonly selectedHex: { col: number; row: number };
  private readonly map: MapState;
  private units: Unit[];
  private cities: City[];

  constructor(selectedHex: { col: number; row: number }, map: MapState, units: Unit[], cities: City[]) {
    this.selectedHex = selectedHex;
    this.map = map;
    this.units = units;
    this.cities = cities;
  }

  getTile(): MapState['tiles'][0] | null {
    if (!this.selectedHex || !this.map) return null;
    const index = this.selectedHex.row * this.map.width + this.selectedHex.col;
    return this.map.tiles[index] || null;
  }

  getUnitsAtHex(): Unit[] {
    return this.units.filter(u => u.col === this.selectedHex?.col && u.row === this.selectedHex?.row);
  }

  getCityAtHex(): City | undefined {
    return this.cities.find(c => c.col === this.selectedHex?.col && c.row === this.selectedHex?.row);
  }

  getTileType(): string {
    const tile = this.getTile();
    return tile?.type || 'Unknown';
  }

  getTileResource(): string {
    const tile = this.getTile();
    return tile?.resource || 'None';
  }

  getTileImprovement(): string {
    const tile = this.getTile();
    return tile?.improvement || 'None';
  }
}