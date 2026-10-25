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
  await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts', exact: true })).toBeVisible();
  await expect(page.getByText('Last Task', { exact: true })).toBeVisible();
  const shortcutSearch = page.getByPlaceholder('Search shortcuts…');
  const top = (await shortcutSearch.boundingBox())?.y;
  await shortcutSearch.fill('no-such-shortcut');
  await expect(page.getByText('No shortcuts match.', { exact: true })).toBeVisible();
  await expect.poll(async () => (await shortcutSearch.boundingBox())?.y).toBe(top);
});

test('a narrowed window keeps the sidebar as a rail, and expanding it hands it the keyboard', async ({ page }) => {
  await connect(page);
  const palette = async (command: string) => {
    await page.keyboard.press('ControlOrMeta+k');
    const search = page.getByPlaceholder('Go to or do…');
    await expect(search).toBeFocused();
    await search.fill(command);
    await expect(page.getByText(command, { exact: true }).last()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(search).toBeHidden();
  };

  // Too narrow for the full sidebar: the rail stays, however narrow the window.
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.getByLabel('Expand sidebar')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(page.getByLabel('Expand sidebar')).toBeVisible();

  // Back to full width, collapsed by hand, then expanded from the command menu.
  await page.setViewportSize({ width: 1400, height: 900 });
  await palette('Toggle Sidebar');
  await expect(page.getByLabel('Expand sidebar')).toBeVisible();
  await page.getByPlaceholder(/Add a task/).click();
  await page.keyboard.press('Escape');
  await palette('Toggle Sidebar');
  await expect(page.getByLabel('Collapse sidebar')).toBeVisible();

  // The arrows go straight to the sidebar.
  await expect.poll(async () => (await focused(page)).tag).toBe('DIV');
  const before = page.url();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.url()).not.toBe(before);
});

test('the sidebar keeps the keyboard row in view, and Space and ← fold a folder', async ({ page, request }) => {
  const stamp = Date.now();
  const now = new Date().toISOString();
  const folderName = `Keys folder ${stamp}`;
  const inFolder = `Keys inside ${stamp}`;
  const lists = Array.from({ length: 24 }, (_, i) => ({
    id: `keys-list-${stamp}-${i}`,
    name: `Keys list ${String(i).padStart(2, '0')} ${stamp}`,
    color: '#4A7BF7',
    folderId: null,
    order: 10 + i,
    updatedAt: now,
  }));
  const folderId = `keys-folder-${stamp}`;
  const response = await request.post('/api/v1/sync', {
    headers: { Authorization: `Bearer ${TOKEN}` },
    data: {
      folders: [{ id: folderId, name: folderName, order: 0, updatedAt: now }],
      lists: [
        { id: `keys-inside-${stamp}`, name: inFolder, color: '#4A7BF7', folderId, order: 0, updatedAt: now },
        ...lists,
      ],
    },
  });
  expect(response.ok()).toBe(true);

  await page.setViewportSize({ width: 1400, height: 600 });
  await connect(page);
  const last = page.getByLabel(lists[lists.length - 1].name, { exact: true });
  await expect(last).toBeAttached();
  await expect(last).not.toBeInViewport();

  /** Arrows through the sidebar until the view shown is `id`'s. Other tests' lists may be in the tree too. */
  const arrowTo = async (key: 'ArrowDown' | 'ArrowUp', id: string) => {
    for (let i = 0; i < 200 && !page.url().includes(id); i++) {
      const before = page.url();
      await page.keyboard.press(key);
      await expect.poll(() => page.url()).not.toBe(before);
    }
    expect(page.url()).toContain(id);
  };

  // ← from the list goes to the sidebar; ↓ to the last list scrolls it into view.
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await focused(page)).tag).toBe('DIV');
  await arrowTo('ArrowDown', lists[lists.length - 1].id);
  await expect(last).toBeInViewport();

  // Back up to the list inside the folder: ← folds the folder and moves up to it.
  await arrowTo('ArrowUp', `keys-inside-${stamp}`);
  const inside = page.getByLabel(inFolder, { exact: true });
  await expect(inside).toBeInViewport();
  await page.keyboard.press('ArrowLeft');
  await expect(inside).toHaveCount(0);
  await expect.poll(() => page.url()).toContain(folderId);

  // Space opens the folder again, and folds it.
  await page.keyboard.press(' ');
  await expect(inside).toBeVisible();
  await page.keyboard.press(' ');
  await expect(inside).toHaveCount(0);
});

