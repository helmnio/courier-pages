import { test, expect } from '@playwright/test';

test('per-element review applies only the accepted changes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The Last Light', exact: true })).toBeVisible();
  const list = await (await page.request.get('/api/projects')).json();
  const p = await (await page.request.get('/api/projects/' + list[0].id)).json();
  const lines = p.document.blocks.filter((b: any) => b.type === 'action').slice(0, 2);
  const proposed = {
    ...p.document,
    blocks: p.document.blocks.map((b: any) =>
      b.id === lines[0].id
        ? { ...b, text: b.text + ' ALPHA' }
        : b.id === lines[1].id
          ? { ...b, text: b.text + ' BETA' }
          : b,
    ),
  };
  await page.request.post('/api/projects/' + p.id + '/proposals', {
    data: { baseVersion: p.version, summary: 'Two small additions', document: proposed },
  });
  await page.reload();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page
    .getByRole('button', { name: /^✓?\s*Accept$/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Apply 1 accepted/ }).click();
  await expect(page.getByText('1 change accepted')).toBeVisible();
  const editor = page.getByRole('textbox', { name: 'Screenplay editor' });
  await expect(editor).toContainText('ALPHA');
  await expect(editor).not.toContainText('BETA');
});
