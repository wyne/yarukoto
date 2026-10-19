import { expect, test } from '@playwright/test';

const TOKEN = 'e2e-token';
const auth = { Authorization: `Bearer ${TOKEN}` };

test("a task's history opens from the bottom of the task and lists its edits", async ({ page, request }) => {
  const title = `History ${Date.now()}`;
  const created = await request.post('/api/v1/tasks', { headers: auth, data: { title } });
  expect(created.ok()).toBe(true);
  const { task } = await created.json();
  expect((await request.patch(`/api/v1/tasks/${task.id}`, { headers: auth, data: { priority: 'high' } })).ok()).toBe(true);
  expect((await request.patch(`/api/v1/tasks/${task.id}`, { headers: auth, data: { notes: 'bring the watering can' } })).ok()).toBe(true);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/connect');
  await page.getByText('Use an access token', { exact: true }).click();
  await page.getByPlaceholder('Access token').fill(TOKEN);
  await page.getByText('Connect', { exact: true }).click();
  await expect(page.getByPlaceholder(/Add a task/)).toBeVisible();

  await page.getByText(title, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Show history' }).click();
  await expect(page.getByText('Edited notes')).toBeVisible();
  await expect(page.getByText('Edited priority')).toBeVisible();
  await expect(page.getByText('Created task')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/task-history.png' });

  // A popover closes on a click anywhere outside it.
  await page.mouse.click(600, 400);
  await expect(page.getByText('Edited priority')).toHaveCount(0);
});
