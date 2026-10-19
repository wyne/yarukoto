import { expect, Page, test } from '@playwright/test';

const TOKEN = 'e2e-token';
const VIEWPORT = { width: 1000, height: 640 };

test.use({ viewport: VIEWPORT });

async function connect(page: Page): Promise<void> {
  await page.goto('/connect');
  await page.getByText('Use an access token', { exact: true }).click();
  await page.getByPlaceholder('Access token').fill(TOKEN);
  await page.getByText('Connect', { exact: true }).click();
  await expect(page.getByPlaceholder(/Add a task/)).toBeVisible();
}

/**
 * Right-clicks the row as if the pointer were at (x, y) in the window. Dispatched
 * rather than clicked, since a real click can only land where the row is.
 */
const rightClickAt = (page: Page, title: string, x: number, y: number) =>
  page
    .getByText(title, { exact: true })
    .evaluate(
      (el, at) =>
        el.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: at.x, clientY: at.y })
        ),
      { x, y }
    );

/** The menu's first and last items, which between them span the whole panel. */
async function menuExtent(page: Page) {
  const first = await page.getByText('Date', { exact: true }).boundingBox();
  const last = await page.getByText('Delete', { exact: true }).boundingBox();
  if (!first || !last) throw new Error('context menu not laid out');
  return { top: first.y, bottom: last.y + last.height, left: Math.min(first.x, last.x), right: last.x + last.width };
}

test('the task context menu stays inside the window wherever it opens', async ({ page }) => {
  const title = `Context menu ${Date.now()}`;
  await connect(page);
  const quickAdd = page.getByPlaceholder(/Add a task/);
  await quickAdd.fill(title);
  await quickAdd.press('Enter');
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  // Each corner, and the middle of the bottom edge, where a fixed "is there
  // 200px below?" guess used to open the menu downward past the edge.
  const points = [
    { x: 300, y: 120 },
    { x: 300, y: VIEWPORT.height - 230 },
    { x: 300, y: VIEWPORT.height - 20 },
    { x: VIEWPORT.width - 20, y: 120 },
    { x: VIEWPORT.width - 20, y: VIEWPORT.height - 20 },
  ];
  for (const at of points) {
    await rightClickAt(page, title, at.x, at.y);
    await expect(page.getByText('Delete', { exact: true })).toBeVisible();
    // Placement settles once the panel has measured itself.
    await expect
      .poll(async () => {
        const box = await menuExtent(page);
        return box.top >= 0 && box.left >= 0 && box.bottom <= VIEWPORT.height && box.right <= VIEWPORT.width;
      }, { message: `menu opened at ${at.x},${at.y} should fit the window` })
      .toBe(true);
    // Clicking away, across the window from the menu, is what closes it.
    await page.mouse.click(at.x > VIEWPORT.width / 2 ? 40 : VIEWPORT.width - 40, at.y > VIEWPORT.height / 2 ? 40 : VIEWPORT.height - 40);
    await expect(page.getByText('Delete', { exact: true })).toHaveCount(0);
  }
});
