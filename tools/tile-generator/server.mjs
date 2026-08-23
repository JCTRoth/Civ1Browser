/**
 * Simple Node.js server for the AI Tile Generator tool.
 * Serves the HTML UI and proxies requests to fal.ai with the API key.
 *
 * Usage: node Zivilisation_1/tools/tile-generator/server.mjs
 * Debug: DEBUG=1 node Zivilisation_1/tools/tile-generator/server.mjs
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync, copyFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 3456;
const FAL_KEY = process.env.FAL_AI_KEY || '';
const DEBUG = !!process.env.DEBUG;
const OUTPUT_DIR = join(__dirname, '..', '..', 'public', 'assets', 'tiles');
const ARCHIVE_DIR = join(__dirname, '..', '..', 'archive', 'tiles');
// Generated variants live here; copied to OUTPUT_DIR via "Use in Game"
const TEXTURES_DIR = join(__dirname, 'textures');

function debugLog(...args) {
  if (DEBUG) console.log('[debug]', ...args);
}

function debugWarn(...args) {
  if (DEBUG) console.warn('[debug:WARN]', ...args);
}

/** Parse "terrain_grassland_3.png" → { group: "terrain_grassland", n: 3 } */
function parseTextureName(filename) {
  const base = filename.replace(/\.png$/i, '');
  const match = base.match(/^(.+)_(\d+)$/);
  if (!match) return null;
  return { group: match[1], n: parseInt(match[2], 10) };
}

/** Return the next unused variant number for a given group name in TEXTURES_DIR. */
function nextVariantN(groupName) {
  if (!existsSync(TEXTURES_DIR)) return 1;
  const files = readdirSync(TEXTURES_DIR);
  let max = 0;
  for (const f of files) {
    const p = parseTextureName(f);
    if (p && p.group === groupName) max = Math.max(max, p.n);
  }
  return max + 1;
}

/**
 * Return the next in-game variant number for a group, independent of the
 * tile-generator numbering. In-game tiles always start at _1 and count up,
 * so adding the same image twice yields two separate game tiles (_1, _2, …)
 * with no gaps. Legacy base files without a _N suffix (e.g. terrain_x.png)
 * are not counted — they are a separate primary tile.
 */
function nextGameN(groupName) {
  if (!existsSync(OUTPUT_DIR)) return 1;
  const files = readdirSync(OUTPUT_DIR);
  let max = 0;
  for (const f of files) {
    const p = parseTextureName(f);
    if (p && p.group === groupName) max = Math.max(max, p.n);
  }
  return max + 1;
}

/**
 * Compact a group's in-game numbered tiles so they are contiguous from _1.
 * Removing terrain_forest_feature_1 must leave _1,_2,_3 — never a gap like
 * _2,_3,_4. Legacy base files without a _N suffix are never touched. Returns
 * the list of renames performed ({ from, to }).
 */