test('the list keeps the cursor row in view', async ({ page, request }) => {
  const stamp = Date.now();
  const now = new Date().toISOString();
  const list = { id: `keys-rows-${stamp}`, name: `Keys rows ${stamp}`, color: '#4A7BF7', folderId: null, order: -1, updatedAt: now };
  const response = await request.post('/api/v1/sync', {
    headers: { Authorization: `Bearer ${TOKEN}` },
    data: { lists: [list] },
  });
  expect(response.ok()).toBe(true);

  await page.setViewportSize({ width: 1400, height: 600 });
  await connect(page);
  await page.getByLabel(list.name, { exact: true }).click();
  await expect.poll(() => page.url()).toContain(list.id);
  // Loaded afresh, so the view behind it, with its own copy of each row, isn't mounted.
  await page.goto(page.url());

  const titles = Array.from({ length: 30 }, (_, i) => `Row ${String(i).padStart(2, '0')} ${stamp}`);
  const quickAdd = page.getByPlaceholder(`Add a task to ${list.name}`);
  await quickAdd.click();
  for (const title of titles) {
    await quickAdd.fill(title);
    await quickAdd.press('Enter');
  }
  await expect(page.getByText(titles[29], { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(async () => typingIn(await focused(page))).toBe(false);

  // Newest first, so ↓ walks from the last added towards the first.
  const first = page.getByText(titles[0], { exact: true });
  await expect(first).not.toBeInViewport();
  for (let i = 0; i < titles.length; i++) await page.keyboard.press('ArrowDown');
  await expect(first).toBeInViewport();

  // And ↑ brings the top back.
  for (let i = 0; i < titles.length; i++) await page.keyboard.press('ArrowUp');
  await expect(page.getByText(titles[29], { exact: true })).toBeInViewport();

  // ⌃E scrolls a row at a time, and the cursor comes along once it would leave
  // the screen; ⌃Y scrolls back.
  const top = page.getByText(titles[29], { exact: true });
  for (let i = 0; i < 15; i++) await page.keyboard.press('Control+e');
  await expect(top).not.toBeInViewport();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await focused(page)).tag).toBe('INPUT');
  const cursor = (await focused(page)).value;
  expect(cursor).not.toBe(titles[29]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByText(cursor!, { exact: true }).first()).toBeInViewport();
  for (let i = 0; i < 15; i++) await page.keyboard.press('Control+y');
  await expect(top).toBeInViewport();
});

test('a task added off screen is scrolled to, becomes the cursor and opens beside the list', async ({ page, request }) => {
  const stamp = Date.now();
  const now = new Date().toISOString();
  const list = { id: `keys-added-${stamp}`, name: `Keys added ${stamp}`, color: '#4A7BF7', folderId: null, order: -1, updatedAt: now };
  // Ordered ahead of anything the add field makes, so the new task lands below them all.
  const tasks = Array.from({ length: 30 }, (_, i) => ({
    id: `keys-added-task-${stamp}-${i}`,
    title: `Seeded ${String(i).padStart(2, '0')} ${stamp}`,
    notes: '',
    priority: 'none',
    reminders: [],
    listId: list.id,
    tags: [],
    subtasks: [],
    completed: false,
    createdAt: now,
    updatedAt: now,
    order: -1e15 + i,
  }));
  const response = await request.post('/api/v1/sync', {
    headers: { Authorization: `Bearer ${TOKEN}` },
    data: { lists: [list], tasks },
  });
  expect(response.ok()).toBe(true);

  await page.setViewportSize({ width: 1400, height: 600 });
  await connect(page);
  await page.getByLabel(list.name, { exact: true }).click();
  await expect.poll(() => page.url()).toContain(list.id);
  await page.goto(page.url());
  await expect(page.getByText(tasks[29].title, { exact: true })).toBeAttached();

  const title = `Added last ${stamp}`;
  const quickAdd = page.getByPlaceholder(`Add a task to ${list.name}`);
  await quickAdd.click();
  await quickAdd.fill(title);
  await quickAdd.press('Enter');
  await expect(page.getByText(title, { exact: true })).toBeInViewport();
  // It opens beside the list, and the add field keeps the keyboard for the next one.
  await expect(page.locator(`input[value="${title}"]`)).toBeVisible();
  await expect(quickAdd).toBeFocused();

  // The list takes the keyboard on the new task, so Return edits it.
  await page.keyboard.press('Escape');
  await expect.poll(async () => typingIn(await focused(page))).toBe(false);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await focused(page)).value).toBe(title);
});

