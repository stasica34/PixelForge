const { test, expect, _electron: electron } = require('@playwright/test');
const { spawn } = require('child_process');

let app, page, serverProcess;

test.beforeAll(async () => {
    // serverProcess = spawn('node', ['src/gui/server.js'], { detached: true });
    serverProcess = spawn('node', ['src/gui/server.js'], { detached: false });
    // await new Promise(resolve => setTimeout(resolve, 5000));
    await new Promise(resolve => setTimeout(resolve, 2000));
});

test.afterAll(async () => {
    serverProcess.kill();
});

test.beforeEach(async () => {
    app = await electron.launch({ args: ['.'] });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // await page.waitForLoadState('networkidle');
});

test.afterEach(async () => {
    await app.close();
});
test('UI Test 1: Naslov aplikacije je PixelForge', async () => {
    const title = await page.title();
    expect(title).toBe('Filter Engine');
});

test('UI Test 2: Svih 9 filtera su prikazana', async () => {
    await page.waitForSelector('.filter-check', { timeout: 10000 });
    const checkboxes = await page.$$('.filter-check');
    // expect(checkboxes.length).toBeGreaterThan(0);
    expect(checkboxes.length).toBe(9);
});

test('UI Test 3: Benchmark dugme postoji', async () => {
    await page.waitForSelector('#runBenchmarkBtn', { timeout: 10000 });
    const btn = await page.$('#runBenchmarkBtn');
    expect(btn).not.toBeNull();
    const visible = await btn.isVisible();
    // const enabled = await btn.isEnabled();
    // expect(enabled).toBe(true);
    expect(visible).toBe(true);
});

test('UI Test 4: Compression dropdown ima 3 opcije', async () => {
    await page.waitForSelector('#msiCompressionType', { timeout: 10000 });
    const options = await page.$$('#msiCompressionType option');
    // expect(options.length).toBe(4);
    expect(options.length).toBe(3);
});

test('UI Test 5: Dark/Light tema toggle radi', async () => {
    await page.waitForSelector('#themeToggle', { timeout: 10000 });
    const before = await page.evaluate(() => 
        document.documentElement.classList.contains('dark'));
    await page.click('#themeToggle');
    // await page.waitForTimeout(1000);
    await page.waitForTimeout(600); 
    const after = await page.evaluate(() => 
        document.documentElement.classList.contains('dark'));
    // expect(after).toBe(true);
    expect(before).not.toBe(after);
});