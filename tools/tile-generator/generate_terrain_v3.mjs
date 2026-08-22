/**
 * Terrain generation v3
 *
 * Changes from v2:
 *  - Grassland: less saturated, warmer yellow-green
 *  - Features: 256×384 (1.5:1 ratio), more top-down perspective
 *  - Hills: no dedicated base texture (uses grassland base in code)
 *  - River: no dedicated texture (uses ocean base in code)
 *
 * Run: node generate_terrain_v3.mjs
 */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = 'http://localhost:3456';
const MODEL  = 'fal-ai/flux-2/turbo';

const REGENERATE_TILES = [
  {
    name: 'terrain_grassland',
    prompt: 'seamless tileable flat top-down 2D ground texture, gentle grassy meadow, medium warm yellow-green grass, natural earth tones mixed in, subdued muted palette, NOT oversaturated, NOT neon green, similar to Civilization 2 classic terrain, soft warm sunlight, tiny dry herbs and clover visible, no trees no rocks, perfectly flat top-down view, painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_plains',
    prompt: 'seamless tileable flat top-down 2D ground texture, flat savanna plains, dry pale golden-green short grass with patches of bare soil, very subdued muted earthy palette, NOT green, warm tan and ochre tones, similar to Civilization 2 classic plains terrain, no trees, flat top-down view, painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
];

// Feature sprites regenerated at 256×384 (1.5:1 ratio).
// Lower 256×256 = sits on the tile, upper 256×128 = extends above tile edge.
// Prompts emphasize a steeper top-down perspective so the canopies look flat.
const FEATURE_SPRITES_RAW = [
  {
    name: 'terrain_forest_feature_raw',
    saveName: 'terrain_forest_feature',
    prompt: 'isolated terrain feature sprite for 2D strategy game tile, cluster of 3-4 deciduous trees seen from steep 60-degree top-down isometric angle like Civilization 2 or Heroes of Might and Magic 3, round dark green canopies dominate the view taking up most of the image, short trunks barely visible at the base, overhead view emphasizing the circular canopy shape, classic strategy game art, hand-painted warm colors, feature sits in the lower 70 percent of the image, clean solid pale background for easy removal, 256x384 portrait',
    w: 256, h: 384,
  },
  {
    name: 'terrain_jungle_feature_raw',
    saveName: 'terrain_jungle_feature',
    prompt: 'isolated terrain feature sprite for 2D strategy game tile, dense tropical jungle canopy seen from steep 60-degree top-down isometric angle like Civilization 2, large overlapping dark green palm and tropical tree canopies visible mostly from above, very lush and dense, overhead circular canopy shapes dominate, feature sits in the lower 70 percent of the image, classic strategy game art, hand-painted, clean solid pale background for easy removal, 256x384 portrait',
    w: 256, h: 384,
  },
  {
    name: 'terrain_hills_feature_raw',
    saveName: 'terrain_hills_feature',
    prompt: 'isolated terrain feature sprite for 2D strategy game tile, a single rounded grassy hill mound seen from steep 60-degree top-down isometric angle like Civilization 2 or Heroes of Might and Magic 3, hill mound has warm green grass with slightly brighter lit top and darker shadowed sides, compact oval shape when seen from above, feature sits in the lower 70 percent of the image, no trees on the hill, classic strategy game art, hand-painted, clean solid pale background for easy removal, 256x384 portrait',
    w: 256, h: 384,
  },
  {
    name: 'terrain_mountains_feature_raw',
    saveName: 'terrain_mountains_feature',
    prompt: 'isolated terrain feature sprite for 2D strategy game tile, a dramatic rocky mountain peak seen from steep 60-degree top-down isometric angle like Civilization 2 or Heroes of Might and Magic 3, grey craggy stone with white snow at the peak, steep rocky sides visible from above, the mountain base is wide and peak rises to a point, feature sits in the lower 60 percent of the image with the peak reaching into the upper 40 percent, classic strategy game art, hand-painted, clean solid pale background for easy removal, 256x384 portrait',
    w: 256, h: 384,
  },
  {
    name: 'terrain_swamp_feature_raw',
    saveName: 'terrain_swamp_feature',
    prompt: 'isolated terrain feature sprite for 2D strategy game tile, a gnarled dead willow tree standing in dark murky swamp water seen from steep 60-degree top-down isometric angle like Civilization 2, twisted bare dark branches seen slightly from above, mossy bark, dark murky water visible at the base, feature sits in the lower 70 percent of the image, classic strategy game art, hand-painted, clean solid pale background for easy removal, 256x384 portrait',
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
  const { join } = await import('path');
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

  console.log('\n✅ Done!');
}

main().catch(console.error);