function renumberGroup(groupName) {
  if (!existsSync(OUTPUT_DIR)) return [];
  const files = readdirSync(OUTPUT_DIR);
  const members = [];
  for (const f of files) {
    const p = parseTextureName(f);
    if (p && p.group === groupName) members.push(p.n);
  }
  members.sort((a, b) => a - b);

  // The k-th smallest current number becomes k+1. Processing in ascending
  // order is safe: the target slot is never occupied when it is written.
  const renames = [];
  for (let i = 0; i < members.length; i++) {
    const current = members[i];
    const target = i + 1;
    if (current === target) continue;
    const from = join(OUTPUT_DIR, `${groupName}_${current}.png`);
    const to = join(OUTPUT_DIR, `${groupName}_${target}.png`);
    if (existsSync(from) && !existsSync(to)) {
      renameSync(from, to);
      renames.push({ from: `${groupName}_${current}.png`, to: `${groupName}_${target}.png` });
      console.log(`[renumber] ${groupName}_${current}.png → ${groupName}_${target}.png`);
    }
  }
  return renames;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

// Pricing cache — fetched live from fal.ai's Platform API.
// Cache TTL: 1 hour for successful fetches, 5 minutes for "not found".
const _pricingCache = new Map(); // endpoint_id → { unit_price, unit, currency, fetched_at } or { not_found: true, fetched_at }
const FETCH_TIMEOUT_MS = 10_000; // 10s timeout for fal.ai API calls

async function fetchPricingFromFal(endpointIds) {
  if (!FAL_KEY) return {};
  // Filter out cached entries (within their TTL)
  const now = Date.now();
  const toFetch = endpointIds.filter(id => {
    const cached = _pricingCache.get(id);
    if (!cached) return true;
    // "Not found" markers expire after 5 minutes; real pricing after 1 hour
    const ttl = cached.not_found ? 300_000 : 3_600_000;
    return (now - cached.fetched_at) > ttl;
  });

  if (toFetch.length === 0) {
    // All cached — return from cache (filter out not_found markers as null)
    const result = {};
    for (const id of endpointIds) {
      const c = _pricingCache.get(id);
      result[id] = (c && !c.not_found) ? c : null;
    }
    return result;
  }

  // Fetch in batches of 10 — URL length limit, not API limit
  const results = {};
  debugLog(`[pricing] Fetching ${toFetch.length} uncached IDs in ${Math.ceil(toFetch.length / 10)} batch(es)`);
  for (let i = 0; i < toFetch.length; i += 10) {
    const batch = toFetch.slice(i, i + 10);
    const url = `https://api.fal.ai/v1/models/pricing?${batch.map(id => `endpoint_id=${encodeURIComponent(id)}`).join('&')}`;
    debugLog(`[pricing] Fetching batch ${i / 50 + 1}: ${batch.length} IDs with url ${url}`);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const resp = await fetch(url, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        console.error(`[pricing] HTTP ${resp.status} fetching batch of ${batch.length} IDs`);
        debugWarn(`[pricing] Batch ${i / 50 + 1} failed with HTTP ${resp.status}`);
        // Mark batch IDs as not-found so we don't hammer the API
        for (const id of batch) {
          _pricingCache.set(id, { not_found: true, fetched_at: now });
        }
        continue;
      }
      const data = await resp.json();
      const foundIds = new Set();
      for (const p of (data.prices || [])) {
        const entry = { ...p, fetched_at: now };
        _pricingCache.set(p.endpoint_id, entry);
        results[p.endpoint_id] = entry;
        foundIds.add(p.endpoint_id);
      }
      debugLog(`[pricing] Batch ${i / 50 + 1}: got ${foundIds.size} prices, ${batch.length - foundIds.size} not found`);
      // Mark batch IDs not in response as not-found
      for (const id of batch) {
        if (!foundIds.has(id)) {
          _pricingCache.set(id, { not_found: true, fetched_at: now });
        }
      }
    } catch (err) {
      console.error(`[pricing] Error fetching batch:`, err.message);
      debugWarn(`[pricing] Batch ${i / 50 + 1} error: ${err.message}`);
      // Mark batch IDs as not-found on error too (with short TTL for retry)
      for (const id of batch) {
        if (!_pricingCache.has(id)) {
          _pricingCache.set(id, { not_found: true, fetched_at: now });
        }
      }
    }
  }

  // Merge with cache for any IDs that weren't in the fetch batches
  for (const id of endpointIds) {
    if (!results[id]) {
      const cached = _pricingCache.get(id);
      results[id] = (cached && !cached.not_found) ? cached : null;
    }
  }

  return results;
}

function classifyPricing(p) {
  if (!p || p.unit_price == null) return { cost: '—', unit: '', type: 'unknown', note: 'No price info' };
  const price = `$${p.unit_price.toFixed(p.unit_price < 0.01 ? 4 : 3)}`;
  // Real fal.ai unit values: "megapixels", "images", "units", "compute seconds"
  let unitLabel, type;
  switch (p.unit) {
    case 'megapixels':     unitLabel = '/MP';  type = 'megapixel'; break;
    case 'images':         unitLabel = '/img'; type = 'image';     break;
    case 'units':          unitLabel = '/unit';type = 'per-unit';  break; // one image = multiple units, effectively more expensive
    case 'compute seconds':unitLabel = '/sec'; type = 'gpu';       break;
    default:               unitLabel = `/${p.unit || 'unit'}`; type = 'unknown'; break;
  }
  return { cost: price, unit: unitLabel, type, note: `per ${p.unit || 'unit'}` };
}

