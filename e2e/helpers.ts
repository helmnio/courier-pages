import type { Page } from '@playwright/test';

const alias: Record<string, string> = { Screenplay: 'Script', Planning: 'Plan' };
const more = ['Story bible', 'Characters', 'Projects', 'History', 'Connections'];

/** Opens a workspace section, going through the "More" menu when it lives there. */
export async function openTab(page: Page, name: string) {
  const label = alias[name] ?? name;
  const tabs = page.getByRole('tablist', { name: 'Sections' }).getByRole('tab');
  if (more.includes(label)) {
    await tabs.last().click();
    await page.getByRole('menuitem', { name: label }).click();
  } else {
    await tabs
      .filter({ hasText: new RegExp('^' + label) })
      .first()
      .click();
  }
}

/** Toggles an entry in the screenplay toolbar's View menu (e.g. "Focus mode"). */
export async function viewMenu(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: /^View/ }).click();
  await page.getByRole('menuitemcheckbox', { name }).click();
}
