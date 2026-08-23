import type { TextureGroup, FalModel, GenerateResult } from './types';

const BASE = '/api';

export async function fetchTextures(): Promise<TextureGroup[]> {
  const res = await fetch(`${BASE}/textures`);
  const data = await res.json();
  return data.groups as TextureGroup[];
}

export async function generate(params: {
  model: string;
  prompt: string;
  tileName: string;
  width: number;
  height: number;
}): Promise<GenerateResult> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function useInGame(filenames: string | string[]): Promise<{ ok: boolean; results?: Array<{ filename: string; ok: boolean; targetName?: string; error?: string }>; error?: string }> {
  const filenameList = Array.isArray(filenames) ? filenames : [filenames];
  const res = await fetch(`${BASE}/use-in-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filenames: filenameList }),
  });
  return res.json();
}

export async function removeFromGame(filenames: string | string[]): Promise<{ ok: boolean; results?: Array<{ filename: string; ok: boolean; targetName?: string; error?: string }>; error?: string }> {
  const filenameList = Array.isArray(filenames) ? filenames : [filenames];
  const res = await fetch(`${BASE}/remove-from-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filenames: filenameList }),
  });
  return res.json();
}

export async function removeBg(filename: string, bgModel: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/remove-bg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tileName: filename, bgModel, source: 'textures' }),
  });
  return res.json();
}

export async function deleteTexture(filename: string): Promise<void> {
  await fetch(`${BASE}/textures/${encodeURIComponent(filename)}`, { method: 'DELETE' });
}

export async function fetchModels(): Promise<FalModel[]> {
  const res = await fetch(`${BASE}/models`);
  const data = await res.json();
  return data.models as FalModel[];
}

export async function estimateCost(model: string, width: number, height: number): Promise<{
  estimatedCost?: number;
  currency?: string;
  error?: string;
}> {
  const res = await fetch(`${BASE}/estimate-cost`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, width, height }),
  });
  return res.json();
}
