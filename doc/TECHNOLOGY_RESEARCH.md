# Technology Research

Player-facing research UX built on top of the existing Technology Tree modal.

## Behaviour (per TODO.txt spec)

1. **Selection & persistence** — When the player picks a tech in the Modal Technology
   Tree, the selected tech **and** the full prerequisite path to it are remembered
   (persisted in the store as `researchPath`).
2. **Highlight on reopen** — Reopening the modal highlights the previously selected
   path (gold `#ffd700` stroke on the currently-researched node) and shows the path
   breadcrumb at the top.
3. **Progress** — The currently-researched tech shows `progress/cost sci` on its node
   plus a gold progress bar; the side panel shows the same with a progress bar.
4. **Switching techs** — Selecting a different tech saves the current tech's progress
   (`techProgress`) and starts the new one at zero (restoring any progress it had
   from a previous switch).
5. **Completion notification** — When a tech finishes, a "Research Complete" modal
   shows the tech's emoji/icon (fallback `🧪`), its name, and a short description.
6. **Path has more techs** — The modal shows a **"Continue Researching: [next]"**
   button; research also auto-advances to the next available tech in the path.
7. **Path exhausted** — The modal shows a **"Choose New Research Path"** button that
   opens the Technology Tree.
8. **Every turn** — If no path is selected / nothing is being researched but not all
   techs are complete, the side panel shows "No research selected…" with a
   "Choose Research Path" button.

## Architecture

- `src/data/TechnologyIcons.ts` — emoji icon map + `getTechIcon(id)`.
- `src/utils/ResearchPath.ts` — `findPathToTech` (DFS root→target), `firstUnresearchedInPath`.
- `src/stores/GameStore.ts` — `researchPath`, `techProgress`, `lastResearchedTech`
  state + `setResearchPath` / `saveTechProgress` / `notifyTechResearched` /
  `dismissTechNotification` actions.
- `src/game/engine/GameEngine.ts` — `setResearch(civId, techId, savedProgress?)`;
  `updateTechnologyAvailability()` marks completed techs `researched` on the shared
  tree (union of all civs' researched techs).
- `src/game/engine/TurnManager.ts` — emits `TECH_RESEARCHED {civilizationId, techId}`
  when a tech completes.
- `src/utils/EngineEventHandlers.ts` — `onTechResearched` (syncs store copies, shows
  the completion modal for the human player, auto-advances the path) +
  `advanceResearchPath`.
- `src/components/ui/TechTreeView.tsx` — research props, `is-researching` highlight,
  progress display, click-to-select.
- `src/components/ui/GameModals.tsx` — `handleSelectTech`, `renderResearchComplete`
  (invoked as `{renderResearchComplete()}` in the main return).
- `src/components/ui/SidePanel.tsx` — research status section (always reads the
  **human** player, `civilizations[0]`, never `currentPlayer`).

## Tests

- `tests/researchPath.test.ts` — path finding + icons (7 unit tests).
- e2e `e2e/game.spec.ts` — Tech Tree tests (modal shows available techs, selecting a
  tech, researched techs after turns).