function serveFile(res, path, mime) {
  try {
    const data = readFileSync(path);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

/** Return a unique archive path for a filename, appending _2, _3, etc. if needed. */
function uniqueArchivePath(fname) {
  const ext = extname(fname);
  const base = fname.slice(0, -ext.length);

  let candidate = join(ARCHIVE_DIR, fname);
  if (!existsSync(candidate)) return candidate;

  let n = 2;
  while (existsSync(candidate)) {
    candidate = join(ARCHIVE_DIR, `${base}_${n}${ext}`);
    n++;
  }
  return candidate;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  debugLog(`${req.method} ${pathname}${url.search ? '?' + url.search : ''}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // ─── Serve HTML tool ─────────────────────────────────────────────────
  if (pathname === '/' || pathname === '/index.html') {
    return serveFile(res, join(__dirname, 'index.html'), 'text/html; charset=utf-8');
  }

  // ─── API: list tiles ─────────────────────────────────────────────────
  if (pathname === '/api/tiles' && req.method === 'GET') {
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
    const files = readdirSync(OUTPUT_DIR)
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map((f) => {
        const full = join(OUTPUT_DIR, f);
        const size = statSync(full).size;
        return { name: f, path: `/api/tiles/${f}`, size };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return json(res, files);
  }

  // ─── API: serve tile image ──────────────────────────────────────────
  if (pathname.startsWith('/api/tiles/') && req.method === 'GET') {
    const fname = decodeURIComponent(pathname.slice('/api/tiles/'.length));
    const safe = join(OUTPUT_DIR, fname);
    if (!safe.startsWith(OUTPUT_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
    const ext = extname(fname).toLowerCase();
    return serveFile(res, safe, MIME[ext] || 'image/png');
  }

  // ─── API: delete tile ───────────────────────────────────────────────
  if (pathname.startsWith('/api/tiles/') && req.method === 'DELETE') {
    const fname = decodeURIComponent(pathname.slice('/api/tiles/'.length));
    const safe = join(OUTPUT_DIR, fname);
    if (!safe.startsWith(OUTPUT_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
    try {
      unlinkSync(safe);
      return json(res, { ok: true });
    } catch {
      return json(res, { ok: false, error: 'Delete failed' }, 500);
    }
  }

  // ─── API: generate tile ─────────────────────────────────────────────
  if (pathname === '/api/generate' && req.method === 'POST') {
    if (!FAL_KEY) return json(res, { error: 'FAL_AI_KEY not set in environment. Export it: export FAL_AI_KEY=your-key' }, 500);

    const body = await readBody(req);
    let params;
    try { params = JSON.parse(body); } catch {
      return json(res, { error: 'Invalid JSON' }, 400);
    }

    const { model, prompt, tileName, width, height, useInGame } = params;
    if (!prompt || !tileName) return json(res, { error: 'Missing prompt or tileName' }, 400);

    const w = width || 512;
    const h = height || 512;

    try {
      const result = await callFalAI(model, prompt, w, h);
      if (!result.imageUrl) {
        return json(res, { error: 'No image returned from fal.ai' }, 500);
      }

      // Download image
      const imgResp = await fetch(result.imageUrl);
      const buffer = Buffer.from(await imgResp.arrayBuffer());

      const safeBase = tileName.replace(/[^a-z0-9_-]/gi, '_');

      if (useInGame) {
        // Batch-script mode: save directly to the game tiles folder (legacy behaviour)
        if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
        if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
        const fname = safeBase + '.png';
        const filePath = join(OUTPUT_DIR, fname);
        if (existsSync(filePath)) {
          const archivePath = uniqueArchivePath(fname);
          renameSync(filePath, archivePath);
          console.log(`[archive] Moved existing "${fname}" → archive/tiles/${archivePath.split('/').pop()}`);
        }
        writeFileSync(filePath, buffer);
        return json(res, { ok: true, name: fname, filename: fname, path: `/api/tiles/${fname}`, size: buffer.length });
      }

      // Interactive mode: save to TEXTURES_DIR with auto-incremented variant n
      if (!existsSync(TEXTURES_DIR)) mkdirSync(TEXTURES_DIR, { recursive: true });
      const n = nextVariantN(safeBase);
      const fname = `${safeBase}_${n}.png`;
      const filePath = join(TEXTURES_DIR, fname);

      writeFileSync(filePath, buffer);
      console.log(`[generate] Saved variant: ${fname} (${buffer.length} bytes)`);

      return json(res, {
        ok: true,
        name: fname,
        filename: fname,
        path: `/api/textures/${encodeURIComponent(fname)}`,
        size: buffer.length,
        n,
      });
    } catch (err) {
      console.error('[server] Generate error:', err);
      return json(res, { error: String(err) }, 500);
    }
  }

  // ─── API: remove background ─────────────────────────────────────────
  if (pathname === '/api/remove-bg' && req.method === 'POST') {
    if (!FAL_KEY) return json(res, { error: 'FAL_AI_KEY not set in environment. Export it: export FAL_AI_KEY=your-key' }, 500);

    const body = await readBody(req);
    let params;
    try { params = JSON.parse(body); } catch {
      return json(res, { error: 'Invalid JSON' }, 400);
    }

    const { tileName, bgModel, source } = params;
    if (!tileName) return json(res, { error: 'Missing tileName' }, 400);

    // Validate model against allowlist
    const ALLOWED_BG_MODELS = ['fal-ai/imageutils/rembg', 'fal-ai/bria/background/remove'];
    const resolvedBgModel = ALLOWED_BG_MODELS.includes(bgModel) ? bgModel : ALLOWED_BG_MODELS[0];

    // Sanitize — no path separators allowed
    const fname = tileName.replace(/[^a-z0-9_.-]/gi, '_');

    // Prefer TEXTURES_DIR; fall back to OUTPUT_DIR for legacy usage
    const searchDirs = source === 'game' ? [OUTPUT_DIR] : [TEXTURES_DIR, OUTPUT_DIR];
    let fileDir = null;
    for (const dir of searchDirs) {
      const candidate = join(dir, fname);
      if (candidate.startsWith(dir) && existsSync(candidate)) { fileDir = dir; break; }
    }
    if (!fileDir) return json(res, { error: `File not found: ${fname}` }, 404);
    const filePath = join(fileDir, fname);

    try {
      const fileBuffer = readFileSync(filePath);
      // Detect JPEG vs PNG from magic bytes
      const mime = (fileBuffer[0] === 0xFF && fileBuffer[1] === 0xD8) ? 'image/jpeg' : 'image/png';
      const dataUri = `data:${mime};base64,${fileBuffer.toString('base64')}`;

      console.log(`[bg-remove] Processing "${fname}" (${fileBuffer.length} bytes, ${mime}) via ${resolvedBgModel}...`);
      const result = await callFalBgRemove(dataUri, resolvedBgModel);

      const imgResp = await fetch(result.imageUrl);
      const outBuffer = Buffer.from(await imgResp.arrayBuffer());

      // Overwrite in place — result is always PNG with alpha channel
      writeFileSync(filePath, outBuffer);
      console.log(`[bg-remove] Saved "${fname}" with background removed (${outBuffer.length} bytes)`);

      return json(res, { ok: true, name: fname, size: outBuffer.length });
    } catch (err) {
      console.error('[bg-remove] Error:', err);
      return json(res, { error: String(err) }, 500);
    }
  }

  // ─── API: list generated texture variants (grouped) ──────────────────
  if (pathname === '/api/textures' && req.method === 'GET') {
    if (!existsSync(TEXTURES_DIR)) mkdirSync(TEXTURES_DIR, { recursive: true });
    const files = readdirSync(TEXTURES_DIR).filter(f => /\.png$/i.test(f));

    const groupMap = new Map();
    for (const f of files) {
      const p = parseTextureName(f);
      if (!p) continue;
      if (!groupMap.has(p.group)) groupMap.set(p.group, []);
      const st = statSync(join(TEXTURES_DIR, f));
      groupMap.get(p.group).push({ filename: f, path: `/api/textures/${encodeURIComponent(f)}`, size: st.size, n: p.n, mtime: st.mtimeMs });
    }

    const groups = [];
    for (const [name, variants] of groupMap) {
      variants.sort((a, b) => a.n - b.n);
      
      // Check for in-game tiles (both name.png and name_N.png patterns).
      // A tile belongs to this group only if its parsed group matches —
      // never via naive prefix matching, so terrain_forest_feature*.png
      // stays out of the terrain_forest group.
      const inGameTiles = [];
      if (existsSync(OUTPUT_DIR)) {
        const gameFiles = readdirSync(OUTPUT_DIR).filter(f => {
          if (!/\.png$/i.test(f)) return false;
          const parsed = parseTextureName(f);
          if (parsed) return parsed.group === name;
          // No _N suffix → belongs to the group with its own base name
          return f.replace(/\.png$/i, '') === name;
        });
        for (const f of gameFiles) {
          const st = statSync(join(OUTPUT_DIR, f));
          inGameTiles.push({ filename: f, path: `/api/game-tiles/${encodeURIComponent(f)}`, size: st.size, mtime: st.mtimeMs });
        }
      }
      
      // For backward compatibility, keep inGame as single item or first found
      const inGame = inGameTiles.length > 0 ? inGameTiles[0] : null;
      groups.push({ name, variants, inGame, inGameTiles });
    }
    groups.sort((a, b) => a.name.localeCompare(b.name));
    return json(res, { groups });
  }

  // ─── API: serve texture variant image ────────────────────────────────
  if (pathname.startsWith('/api/textures/') && req.method === 'GET') {
    const fname = decodeURIComponent(pathname.slice('/api/textures/'.length));
    const safe = join(TEXTURES_DIR, fname);
    if (!safe.startsWith(TEXTURES_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
    return serveFile(res, safe, MIME[extname(fname).toLowerCase()] || 'image/png');
  }

  // ─── API: delete texture variant ─────────────────────────────────────
  if (pathname.startsWith('/api/textures/') && req.method === 'DELETE') {
    const fname = decodeURIComponent(pathname.slice('/api/textures/'.length));
    const safe = join(TEXTURES_DIR, fname);
    if (!safe.startsWith(TEXTURES_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
    try { unlinkSync(safe); return json(res, { ok: true }); }
    catch { return json(res, { ok: false, error: 'Delete failed' }, 500); }
  }

  // ─── API: use texture variant(s) in game ─────────────────────────────
  if (pathname === '/api/use-in-game' && req.method === 'POST') {
    const body = await readBody(req);
    let params;
    try { params = JSON.parse(body); } catch { return json(res, { error: 'Invalid JSON' }, 400); }

    // Support both single filename and array of filenames
    const filenames = params.filenames || (params.filename ? [params.filename] : []);
    if (filenames.length === 0) return json(res, { error: 'Missing filename(s)' }, 400);

    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

    const results = [];
    for (const filename of filenames) {
      const parsed = parseTextureName(filename.replace(/\.png$/i, ''));
      if (!parsed) {
        results.push({ filename, ok: false, error: 'Filename must end in _<n>.png' });
        continue;
      }

      const safeFilename = filename.replace(/[^a-z0-9_.-]/gi, '_');
      const srcPath = join(TEXTURES_DIR, safeFilename);
      if (!srcPath.startsWith(TEXTURES_DIR)) {
        results.push({ filename, ok: false, error: 'Forbidden' });
        continue;
      }
      if (!existsSync(srcPath)) {
        results.push({ filename, ok: false, error: `Not found: ${safeFilename}` });
        continue;
      }

      // Game-side numbering is independent of the tile-generator numbering.
      // The in-game tile always gets the group's next number starting at _1,
      // so adding the same image twice adds the same image twice to the game
      // (they can be removed manually later) and gaps are avoided.
      const gameN = nextGameN(parsed.group);
      const targetName = `${parsed.group}_${gameN}.png`;
      const destPath = join(OUTPUT_DIR, targetName);
      if (!destPath.startsWith(OUTPUT_DIR)) {
        results.push({ filename, ok: false, error: 'Forbidden' });
        continue;
      }

      copyFileSync(srcPath, destPath);
      console.log(`[use-in-game] ${safeFilename} → game tiles/${targetName} (game #${gameN})`);
      results.push({ filename, ok: true, targetName });
    }

    // Compact affected groups so in-game numbering stays contiguous from _1.
    // Self-heals any pre-existing gap (e.g. _2,_3,_4 after _1 was removed).
    const addedGroups = new Set();
    for (const r of results) {
      if (!r.ok || !r.targetName) continue;
      const p = parseTextureName(r.targetName.replace(/\.png$/i, ''));
      if (p) addedGroups.add(p.group);
    }
    const renames = [];
    for (const group of addedGroups) renames.push(...renumberGroup(group));

    const allOk = results.every(r => r.ok);
    return json(res, { ok: allOk, results, renames });
  }

  // ─── API: remove texture variant(s) from game ────────────────────────
  if (pathname === '/api/remove-from-game' && req.method === 'POST') {
    const body = await readBody(req);
    let params;
    try { params = JSON.parse(body); } catch { return json(res, { error: 'Invalid JSON' }, 400); }

    // Support both single filename and array of filenames
    const filenames = params.filenames || (params.filename ? [params.filename] : []);
    if (filenames.length === 0) return json(res, { error: 'Missing filename(s)' }, 400);

    const results = [];
    const affectedGroups = new Set();
    for (const filename of filenames) {
      const safeFilename = filename.replace(/[^a-z0-9_.-]/gi, '_');
      const parsed = parseTextureName(safeFilename.replace(/\.png$/i, ''));
      if (parsed) affectedGroups.add(parsed.group);
      const targetPath = join(OUTPUT_DIR, safeFilename);
      if (!targetPath.startsWith(OUTPUT_DIR)) {
        results.push({ filename, ok: false, error: 'Forbidden' });
        continue;
      }
      if (!existsSync(targetPath)) {
        results.push({ filename, ok: false, error: `Not in game: ${safeFilename}` });
        continue;
      }
      try {
        unlinkSync(targetPath);
        console.log(`[remove-from-game] ${safeFilename} ← game tiles/`);
        results.push({ filename, ok: true, targetName: safeFilename });
      } catch {
        results.push({ filename, ok: false, error: 'Remove failed' });
      }
    }

    // Re-number remaining tiles of affected groups so they stay contiguous
    // from _1 (removing terrain_forest_feature_1 must leave _1,_2,_3 — never
    // a gap like _2,_3,_4). Renames are returned so clients can reflect them.
    const renames = [];
    for (const group of affectedGroups) renames.push(...renumberGroup(group));

    const allOk = results.every(r => r.ok);
    return json(res, { ok: allOk, results, renames });
  }

  // ─── API: serve current in-game tile ─────────────────────────────────
  if (pathname.startsWith('/api/game-tiles/') && req.method === 'GET') {
    const fname = decodeURIComponent(pathname.slice('/api/game-tiles/'.length));
    const safe = join(OUTPUT_DIR, fname);
    if (!safe.startsWith(OUTPUT_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
    return serveFile(res, safe, MIME[extname(fname).toLowerCase()] || 'image/png');
  }

  // ─── API: list text-to-image models from fal.ai ──────────────────────
  if (pathname === '/api/models' && req.method === 'GET') {
    if (!FAL_KEY) return json(res, { error: 'FAL_AI_KEY not set' }, 500);
    try {
      const resp = await fetch('https://api.fal.ai/v1/models?limit=500', {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} from fal.ai`);
      const data = await resp.json();
      const t2i = (data.models || [])
        .filter(m => m.metadata?.category === 'text-to-image')
        .map(m => {
          const eid = m.endpoint_id;
          let dn = m.metadata.display_name
            .replace(/ Text To Image$/, '')
            .replace(/ API$/, '');
          return {
            id: eid,
            name: dn,
            description: (m.metadata.description || '').split('\n')[0].slice(0, 200),
            status: m.metadata?.status || 'unknown',
            pricing: null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      // Ensure the 4 hardcoded quick-select models are always present.
      // They may be inactive or miscategorized in the API — include them
      // anyway so the browser list is exhaustive.
      const QUICK_SELECT_IDS = [
        'fal-ai/flux.2-turbo',
        'fal-ai/fast-sdxl',
        'fal-ai/flux/schnell',
        'fal-ai/flux/dev',
        'fal-ai/stable-diffusion-v3.5',
      ];
      const existingIds = new Set(t2i.map(m => m.id));
      for (const id of QUICK_SELECT_IDS) {
        if (!existingIds.has(id)) {
          const name = id.replace('fal-ai/', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          t2i.push({
            id,
            name,
            description: 'Quick-select model (not listed as text-to-image by fal.ai API)',
            status: 'unknown',
            pricing: null,
          });
        }
      }
      t2i.sort((a, b) => a.name.localeCompare(b.name));

      return json(res, { models: t2i });
    } catch (err) {
      console.error('[models] Error:', err);
      return json(res, { error: String(err) }, 500);
    }
  }

  // ─── API: fetch live pricing from fal.ai Platform API ────────────────
  if (pathname === '/api/pricing' && req.method === 'GET') {
    if (!FAL_KEY) return json(res, { error: 'FAL_AI_KEY not set' }, 500);
    const idsParam = url.searchParams.get('ids');
    if (!idsParam) return json(res, { error: 'Missing ?ids= comma-separated endpoint IDs' }, 400);
    const ids = [...new Set(idsParam.split(',').map(s => s.trim()).filter(Boolean))];
    if (ids.length === 0) return json(res, { error: 'No valid IDs' }, 400);
    if (ids.length > 200) return json(res, { error: 'Too many IDs (max 200)' }, 400);

    try {
      const raw = await fetchPricingFromFal(ids);
      const prices = {};
      for (const id of ids) {
        prices[id] = raw[id] ? classifyPricing(raw[id]) : { cost: '—', unit: '', type: 'unknown', note: 'No price info' };
      }
      return json(res, { prices });
    } catch (err) {
      console.error('[pricing] Error:', err);
      return json(res, { error: String(err) }, 500);
    }
  }

// Estimate cache — short-lived (30s) to avoid hammering fal.ai on every keystroke
const _estimateCache = new Map(); // key: "model:w:h" → { estimatedCost, currency, ... }

  // ─── API: estimate generation cost ───────────────────────────────────
  if (pathname === '/api/estimate-cost' && req.method === 'POST') {
    if (!FAL_KEY) return json(res, { error: 'FAL_AI_KEY not set' }, 500);

    const body = await readBody(req);
    let params;
    try { params = JSON.parse(body); } catch {
      return json(res, { error: 'Invalid JSON' }, 400);
    }

    const { model, width, height } = params;
    if (!model) return json(res, { error: 'Missing model' }, 400);

    const w = parseInt(width) || 512;
    const h = parseInt(height) || 512;
    const megapixels = (w * h) / 1_000_000;

    // Check short-lived cache (30s TTL)
    const cacheKey = `${model}:${w}:${h}`;
    const cached = _estimateCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < 30_000) {
      return json(res, cached.data);
    }

    try {
      // First get pricing to determine the unit type
      const raw = await fetchPricingFromFal([model]);
      const priceInfo = raw[model];

      // If no pricing available, return local estimate immediately
      if (!priceInfo || priceInfo.unit_price == null) {
        const fallback = computeLocalEstimate(priceInfo, 1);
        _estimateCache.set(cacheKey, { data: fallback, ts: Date.now() });
        return json(res, fallback);
      }

      // Determine unit_quantity based on the billing unit
      let unitQuantity;
      if (priceInfo.unit === 'megapixels') {
        unitQuantity = Math.max(0.001, megapixels);
      } else if (priceInfo.unit === 'images' || priceInfo.unit === 'units') {
        unitQuantity = 1;
      } else if (priceInfo.unit === 'compute seconds') {
        unitQuantity = 1;
      } else {
        unitQuantity = Math.max(0.001, megapixels);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const resp = await fetch('https://api.fal.ai/v1/models/pricing/estimate', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          estimate_type: 'unit_price',
          endpoints: { [model]: { unit_quantity: parseFloat(unitQuantity.toFixed(6)) } },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text();
        // Rate limited — return a rough local estimate and cache it too
        if (resp.status === 429) {
          console.warn(`[estimate] Rate limited, using local estimate for ${model}`);
          const fallback = computeLocalEstimate(priceInfo, unitQuantity);
          _estimateCache.set(cacheKey, { data: fallback, ts: Date.now() });
          return json(res, fallback);
        }
        console.error(`[estimate] HTTP ${resp.status}: ${errText.slice(0, 300)}`);
        return json(res, { error: `Estimate failed: HTTP ${resp.status}` }, 500);
      }

      const data = await resp.json();
      const result = {
        estimatedCost: data.total_cost,
        currency: data.currency || 'USD',
        megapixels: parseFloat(megapixels.toFixed(4)),
        unitQuantity: parseFloat(unitQuantity.toFixed(6)),
        unit: priceInfo?.unit || 'unknown',
      };
      // Cache the result
      _estimateCache.set(cacheKey, { data: result, ts: Date.now() });
      return json(res, result);
    } catch (err) {
      console.error('[estimate] Error:', err);
      return json(res, { error: String(err) }, 500);
    }
  }

/** Compute a rough local estimate when the fal.ai estimate API is unavailable. */
function computeLocalEstimate(priceInfo, unitQuantity) {
  if (!priceInfo || priceInfo.unit_price == null) {
    return { estimatedCost: 0, currency: 'USD', megapixels: 0, unitQuantity, unit: 'unknown', local: true };
  }
  return {
    estimatedCost: parseFloat((priceInfo.unit_price * unitQuantity).toFixed(6)),
    currency: priceInfo.currency || 'USD',
    megapixels: 0,
    unitQuantity: parseFloat(unitQuantity.toFixed(6)),
    unit: priceInfo.unit || 'unknown',
    local: true,
  };
}

  // ─── API: debug/diagnostics ──────────────────────────────────────────
  if (pathname === '/api/debug' && req.method === 'GET') {
    const cacheEntries = [];
    for (const [id, entry] of _pricingCache.entries()) {
      cacheEntries.push({
        id,
        not_found: !!entry.not_found,
        unit_price: entry.unit_price ?? null,
        unit: entry.unit ?? null,
        fetched_at: entry.fetched_at ? new Date(entry.fetched_at).toISOString() : null,
        age_sec: entry.fetched_at ? Math.round((Date.now() - entry.fetched_at) / 1000) : null,
      });
    }
    return json(res, {
      debug: DEBUG,
      falKey: FAL_KEY ? `Present (${FAL_KEY.length} chars)` : 'MISSING',
      pricingCacheSize: _pricingCache.size,
      pricingCache: cacheEntries.slice(0, 100), // limit to 100 entries
      estimateCacheSize: _estimateCache.size,
      estimateCacheKeys: [..._estimateCache.keys()].slice(0, 50),
      outputDir: OUTPUT_DIR,
      tileCount: existsSync(OUTPUT_DIR)
        ? readdirSync(OUTPUT_DIR).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)).length
        : 0,
    });
  }

  // ─── API: test/health check ──────────────────────────────────────────
  if (pathname === '/api/test' && req.method === 'GET') {
    return json(res, {
      ok: true,
      falKey: FAL_KEY ? `Present (${FAL_KEY.length} chars)` : 'MISSING',
      outputDir: OUTPUT_DIR,
      outputExists: existsSync(OUTPUT_DIR),
      tileCount: existsSync(OUTPUT_DIR)
        ? readdirSync(OUTPUT_DIR).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)).length
        : 0,
    });
  }

  // ─── Static files ───────────────────────────────────────────────────
  // API routes return JSON 404 for debugging; everything else returns text
  if (pathname.startsWith('/api/')) {
    return json(res, { error: 'Not found', path: pathname, method: req.method }, 404);
  }
  res.writeHead(404);
  res.end('Not found');
});

async function callFalAI(model, prompt, width, height) {
  const falModel = model || 'fal-ai/fast-sdxl';
  console.log(`[fal.ai] Generating with model "${falModel}": "${prompt.slice(0, 80)}..."`);

  // Helper: safely fetch and parse JSON with better error messages
  async function fetchJSON(url, opts) {
    const resp = await fetch(url, opts);
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} from ${url}: ${text.slice(0, 300)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
    }
  }

  // Submit generation request
  const submitData = await fetchJSON(`https://queue.fal.run/${falModel}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: { width, height },
      num_inference_steps: falModel.includes('schnell') ? 4 : (falModel.includes('flux-2') || falModel.includes('flux.2')) ? 8 : 28,
    }),
  });

  const requestId = submitData.request_id;
  if (!requestId) throw new Error('No request_id in fal.ai submit response: ' + JSON.stringify(submitData).slice(0, 200));
  console.log(`[fal.ai] Submitted — request_id: ${requestId}`);

  // Use the URLs returned by fal.ai — some models (like flux/schnell) use a
  // different base path than the model name (e.g. submit to /fal-ai/flux/schnell
  // but status/result URLs use /fal-ai/flux without the /schnell suffix).
  const statusUrl = submitData.status_url;
  const resultUrl = submitData.response_url;
  if (!statusUrl || !resultUrl) {
    throw new Error('Missing status_url or response_url in submit response: ' + JSON.stringify(submitData).slice(0, 200));
  }
  console.log(`[fal.ai] Status URL: ${statusUrl}`);

  // Poll for result
  for (let attempt = 1; attempt <= 120; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));

    const statusData = await fetchJSON(
      statusUrl,
      { headers: { 'Authorization': `Key ${FAL_KEY}` } },
    );

    console.log(`[fal.ai] Poll #${attempt}: ${statusData.status}`);

    if (statusData.status === 'COMPLETED') {
      const resultData = await fetchJSON(
        resultUrl,
        { headers: { 'Authorization': `Key ${FAL_KEY}` } },
      );

      const imageUrl = resultData?.images?.[0]?.url || resultData?.image?.url;
      const contentType = resultData?.images?.[0]?.content_type || 'image/png';

      if (!imageUrl) {
        console.error('[fal.ai] Result had no image URL:', JSON.stringify(resultData).slice(0, 500));
        throw new Error('No image URL in fal.ai response');
      }
      console.log(`[fal.ai] Done — image URL: ${imageUrl.slice(0, 80)}...`);
      return { imageUrl, content_type: contentType };
    }

    if (statusData.status === 'FAILED') {
      console.error('[fal.ai] Generation FAILED:', JSON.stringify(statusData));
      throw new Error(`fal.ai generation failed: ${JSON.stringify(statusData).slice(0, 300)}`);
    }
  }

  throw new Error('fal.ai generation timed out (120s)');
}

async function callFalBgRemove(imageDataUri, model = 'fal-ai/imageutils/rembg') {
  console.log(`[fal.ai] Submitting background removal to ${model}...`);

  async function fetchJSON(url, opts) {
    const resp = await fetch(url, opts);
    const text = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}: ${text.slice(0, 300)}`);
    try { return JSON.parse(text); }
    catch { throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`); }
  }

  const submitData = await fetchJSON(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image_url: imageDataUri }),
  });

  const statusUrl = submitData.status_url;
  const resultUrl = submitData.response_url;
  if (!statusUrl || !resultUrl) {
    throw new Error('Missing status_url or response_url in bg-remove response: ' + JSON.stringify(submitData).slice(0, 200));
  }
  console.log(`[fal.ai bg-remove] request_id: ${submitData.request_id}`);

  for (let attempt = 1; attempt <= 60; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));

    const statusData = await fetchJSON(statusUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
    console.log(`[fal.ai bg-remove] Poll #${attempt}: ${statusData.status}`);

    if (statusData.status === 'COMPLETED') {
      const resultData = await fetchJSON(resultUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
      const imageUrl = resultData?.image?.url;
      if (!imageUrl) throw new Error('No image URL in bg-remove result: ' + JSON.stringify(resultData).slice(0, 300));
      console.log(`[fal.ai bg-remove] Done — ${imageUrl.slice(0, 80)}...`);
      return { imageUrl };
    }

    if (statusData.status === 'FAILED') {
      throw new Error(`fal.ai bg-remove failed: ${JSON.stringify(statusData).slice(0, 300)}`);
    }
  }

  throw new Error('fal.ai bg-remove timed out (60s)');
}

server.listen(PORT, () => {
  console.log(`\n🎨  Tile Generator running at http://localhost:${PORT}`);
  if (!FAL_KEY) {
    console.warn('⚠️  FAL_AI_KEY not set — generation will not work.');
    console.warn('   Export it:  export FAL_AI_KEY=your-api-key\n');
  } else {
    console.log(`🔑 FAL_AI_KEY loaded (${FAL_KEY.length} chars)`);
  }
  console.log(`📁 Images saved to: ${OUTPUT_DIR}\n`);
});
