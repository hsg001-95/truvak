import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '..');
const mockUrl = 'http://127.0.0.1:5500/mock-amazon-seller/index.html';

async function launchExtensionContext() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-live-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const existingWorker = context
    .serviceWorkers()
    .find((worker) => /\/background\.js$/i.test(new URL(worker.url()).pathname));

  if (!existingWorker) {
    await context.waitForEvent('serviceworker', {
      timeout: 30_000,
      predicate: (worker) => /\/background\.js$/i.test(new URL(worker.url()).pathname),
    });
  }

  return context;
}

test('extension works live on mock amazon page', async () => {
  const context = await launchExtensionContext();
  const page = await context.newPage();
  const runtimeErrors = [];

  page.on('pageerror', (error) => {
    runtimeErrors.push(String(error?.message || error));
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      runtimeErrors.push(msg.text());
    }
  });

  try {
    await page.goto(mockUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tip-sidebar')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#tip-topbar-title')).toContainText('Truvak');

    const dashboardPagePromise = context.waitForEvent('page', { timeout: 10_000 });
    await page.locator('#tip-open-dashboard').click();
    const dashboardPage = await dashboardPagePromise;
    await dashboardPage.waitForLoadState('domcontentloaded');
    expect(dashboardPage.url()).toContain('127.0.0.1:5173');

    const redeclareErrors = runtimeErrors.filter((line) => /already been declared/i.test(line));
    expect(redeclareErrors, `Unexpected redeclaration errors: ${redeclareErrors.join(' | ')}`).toEqual([]);
  } finally {
    await context.close();
  }
});
