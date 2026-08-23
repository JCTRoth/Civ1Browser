export interface TextureVariant {
  filename: string;
  path: string;
  size: number;
  n: number;
  mtime: number;
}

export interface GameTile {
  filename: string;
  path: string;
  size: number;
  mtime: number;
}

export interface TextureGroup {
  name: string;
  variants: TextureVariant[];
  inGame: GameTile | null;
  inGameTiles: GameTile[];
}

export interface FalModel {
  id: string;
  name: string;
  description: string;
  status: string;
  pricing: null | { cost: string; unit: string; type: string };
}

export interface GenerateResult {
  ok: boolean;
  filename?: string;
  path?: string;
  size?: number;
  n?: number;
  error?: string;
}

export interface Preset {
  name: string;
  prompt: string;
  color: string;
  file: string;
  w: number;
  h: number;
}
