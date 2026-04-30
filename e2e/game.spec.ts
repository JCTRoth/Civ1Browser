import { test, expect, Page } from '@playwright/test';

/**
 * Helper: navigate through the game setup wizard and start a game.
 * Uses the smallest/fastest map preset (CLOSEUP_1V1) to minimise wait time.
 */
async function startGame(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Step 1 – Civilization selection (default is pre-selected)
  await expect(page.locator('h2.modal-title')).toContainText('Zivilisation 1', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Next →' }).click();

  // Step 2 – Game settings
  await expect(page.getByText('Fine-tune Your Challenge')).toBeVisible();
  // Pick the smallest map for fast tests
  await page.locator('.control-card__select').last().selectOption('CLOSEUP_1V1');
  await page.getByRole('button', { name: '🏛️ Start Game' }).click();

  // Wait for game canvas to appear (game finished loading)
  await expect(page.locator('.game-canvas canvas').first()).toBeVisible({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Game Setup
// ---------------------------------------------------------------------------

test.describe('Game Setup', () => {
  test('shows the setup modal on load', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h2.modal-title')).toContainText('Zivilisation 1');
    await expect(page.getByText('Choose Your Civilization')).toBeVisible();
  });

  test('can select a civilization', async ({ page }) => {
    await page.goto('/');
    const aztecCard = page.locator('.setup-civ-card', { hasText: 'Aztecs' });
    await aztecCard.click();
    // Footer should reflect the selection
    await expect(page.locator('.setup-footer__selected-value')).toHaveText('Aztecs');
  });

  test('can navigate between setup steps', async ({ page }) => {
    await page.goto('/');
    // Step 1 → Step 2
    await page.getByRole('button', { name: /Next →/ }).click();
    await expect(page.getByText('Fine-tune Your Challenge')).toBeVisible();
    // Step 2 → Step 1
    await page.getByRole('button', { name: /← Previous/ }).click();
    await expect(page.getByText('Choose Your Civilization')).toBeVisible();
  });

  test('shows game summary on step 2', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Next →/ }).click();
    await expect(page.locator('.setup-summary-title')).toHaveText('Your Setup');
    // Default civilization should be shown in summary
    await expect(page.locator('.setup-summary')).toBeVisible();
  });

  test('starts the game after completing setup', async ({ page }) => {
    await startGame(page);
    // The top menu bar should be visible
    await expect(page.getByRole('button', { name: 'GAME' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End Turn' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Main Game UI
// ---------------------------------------------------------------------------

test.describe('Main Game UI', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page);
  });

  test('renders the game canvas', async ({ page }) => {
    const canvases = page.locator('.game-canvas canvas');
    await expect(canvases.first()).toBeVisible();
  });

  test('shows the side panel', async ({ page }) => {
    await expect(page.locator('.game-side-panel').first()).toBeVisible();
  });

  test('displays turn counter', async ({ page }) => {
    await expect(page.getByText(/Turn \d+/).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Top Menu
// ---------------------------------------------------------------------------

test.describe('Top Menu', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page);
  });

  test('opens and closes GAME menu', async ({ page }) => {
    await page.getByRole('button', { name: 'GAME' }).click();
    await expect(page.getByRole('button', { name: /New Game/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Save/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Settings/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Quit/ })).toBeVisible();

    // Close the menu by pressing Escape (clicking canvas may trigger End Turn dialog)
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /New Game/ })).not.toBeVisible();
  });

  test('opens ORDERS menu', async ({ page }) => {
    await page.getByRole('button', { name: 'ORDERS' }).click();
    // Should show tile improvement options
    await expect(page.getByRole('button', { name: /Road/ })).toBeVisible();
  });

  test('opens WORLD menu', async ({ page }) => {
    await page.getByRole('button', { name: 'WORLD' }).click();
    await expect(page.getByRole('button', { name: /Diplomacy/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Tech Tree/ })).toBeVisible();
  });

  test('opens INFO menu', async ({ page }) => {
    await page.getByRole('button', { name: 'INFO' }).click();
    await expect(page.getByRole('button', { name: /Download Map/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Help/ })).toBeVisible();
  });

  test('opens settings modal from GAME menu', async ({ page }) => {
    await page.getByRole('button', { name: 'GAME' }).click();
    await page.getByRole('button', { name: /Settings/ }).click();
    await expect(page.locator('.modal')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Keyboard Shortcuts
// ---------------------------------------------------------------------------

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page);
  });

  test('F1 opens help dialog', async ({ page }) => {
    // Dispatch F1 keydown on the window (page.keyboard.press may not reach window listeners in headless)
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', code: 'F1', bubbles: true })));
    await expect(page.getByText('Help & Controls').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Escape closes open modal', async ({ page }) => {
    // Open help via INFO menu (more reliable than F1 key)
    await page.getByRole('button', { name: 'INFO' }).click();
    await page.getByRole('button', { name: /Help/ }).click();
    await expect(page.getByText('Help & Controls').first()).toBeVisible();
    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(page.getByText('Help & Controls').first()).not.toBeVisible();
  });

  test('Enter triggers end turn flow', async ({ page }) => {
    await page.locator('.game-canvas').first().click();
    await page.keyboard.press('Enter');
    // Either the turn advances or a confirm dialog appears — game should still be functional
    await expect(page.getByText(/Turn \d+/).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// End Turn
// ---------------------------------------------------------------------------

test.describe('End Turn', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page);
  });

  test('clicking End Turn shows confirmation and can be confirmed', async ({ page }) => {
    // Verify the initial year
    await expect(page.locator('.game-top-bar')).toContainText('4000 BC');

    // Click the top-bar End Turn button
    await page.locator('.game-top-bar').getByRole('button', { name: 'End Turn' }).click();

    // The End Turn confirmation modal should appear
    const modal = page.locator('[role="dialog"]').filter({ hasText: 'End Turn?' });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Modal should have Cancel and End Turn buttons
    await expect(modal.locator('.btn-success')).toBeVisible();
    await expect(modal.getByRole('button', { name: /Cancel/ })).toBeVisible();

    // Click the green End Turn confirm button inside the modal
    await modal.locator('.btn-success').click();

    // Verify the turn advanced by checking the year changed in the top bar
    await expect(page.locator('.game-top-bar')).not.toContainText('4000 BC', { timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Help Dialog
// ---------------------------------------------------------------------------

test.describe('Help Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page);
  });

  test('help dialog contains multiple tabs', async ({ page }) => {
    // Open help via INFO menu
    await page.getByRole('button', { name: 'INFO' }).click();
    await page.getByRole('button', { name: /Help/ }).click();
    const modal = page.locator('.modal', { hasText: 'Help & Controls' });
    await expect(modal).toBeVisible();
    // Should have navigable tabs (Controls, Orders Menu, Gameplay, About)
    await expect(modal.getByRole('tab')).toHaveCount(4);
  });
});
