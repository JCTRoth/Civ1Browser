/**
 * Script to generate all Civilization terrain tiles via the tile generator server.
 * Run: node generate_terrain.mjs
 */

const SERVER = 'http://localhost:3456';
const MODEL = 'fal-ai/flux/schnell';

const TERRAIN_TILES = [
  {
    name: 'terrain_ocean',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, deep ocean water, rich cobalt blue with subtle whitecap ripple patterns, hand-painted illustration style like Battle for Wesnoth, viewed perfectly from above, no perspective, uniform tile pattern, natural organic water texture variation, ancient strategy game art',
  },
  {
    name: 'terrain_plains',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, flat grassy plains, light yellowish-green grass with subtle variation, scattered wildflowers and pebbles, hand-painted illustration style like Battle for Wesnoth or Civilization, viewed perfectly from above, no perspective, warm sun-lit color palette, soft green tones',
  },
  {
    name: 'terrain_grassland',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, rich lush grassland, deep vibrant green grass with organic blade details, tiny clover patches, hand-painted illustration style like Battle for Wesnoth, viewed perfectly from above, no perspective, full saturation healthy green, natural texture variation',
  },
  {
    name: 'terrain_forest',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, deciduous forest canopy viewed from directly above, dark green round tree crowns with dappled sunlight gaps between them, hand-painted illustration style like Battle for Wesnoth, rich greens and deep shadows between trees, organic natural pattern',
  },
  {
    name: 'terrain_jungle',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, dense tropical jungle canopy from directly above, very dark deep green with large overlapping broad leaves, exotic tropical feel, hand-painted illustration style like Battle for Wesnoth, deep shadow contrasts, dense thick foliage, humid tropical atmosphere',
  },
  {
    name: 'terrain_hills',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, rolling hills terrain viewed from above, earthy yellowish-brown and green tones with subtle elevation shading at hill edges, sparse dry grass and dirt patches, hand-painted illustration style like Battle for Wesnoth, warm earthy Mediterranean hills',
  },
  {
    name: 'terrain_mountains',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, rocky mountain terrain viewed directly from above, gray stone with white snow at peaks, bare rock faces with crevices, hand-painted illustration style like Battle for Wesnoth, cool gray and white palette with dramatic rock shadows, high altitude alpine feel',
  },
  {
    name: 'terrain_desert',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, arid sandy desert viewed from directly above, warm golden-orange sand with subtle dune ripple patterns and occasional pebbles, hand-painted illustration style like Battle for Wesnoth, hot dry atmosphere, rich sandy ochre and sienna tones',
  },
  {
    name: 'terrain_swamp',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, murky swamp wetland viewed from above, dark brown-green muddy water with clumps of dead grass and moss, murky bubbles, hand-painted illustration style like Battle for Wesnoth, gloomy dark atmosphere, sickly olive and brown tones',
  },
  {
    name: 'terrain_tundra',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, frozen tundra viewed from directly above, cold pale gray-blue ground with sparse dead brown grass and frost patterns, icy patches, hand-painted illustration style like Battle for Wesnoth, cold bleak winter atmosphere, desaturated blue-gray palette',
  },
  {
    name: 'terrain_arctic',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, arctic snow and ice field viewed from directly above, pure white snow with subtle blue shadow patterns in snow drifts, cracked ice surface, hand-painted illustration style like Battle for Wesnoth, clean crisp cold atmosphere, white and pale blue palette',
  },
  {
    name: 'terrain_river',
    prompt: 'seamless tileable top-down 2D strategy game terrain texture, flowing river water viewed from directly above, clear blue-green water with subtle current ripples and small rocks, shallow riverbed visible, hand-painted illustration style like Battle for Wesnoth, fresh clean water feel, bright azure and teal tones',
  },
];

async function generate(tile) {
  const resp = await fetch(`${SERVER}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt: tile.prompt,
      tileName: tile.name,
      width: 256,
      height: 256,
    }),
  });
  return resp.json();
}

async function main() {
  console.log(`Generating ${TERRAIN_TILES.length} terrain tiles...`);
  for (const tile of TERRAIN_TILES) {
    process.stdout.write(`→ ${tile.name}... `);
    try {
      const result = await generate(tile);
      if (result.ok) {
        console.log(`✓ saved (${(result.size / 1024).toFixed(0)}KB)`);
      } else {
        console.log(`✗ ERROR: ${result.error}`);
      }
    } catch (e) {
      console.log(`✗ FETCH ERROR: ${e.message}`);
    }
  }
  console.log('\nAll done!');
}

main();
