import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('passage review, replies, resolution, navigation and full backup restore', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Project', { exact: true })).toBeVisible();
  const list = await (await page.request.get('/api/projects')).json();
  const source = await (await page.request.get('/api/projects/' + list[0].id)).json();
  source.document.notes = [];
  source.document.title = 'Review notes test';
  source.document.blocks.find((b: any) => b.type === 'action').text =
    'A brass key catches the light.';
  const created = await (
    await page.request.post('/api/projects', { data: { document: source.document } })
  ).json();
  await page.getByLabel('Project', { exact: true }).selectOption(created.id);
  await expect(page.getByRole('heading', { name: 'Review notes test', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Screenplay', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Screenplay editor' });
  const action = editor.locator('p[data-kind="action"]').first();
  await action.click();
  await page.keyboard.press('Meta+ArrowLeft');
  await page.keyboard.press('Meta+Shift+ArrowRight');
  await page.getByRole('button', { name: '＋ Review note', exact: true }).click();
  await expect(page.locator('.sticky-composer blockquote')).toBeVisible();
  await page.getByLabel('Sticky note feedback').fill('Check the brass key continuity.');
  await page.getByRole('button', { name: 'Pin note', exact: true }).click();
  const sticky = page.locator('.script-sticky').first();
  await expect(sticky).toContainText('Check the brass key continuity.');
  await expect(editor.locator('.has-review-note')).toHaveCount(1);
  await expect(editor.locator('.review-passage-highlight')).toHaveCount(1);
  await page.screenshot({ path: 'work/screenplay-sticky-notes-preview.png', fullPage: true });
  await sticky.getByRole('button', { name: 'Open discussion', exact: true }).click();
  await page.getByLabel('Filter note status').selectOption('open');
  const card = page.locator('.review-note').first();
  await expect(card).toContainText('Check the brass key continuity.');
  await card.getByLabel('Reply to note').fill('Key is now visible in the previous scene.');
  await card.getByLabel('Reply author', { exact: true }).fill('Writer');
  await card.getByRole('button', { name: 'Add reply', exact: true }).click();
  await card.getByRole('button', { name: 'Edit note', exact: true }).click();
  await card.getByLabel('Edit review note').fill('Check the brass key continuity and timing.');
  await card.getByRole('button', { name: 'Done editing', exact: true }).click();
  await card.getByRole('button', { name: 'Resolve note', exact: true }).click();
  await expect(page.locator('.review-note')).toHaveCount(0);
  await page.getByLabel('Filter note status').selectOption('resolved');
  await expect(card).toContainText('Key is now visible');
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  await page.reload();
  await expect(page.getByLabel('Filter note status')).toHaveValue('resolved');
  await expect(card).toContainText('Unnamed reviewer');
  await expect(card).toContainText('and timing.');
  await card.getByRole('button', { name: 'Reopen note', exact: true }).click();
  await page.getByLabel('Filter note status').selectOption('open');
  await page.getByLabel('Search review notes').fill('previous scene');
  await expect(card).toBeVisible();
  await page.getByLabel('Search review notes').fill('no match');
  await expect(page.locator('.note-empty')).toContainText('No notes match');
  await page.getByLabel('Search review notes').fill('');
  await page.screenshot({ path: 'work/review-notes-preview.png', fullPage: true });
  await card.locator('.note-context button').click();
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  const downloaded = page.waitForEvent('download');
  await page.getByLabel('Download screenplay').selectOption('backup');
  const download = await downloaded;
  const bytes = await readFile((await download.path())!);
  const backup = JSON.parse(bytes.toString());
  expect(backup.project.document.notes[0].replies).toHaveLength(1);
  expect(backup.project.document.notes[0].quote).toBeTruthy();
  const before = await page.getByLabel('Project', { exact: true }).inputValue();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'review.studio.json', mimeType: 'application/json', buffer: bytes });
  await expect(page.getByLabel('Project', { exact: true })).not.toHaveValue(before);
  const id = await page.getByLabel('Project', { exact: true }).inputValue();
  const restored = await (await page.request.get('/api/projects/' + id)).json();
  expect(restored.document.notes).toEqual(backup.project.document.notes);
});

test('review mode pins an exact clicked word and preserves its position through writing and reload', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Project', { exact: true })).toBeVisible();
  const list = await (await page.request.get('/api/projects')).json();
  const source = await (await page.request.get('/api/projects/' + list[0].id)).json();
  source.document.title = 'Exact word review';
  source.document.notes = [];
  source.document.blocks = [
    { id: 'review-scene', type: 'scene', text: 'INT. STUDY - NIGHT' },
    {
      id: 'review-line',
      type: 'action',
      text: 'A brass key catches the light. Another key waits.',
    },
  ];
  const created = await (
    await page.request.post('/api/projects', { data: { document: source.document } })
  ).json();
  await page.getByLabel('Project', { exact: true }).selectOption(created.id);
  await expect(page.getByRole('heading', { name: 'Exact word review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Screenplay', exact: true }).click();
  await page.getByRole('button', { name: 'Review mode', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Screenplay editor' });
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  const line = editor.locator('[data-block-id="review-line"]');
  // Target the second occurrence, proving the pin isn't just a first-text-match reference.
  const point = await line.evaluate((el) => {
    const node = el.firstChild!;
    const range = document.createRange();
    range.setStart(node, 40);
    range.setEnd(node, 41);
    const rect = range.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.sticky-composer')).toBeVisible();
  await expect(page.locator('.sticky-composer blockquote')).toHaveText('key');
  await page.getByLabel('Sticky note feedback').fill('Review this second key specifically.');
  await page.getByRole('button', { name: 'Pin note', exact: true }).click();
  await expect
    .poll(async () =>
      (await editor.locator('.review-passage-highlight').allTextContents()).join(''),
    )
    .toBe('key');
  const pin = editor.getByRole('button', { name: 'Open pinned review note', exact: true });
  await expect(pin).toHaveCount(1);
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  let saved = await (await page.request.get('/api/projects/' + created.id)).json();
  expect(saved.document.blocks).toEqual(source.document.blocks);
  expect(saved.document.notes[0].anchorFrom).toBe(39);
  expect(saved.document.notes[0].anchorTo).toBe(42);
  expect(saved.document.notes[0].pinOffset).toBeGreaterThanOrEqual(39);
  await page.getByRole('button', { name: 'Exit review mode', exact: true }).click();
  await line.click();
  await page.keyboard.press('Meta+ArrowLeft');
  await page.keyboard.type('Earlier: ');
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  saved = await (await page.request.get('/api/projects/' + created.id)).json();
  expect(saved.document.notes[0].anchorFrom).toBe(48);
  await page.reload();
  await expect
    .poll(async () =>
      (await editor.locator('.review-passage-highlight').allTextContents()).join(''),
    )
    .toBe('key');
  await expect(pin).toHaveCount(1);
  await page.screenshot({ path: 'work/screenplay-exact-pin-preview.png', fullPage: true });
  await pin.click();
  await expect(page.locator('.review-note')).toContainText('second key specifically');
});
