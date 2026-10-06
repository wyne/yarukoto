import { expect, Page, test } from '@playwright/test';

const TOKEN = 'e2e-token';

async function connect(page: Page): Promise<void> {
  await page.goto('/connect');
  await page.getByText('Use an access token', { exact: true }).click();
  await page.getByPlaceholder('Access token').fill(TOKEN);
  await page.getByText('Connect', { exact: true }).click();
  await expect(page.getByPlaceholder(/Add a task/)).toBeVisible();
}

test('a task created in one browser syncs through the server to another browser', async ({ browser, request }) => {
  const title = `Browser sync ${Date.now()}`;

  const firstContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  await connect(firstPage);

  const quickAdd = firstPage.getByPlaceholder(/Add a task/);
  await quickAdd.fill(`${title} !high #e2e`);
  await quickAdd.press('Enter');
  await expect(firstPage.getByText(title, { exact: true })).toBeVisible();

  await expect
    .poll(async () => {
      const response = await request.get('/api/v1/sync', {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(response.ok()).toBe(true);
      const body = await response.json();
      const task = body.tasks.find((candidate: { title: string }) => candidate.title === title);
      return task ? { priority: task.priority, tags: task.tags } : null;
    })
    .toEqual({ priority: 'high', tags: ['e2e'] });

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await connect(secondPage);
  await expect(secondPage.getByText(title, { exact: true })).toBeVisible();

  await firstContext.close();
  await secondContext.close();
});