test('Browse opens blank after leaving it on a saved filter', async ({ page, request }) => {
  const stamp = Date.now();
  const query = `keysfilter${stamp}`;
  const filterId = `sf-keys-${stamp}`;
  const now = new Date().toISOString();
  const response = await request.post('/api/v1/sync', {
    headers: { Authorization: `Bearer ${TOKEN}` },
    data: {
      savedFilters: [
        {
          id: filterId,
          name: `Keys filter ${stamp}`,
          criteria: { query, listIds: [], folderIds: [], tags: [], due: [], status: 'active' },
          order: 0,
          updatedAt: now,
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);

  await connect(page);
  const search = page.getByPlaceholder('Search tasks and tags');
  await page.getByLabel(`Saved filter Keys filter ${stamp}`, { exact: true }).click();
  await expect(search).toHaveValue(query);

  await page.getByLabel('Inbox', { exact: true }).click();
  await page.getByLabel('Browse', { exact: true }).click();
  await expect(search).toHaveValue('');
  expect(page.url()).not.toContain(filterId);

  // A question that isn't saved is still there when you come back.
  await search.fill('unsaved question');
  await page.getByLabel('Inbox', { exact: true }).click();
  await page.getByLabel('Browse', { exact: true }).click();
  await expect(search).toHaveValue('unsaved question');
});

test('New Task from the command menu puts the keyboard in the add field', async ({ page }) => {
  await connect(page);
  await page.keyboard.press('ControlOrMeta+k');
  const search = page.getByPlaceholder('Go to or do…');
  await expect(search).toBeFocused();
  const top = (await search.boundingBox())?.y;
  await search.fill('New Task');
  await expect.poll(async () => (await search.boundingBox())?.y).toBe(top);
  await page.keyboard.press('Enter');
  await expect(search).toBeHidden();
  await expect(page.getByPlaceholder(/Add a task/)).toBeFocused();
});

test('⌘O, ⌘K and ⌘/ cycle through one menu, over and over, and leave the window working', async ({ page }) => {
  await connect(page);
  const menus = [
    { key: 'ControlOrMeta+o', title: 'Go to Task', placeholder: 'Find a task by name…' },
    { key: 'ControlOrMeta+k', title: 'Command Menu', placeholder: 'Go to or do…' },
    { key: 'ControlOrMeta+/', title: 'Keyboard Shortcuts', placeholder: 'Search shortcuts…' },
  ];
  const dialogs = page.locator('[aria-modal="true"]');
  for (let round = 0; round < 3; round++) {
    for (const menu of menus) {
      await page.keyboard.press(menu.key);
      await expect(page.getByRole('heading', { name: menu.title, exact: true })).toBeVisible();
      await expect(page.getByPlaceholder(menu.placeholder)).toBeFocused();
      // Typed into straight away, as each one is for.
      await page.keyboard.type('a');
      await expect(page.getByPlaceholder(menu.placeholder)).toHaveValue('a');
      await expect(dialogs).toHaveCount(1);
    }
  }
  // Each key still answers once the menu has closed, and the window under it does too.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialogs).toHaveCount(0);
  for (const menu of menus) {
    await page.keyboard.press(menu.key);
    await expect(page.getByPlaceholder(menu.placeholder)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialogs).toHaveCount(0);
  }
  const add = page.getByPlaceholder(/Add a task/);
  await add.click();
  await expect(add).toBeFocused();
});

test('a pointer resting where the menu opens leaves the first row selected', async ({ page }) => {
  await connect(page);
  const rows = page.locator('[aria-modal="true"] [tabindex="0"]').filter({ hasText: /\w/ });
  const selected = () =>
    rows.evaluateAll((els) => els.findIndex((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'));
  await page.keyboard.press('ControlOrMeta+k');
  const second = (await rows.nth(1).boundingBox())!;
  await page.keyboard.press('Escape');

  // The pointer waits over where the second row will be, then the key is
  // pressed, held and let go.
  const x = second.x + 40;
  const y = second.y + second.height / 2;
  await page.mouse.move(x, y);
  await page.keyboard.down('ControlOrMeta');
  await page.keyboard.press('k');
  await expect(page.getByPlaceholder('Go to or do…')).toBeFocused();
  await page.waitForTimeout(400);
  await page.keyboard.up('ControlOrMeta');
  await page.waitForTimeout(200);
  expect(await selected()).toBe(0);

  // Moving it is a choice.
  await page.mouse.move(x + 10, y + 2);
  await expect.poll(selected).toBe(1);
});

test('⌘O finds a task that isn\'t done by its title and opens it in its list', async ({ page, request }) => {
  const stamp = Date.now();
  const auth = { Authorization: `Bearer ${TOKEN}` };
  const listId = `goto-list-${stamp}`;
  const now = new Date().toISOString();
  const synced = await request.post('/api/v1/sync', {
    headers: auth,
    data: { lists: [{ id: listId, name: `Go to list ${stamp}`, color: '#4A7BF7', folderId: null, order: 0, updatedAt: now }] },
  });
  expect(synced.ok()).toBe(true);
  const create = async (title: string, notes?: string) => {
    const created = await request.post('/api/v1/tasks', { headers: auth, data: { title, listId, notes } });
    expect(created.ok()).toBe(true);
    return (await created.json()).task as { id: string };
  };
  const wanted = `Goto open ${stamp}`;
  await create(wanted);
  const done = await create(`Goto done ${stamp}`);
  expect((await request.post(`/api/v1/tasks/${done.id}/complete`, { headers: auth, data: {} })).ok()).toBe(true);
  // Found by its notes only, which the search doesn't read.
  await create(`Unrelated ${stamp}`, `goto ${stamp}`);

  await connect(page);
  await page.getByPlaceholder(/Add a task/).click();
  await page.keyboard.press('ControlOrMeta+o');
  const search = page.getByPlaceholder('Find a task by name…');
  await expect(search).toBeFocused();
  const top = (await search.boundingBox())?.y;
  await search.fill(`goto ${stamp}`);
  const menu = page.locator('[aria-modal="true"]');
  await expect(menu.getByText(wanted, { exact: true })).toBeVisible();
  await expect(menu.getByText(`Goto done ${stamp}`, { exact: true })).toHaveCount(0);
  await expect(menu.getByText(`Unrelated ${stamp}`, { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await search.boundingBox())?.y).toBe(top);

  await page.keyboard.press('Enter');
  await expect(search).toBeHidden();
  await expect.poll(() => page.url()).toContain(listId);
  await expect(page.locator(`input[value="${wanted}"]`)).toHaveCount(1);
  // The keyboard is on the list, with the cursor on the task: Return edits its title.
  await expect.poll(async () => typingIn(await focused(page))).toBe(false);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await focused(page)).value).toBe(wanted);
});

test('a task added to another list says where it went, and View goes there', async ({ page, request }) => {
  const stamp = Date.now();
  const now = new Date().toISOString();
  const list = { id: `keys-elsewhere-${stamp}`, name: `Elsewhere${stamp}`, color: '#4A7BF7', folderId: null, order: -1, updatedAt: now };
  const response = await request.post('/api/v1/sync', {
    headers: { Authorization: `Bearer ${TOKEN}` },
    data: { lists: [list] },
  });
  expect(response.ok()).toBe(true);

  await connect(page);
  await page.getByLabel('Inbox', { exact: true }).click();
  await expect.poll(() => page.url()).toContain('inbox');
  // Loaded afresh, so the view behind it, with its own add field, isn't mounted.
  await page.goto(page.url());
  const title = `Sent away ${stamp}`;
  const quickAdd = page.getByPlaceholder(/Add a task/);
  await quickAdd.click();
  await quickAdd.fill(`${title} ~${list.name}`);
  await quickAdd.press('Enter');

  // The Inbox doesn't show a task with a list, so there is no row to go to.
  await expect(page.getByText(`Added to ${list.name}`, { exact: true })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);

  await page.getByText('View', { exact: true }).click();
  await expect.poll(() => page.url()).toContain(list.id);
  await expect(page.locator(`input[value="${title}"]`)).toHaveCount(1);
  await expect(page.getByText(`Added to ${list.name}`, { exact: true })).toBeHidden();
});

test('vim keys move through the list and its groups, and fold them', async ({ page, request }) => {
  const stamp = Date.now();
  const now = new Date().toISOString();
  const list = { id: `keys-vim-${stamp}`, name: `Keys vim ${stamp}`, color: '#4A7BF7', folderId: null, order: -1, updatedAt: now };
  const response = await request.post('/api/v1/sync', {
    headers: { Authorization: `Bearer ${TOKEN}` },
    data: { lists: [list] },
  });
  expect(response.ok()).toBe(true);

  await connect(page);
  await page.getByLabel(list.name, { exact: true }).click();
  await expect.poll(() => page.url()).toContain(list.id);
  await page.goto(page.url());

  const today = [`Vim a ${stamp}`, `Vim b ${stamp}`];
  const tomorrow = `Vim c ${stamp}`;
  const quickAdd = page.getByPlaceholder(`Add a task to ${list.name}`);
  await quickAdd.click();
  for (const entry of [`${today[0]} today`, `${today[1]} today`, `${tomorrow} tomorrow`]) {
    await quickAdd.fill(entry);
    await quickAdd.press('Enter');
  }
  await expect(page.getByText(tomorrow, { exact: true })).toBeVisible();

  // A j typed in the add field is a j.
  await quickAdd.fill('');
  await quickAdd.press('j');
  await expect(quickAdd).toHaveValue('j');
  await quickAdd.fill('');

  await page.keyboard.press('ControlOrMeta+k');
  const search = page.getByPlaceholder('Go to or do…');
  await search.fill('Group By: Date');
  await page.keyboard.press('Enter');
  await expect(search).toBeHidden();
  await quickAdd.click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => typingIn(await focused(page))).toBe(false);

  /** The cursor's task, read from its title in the pane: Return, then Escape back to the list. */
  const cursorTitle = async () => {
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await focused(page)).tag).toBe('INPUT');
    const title = (await focused(page)).value;
    await page.keyboard.press('Escape');
    await expect.poll(async () => typingIn(await focused(page))).toBe(false);
    return title;
  };

  await page.keyboard.press('g');
  await page.keyboard.press('g');
  const first = await cursorTitle();
  expect(today).toContain(first);
  await page.keyboard.press('j');
  expect(await cursorTitle()).toBe(today.find((t) => t !== first));
  await page.keyboard.press('k');
  expect(await cursorTitle()).toBe(first);

  // } into the next group; { from a group's start back to the one before.
  await page.keyboard.press('}');
  expect(await cursorTitle()).toBe(tomorrow);
  await page.keyboard.press('{');
  expect(await cursorTitle()).toBe(first);
  await page.keyboard.press('Shift+G');
  expect(await cursorTitle()).toBe(tomorrow);

  // zc folds the cursor's group, and zo opens it again from its header.
  await page.keyboard.press('z');
  await page.keyboard.press('c');
  await expect(page.getByText(tomorrow, { exact: true })).toBeHidden();
  await page.keyboard.press('z');
  await page.keyboard.press('o');
  await expect(page.getByText(tomorrow, { exact: true })).toBeVisible();
  expect(await cursorTitle()).toBe(tomorrow);

  // Return on a folded header opens it too.
  await page.keyboard.press('z');
  await page.keyboard.press('c');
  await expect(page.getByText(tomorrow, { exact: true })).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page.getByText(tomorrow, { exact: true })).toBeVisible();
  expect(typingIn(await focused(page))).toBe(false);

  // zM folds every group, j and k move between their headers, and zR opens them all.
  await page.keyboard.press('z');
  await page.keyboard.press('Shift+M');
  await expect(page.getByText(today[0], { exact: true })).toBeHidden();
  await expect(page.getByText(tomorrow, { exact: true })).toBeHidden();
  await page.keyboard.press('k');
  await page.keyboard.press('z');
  await page.keyboard.press('a');
  await expect(page.getByText(today[0], { exact: true })).toBeVisible();
  await expect(page.getByText(tomorrow, { exact: true })).toBeHidden();
  await page.keyboard.press('z');
  await page.keyboard.press('Shift+R');
  await expect(page.getByText(tomorrow, { exact: true })).toBeVisible();

  // \ hides and shows the sidebar, and i goes to the add field, typing nothing.
  await page.keyboard.press('\\');
  await expect(page.getByLabel('Expand sidebar')).toBeVisible();
  await page.keyboard.press('\\');
  await expect(page.getByLabel('Collapse sidebar')).toBeVisible();
  await quickAdd.click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('i');
  await expect(quickAdd).toBeFocused();
  await expect(quickAdd).toHaveValue('');
});
