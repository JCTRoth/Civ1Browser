/**
 * Terrain generation v4
 *
 * Changes from v3:
 *  - Grassland: lower contrast, less saturated, natural muted green (not neon).
 *  - Feature sprites: 256×384 (1.5:1) — the lower 256×256 sits on the tile and
 *    only the top 128px extends over the tile above.
 *  - Trees (forest/jungle/swamp): steep top-down / bird's-eye view — circular
 *    canopy shapes seen from above, trunks barely visible. No side view.
 *  - Hills: no dedicated base texture (code reuses the grass base).
 *  - River: no dedicated base texture (code reuses the ocean base); banks come
 *    from the colour-transition pass in TerrainTextureManager.ts.
 *
 * Run: FAL_AI_KEY=... node generate_terrain_v4.mjs   (server must be running)
 */

const SERVER = 'http://localhost:3456';
const MODEL  = 'fal-ai/flux-2/turbo';

// ─── Base ground tiles (flat, seamless, top-down, 256×256) ──────────────────
// Only regenerate what changed. Everything else stays as-is on disk.
const REGENERATE_TILES = [
  {
    name: 'terrain_grassland',
    prompt: 'seamless tileable flat top-down 2D ground texture, natural grassy meadow, soft muted sage-green short grass with gentle tonal variation, earthy yellow-olive undertones, subdued low-contrast palette, NOT saturated, NOT neon green, NOT vivid emerald, calm even lighting, faint tiny clover and dry herb details, classic Civilization 2 style strategy game ground tile, no trees no rocks, perfectly flat top-down view, painterly illustration, no borders or frame, uniform texture across entire image',
    w: 256, h: 256,
  },
];

// ─── Feature sprites (1.5:1 = 256×384, transparent after rembg) ─────────────
// Lower 256×256 = sits on the tile; upper 128 = extends over the tile above.
// Prompts force a steep top-down / bird's-eye view so canopies read as circles.
const FEATURE_SPRITES_RAW = [
  {
    name: 'terrain_forest_feature_raw',
    saveName: 'terrain_forest_feature',
    prompt: 'isolated terrain feature sprite for 2D strategy game tile, a dense thick forest grove with many overlapping rounded deciduous tree canopies packed tightly together viewed from directly above (90-degree bird\'s-eye top-down view), the entire lower 70 percent of the image filled with interlocking circular leafy canopy tops, no gaps showing the ground or trunks, rich deep green hand-painted canopies with varied leaf clusters and soft warm highlights, classic Civilization 2 or Wesnoth strategy game art style, clean solid pale neutral background for easy background removal, portrait 256x384, no side view, no ground, no trunks, no drop shadows',
    w: 256, h: 384,
  },
  {
    name: 'terrain_jungle_feature_raw',
    saveName: 'terrain_jungle_feature',
    prompt: 'isolated terrain feature sprite for 2D strategy game tile, dense tropical jungle canopy viewed from directly above (90-degree bird\'s-eye top-down view), large overlapping dark green palm fronds and broad tropical leaves seen flat from above, circular canopy shapes fill the lower 70 percent of the image, very lush and dense, trunk and ground hidden, classic Civilization 2 or Wesnoth strategy game art style, hand-painted, clean solid pale neutral background for easy background removal, portrait 256x384, no side view, no ground',
    w: 256, h: 384,
  },
  {
    name: 'terrain_hills_feature_raw',
    saveName: 'terrain_hills_feature',
    prompt: 'isolated terrain feature sprite for 2D strategy game tile, a single large rounded grassy hill seen from directly above (90-degree top-down view), gently rounded smooth grassy crown with muted earthy olive-green grass, soft lighter yellow-green highlight on the top of the mound and soft darker green shading around the outer rim and in the shallow dips, subtle short grass tuft texture scattered across the surface, the hill fills the entire lower 90 percent of the image edge to edge and is cut off by the bottom edge so it touches the bottom border with no gap below it, the feature fills a square tile footprint (flat square view, not a diamond or isometric shape), no trees no rocks no paths, classic Civilization 2 or Wesnoth strategy game art style, hand-painted, clean solid pale neutral background for easy background removal, portrait 256x384',
    w: 256, h: 384,
  },
  {
    name: 'terrain_mountains_feature_raw',
    saveName: 'terrain_mountains_feature',
    prompt: 'isolated terrain feature sprite for 2D strategy game tile, a dramatic rocky mountain peak viewed from a steep top-down angle, grey craggy stone ridges radiating from a central summit with white snow at the peak, wide rocky base with the peak as the highest point seen slightly from above, feature sits in the lower 60 percent with the summit reaching into the upper 40 percent, classic Civilization 2 or Wesnoth strategy game art style, hand-painted, clean solid pale neutral background for easy background removal, portrait 256x384',
    w: 256, h: 384,
  },
  {
    name: 'terrain_swamp_feature_raw',
    saveName: 'terrain_swamp_feature',
    prompt: 'isolated terrain feature sprite for 2D strategy game tile, a gnarled dead tree viewed from a steep top-down angle, twisted bare dark branches radiating outward seen from above, mossy bark, dark murky swamp water visible at the base, feature sits in the lower 70 percent of the image, classic Civilization 2 or Wesnoth strategy game art style, hand-painted, clean solid pale neutral background for easy background removal, portrait 256x384, no side view',
    w: 256, h: 384,
  },
];

