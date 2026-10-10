import { expect, Page, test } from '@playwright/test';

const TOKEN = 'e2e-token';

test.use({ viewport: { width: 1400, height: 900 } });

async function connect(page: Page): Promise<void> {
  await page.goto('/connect');
  await page.getByText('Use an access token', { exact: true }).click();
  await page.getByPlaceholder('Access token').fill(TOKEN);
  await page.getByText('Connect', { exact: true }).click();
  await expect(page.getByPlaceholder(/Add a task/)).toBeVisible();
}

/** What has the keyboard: the tag, and the value if it's a field. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement | null;
    return { tag: el?.tagName ?? null, value: el?.value ?? null };
  });

const typingIn = (f: { tag: string | null }) => f.tag === 'INPUT' || f.tag === 'TEXTAREA';

test('the keyboard moves between the add field, the list and the task pane', async ({ page }) => {
  const stamp = Date.now();
  const titles = [`Keys first ${stamp}`, `Keys second ${stamp}`];
  await connect(page);

  const quickAdd = page.getByPlaceholder(/Add a task/);
  await quickAdd.click();
  for (const title of titles) {
    await quickAdd.fill(title);
    await quickAdd.press('Enter');
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }

  // Escape leaves the add field for the list, rather than for nothing.
  await page.keyboard.press('Escape');
  await expect.poll(async () => typingIn(await focused(page))).toBe(false);

  // The list answers its keys: Return opens the cursor's task beside it.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Close', { exact: true })).toBeVisible();

  // Tab from the list goes into the task's title.
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await focused(page)).tag).toBe('INPUT');
  const title = (await focused(page)).value;
  expect(titles).toContain(title);

  // Tab in the title moves on to the notes, and types nothing into the title.
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await focused(page)).tag).toBe('TEXTAREA');
  await expect(page.locator(`input[value="${title}"]`)).toHaveCount(1);

  // Shift-Tab comes back.
  await page.keyboard.press('Shift+Tab');
  await expect.poll(async () => (await focused(page)).value).toBe(title);

  // Escape in the pane gives the keyboard back to the list, with the task still open.
  await page.keyboard.press('Escape');
  await expect.poll(async () => typingIn(await focused(page))).toBe(false);
  await expect(page.getByText('Close', { exact: true })).toBeVisible();

  // And the list's own Escape then closes it.
  await page.keyboard.press('Escape');
  await expect(page.getByText('Close', { exact: true })).toBeHidden();
});
