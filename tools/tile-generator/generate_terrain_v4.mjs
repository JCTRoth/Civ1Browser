/**
 * Terrain generation v4 — switchable backend (local SD or fal.ai)
 *
 * BACKEND=local (default): uses the local AUTOMATIC1111-compatible Stable
 * Diffusion server (`sd-server` from stable-diffusion.cpp) at
 * http://127.0.0.1:8081, running the Flux.2 klein GGUF model.
 *
 * BACKEND=fal: uses the fal.ai cloud API (https://queue.fal.run/{FAL_MODEL})
 * and requires FAL_AI_KEY. Default model is `fal-ai/flux-2/turbo` (override
 * with FAL_MODEL).
 *
 * Background removal always runs locally via Python `rembg`
 * (pip install rembg — the model downloads once on first use).
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
 * Run:
 *   BACKEND=local node generate_terrain_v4.mjs        (local sd-server on :8081)
 *   BACKEND=fal  FAL_AI_KEY=... node generate_terrain_v4.mjs
 *
 * Env overrides:
 *   BACKEND        local|fal                    which generator backend to use
 *   FAL_AI_KEY     (required for BACKEND=fal)   fal.ai API key
 *   FAL_MODEL      fal-ai/flux-2/turbo          fal.ai model endpoint
 *   SD_SERVER      http://127.0.0.1:8081        sd-server URL (local backend)
 *   SD_STEPS       4                            Flux.2 klein — fast
 *   SD_CFG         1.0
 *   SD_SAMPLER     euler
 *   SD_OUTPUT_DIR  public/assets/tiles          where the PNGs are written
 *   PYTHON         python3                      interpreter with `rembg` installed
 */

import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BACKEND    = (process.env.BACKEND    || 'local').toLowerCase();
const FAL_KEY    = process.env.FAL_AI_KEY  || '';
const FAL_MODEL  = process.env.FAL_MODEL   || 'fal-ai/flux-2/turbo';
const SD_SERVER  = process.env.SD_SERVER   || 'http://127.0.0.1:8081';
const SD_STEPS   = parseInt(process.env.SD_STEPS || '4', 10);
const SD_CFG     = parseFloat(process.env.SD_CFG || '1.0');
const SD_SAMPLER = process.env.SD_SAMPLER  || 'euler';
const PYTHON     = process.env.PYTHON      || 'python3';

const OUTPUT_DIR = process.env.SD_OUTPUT_DIR
  ? (process.env.SD_OUTPUT_DIR.startsWith('/')
      ? process.env.SD_OUTPUT_DIR
      : join(__dirname, '..', '..', process.env.SD_OUTPUT_DIR))
  : join(__dirname, '..', '..', 'public', 'assets', 'tiles');

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