async function post(endpoint, body) {
  const r = await fetch(`${SERVER}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function generateTile(tile) {
  return post('/api/generate', { model: MODEL, prompt: tile.prompt, tileName: tile.name, width: tile.w, height: tile.h });
}

async function removeBg(filename) {
  return post('/api/remove-bg', { tileName: filename + '.png', bgModel: 'fal-ai/imageutils/rembg' });
}

async function renameTile(from, to) {
  const { readFileSync, writeFileSync, existsSync, unlinkSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dir  = join(__dirname, '..', '..', 'public', 'assets', 'tiles');
  const src  = join(dir, from + '.png');
  const dest = join(dir, to   + '.png');
  if (!existsSync(src)) { console.error(`    ✗ not found: ${src}`); return false; }
  writeFileSync(dest, readFileSync(src));
  unlinkSync(src);
  return true;
}

async function main() {
  console.log('\n═══ Base tile re-generations (' + REGENERATE_TILES.length + ') ═════════════');
  for (const t of REGENERATE_TILES) {
    process.stdout.write(`  → ${t.name} … `);
    try {
      const r = await generateTile(t);
      console.log(r.ok ? `✓ (${(r.size/1024).toFixed(0)}KB)` : `✗ ${r.error}`);
    } catch (e) { console.log(`✗ ${e.message}`); }
  }

  console.log('\n═══ Feature sprites raw (' + FEATURE_SPRITES_RAW.length + ') ═════════════════');
  for (const s of FEATURE_SPRITES_RAW) {
    process.stdout.write(`  → ${s.name} … `);
    try {
      const r = await generateTile(s);
      console.log(r.ok ? `✓ (${(r.size/1024).toFixed(0)}KB)` : `✗ ${r.error}`);
    } catch (e) { console.log(`✗ ${e.message}`); }
  }

  console.log('\n═══ Background removal ══════════════════════════════════════');
  for (const s of FEATURE_SPRITES_RAW) {
    process.stdout.write(`  → rembg ${s.name} … `);
    try {
      const r = await removeBg(s.name);
      if (r.ok) {
        process.stdout.write(`✓ → rename to ${s.saveName} … `);
        console.log(await renameTile(s.name, s.saveName) ? '✓' : '✗');
      } else { console.log(`✗ ${r.error}`); }
    } catch (e) { console.log(`✗ ${e.message}`); }
  }

  console.log('\n✅ Done! Review with: http://localhost:3000/?quickstart');
}

main().catch(console.error);
