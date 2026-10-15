/* Browser regression checks. Requires Playwright and a local HTTP server; see README. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const baseURL = process.env.NEWTAB_TEST_URL || 'http://127.0.0.1:8000';
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
let checks = 0;
function pass(name) { console.log('PASS ' + name); checks++; }
const now = Math.floor(Date.now() / 3600000) * 3600;
const weather = {
  utc_offset_seconds: 32400,
  current: { temperature_2m: 21, apparent_temperature: 20, weather_code: 0, is_day: 1 },
  hourly: {
    time: Array.from({ length: 24 }, (_, i) => now + i * 3600),
    temperature_2m: Array(24).fill(21),
    precipitation_probability: Array(24).fill(10),
    weather_code: Array(24).fill(0),
  },
  daily: {
    time: Array.from({ length: 5 }, (_, i) => now + i * 86400),
    weather_code: Array(5).fill(0),
    temperature_2m_max: Array(5).fill(23),
    temperature_2m_min: Array(5).fill(16),
    precipitation_probability_max: Array(5).fill(10),
  },
};
const subjects = ['国語', '数学', '英語', '理科', '地理', '体育', '情報'];
const timetable = { schedules: Object.fromEntries(['日曜','月曜','火曜','水曜','木曜','金曜','土曜'].map(day => [day, { '101': subjects }])) };
async function open(browser, options = {}, fail = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Tokyo', ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    if (fail) return route.abort();
    if (url.hostname === 'api.open-meteo.com') return route.fulfill({ json: weather });
    if (url.hostname.endsWith('firebaseio.com')) return route.fulfill({ json: timetable });
    if (url.hostname === 'suggestqueries.google.com') return route.fulfill({ json: ['', []] });
    return route.abort();
  });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.locator('#search-input').waitFor();
  return { context, page, errors };
}
async function noOverflow(page) {
  const result = await page.evaluate(() => {
    const main = document.querySelector('#home').getBoundingClientRect();
    const active = [...document.querySelectorAll('.page')].find(p => !p.inert);
    const boxes = [...active.querySelectorAll('.item')].map(n => ({ key: n.dataset.key, r: n.getBoundingClientRect() }));
    return {
      wide: document.documentElement.scrollWidth > innerWidth,
      outside: boxes.filter(({ r }) => r.left < -1 || r.right > innerWidth + 1).map(x => x.key),
      overlap: boxes.some((a, i) => boxes.slice(i + 1).some(b => a.r.left < b.r.right - 1 && a.r.right > b.r.left + 1 && a.r.top < b.r.bottom - 1 && a.r.bottom > b.r.top + 1)),
      footerCollision: main.bottom > document.querySelector('.home-footer').getBoundingClientRect().top + 1,
    };
  });
  assert.deepEqual(result, { wide: false, outside: [], overlap: false, footerCollision: false });
}
(async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const { page, context, errors } = await open(browser);
    await page.locator('.temperature').waitFor();
    assert.equal(await page.locator('.lessons .lesson').count(), 7);
    await noOverflow(page);
    pass('Desktop: weather and seven lessons render from fixture responses without overlapping cards');

    await page.keyboard.press('/');
    assert.equal(await page.locator('#search-input').evaluate(n => n === document.activeElement), true);
    await page.locator('#search-input').fill('Google');
    await page.locator('#suggestions button').first().waitFor();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#suggestions [aria-selected=true]').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#suggestions').isVisible(), false);
    pass('Search: slash focus, local suggestions, arrow selection and Escape');

    await page.locator('.weather-open').click();
    assert.equal(await page.locator('#sheet[open] .day-forecast').count(), 5);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+,');
    assert.equal(await page.locator('#sheet[open] #sheet-title').textContent(), '壁紙と外観');
    await page.locator('#settings-nav button[data-section=clock]').click();
    assert.equal(await page.getByRole('radio', { name: 'デジタル', exact: true }).getAttribute('aria-checked'), 'true');
    await page.locator('#settings-nav button[data-section=appearance]').click();
    assert.equal(await page.locator('#sheet-title').textContent(), '壁紙と外観');
    await page.keyboard.press('Escape');
    pass('Dialogs: five-day forecast, settings shortcut, nested settings and dismissal');

    await page.locator('#dock .dock-action').first().click();
    await page.locator('.form-stack input[type=text]').fill('Design reference');
    await page.locator('.form-stack input[type=url]').fill('https://example.com/design');
    await page.locator('.form-stack button[type=submit]').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('.shortcut a[aria-label="Design reference"]').count(), 1);
    pass('Shortcut creation survives reload');

    await page.locator('#edit').click();
    assert.equal(await page.locator('#edit').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-key=clock] .configure').click();
    await page.getByRole('spinbutton', { name: '高さ', exact: true }).fill('2');
    await page.getByRole('button', { name: '配置を変更', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('newtab.original.v4')).pages[0].items.find(i => i.id === 'clock').h), 2);
    await page.locator('#undo').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('newtab.original.v4')).pages[0].items.find(i => i.id === 'clock').h), 3);
    await page.locator('#edit').click();
    pass('Edit: keyboard layout change and undo preserve saved layout');

    await page.locator('#page-nav button').nth(1).click();
    assert.equal(await page.locator('.page:not([inert]) .empty-page').count(), 1);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('.page:not([inert]) #search-input').count(), 1);
    pass('Page navigation works by control and keyboard');

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.appearance === 'dark');
    assert.equal(await page.locator('html').getAttribute('data-appearance'), 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.appearance === 'light');
    assert.equal(await page.locator('html').getAttribute('data-appearance'), 'light');
    await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
    assert.equal(await page.locator('#pages').evaluate(n => getComputedStyle(n).transitionDuration), '0s');
    assert.equal(await page.locator('#dock').evaluate(n => getComputedStyle(n).backdropFilter), 'none');
    pass('System appearance updates live; reduced motion and increased contrast remove effects');
    assert.deepEqual(errors, []);
    await context.close();

    for (const width of [320, 390, 768, 1024]) {
      const run = await open(browser, { viewport: { width, height: 844 }, colorScheme: 'dark' });
      await run.page.locator('.temperature').waitFor();
      await noOverflow(run.page);
      if (width < 760) {
        const search = await run.page.locator('#search-input').boundingBox();
        assert(search.y < 300, 'Search must be reachable without scrolling on compact screens');
        await run.page.locator('.weather-open').scrollIntoViewIfNeeded();
        await run.page.locator('.weather-open').click();
        assert.equal(await run.page.locator('#sheet[open] .day-forecast').count(), 5);
        await run.page.keyboard.press('Escape');
      }
      await run.page.locator('#settings').click();
      await run.page.locator('#sheet[open]').waitFor();
      assert.equal(await run.page.locator('#sheet').evaluate(n => n.scrollWidth <= n.clientWidth + 1), true);
      assert.deepEqual(run.errors, []);
      await run.context.close();
    }
    pass('320, 390, 768 and 1024px: no horizontal overflow or card overlap; settings and forecast accessible');

    for (const width of [320, 1440]) {
      const large = await open(browser, { viewport: { width, height: 1000 } });
      await large.page.locator('.temperature').waitFor();
      await large.page.addStyleTag({ content: 'html { font-size: 200%; }' });
      await large.page.setViewportSize({ width, height: 999 });
      await large.page.waitForFunction(() => parseFloat(document.documentElement.style.getPropertyValue('--row')) > 120);
      await noOverflow(large.page);
      assert.deepEqual(await large.page.locator('.widget-content').evaluateAll(nodes => nodes.filter(n => n.scrollHeight > n.clientHeight + 2).map(n => n.dataset.widget)), []);
      await large.page.locator('#settings').click();
      assert.equal(await large.page.locator('#sheet').evaluate(n => n.scrollWidth <= n.clientWidth + 1), true);
      await large.context.close();
    }
    pass('200% text at 320 and 1440px: cards grow without clipping and settings remain reachable');

    const settings = await open(browser);
    const sp = settings.page;
    await sp.locator('#settings').click();
    await sp.locator('#settings-filter').fill('授業');
    assert.equal(await sp.locator('#settings-nav button').count(), 1);
    await sp.locator('#settings-nav button').click();
    assert.equal(await sp.locator('#sheet-title').textContent(), '時間割');
    await sp.locator('#settings-filter').fill('');
    await sp.locator('#settings-nav button[data-section=clock]').click();
    await sp.getByRole('radio', { name: 'アナログ', exact: true }).click();
    assert.equal(await sp.locator('.analog-face').count(), 1);
    await sp.getByRole('radio', { name: 'アナログ', exact: true }).press('ArrowLeft');
    assert.equal(await sp.getByRole('radio', { name: 'デジタル', exact: true }).getAttribute('aria-checked'), 'true');
    await sp.locator('#settings-nav button[data-section=widgets]').click();
    await sp.getByRole('switch', { name: '時計を表示', exact: true }).uncheck();
    assert.equal(await sp.locator('[data-key=clock]').count(), 0);
    await sp.reload({ waitUntil: 'domcontentloaded' });
    await sp.locator('#settings').click();
    await sp.locator('#settings-nav button[data-section=widgets]').click();
    assert.equal(await sp.getByRole('switch', { name: '時計を表示', exact: true }).isChecked(), false);
    await sp.getByRole('switch', { name: '時計を表示', exact: true }).check();
    assert.equal(await sp.locator('[data-key=clock]').count(), 1);
    await sp.locator('#settings-nav button[data-section=appearance]').click();
    await sp.getByRole('radio', { name: 'ローズ', exact: true }).click();
    assert.equal(await sp.getByRole('radio', { name: 'ローズ', exact: true }).getAttribute('aria-checked'), 'true');
    assert.equal(await sp.getByRole('switch', { name: '外観を自動調整' }).isChecked(), false);
    await sp.getByRole('switch', { name: '外観を自動調整' }).check();
    await sp.locator('#settings-nav button[data-section=grid]').click();
    await sp.getByRole('button', { name: 'シンプル', exact: true }).click();
    assert.equal(await sp.locator('#sheet.confirmation-mode').count(), 1);
    await sp.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal(await sp.locator('#sheet-title').textContent(), 'グリッドと配置');
    assert.equal(await sp.locator('#settings-sidebar').isVisible(), true);
    assert.deepEqual(settings.errors, []);
    await settings.context.close();
    pass('Settings: search, navigation, keyboard segments, persistent switches, appearance choices and confirmation return');

    for (const width of [320, 1440]) {
      const panes = await open(browser, { viewport: { width, height: 844 }, colorScheme: 'dark' });
      for (const key of ['appearance','grid','pages','shortcuts','widgets','clock','timetable','weather','search','gallery','data']) {
        await panes.page.locator('#settings').click();
        if (width < 700) await panes.page.locator('.settings-menu button[data-section=' + key + ']').click();
        else await panes.page.locator('#settings-nav button[data-section=' + key + ']').click();
        assert.equal(await panes.page.locator('#sheet-body').evaluate(n => n.scrollWidth <= n.clientWidth + 1), true, key + ' must fit at ' + width);
        await panes.page.keyboard.press('Escape');
      }
      assert.deepEqual(panes.errors, []);
      await panes.context.close();
    }
    pass('All eleven settings panes render without horizontal overflow at 320 and 1440px');

    const mobileSettings = await open(browser, { viewport: { width: 390, height: 844 } });
    await mobileSettings.page.locator('#settings').click();
    assert.equal(await mobileSettings.page.locator('.settings-index').count(), 1);
    await mobileSettings.page.getByRole('button', { name: '壁紙と外観', exact: true }).click();
    assert.equal(await mobileSettings.page.locator('#sheet-title').textContent(), '壁紙と外観');
    await mobileSettings.page.locator('#sheet-back').click();
    await mobileSettings.page.getByRole('searchbox', { name: '設定リストを検索' }).fill('授業');
    assert.equal(await mobileSettings.page.locator('.settings-menu button:visible').count(), 1);
    await mobileSettings.page.locator('.settings-menu button:visible').click();
    assert.equal(await mobileSettings.page.locator('#sheet-title').textContent(), '時間割');
    assert.deepEqual(mobileSettings.errors, []);
    await mobileSettings.context.close();
    pass('Compact settings: grouped list, search, detail navigation and Back');

    const offlineContext = await browser.newContext();
    const offlinePage = await offlineContext.newPage();
    await offlinePage.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await offlinePage.evaluate(async () => {
      const old = await caches.open('newtab-original-shell-2');
      await old.put('./style.css', new Response('body { display: none; }', { headers: { 'Content-Type': 'text/css' } }));
      await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    const cachedFiles = await offlinePage.evaluate(async () => {
      const cache = await caches.open('newtab-original-shell-settings-3');
      return (await cache.keys()).map(r => r.url);
    });
    assert(cachedFiles.some(url => url.endsWith('settings.css?v=20261016-settings-3')));
    assert.equal(await offlinePage.evaluate(async () => (await caches.keys()).includes('newtab-original-shell-2')), false);
    await offlineContext.setOffline(true);
    await offlinePage.reload({ waitUntil: 'domcontentloaded' });
    await offlinePage.locator('#settings').click();
    assert.equal(await offlinePage.locator('#settings-sidebar').isVisible(), true);
    assert.equal(await offlinePage.locator('#sheet').evaluate(n => getComputedStyle(n).width), '980px');
    await offlineContext.close();
    pass('Old shell cache is removed; versioned settings assets work after an offline reload');

    const failure = await open(browser, {}, true);
    await failure.page.getByText('天気を取得できませんでした', { exact: true }).waitFor();
    assert.equal(await failure.page.getByText('予定を取得できませんでした', { exact: true }).count(), 1);
    assert.equal(await failure.page.locator('.widget .empty-message button').count(), 2);
    assert.equal(await failure.page.locator('.temperature').count(), 0);
    await failure.page.locator('#settings').click();
    assert.equal(await failure.page.locator('#sheet[open]').count(), 1);
    assert.deepEqual(failure.errors, []);
    await failure.context.close();
    pass('Unavailable APIs show honest retry states while local settings remain usable');
    console.log(`${checks} browser checks passed. External API responses were fixtures; live integrations were not asserted.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