/** Query the local Stable Diffusion server (txt2img) and return a PNG buffer. */
async function localTxt2img(prompt, width, height) {
  const r = await fetch(`${SD_SERVER}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      width,
      height,
      steps: SD_STEPS,
      cfg_scale: SD_CFG,
      sampler_name: SD_SAMPLER,
      seed: -1,
    }),
  });
  if (!r.ok) throw new Error(`SD server HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  if (!data.images?.[0]) throw new Error('No image returned from SD server');
  return Buffer.from(data.images[0], 'base64');
}

/** Generate via the fal.ai cloud queue API and return a PNG buffer. */
async function falGenerate(prompt, width, height) {
  if (!FAL_KEY) throw new Error('BACKEND=fal requires FAL_AI_KEY (export FAL_AI_KEY=...)');
  const steps = FAL_MODEL.includes('schnell') ? 4
    : (FAL_MODEL.includes('flux-2') || FAL_MODEL.includes('flux.2')) ? 8 : 28;

  async function fetchJSON(url, opts) {
    const resp = await fetch(url, opts);
    const text = await resp.text();
    if (!resp.ok) throw new Error(`fal.ai HTTP ${resp.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  }

  const submit = await fetchJSON(`https://queue.fal.run/${FAL_MODEL}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: { width, height }, num_inference_steps: steps }),
  });
  const { status_url, response_url } = submit;
  if (!status_url || !response_url) {
    throw new Error(`Missing status_url/response_url in fal.ai response: ${JSON.stringify(submit).slice(0, 200)}`);
  }

  for (let attempt = 1; attempt <= 120; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    const status = await fetchJSON(status_url, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
    if (status.status === 'COMPLETED') {
      const result = await fetchJSON(response_url, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
      const imageUrl = result?.images?.[0]?.url || result?.image?.url;
      if (!imageUrl) throw new Error('No image URL in fal.ai result');
      const imgResp = await fetch(imageUrl);
      return Buffer.from(await imgResp.arrayBuffer());
    }
    if (status.status === 'FAILED') {
      throw new Error(`fal.ai generation failed: ${JSON.stringify(status).slice(0, 300)}`);
    }
  }
  throw new Error('fal.ai generation timed out (120s)');
}

/** Generate a PNG buffer using the configured backend. */
function generateImage(prompt, width, height) {
  if (BACKEND === 'fal') {
    console.log(`[fal] ${FAL_MODEL} — "${prompt.slice(0, 60)}..." (${width}x${height})`);
    return falGenerate(prompt, width, height);
  }
  console.log(`[sd] "${prompt.slice(0, 60)}..." (${width}x${height}, steps=${SD_STEPS}, cfg=${SD_CFG}, sampler=${SD_SAMPLER})`);
  return localTxt2img(prompt, width, height);
}

/** Verify the configured backend is ready before doing any work. */
async function checkServer() {
  if (BACKEND === 'fal') {
    if (FAL_KEY) {
      console.log(`✓ fal.ai backend configured (${FAL_MODEL})`);
      return true;
    }
    console.error('✗ BACKEND=fal requires FAL_AI_KEY.');
    console.error('  export FAL_AI_KEY=your-api-key');
    return false;
  }
  try {
    const r = await fetch(`${SD_SERVER}/`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      console.log(`✓ Stable Diffusion server reachable at ${SD_SERVER}`);
      return true;
    }
  } catch { /* fall through */ }
  console.error(`✗ Cannot reach Stable Diffusion server at ${SD_SERVER}`);
  console.error('  Start the sd-server (stable-diffusion.cpp) on port 8081 first,');
  console.error('  or switch backend with: BACKEND=fal FAL_AI_KEY=...');
  return false;
}

/** Verify Python + rembg are available for the feature-sprites pass. */
function checkRembg() {
  const r = spawnSync(PYTHON, ['-c', 'import rembg'], { encoding: 'utf8' });
  if (r.status === 0) {
    console.log(`✓ Python rembg available via "${PYTHON}"`);
    return true;
  }
  console.error(`✗ Python rembg not importable via "${PYTHON}". Install it:`);
  console.error('    pip install rembg');
  return false;
}

/** Remove the background of srcPath and write the transparent PNG to dstPath. */
function removeBackground(srcPath, dstPath) {
  const script = [
    'from rembg import remove',
    'from PIL import Image',
    'import sys',
    'src, dst = sys.argv[1], sys.argv[2]',
    'Image.MAX_IMAGE_PIXELS = None',
    'img = Image.open(src).convert("RGB")',
    'out = remove(img)',
    'out.save(dst)',
  ].join('\n');
  const r = spawnSync(PYTHON, ['-c', script, srcPath, dstPath], {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const tail = (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join('\n');
    throw new Error(`rembg failed (exit ${r.status}): ${tail}`);
  }
}

async function main() {
  console.log(`\n🎨 Terrain generator v4 — backend: ${BACKEND === 'fal' ? `fal.ai (${FAL_MODEL})` : `local SD (${SD_SERVER})`}\n`);

  if (!(await checkServer())) process.exit(1);
  if (!checkRembg()) process.exit(1);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Output: ${OUTPUT_DIR}\n`);

  console.log(`═══ Base tile re-generations (${REGENERATE_TILES.length}) ═════════════`);
  for (const t of REGENERATE_TILES) {
    process.stdout.write(`  → ${t.name} … `);
    try {
      const buf = await generateImage(t.prompt, t.w, t.h);
      const filePath = join(OUTPUT_DIR, t.name + '.png');
      writeFileSync(filePath, buf);
      console.log(`✓ (${(buf.length / 1024).toFixed(0)}KB)`);
    } catch (e) { console.log(`✗ ${e.message}`); }
  }

  console.log(`\n═══ Feature sprites raw (${FEATURE_SPRITES_RAW.length}) ═════════════════`);
  for (const s of FEATURE_SPRITES_RAW) {
    process.stdout.write(`  → ${s.name} … `);
    let buf;
    try {
      buf = await generateImage(s.prompt, s.w, s.h);
    } catch (e) { console.log(`✗ ${e.message}`); continue; }

    const rawPath = join(OUTPUT_DIR, s.name + '.png');
    writeFileSync(rawPath, buf);
    process.stdout.write(`✓ gen → rembg … `);

    try {
      const finalPath = join(OUTPUT_DIR, s.saveName + '.png');
      removeBackground(rawPath, finalPath);
      if (existsSync(rawPath)) unlinkSync(rawPath);
      console.log(`✓ ${s.saveName}.png`);
    } catch (e) {
      console.log(`✗ ${e.message} (raw kept at ${s.name}.png)`);
    }
  }

  console.log('\n✅ Done! Review with: http://localhost:3000/?quickstart\n');
}

main().catch(console.error);
