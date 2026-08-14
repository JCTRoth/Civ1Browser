# Diplomacy Images — Placement Guide & Generation Prompts

This document describes **every image slot** in the diplomacy UI, where to place the files, the required dimensions, and ready-to-use **image generation prompts** (for DALL-E, Midjourney, Stable Diffusion, or similar tools).

---

## Table of Contents

1. [Directory Structure](#1-directory-structure)
2. [Leader Portraits (14 images)](#2-leader-portraits-14-images)
3. [Diplomacy Scene Backgrounds (7 images)](#3-diplomacy-scene-backgrounds-7-images)
4. [Diplomatic Status Icons (4 images)](#4-diplomatic-status-icons-4-images)
5. [Treaty Icons (5 images)](#5-treaty-icons-5-images)
6. [Attitude Mood Frames (4 images)](#6-attitude-mood-frames-4-images)
7. [Event Icons (8 images)](#7-event-icons-8-images)
8. [Integration Guide](#8-integration-guide)

---

## 1. Directory Structure

Create the following directory tree for all diplomacy images:

```
public/
  images/
    diplomacy/
      leaders/              ← 14 leader portrait images
        lincoln.png
        montezuma.png
        hammurabi.png
        mao.png
        ramesses.png
        elizabeth.png
        frederick.png
        napoleon.png
        alexander.png
        gandhi.png
        genghis.png
        caesar.png
        stalin.png
        shaka.png
      scenes/               ← 7 scene background images
        throne.png
        temple.png
        palace.png
        tent.png
        garden.png
        fortress.png
        court.png
      icons/
        status/             ← 4 diplomatic status icons
          war.png
          peace.png
          ceasefire.png
          alliance.png
        treaties/           ← 5 treaty icons
          open_borders.png
          trade_agreement.png
          mutual_defense.png
          non_aggression.png
          embargo.png
        moods/              ← 4 attitude mood frames/overlays
          friendly.png
          neutral.png
          annoyed.png
          hostile.png
        events/             ← 8 event notification icons
          war_declared.png
          peace_made.png
          ceasefire_signed.png
          alliance_formed.png
          tribute_paid.png
          unit_bribed.png
          intelligence.png
          treaty_signed.png
```

---

## 2. Leader Portraits (14 images)

**Dimensions:** 240 × 312 px (2× for retina; displayed at 120 × 156)
**Format:** PNG with transparent background
**Style target:** Pixel art or painted portrait in the style of Civilization I/II leader screens — shoulders-up bust portrait, rich period clothing, characteristic headgear.

### File: `leaders/lincoln.png`
**Leader:** Abraham Lincoln — Americans

> **Prompt:** Pixel art portrait of Abraham Lincoln, shoulders-up bust view, dark navy suit with gold pocket chain, tall black top hat, short dark beard, serious but kind expression, warm skin tone, olive-green eyes, dark wood-paneled office background, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/montezuma.png`
**Leader:** Montezuma — Aztecs

> **Prompt:** Pixel art portrait of Aztec emperor Montezuma, shoulders-up bust view, elaborate green feathered headdress with gold accents, jade necklace, bare shoulders with golden armbands, bronze skin, dark intense eyes, ancient stone temple background with torches, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/hammurabi.png`
**Leader:** Hammurabi — Babylonians

> **Prompt:** Pixel art portrait of ancient Babylonian King Hammurabi, shoulders-up bust view, golden turban with red jewel centerpiece, long black curly beard, bronze skin, dark brown robes with gold trim, stern regal expression, Babylonian palace background with carved stone walls, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/mao.png`
**Leader:** Mao Tse Tung — Chinese

> **Prompt:** Pixel art portrait of a Chinese chairman in Mao suit, shoulders-up bust view, olive green military tunic with golden buttons, no headgear, neat black hair combed back, warm skin tone, calm calculated expression, red and gold palace hall background, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/ramesses.png`
**Leader:** Ramesses II — Egyptians

> **Prompt:** Pixel art portrait of Egyptian Pharaoh Ramesses II, shoulders-up bust view, gold and blue striped nemes headdress with cobra uraeus, golden collar necklace, white linen robe, bronze skin, dark lined eyes, short dark goatee, sandstone temple background with hieroglyphs, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/elizabeth.png`
**Leader:** Elizabeth I — English

> **Prompt:** Pixel art portrait of Queen Elizabeth I, shoulders-up bust view, ornate golden crown with colored jewels, red curly hair with pearl decorations, large white ruff collar, deep crimson velvet dress with gold embroidery, pale porcelain skin, blue eyes, regal composure, purple and gold throne room background, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/frederick.png`
**Leader:** Frederick the Great — Germans

> **Prompt:** Pixel art portrait of Prussian King Frederick the Great, shoulders-up bust view, silver pointed military helmet with crest, powdered white hair, grey handlebar mustache, dark blue Prussian military uniform with gold braiding and medals, pale skin, stern blue eyes, stone fortress background with Prussian eagle banner, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/napoleon.png`
**Leader:** Napoleon Bonaparte — French

> **Prompt:** Pixel art portrait of Emperor Napoleon Bonaparte, shoulders-up bust view, signature black bicorne hat worn sideways, dark brown hair, clean-shaven, dark blue military coat with red collar and gold epaulettes, pale skin, piercing green eyes, commanding expression, ornate French court background with tricolor drapes, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/alexander.png`
**Leader:** Alexander the Great — Greeks

> **Prompt:** Pixel art portrait of Alexander the Great, shoulders-up bust view, golden laurel wreath crown, wavy golden-brown hair flowing past ears, clean-shaven youthful face, white Greek chiton with blue cape draped over one shoulder, olive skin, green eyes, confident heroic expression, marble columned palace background, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/gandhi.png`
**Leader:** Mahatma Gandhi — Indians

> **Prompt:** Pixel art portrait of Mahatma Gandhi, shoulders-up bust view, bald head with thin white hair on sides, round wire-rimmed spectacles, simple white cotton shawl draped over bare shoulders, thin build, brown skin, gentle wise expression, peaceful Indian garden background with orange marigold flowers and green foliage, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/genghis.png`
**Leader:** Genghis Khan — Huns

> **Prompt:** Pixel art portrait of Genghis Khan, shoulders-up bust view, brown fur cap with leather trim, long black hair with thin braids, thick dark drooping mustache, weathered bronze skin, dark intense eyes, brown leather armor with fur collar, Mongolian steppe tent (ger) interior background with weapons on walls, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/caesar.png`
**Leader:** Julius Caesar — Romans

> **Prompt:** Pixel art portrait of Roman Emperor Julius Caesar, shoulders-up bust view, golden laurel wreath on short dark hair, clean-shaven strong jaw, deep red Roman toga with gold clasp at shoulder, olive skin, green eyes, commanding imperial expression, Roman senate hall background with marble columns and red drapes, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/stalin.png`
**Leader:** Joseph Stalin — Russians

> **Prompt:** Pixel art portrait of a Soviet premier, shoulders-up bust view, no headgear, thick dark hair combed back, thick dark bushy mustache, olive-green military tunic with red collar tabs and gold star medals, warm skin tone, calculating dark eyes, fortress interior background with red Soviet banner and hammer-sickle emblem, 16-bit retro game style, 240x312 pixels, no text

---

### File: `leaders/shaka.png`
**Leader:** Shaka — Zulus

> **Prompt:** Pixel art portrait of Zulu King Shaka, shoulders-up bust view, red and white feathered warrior headdress, bare muscular shoulders, beaded necklace and armband, large cowhide shield partially visible, dark brown skin, fierce proud expression, African savanna landscape background with acacia trees and setting sun, 16-bit retro game style, 240x312 pixels, no text

---

## 3. Diplomacy Scene Backgrounds (7 images)

**Dimensions:** 560 × 480 px (fills the negotiation panel right side)
**Format:** PNG (opaque, dark-toned to not overwhelm UI text)
**Style target:** Dark, moody, pixel art or painted scene — should be dimmed/desaturated so UI text remains readable. These appear **behind** the entire negotiation panel.

### File: `scenes/throne.png`
**Used by:** Elizabeth I (English), Julius Caesar (Romans)

> **Prompt:** Dark moody pixel art throne room interior, ornate golden throne on raised dais, red velvet curtains, marble floor, candlelight illumination, very dark and desaturated color palette, meant as background for text overlay, 16-bit retro game style, 560x480 pixels

---

### File: `scenes/temple.png`
**Used by:** Montezuma (Aztecs), Ramesses II (Egyptians)

> **Prompt:** Dark moody pixel art ancient stone temple interior, massive carved columns, torch-lit with flickering orange glow, hieroglyphic or Mesoamerican carvings on walls, stone altar, very dark and desaturated color palette, meant as background for text overlay, 16-bit retro game style, 560x480 pixels

---

### File: `scenes/palace.png`
**Used by:** Hammurabi (Babylonians), Mao Tse Tung (Chinese), Alexander the Great (Greeks)

> **Prompt:** Dark moody pixel art royal palace audience hall, polished marble floor, gilded arched ceiling, silk tapestries on walls, low ambient light from high windows, very dark and desaturated color palette, meant as background for text overlay, 16-bit retro game style, 560x480 pixels

---

### File: `scenes/tent.png`
**Used by:** Genghis Khan (Huns), Shaka (Zulus)

> **Prompt:** Dark moody pixel art nomadic war tent interior, animal hide walls, fur rugs on dirt floor, weapons hanging on wooden poles, campfire glow from center, very dark and desaturated color palette, meant as background for text overlay, 16-bit retro game style, 560x480 pixels

---

### File: `scenes/garden.png`
**Used by:** Mahatma Gandhi (Indians)

> **Prompt:** Dark moody pixel art peaceful garden at dusk, stone pathway through manicured hedges, blooming flowers in shadow, distant pagoda silhouette, fireflies and soft ambient light, very dark and desaturated color palette, meant as background for text overlay, 16-bit retro game style, 560x480 pixels

---

### File: `scenes/fortress.png`
**Used by:** Frederick the Great (Germans), Joseph Stalin (Russians)

> **Prompt:** Dark moody pixel art military fortress interior, thick stone walls, arrow slits with dim daylight, weapon racks and maps on tables, iron chandeliers with candles, very dark and desaturated color palette, meant as background for text overlay, 16-bit retro game style, 560x480 pixels

---

### File: `scenes/court.png`
**Used by:** Abraham Lincoln (Americans), Napoleon Bonaparte (French)

> **Prompt:** Dark moody pixel art government court chamber, wooden paneled walls, official desk with papers and quill, national flag in background, gas lamp lighting, very dark and desaturated color palette, meant as background for text overlay, 16-bit retro game style, 560x480 pixels

---

## 4. Diplomatic Status Icons (4 images)

**Dimensions:** 32 × 32 px
**Format:** PNG with transparent background
**Style target:** Clean pixel art icon, single recognizable symbol, bold colors

### File: `icons/status/war.png`
> **Prompt:** 32x32 pixel art icon of two crossed swords, red and silver metal, dark transparent background, sharp clean lines, retro game UI style

### File: `icons/status/peace.png`
> **Prompt:** 32x32 pixel art icon of a white dove carrying an olive branch, soft green leaf, dark transparent background, clean lines, retro game UI style

### File: `icons/status/ceasefire.png`
> **Prompt:** 32x32 pixel art icon of a white flag on a pole, slightly waving, dark transparent background, clean lines, retro game UI style

### File: `icons/status/alliance.png`
> **Prompt:** 32x32 pixel art icon of a handshake between two hands, one gold and one silver, dark transparent background, clean lines, retro game UI style

---

## 5. Treaty Icons (5 images)

**Dimensions:** 24 × 24 px
**Format:** PNG with transparent background
**Style target:** Small, clear pixel art icon that works at small sizes inside UI badges

### File: `icons/treaties/open_borders.png`
> **Prompt:** 24x24 pixel art icon of an open wooden gate or door, welcoming, brown wood with green landscape visible through doorway, transparent background, retro game UI style

### File: `icons/treaties/trade_agreement.png`
> **Prompt:** 24x24 pixel art icon of a wooden trade cart or merchant package with gold coins, warm brown and yellow colors, transparent background, retro game UI style

### File: `icons/treaties/mutual_defense.png`
> **Prompt:** 24x24 pixel art icon of two overlapping shields, one blue and one red, with a small sword behind them, transparent background, retro game UI style

### File: `icons/treaties/non_aggression.png`
> **Prompt:** 24x24 pixel art icon of an open raised hand in a "stop" gesture, warm skin tone, transparent background, retro game UI style

### File: `icons/treaties/embargo.png`
> **Prompt:** 24x24 pixel art icon of a red circle with a diagonal line through it (prohibition sign) over a small gold coin, transparent background, retro game UI style

---

## 6. Attitude Mood Frames (4 images)

**Dimensions:** 128 × 164 px
**Format:** PNG with transparent center and decorated border
**Style target:** Ornate pixel art border/frame that goes around the leader portrait. The center must be fully transparent. Only the border is visible.

### File: `icons/moods/friendly.png`
> **Prompt:** 128x164 pixel art ornamental frame border only, center is fully transparent, green vine and leaf decorations intertwined with gold filigree, warm welcoming style, retro game style

### File: `icons/moods/neutral.png`
> **Prompt:** 128x164 pixel art ornamental frame border only, center is fully transparent, simple stone carved border with subtle grey and brown tones, neutral dignified style, retro game style

### File: `icons/moods/annoyed.png`
> **Prompt:** 128x164 pixel art ornamental frame border only, center is fully transparent, iron border with orange rust patches and sharp angular corners, tense aggressive style, retro game style

### File: `icons/moods/hostile.png`
> **Prompt:** 128x164 pixel art ornamental frame border only, center is fully transparent, dark thorny vines with red spikes and cracked edges, menacing hostile style, retro game style

---

## 7. Event Icons (8 images)

**Dimensions:** 20 × 20 px
**Format:** PNG with transparent background
**Style target:** Tiny pixel art icon used in the diplomacy event log. Must be legible at very small size.

### File: `icons/events/war_declared.png`
> **Prompt:** 20x20 pixel art micro-icon of a red explosion or crossed red swords, transparent background, bold simple shapes, retro game style

### File: `icons/events/peace_made.png`
> **Prompt:** 20x20 pixel art micro-icon of a small green olive branch, transparent background, bold simple shapes, retro game style

### File: `icons/events/ceasefire_signed.png`
> **Prompt:** 20x20 pixel art micro-icon of a small white flag, transparent background, bold simple shapes, retro game style

### File: `icons/events/alliance_formed.png`
> **Prompt:** 20x20 pixel art micro-icon of two small clasped hands in gold, transparent background, bold simple shapes, retro game style

### File: `icons/events/tribute_paid.png`
> **Prompt:** 20x20 pixel art micro-icon of gold coins stacked, transparent background, bold simple shapes, yellow and orange, retro game style

### File: `icons/events/unit_bribed.png`
> **Prompt:** 20x20 pixel art micro-icon of a small money bag with a question mark, transparent background, bold simple shapes, retro game style

### File: `icons/events/intelligence.png`
> **Prompt:** 20x20 pixel art micro-icon of a small magnifying glass or spy eye, transparent background, bold simple shapes, retro game style

### File: `icons/events/treaty_signed.png`
> **Prompt:** 20x20 pixel art micro-icon of a small scroll or parchment with a wax seal, transparent background, bold simple shapes, retro game style

---

## 8. Integration Guide

### Replacing SVG portraits with image files

To use real images instead of the procedural SVG portraits, edit `LeaderPortrait.tsx`:

```tsx
// In LeaderPortrait.tsx — replace the SVG with an <img> tag:

// 1. Add a mapping from leader name to image filename
const LEADER_IMAGE_FILES: Record<string, string> = {
  'Abraham Lincoln': 'lincoln.png',
  'Montezuma': 'montezuma.png',
  'Hammurabi': 'hammurabi.png',
  'Mao Tse Tung': 'mao.png',
  'Ramesses II': 'ramesses.png',
  'Elizabeth I': 'elizabeth.png',
  'Frederick the Great': 'frederick.png',
  'Napoleon Bonaparte': 'napoleon.png',
  'Alexander the Great': 'alexander.png',
  'Mahatma Gandhi': 'gandhi.png',
  'Dschingis Khan': 'genghis.png',
  'Julius Caesar': 'caesar.png',
  'Joseph Stalin': 'stalin.png',
  'Shaka': 'shaka.png',
};

// 2. In the component, check if an image exists:
const imageFile = LEADER_IMAGE_FILES[leaderName];
if (imageFile) {
  return <img
    src={`/images/diplomacy/leaders/${imageFile}`}
    alt={leaderName}
    width={size}
    height={size * 1.3}
    className="leader-portrait-img"
  />;
}
// 3. Fall back to the procedural SVG if no image is found
```

### Using scene backgrounds

To add scene backgrounds behind the negotiation panel, edit `GameModals.tsx`:

```tsx
// In the diplomacy-negotiation div, add a background image:
const sceneType = portraitConfig?.scene || 'court';
const sceneStyle = {
  backgroundImage: `url(/images/diplomacy/scenes/${sceneType}.png)`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
};

// Apply as inline style on the .diplomacy-negotiation div
```

### Using mood frames

To overlay a mood frame on the portrait:

```css
.diplomacy-portrait-slot.mood-friendly {
  border-image: url('/images/diplomacy/icons/moods/friendly.png') 8 fill;
}
```

### Using treaty and status icons

Replace emoji characters in the JSX with `<img>` tags:

```tsx
// Instead of: {STATUS_ICONS[status] || '❓'}
// Use:
<img
  src={`/images/diplomacy/icons/status/${status}.png`}
  alt={status}
  width={16}
  height={16}
/>
```

### CSS class for image portraits

Add to `diplomacyModal.css`:

```css
.leader-portrait-img {
  display: block;
  image-rendering: pixelated;  /* crisp pixel art scaling */
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

---

## Quick Reference: All 42 Images

| Category | Count | Dimensions | Path |
|----------|-------|-----------|------|
| Leader portraits | 14 | 240 × 312 | `public/images/diplomacy/leaders/` |
| Scene backgrounds | 7 | 560 × 480 | `public/images/diplomacy/scenes/` |
| Status icons | 4 | 32 × 32 | `public/images/diplomacy/icons/status/` |
| Treaty icons | 5 | 24 × 24 | `public/images/diplomacy/icons/treaties/` |
| Mood frames | 4 | 128 × 164 | `public/images/diplomacy/icons/moods/` |
| Event icons | 8 | 20 × 20 | `public/images/diplomacy/icons/events/` |
| **Total** | **42** | | |
