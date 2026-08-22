/**
 * Terrain generation v2 — Wesnoth-style two-layer approach.
 *
 * Layer 1 — base ground tiles (seamless, flat, top-down, 256×256)
 *   Saved as: terrain_<type>.png
 *
 * Layer 2 — feature sprites (isometric, larger-than-tile, transparent bg, 256×512)
 *   Generated as: terrain_<type>_feature_raw.png
 *   After rembg:  terrain_<type>_feature.png
 *
 * Run: FAL_AI_KEY=... node generate_terrain_v2.mjs
 */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = 'http://localhost:3456';
const MODEL  = 'fal-ai/flux-2/turbo';  // Flux 2 turbo for best quality

// ─── Base ground tiles (flat, seamless, top-down) ────────────────────────────
// These must be 100% flat — no elevated tree shapes, no mountain peaks.
// The feature sprites will provide all 3-D visual interest.

const BASE_TILES = [
  {
    name: 'terrain_ocean',
    prompt: 'seamless tileable flat top-down 2D ground texture, deep ocean water surface, rich cobalt and teal blue tones with gentle ripple caustics, classic strategy game map tile, no waves cresting, perfectly flat water surface, warm painterly illustration style, no borders or frame, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_plains',
    prompt: 'seamless tileable flat top-down 2D ground texture, flat open grassland plains, light golden-green short grass with subtle soil variation, classic strategy game map ground tile, no trees no bushes, perfectly flat, warm painterly style, viewed directly from above, no borders, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_grassland',
    prompt: 'seamless tileable flat top-down 2D ground texture, lush rich green grassland floor, vibrant emerald green short grass with organic blade detail and tiny clovers, classic strategy game ground tile, no trees no rocks, perfectly flat top-down view, warm painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_forest',
    prompt: 'seamless tileable flat top-down 2D ground texture, forest floor, dark mossy ground with fallen leaves, pine needles, root patterns, rich brown-green earthy soil with moss patches, classic strategy game ground tile, no tree trunks visible, flat ground view only, warm painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_jungle',
    prompt: 'seamless tileable flat top-down 2D ground texture, tropical jungle floor, dense dark damp earth with large exotic fallen leaves, roots, and vivid green moss, classic strategy game ground tile, flat ground only no trees, warm humid atmosphere, painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_hills',
    prompt: 'seamless tileable flat top-down 2D ground texture, grassy hillside ground, warm earthy yellow-green short grass with dirt paths and exposed ochre soil, classic strategy game ground tile, flat ground material viewed from above, warm Mediterranean atmosphere, painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_mountains',
    prompt: 'seamless tileable flat top-down 2D ground texture, rocky mountain ground surface, grey limestone rock with cracks and stone fragments, patches of scree and grey gravel, classic strategy game ground tile, flat rock surface viewed from above, no mountain peaks, cool grey palette, painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_desert',
    prompt: 'seamless tileable flat top-down 2D ground texture, desert sand floor, warm golden-orange fine sand with subtle wind ripple pattern, scattered tiny pebbles, classic strategy game ground tile, flat sand surface top-down, hot dry atmosphere, painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_swamp',
    prompt: 'seamless tileable flat top-down 2D ground texture, swamp mud and shallow water floor, dark olive-brown murky mud with stagnant water patches and algae, classic strategy game ground tile, flat wetland ground top-down, gloomy atmosphere, painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_tundra',
    prompt: 'seamless tileable flat top-down 2D ground texture, frozen tundra ground, pale grey-blue frozen earth with sparse dead brown grass tufts and frost crystal patterns, classic strategy game ground tile, flat frozen ground top-down, cold bleak atmosphere, painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_arctic',
    prompt: 'seamless tileable flat top-down 2D ground texture, arctic snow and ice floor, pure white snow with subtle blue-shadow wind-carved ripples and cracked ice veins, classic strategy game ground tile, flat snow surface top-down, crisp cold atmosphere, painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
  {
    name: 'terrain_river',
    prompt: 'seamless tileable flat top-down 2D ground texture, river water surface, clear blue-green shallow water with sandy pebble riverbed visible below, gentle current ripples, classic strategy game ground tile, flat water surface top-down, fresh water atmosphere, painterly style, no borders, uniform across entire image',
    w: 256, h: 256,
  },
];

// ─── Feature sprites (isometric, with background to be removed) ──────────────
// Generated at 256×512: lower 256×256 = ground-level base, upper 256×256 = elevated part.
// Background removal is applied after generation.

const FEATURE_SPRITES_RAW = [
  {
    name: 'terrain_forest_feature_raw',
    saveName: 'terrain_forest_feature',
    prompt: 'isolated game sprite for 2D strategy game tile, cluster of 3 tall deciduous trees, slight isometric top-down angle like classic Civilization or Heroes of Might and Magic, rich dark green leafy canopies, detailed hand-painted illustration style, trees occupy bottom two-thirds of image, canopy tops in upper third, warm natural lighting, clean solid uniform background color for easy removal, no other terrain elements, portrait orientation',
    w: 256, h: 512,
  },
  {
    name: 'terrain_jungle_feature_raw',
    saveName: 'terrain_jungle_feature',
    prompt: 'isolated game sprite for 2D strategy game tile, cluster of tall tropical jungle trees and giant palm fronds, slight isometric top-down angle like classic Civilization, very dense dark green tropical canopy, exotic broad leaves and hanging vines, hand-painted illustration style, trees in lower two-thirds, canopy tops in upper third, lush humid atmosphere, clean solid uniform background for removal, portrait orientation',
    w: 256, h: 512,
  },
  {
    name: 'terrain_hills_feature_raw',
    saveName: 'terrain_hills_feature',
    prompt: 'isolated game sprite for 2D strategy game tile, a single rounded grassy hill mound, slight isometric top-down angle like classic Civilization or Heroes of Might and Magic, warm earthy green hill with light grass, gentle slopes, hand-painted illustration style, hill occupies bottom half of image rising into upper half, clean solid uniform background for easy removal, no trees, portrait orientation',
    w: 256, h: 512,
  },
  {
    name: 'terrain_mountains_feature_raw',
    saveName: 'terrain_mountains_feature',
    prompt: 'isolated game sprite for 2D strategy game tile, dramatic rocky mountain peak, slight isometric top-down angle like classic Civilization or Heroes of Might and Magic, grey rocky mountain with white snow at the top, craggy stone cliffs, hand-painted illustration style, mountain base at bottom quarter rising dramatically to snow peak at top, clean solid uniform background for easy removal, portrait orientation',
    w: 256, h: 512,
  },
  {
    name: 'terrain_swamp_feature_raw',
    saveName: 'terrain_swamp_feature',
    prompt: 'isolated game sprite for 2D strategy game tile, a dead gnarled willow tree standing in dark murky swamp water, slight isometric top-down angle like classic Civilization, twisted bare dark branches, mossy bark, reflective dark water at base, hand-painted illustration style, tree base at bottom rising to bare branches at top, clean solid uniform background for easy removal, portrait orientation',
    w: 256, h: 512,
  },
];

async function post(endpoint, body) {
  const resp = await fetch(`${SERVER}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}

async function generateTile(tile) {
  return post('/api/generate', {
    model: MODEL,
    prompt: tile.prompt,
    tileName: tile.name,
    width: tile.w,
    height: tile.h,
  });
}

async function removeBg(filename) {
  return post('/api/remove-bg', {
    tileName: filename + '.png',
    bgModel: 'fal-ai/imageutils/rembg',
  });
}

async function renameTile(fromName, toName) {
  // Use generate with same content to overwrite — but we can't rename directly.
  // Instead, read the file, save it as toName, then delete fromName.
  // The server doesn't have a rename endpoint, so we'll use the file system.
  const { readFileSync, writeFileSync, existsSync, unlinkSync } = await import('fs');
  const { join } = await import('path');
  const outputDir = join(__dirname, '..', '..', 'public', 'assets', 'tiles');
  
  const fromPath = join(outputDir, fromName + '.png');
  const toPath   = join(outputDir, toName   + '.png');
  
  if (!existsSync(fromPath)) {
    console.error(`    ✗ Source file not found: ${fromPath}`);
    return false;
  }
  writeFileSync(toPath, readFileSync(fromPath));
  unlinkSync(fromPath);
  return true;
}

async function main() {
  // ── Phase 1: base ground tiles ──────────────────────────────────────────────
  console.log('\n═══ Phase 1: Base ground tiles (' + BASE_TILES.length + ') ══════════════════');
  for (const tile of BASE_TILES) {
    process.stdout.write(`  → ${tile.name} ... `);
    try {
      const r = await generateTile(tile);
      if (r.ok) console.log(`✓  (${(r.size/1024).toFixed(0)}KB)`);
      else       console.log(`✗  ${r.error}`);
    } catch (e) { console.log(`✗  ${e.message}`); }
  }

  // ── Phase 2: feature sprites (raw, with background) ─────────────────────────
  console.log('\n═══ Phase 2: Feature sprites raw (' + FEATURE_SPRITES_RAW.length + ') ═══════════════');
  for (const sprite of FEATURE_SPRITES_RAW) {
    process.stdout.write(`  → ${sprite.name} ... `);
    try {
      const r = await generateTile(sprite);
      if (r.ok) console.log(`✓  (${(r.size/1024).toFixed(0)}KB)`);
      else       console.log(`✗  ${r.error}`);
    } catch (e) { console.log(`✗  ${e.message}`); }
  }

  // ── Phase 3: background removal on feature sprites ──────────────────────────
  console.log('\n═══ Phase 3: Background removal ════════════════════════════════');
  for (const sprite of FEATURE_SPRITES_RAW) {
    process.stdout.write(`  → removing bg from ${sprite.name} ... `);
    try {
      const r = await removeBg(sprite.name);
      if (r.ok) {
        process.stdout.write(`✓  → renaming to ${sprite.saveName} ... `);
        const renamed = await renameTile(sprite.name, sprite.saveName);
        console.log(renamed ? '✓' : '✗ rename failed');
      } else {
        console.log(`✗  ${r.error}`);
      }
    } catch (e) { console.log(`✗  ${e.message}`); }
  }

  console.log('\n✅ Done! All tiles saved to Zivilisation_1/public/assets/tiles/');
}

main().catch(console.error);
