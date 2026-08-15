// Research path helpers — the ordered chain of techs from the tree roots to a
// target tech (via prerequisites). Used by the tech tree and research selection.
import type { Technology } from '../../types/game';

/**
 * Return an ordered path [root, …, targetId] following prerequisite edges.
 * Returns null when the target cannot be reached from any root tech.
 */
export function findPathToTech(techs: Technology[], targetId: string): string[] | null {
  if (!techs || techs.length === 0) return null;

  const childrenMap: Record<string, string[]> = {};
  techs.forEach((t) => {
    (t.prerequisites || []).forEach((p) => {
      if (!childrenMap[p]) childrenMap[p] = [];
      childrenMap[p].push(t.id);
    });
  });

  const roots = techs
    .filter((t) => !t.prerequisites || t.prerequisites.length === 0)
    .map((t) => t.id);

  const visited = new Set<string>();
  const stack: string[] = [];

  const dfs = (nodeId: string): boolean => {
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    stack.push(nodeId);
    if (nodeId === targetId) return true;
    const children = childrenMap[nodeId] || [];
    for (const c of children) {
      if (dfs(c)) return true;
    }
    stack.pop();
    return false;
  };

  for (const root of roots) {
    visited.clear();
    stack.length = 0;
    if (dfs(root)) return [...stack];
  }
  return null;
}

/**
 * The first tech in `path` that is available and not yet researched — the next
 * tech a civ should start (or continue) researching. Returns null when the
 * path is exhausted or empty.
 */
export function firstUnresearchedInPath(techs: Technology[], path: string[]): string | null {
  for (const id of path) {
    const t = techs.find((x) => x.id === id);
    if (t && t.available && !t.researched) return id;
  }
  return null;
}
