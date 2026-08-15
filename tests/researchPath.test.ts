/**
 * Verifies the research path utilities and tech icons used by the Technology
 * Research feature (tree selection, progress persistence, notifications).
 */
import { describe, it, expect } from 'vitest';
import { findPathToTech, firstUnresearchedInPath } from '@/utils/ResearchPath';
import { getTechIcon } from '@/data/TechnologyIcons';
import { TECHNOLOGIES_DATA } from '@/data/TechnologyData';

describe('findPathToTech', () => {
  it('returns a single-node path for a root tech', () => {
    expect(findPathToTech(TECHNOLOGIES_DATA, 'pottery')).toEqual(['pottery']);
    expect(findPathToTech(TECHNOLOGIES_DATA, 'alphabet')).toEqual(['alphabet']);
  });

  it('returns the prerequisite chain for a deep tech', () => {
    expect(findPathToTech(TECHNOLOGIES_DATA, 'literacy')).toEqual(['alphabet', 'writing', 'literacy']);
    expect(findPathToTech(TECHNOLOGIES_DATA, 'the_wheel')).toEqual(['the_wheel']);
  });

  it('reaches late-game techs via their prerequisites', () => {
    const path = findPathToTech(TECHNOLOGIES_DATA, 'space_flight');
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toBe('space_flight');
    // every consecutive pair must be a prerequisite edge
    for (let i = 1; i < path!.length; i++) {
      const tech = TECHNOLOGIES_DATA.find((t) => t.id === path![i]);
      expect(tech?.prerequisites ?? []).toContain(path![i - 1]);
    }
  });

  it('returns null for an unknown tech', () => {
    expect(findPathToTech(TECHNOLOGIES_DATA, 'not_a_tech')).toBeNull();
    expect(findPathToTech([], 'pottery')).toBeNull();
  });
});

describe('firstUnresearchedInPath', () => {
  it('picks the first available + unresearched tech in the path', () => {
    // Mark alphabet as researched so the path starts at writing. (TECHNOLOGIES_DATA
    // only sets `available` on root techs, so mark the path techs available too.)
    const techs = TECHNOLOGIES_DATA.map((t) => {
      if (t.id === 'alphabet') return { ...t, researched: true, available: true };
      if (t.id === 'writing' || t.id === 'literacy') return { ...t, available: true };
      return { ...t };
    });
    const path = ['alphabet', 'writing', 'literacy'];
    expect(firstUnresearchedInPath(techs, path)).toBe('writing');
  });

  it('returns null when the path is exhausted', () => {
    const techs = TECHNOLOGIES_DATA.map((t) =>
      ['alphabet', 'writing', 'literacy'].includes(t.id) ? { ...t, researched: true } : { ...t },
    );
    expect(firstUnresearchedInPath(techs, ['alphabet', 'writing', 'literacy'])).toBeNull();
    expect(firstUnresearchedInPath(techs, [])).toBeNull();
  });
});

describe('getTechIcon', () => {
  it('returns a fitting icon for known techs and the 🧪 fallback otherwise', () => {
    expect(getTechIcon('pottery')).toBe('🏺');
    expect(getTechIcon('space_flight')).toBe('🚀');
    expect(getTechIcon('not_a_tech')).toBe('🧪');
  });
});
