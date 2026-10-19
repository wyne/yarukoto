import { expect, test } from '@playwright/test';

const TOKEN = 'e2e-token';
const auth = { Authorization: `Bearer ${TOKEN}` };

test('activity picks up an edit from another device and filters by action', async ({ page, request }) => {
  const title = `Activity feed ${Date.now()}`;
  const created = await request.post('/api/v1/tasks', { headers: auth, data: { title } });
  expect(created.ok()).toBe(true);
  const { task } = await created.json();

  await page.goto('/connect');
  await page.getByText('Use an access token', { exact: true }).click();
  await page.getByPlaceholder('Access token').fill(TOKEN);
  await page.getByText('Connect', { exact: true }).click();
  await expect(page.getByPlaceholder(/Add a task/)).toBeVisible();

  await page.getByText('Activity', { exact: true }).first().click();
  await expect(page.getByText('Created task').first()).toBeVisible();
  await expect(page.getByText('Edited notes')).toHaveCount(0);

  // Another device edits the notes while this screen stays open; the next
  // sync tick should bring the edit in without a reload or pull-to-refresh.
  const edited = await request.patch(`/api/v1/tasks/${task.id}`, { headers: auth, data: { notes: 'from elsewhere' } });
  expect(edited.ok()).toBe(true);
  await expect(page.getByText('Edited notes')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('+ from elsewhere')).toBeVisible();

  await page.getByRole('button', { name: 'Deleted' }).click();
  await expect(page.getByText('Edited notes')).toHaveCount(0);
  await expect(page.getByText('Created task')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edited' }).click();
  await expect(page.getByText('Edited notes')).toBeVisible();
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.getByText('Created task').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/activity-filters.png' });
});
