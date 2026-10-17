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

  // The list answers its keys: Return opens the cursor's task beside it, to edit.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Close', { exact: true })).toBeVisible();
  await expect.poll(async () => (await focused(page)).tag).toBe('INPUT');

  // Escape goes back to the list, and Tab from there into the task's title.
  await page.keyboard.press('Escape');
  await expect.poll(async () => typingIn(await focused(page))).toBe(false);
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

test('Return edits, Space opens, and the list and sidebar answer their keys', async ({ page }) => {
  const stamp = Date.now();
  const titles = [`Jump a ${stamp}`, `Jump b ${stamp}`, `Jump c ${stamp}`];
  await connect(page);

  const quickAdd = page.getByPlaceholder(/Add a task/);
  await quickAdd.click();
  for (const title of titles) {
    await quickAdd.fill(title);
    await quickAdd.press('Enter');
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect.poll(async () => typingIn(await focused(page))).toBe(false);

  // Space opens the cursor's task beside the list and leaves the keyboard there.
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  await page.keyboard.press(' ');
  await expect(page.getByText('Close', { exact: true })).toBeVisible();
  expect(typingIn(await focused(page))).toBe(false);

  // Return goes on into the title, to edit it.
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await focused(page)).tag).toBe('INPUT');

  // Escape comes back, and ⌘↑ jumps to the first task, which the pane follows.
  await page.keyboard.press('Escape');
  await expect.poll(async () => typingIn(await focused(page))).toBe(false);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await focused(page)).tag).toBe('INPUT');
  const last = (await focused(page)).value;
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await focused(page)).value).not.toBe(last);
  await page.keyboard.press('Escape');

  // ← goes to the sidebar, where ↓ moves to the next view and shows it.
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await focused(page)).tag).toBe('DIV');
  const before = page.url();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.url()).not.toBe(before);
  // The sidebar keeps the keyboard as the view changes, and Return hands it back.
  await expect.poll(async () => (await focused(page)).tag).toBe('DIV');
  await page.keyboard.press('Enter');

  // ⌘/ lists the keys.
  await page.keyboard.press('ControlOrMeta+/');
  await expect(page.getByText('Keyboard Shortcuts', { exact: true })).toBeVisible();
  await expect(page.getByText('Last Task', { exact: true })).toBeVisible();
});
