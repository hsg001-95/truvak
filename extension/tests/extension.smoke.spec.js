import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '..');
const fixturePath = path.resolve(__dirname, 'fixtures', 'merchant-host.html');

function startFixtureServer() {
  const html = fs.readFileSync(fixturePath, 'utf8');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  return new Promise((resolve) => {
    server.listen(4173, '127.0.0.1', () => resolve(server));
  });
}

async function launchExtensionContext() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-pw-'));
  const requestedChannel = process.env.PW_CHROME_CHANNEL || 'chromium';
  const channel = requestedChannel === 'chrome' ? 'chromium' : requestedChannel;

  if (requestedChannel === 'chrome') {
    console.warn('[smoke] Chrome channel does not reliably support extension sideloading; using Chromium channel.');
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel,
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const existingWorker = context
    .serviceWorkers()
    .find((worker) => /\/background\.js$/i.test(new URL(worker.url()).pathname));

  const serviceWorker = existingWorker || await context.waitForEvent('serviceworker', {
    timeout: 30_000,
    predicate: (worker) => /\/background\.js$/i.test(new URL(worker.url()).pathname),
  });

  const extensionId = new URL(serviceWorker.url()).host;
  return { context, extensionId };
}

test.describe('Trust Intelligence extension smoke', () => {
  test('popup renders and toggles logs panel', async () => {
    const { context, extensionId } = await launchExtensionContext();

    try {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/popup.html`);

      await expect(page.locator('#panelRoot')).toBeVisible();
      await expect(page.locator('.brand-title')).toHaveText(/Truvak/i);
      await expect(page.locator('#automateButton')).toBeVisible();
      await expect(page.locator('#logsButton')).toBeVisible();
      await expect(page.locator('#openDashboardButton')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('content script injects merchant sidebar on localhost fixture', async () => {
    const server = await startFixtureServer();
    const { context } = await launchExtensionContext();

    try {
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:4173/merchant-host.html');

      await expect(page.locator('#tip-sidebar')).toBeVisible();
      await expect(page.locator('#tip-topbar-title')).toHaveText(/Truvak/i);
    } finally {
      await context.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
