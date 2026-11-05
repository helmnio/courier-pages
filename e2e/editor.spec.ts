import { openTab, END_OF_SCRIPT, START_OF_LINE } from './helpers';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
test('structured typing, splitting, merging, undo, autosave and recovery', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The Last Light', exact: true })).toBeVisible();
  const editor = page.getByRole('textbox', { name: 'Screenplay editor' });
  await editor.click();
  await editor.press(END_OF_SCRIPT);
  await editor.press('Enter');
  await editor.pressSequentially('A new beat.');
  await expect(editor).toContainText('A new beat.');
  const count = await editor.locator('p').count();
  await editor.press('Enter');
  await editor.pressSequentially('A second beat.');
  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('A second beat.');
  await editor.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText('A second beat.');
  await editor.press(START_OF_LINE);
  await editor.press('Backspace');
  await expect(editor.locator('p')).toHaveCount(count);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  await page.reload();
  await expect(editor).toContainText('A new beat.');
  await expect(editor).toContainText('A second beat.');
});
test('character cues enter dialogue and Tab changes explicit element type', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Screenplay editor' });
  await editor.click();
  await editor.press(END_OF_SCRIPT);
  await editor.press('Enter');
  await editor.press('ControlOrMeta+Alt+3');
  await editor.pressSequentially('TEST WRITER');
  await expect(editor.locator('p').filter({ hasText: 'TEST WRITER' })).toHaveAttribute(
    'data-kind',
    'character',
  );
  await editor.press('Enter');
  await editor.pressSequentially('We are testing the keyboard.');
  await expect(
    editor.locator('p').filter({ hasText: 'We are testing the keyboard.' }),
  ).toHaveAttribute('data-kind', 'dialogue');
  await editor.press('Tab');
  await expect(
    editor.locator('p').filter({ hasText: 'We are testing the keyboard.' }),
  ).toHaveAttribute('data-kind', 'parenthetical');
});
test('scene reordering retains stable IDs and scene notes', async ({ page }) => {
  await page.goto('/');
  await openTab(page, 'Scenes');
  const cards = page.locator('.scene-card');
  const before = await cards.first().getByLabel('Scene heading', { exact: true }).inputValue();
  await cards.first().getByLabel('Synopsis & notes').fill('A scene-specific note.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await cards.first().getByRole('button', { name: 'Move scene down', exact: true }).click();
  await expect(cards.nth(1).getByLabel('Scene heading', { exact: true })).toHaveValue(before);
  await expect(cards.nth(1).getByLabel('Synopsis & notes')).toHaveValue('A scene-specific note.');
});
test('real proposal review, edited proposal, rejection and history restoration', async ({
  page,
}) => {
  await page.goto('/');
  await openTab(page, 'Revisions');
  await page.getByRole('button', { name: 'Try a sample proposal' }).click();
  await expect(page.getByText('pending · WRITTEN AGAINST DRAFT', { exact: false })).toBeVisible();
  await expect(page.locator('.proposal ins')).toContainText('Sample suggestion');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('accepted · WRITTEN AGAINST DRAFT', { exact: false })).toBeVisible();
  await openTab(page, 'History');
  await expect(page.getByRole('button', { name: 'Restore to editor' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Restore to editor' }).last().click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  await openTab(page, 'Screenplay');
  await expect(page.getByRole('textbox', { name: 'Screenplay editor' })).not.toContainText(
    'A new beat.',
  );
});
test('browser tools fail gracefully when unavailable and exports download', async ({ page }) => {
  await page.goto('/');
  await openTab(page, 'Connections');
  await expect(page.getByText('WebMCP registry unavailable in this browser.')).toBeVisible();
  await page.getByLabel('Enable Site tools in this browser (remembered)').check();
  await openTab(page, 'Screenplay');
  await expect(page.getByRole('textbox', { name: 'Screenplay editor' })).toBeVisible();
  for (const format of ['fdx', 'fountain', 'pdf', 'backup']) {
    const downloadPromise = page.waitForEvent('download');
    await page.getByLabel('Export screenplay').selectOption(format);
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(
      format === 'backup' ? '.studio.json' : '.' + format,
    );
  }
});
test('unsaved text survives a competing save in a second tab', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/');
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PUT') await gate;
    await route.continue();
  });
  const editor = page.getByRole('textbox', { name: 'Screenplay editor' });
  await editor.click();
  await editor.press(END_OF_SCRIPT);
  await editor.pressSequentially(' Local change kept.');
  const second = other.getByRole('textbox', { name: 'Screenplay editor' });
  await second.click();
  await second.press(END_OF_SCRIPT);
  await second.pressSequentially(' Competing edit.');
  await other.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(other.locator('.save-status')).toContainText('Saved locally');
  release();
  await expect(editor).toContainText('Local change kept.');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/changed|version/);
});
test('recovers browser drafts after interrupted autosave', async ({ page }) => {
  await page.goto('/');
  await page.route('**/api/projects/*', async (route) =>
    route.request().method() === 'PUT' ? route.abort() : route.continue(),
  );
  const editor = page.getByRole('textbox', { name: 'Screenplay editor' });
  await editor.click();
  await editor.press(END_OF_SCRIPT);
  await editor.pressSequentially(' Recovery sentinel.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Draft stored');
  page.on('dialog', (d) => d.accept());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Recover draft', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Recover draft', exact: true }).click();
  await expect(editor).toContainText('Recovery sentinel.');
});
test('proposal edits require resubmission before acceptance', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The Last Light', exact: true })).toBeVisible();
  const list = await (await page.request.get('/api/projects')).json();
  const p = await (await page.request.get('/api/projects/' + list[0].id)).json();
  await page.request.post('/api/projects/' + p.id + '/proposals', {
    data: { baseVersion: p.version, summary: 'Editable test', document: p.document },
  });
  await page.reload();
  await openTab(page, 'Revisions');
  const proposal = page.locator('.proposal').filter({ hasText: 'Editable test' });
  await proposal.getByText('Edit proposal', { exact: true }).click();
  await proposal.getByRole('textbox', { name: /Logline/ }).fill('A human-edited proposal.');
  await expect(proposal.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await proposal.getByRole('button', { name: 'Submit edited proposal for review' }).click();
  const edited = page
    .locator('.proposal')
    .filter({ hasText: 'Human-edited:' })
    .filter({ hasText: 'pending' });
  await expect(edited).toHaveCount(1);
  await edited.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(edited).toHaveCount(0);
});
test('feature-length editor remains responsive and keeps later scenes intact', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The Last Light', exact: true })).toBeVisible();
  const all = await (await page.request.get('/api/projects')).json();
  const base = await (await page.request.get('/api/projects/' + all[0].id)).json();
  const blocks: any[] = [];
  for (let i = 0; i < 180; i++) {
    blocks.push({ id: 'scene-' + i, type: 'scene', text: 'INT. CABIN ' + i + ' - NIGHT' });
    for (let j = 0; j < 8; j++)
      blocks.push({
        id: `block-${i}-${j}`,
        type: 'action',
        text: 'A light passes through the window. The sea rises, then falls. '.repeat(3),
      });
  }
  const created = await (
    await page.request.post('/api/projects', {
      data: { document: { ...base.document, title: 'Long browser test', blocks } },
    })
  ).json();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The Last Light', exact: true })).toBeVisible();
  await page.getByLabel('Project', { exact: true }).selectOption(created.id);
  const editor = page.getByRole('textbox', { name: 'Screenplay editor' });
  await expect(editor.locator('p')).toHaveCount(blocks.length);
  await editor.locator('p').last().click();
  await editor.press(END_OF_SCRIPT);
  const start = Date.now();
  await editor.pressSequentially(' Final edit.');
  await expect(editor.locator('p').last()).toContainText('Final edit.');
  expect(Date.now() - start).toBeLessThan(3000);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved locally');
});
test('scene navigation and new-element buttons place the writing cursor correctly', async ({
  page,
}) => {
  await page.goto('/');
  const second = page.locator('.scene-link').nth(1);
  await second.click();
  await expect(page.getByLabel('Element type', { exact: true })).toHaveValue('scene');
  await page.getByLabel('Element type', { exact: true }).selectOption('shot');
  const editor = page.getByRole('textbox', { name: 'Screenplay editor' });
  await expect(editor.locator('p[data-kind="shot"]')).toContainText('INT. LIGHTHOUSE');
  await page.getByRole('button', { name: '＋ Continue your story', exact: true }).click();
  await page.keyboard.type('A cursor test.');
  await expect(editor.locator('p').last()).toContainText('A cursor test.');
});
test('complete project backup downloads and restores through the visible import flow', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The Last Light', exact: true })).toBeVisible();
  const project = page.getByLabel('Project', { exact: true });
  const before = await project.inputValue();
  const downloaded = page.waitForEvent('download');
  await page.getByLabel('Export screenplay').selectOption('backup');
  const download = await downloaded;
  const bytes = await readFile((await download.path())!);
  const backup = JSON.parse(bytes.toString());
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'roundtrip.studio.json', mimeType: 'application/json', buffer: bytes });
  await expect(project).not.toHaveValue(before);
  const restored = await project.inputValue();
  const result = await (await page.request.get('/api/projects/' + restored)).json();
  expect(result.document).toEqual(backup.project.document);
  const history = await (await page.request.get('/api/projects/' + restored + '/history')).json();
  expect(history).toHaveLength(backup.revisions.length);
});
