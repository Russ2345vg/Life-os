import { expect, type Page } from '@playwright/test';

export async function openDisclosure(page: Page, selector: string) {
  const details = page.locator(selector);
  await expect(details).toBeVisible();
  if ((await details.getAttribute('open')) === null) {
    await details.locator(':scope > summary').click();
  }
  await expect(details).toHaveAttribute('open', '');
}
