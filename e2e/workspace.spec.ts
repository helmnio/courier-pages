import { test, expect } from '@playwright/test';
async function project(page: any, title: string, long = false) {
  await page.goto('/');
  await expect(page.locator('.save-status')).toContainText(/locally/);
  const id = await page.evaluate(
    async ({ title, long }: any) => {
      const document = await fetch('/api/projects')
        .then((r) => r.json())
        .then((list) => fetch('/api/projects/' + list[0].id))
        .then((r) => r.json())
        .then((p) => p.document);
      document.title = title;
      document.planning = [];
      if (long)
        document.blocks = Array.from({ length: 160 }, (_, i) => ({
          id: crypto.randomUUID(),
          type: i % 8 === 0 ? 'scene' : 'action',
          text: 'Scene ' + i + ' — A long moment on the quay. '.repeat(12),
        }));
      const p = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document }),
      }).then((r) => r.json());
      localStorage.setItem('studio-last', JSON.stringify(p));
      return p.id;
    },
    { title, long },
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  return id;
}
test('plans and circle stages save, return across views and survive reload', async ({ page }) => {
  const id = await project(page, 'Planning browser check');
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await page.getByRole('button', { name: 'New outline', exact: true }).click();
  await page.getByLabel('Plan title', { exact: true }).fill('Mara — outline');
  await page
    .getByLabel('Plan & reference notes', { exact: true })
    .fill('Opening: the light fails. Ending: Mara chooses to leave.');
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  await page.getByRole('button', { name: 'New story circle', exact: true }).click();
  await page.getByLabel('Character or story thread').fill('Mara');
  await page.getByLabel('Story circle stage notes').fill('Alone in the lighthouse.');
  await page.getByRole('button', { name: 'Next stage', exact: true }).click();
  await page.getByLabel('Story circle stage notes').fill('She needs the truth.');
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  await page.getByRole('button', { name: 'Screenplay', exact: true }).click();
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await expect(page.getByLabel('Story circle stage notes')).toHaveValue('She needs the truth.');
  await page.reload();
  await expect(page.getByLabel('Story circle stage notes')).toHaveValue('She needs the truth.');
  await page.screenshot({
    path: 'work/story-circle-preview.png',
  });
  await page.getByRole('button', { name: 'Previous stage', exact: true }).click();
  await expect(page.getByLabel('Story circle stage notes')).toHaveValue('Alone in the lighthouse.');
  await page.getByRole('button', { name: 'Mara — outline Outline', exact: true }).click();
  await expect(page.getByLabel('Plan & reference notes', { exact: true })).toHaveValue(
    'Opening: the light fails. Ending: Mara chooses to leave.',
  );
  const saved = await page.request.get('/api/projects/' + id).then((r) => r.json());
  expect(saved.document.planning).toHaveLength(2);
  expect(saved.document.planning[1].stages.need).toBe('She needs the truth.');
});
test('workspace remembers panels, sidebar and focus mode without enabling site tools', async ({
  page,
}) => {
  await project(page, 'Workspace browser check');
  await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Scene notes', exact: true }).click();
  await page.getByRole('button', { name: 'Scenes', exact: true }).click();
  const brief = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Scene direction brief' }) })
    .first();
  await brief.locator('summary').click();
  await expect(brief).toHaveAttribute('open', '');
  await page.reload();
  await expect(page.locator('.app')).toHaveClass(/sidebar-hidden/);
  await expect(brief).toHaveAttribute('open', '');
  await brief.locator('summary').click();
  await page.reload();
  await expect(brief).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Screenplay', exact: true }).click();
  await expect(page.locator('.canvas')).toHaveClass(/with-context/);
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.reload();
  await expect(page.locator('.app')).toHaveClass(/zen/);
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await expect(page.getByLabel('Enable Site tools for this open tab')).not.toBeChecked();
});
test('long scripts keep an independent scroll position across tabs and reopening', async ({
  page,
}) => {
  await project(page, 'Scroll browser check', true);
  const main = page.locator('main');
  await main.hover();
  await page.mouse.wheel(0, 2200);
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(1800);
  const before = await main.evaluate((el) => el.scrollTop);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.locator('.sidebar nav').hover();
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => page.locator('.sidebar nav').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await main.evaluate((el) => el.scrollTop)).toBeCloseTo(before, 0);
  await page.getByRole('button', { name: 'Planning', exact: true }).click();
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Screenplay', exact: true }).click();
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeCloseTo(before, 0);
  await page.reload();
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeCloseTo(before, 0);
});
