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
  assert.equal(await page.locator('.status-bar, .welcome, #greeting').count(), 0);
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
      fullViewport: main.top === 0 && main.left === 0 && Math.abs(main.bottom - innerHeight) <= 1 && Math.abs(main.width - innerWidth) <= 1,
      floatingControls: getComputedStyle(document.querySelector('.home-footer')).position === 'fixed',
      fullGridWidth: active.querySelector('.grid').getBoundingClientRect().width >= innerWidth - 48 - 1,
    };
  });
  assert.deepEqual(result, { wide: false, outside: [], overlap: false, fullViewport: true, floatingControls: true, fullGridWidth: true });
}
(async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const { page, context, errors } = await open(browser);
    await page.locator('.temperature').waitFor();
    assert.equal(await page.locator('.lessons .lesson').count(), 7);
    await noOverflow(page);
    pass('Desktop: weather and seven lessons render from fixture responses without overlapping cards');
    const homeBoxes = () => page.locator('#home .item').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.key, ...n.getBoundingClientRect().toJSON() })));
    const originalBoxes = await homeBoxes();
    await page.locator('#edit').click();
    assert.deepEqual(await homeBoxes(), originalBoxes);
    await page.locator('#edit').click();
    assert.deepEqual(await homeBoxes(), originalBoxes);
    pass('All default widgets and shortcuts keep identical positions and dimensions when editing starts and ends');

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
    await page.locator('[data-key=clock]').click();
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
    assert.equal(await page.locator('.dock-surface').evaluate(n => getComputedStyle(n).backdropFilter), 'none');
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

    const material = await open(browser);
    await material.page.locator('#settings').click();
    await material.page.locator('#sheet[data-pane-ready=true]').waitFor();
    await material.page.getByRole('radio', { name: '不透明', exact: true }).click();
    assert.equal(await material.page.locator('html').getAttribute('data-material'), 'solid');
    assert.equal(await material.page.locator('.dock-surface').evaluate(n => getComputedStyle(n).backdropFilter), 'none');
    await material.page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await material.page.locator('html').getAttribute('data-material'), 'solid');
    await material.page.locator('#settings').click();
    await material.page.getByRole('radio', { name: 'Liquid Glass', exact: true }).click();
    assert.equal(await material.page.locator('html').getAttribute('data-material'), 'glass');
    assert.notEqual(await material.page.locator('.widget').first().evaluate(n => getComputedStyle(n, '::before').backdropFilter), 'none');
    const media = await material.context.newCDPSession(material.page);
    await media.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    assert.equal(await material.page.locator('.widget').first().evaluate(n => getComputedStyle(n, '::before').backdropFilter), 'none');
    assert.deepEqual(material.errors, []);
    await material.context.close();
    pass('Glass and solid material choices persist; reduced transparency removes the glass effects');

    for (const touch of [false, true]) {
      const drawer = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: touch });
      const dp = drawer.page;
      await dp.locator('#settings').click();
      await dp.locator('#sheet[data-pane-ready=true]').waitFor();
      const top = await dp.locator('.newtab-pane .pane').evaluate(n => n.getBoundingClientRect().top);
      await dp.locator('#sheet-grabber').press('ArrowDown');
      await dp.waitForFunction(y => document.querySelector('.newtab-pane .pane').getBoundingClientRect().top > y + 100, top);
      await dp.locator('#sheet-grabber').press('ArrowUp');
      await dp.waitForFunction(y => Math.abs(document.querySelector('.newtab-pane .pane').getBoundingClientRect().top - y) < 2, top);
      for (let i = 0; i < 8; i++) {
        await dp.keyboard.press('Tab');
        assert.equal(await dp.locator('#sheet').evaluate(n => n.contains(document.activeElement)), true);
      }
      const grip = await dp.locator('#sheet-grabber').boundingBox();
      const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2;
      if (touch) {
        const cdp = await drawer.context.newCDPSession(dp);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 24; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (830 - y) * i / 24 }] });
          await dp.waitForTimeout(18);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await dp.mouse.move(x, y);
        await dp.mouse.down();
        await dp.mouse.move(x, 830, { steps: 30 });
        await dp.mouse.up();
      }
      await dp.locator('#sheet').waitFor({ state: 'hidden' });
      assert.equal(await dp.locator('.newtab-pane').count(), 0);
      await dp.locator('#settings').click();
      await dp.locator('#sheet[data-pane-ready=true]').waitFor();
      await dp.keyboard.press('Escape');
      await dp.locator('#sheet').waitFor({ state: 'hidden' });
      assert.equal(await dp.locator('#settings').evaluate(n => n === document.activeElement), true);
      assert.deepEqual(drawer.errors, []);
      await drawer.context.close();
    }
    pass('Cupertino Pane: keyboard detents, focus containment, mouse/touch swipe dismissal and reopening');

    for (const width of [390, 1440]) {
      const canvas = await open(browser, { viewport: { width, height: 844 } });
      await canvas.page.evaluate(() => {
        const state = NewTabCore.defaults();
        const bottom = state.pages[0].items.find(item => item.id === 's:github');
        bottom.x = 5; bottom.y = 16;
        localStorage.setItem(NewTabCore.KEY, JSON.stringify(state));
      });
      await canvas.page.reload({ waitUntil: 'domcontentloaded' });
      await noOverflow(canvas.page);
      const bottom = canvas.page.locator('[data-key="s:github"] a');
      await bottom.evaluate(n => n.scrollIntoView({ block: 'end' }));
      const reachable = await bottom.evaluate(n => {
        const box = n.getBoundingClientRect(), footer = document.querySelector('.home-footer').getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return box.bottom < footer.top && n.contains(hit);
      });
      assert.equal(reachable, true, 'Bottom grid items must scroll above the floating Dock');
      await canvas.page.locator('#settings').click();
      await canvas.page.locator('#sheet[data-pane-ready=true]').waitFor();
      assert.deepEqual(canvas.errors, []);
      await canvas.context.close();
    }
    pass('Full-screen canvas uses the full width and height; bottom items scroll above the floating Dock');

    for (const width of [320, 774, 1440]) {
      for (const [rowHeight, gap, fontSize] of [[40, 8, 16], [48, 14, 16], [60, 20, 32]]) {
        const labels = await open(browser, { viewport: { width, height: 700 } });
        const lp = labels.page;
        await lp.evaluate(({ rowHeight, gap }) => {
          const s = NewTabCore.defaults();
          s.grid = { columns: 12, rowHeight, gap };
          Object.values(s.widgets).forEach(w => w.enabled = false);
          s.shortcuts = ['Classroom', 'ChatGPT', 'Gemini', 'Claude'].map((name, i) => ({ id: 'label' + i, name, url: 'https://example.com/' + i, color: '#ffffff' }));
          s.pages = [{ id: 'labels', name: 'ホーム', items: s.shortcuts.map((v, i) => ({ id: 's:' + v.id, x: i * 3, y: 12, w: 3, h: 1 })) }];
          s.activePage = 'labels';
          localStorage.setItem(NewTabCore.KEY, JSON.stringify(s));
        }, { rowHeight, gap });
        await lp.reload({ waitUntil: 'domcontentloaded' });
        if (fontSize !== 16) {
          await lp.evaluate(() => { document.documentElement.style.fontSize = '200%'; window.dispatchEvent(new Event('resize')); });
          await lp.waitForTimeout(220);
        }
        await lp.locator('#home .shortcut').last().evaluate(n => n.scrollIntoView({ block: 'end' }));
        const boxes = () => lp.locator('#home .item').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.key, ...n.getBoundingClientRect().toJSON() })));
        const before = await boxes();
        const saved = await lp.evaluate(() => localStorage.getItem(NewTabCore.KEY));
        for (const edit of [true, false]) {
          await lp.locator('#edit').click();
          assert.equal(await lp.locator('#edit').getAttribute('aria-pressed'), String(edit));
          assert.deepEqual(await boxes(), before, 'Editing must not move or stretch grid items');
          const text = await lp.locator('#home .app-label').evaluateAll(nodes => nodes.map(n => {
            const r = n.getBoundingClientRect(), tile = n.closest('.item').getBoundingClientRect();
            return { completeLine: r.height >= parseFloat(getComputedStyle(n).lineHeight) - 1, unshrunk: n.scrollHeight <= n.clientHeight + 1, contained: r.top >= tile.top && r.bottom <= tile.bottom };
          }));
          if (edit && width === 774 && rowHeight === 40) {
            const tile = lp.locator('#home .shortcut').last();
            await tile.click();
            const handle = await tile.locator('.resize').boundingBox();
            const tileBox = await tile.boundingBox();
            await lp.mouse.move(handle.x + 22, handle.y + 22);
            await lp.mouse.down();
            await lp.mouse.move(handle.x + 22, handle.y - 250, { steps: 8 });
            assert(Math.abs((await lp.locator('.ghost').boundingBox()).height - tileBox.height) < 1, 'Resize must reserve the complete label line');
            await lp.mouse.up();
          }
          assert.equal(text.length, 4);
          assert(text.every(t => t.completeLine && t.unshrunk && t.contained), JSON.stringify(text));
          await noOverflow(lp);
        }
        assert.equal(await lp.evaluate(() => localStorage.getItem(NewTabCore.KEY)), saved, 'Toggling edit must not rewrite the saved layout');
        const bottom = await lp.locator('#home .shortcut').last().boundingBox();
        const footer = await lp.locator('.home-footer').boundingBox();
        assert(bottom.y + bottom.height < footer.y, 'The last label must scroll above the Dock');
        if (width === 774 && rowHeight === 48) await lp.screenshot({ path: '/tmp/newtab-shortcut-labels.png' });
        assert.deepEqual(labels.errors, []);
        await labels.context.close();
      }
    }
    pass('Identical edit/live geometry and complete shortcut labels at 320/774/1440px, tight grids, bottom rows and 200% text');

    for (const touch of [false, true]) {
      const editor = await open(browser, { viewport: { width: touch ? 390 : 1440, height: 900 }, hasTouch: touch, isMobile: touch });
      const ep = editor.page;
      await ep.evaluate(() => {
        const s = NewTabCore.defaults();
        Object.entries(s.widgets).forEach(([k, w]) => w.enabled = k === 'clock');
        s.shortcuts = s.shortcuts.slice(0, 1);
        s.pages = [{ id: 'editing', name: 'ホーム', items: [{ id: 'clock', x: 0, y: 0, w: 2, h: 2 }, { id: 's:google', x: 2, y: 0, w: 2, h: 2 }] }];
        s.activePage = 'editing';
        localStorage.setItem(NewTabCore.KEY, JSON.stringify(s));
      });
      await ep.reload({ waitUntil: 'domcontentloaded' });
      await ep.evaluate(() => document.addEventListener('click', e => { if (e.target.closest('#home [data-key="s:google"] a')) { window.normalTap = !e.defaultPrevented; e.preventDefault(); } }));
      if (touch) await ep.locator('[data-key="s:google"] a').tap();
      else await ep.locator('[data-key="s:google"] a').click();
      assert.equal(await ep.evaluate(() => window.normalTap), true, 'An ordinary tap must retain link behavior');
      assert.equal(await ep.locator('#edit').getAttribute('aria-pressed'), 'false');
      const cdp = touch ? await editor.context.newCDPSession(ep) : null;
      const down = async (x, y) => {
        if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        else { await ep.mouse.move(x, y); await ep.mouse.down(); }
      };
      const move = async (x, y) => {
        if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        else await ep.mouse.move(x, y, { steps: 12 });
      };
      const up = async () => {
        if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else await ep.mouse.up();
      };
      if (touch) {
        await down(190, 480);
        for (let i = 1; i <= 5; i++) { await move(190, 480 - i * 40); await ep.waitForTimeout(20); }
        await up();
        await ep.waitForTimeout(150);
        assert.equal(await ep.locator('#edit').getAttribute('aria-pressed'), 'false', 'A normal scroll must not enter editing');
        assert(await ep.locator('#home').evaluate(n => n.scrollTop > 0), 'Normal touch scrolling must remain available');
        await ep.locator('#home').evaluate(n => n.scrollTop = 0);
      }
      const clock = ep.locator('#home [data-key=clock]');
      const original = await clock.boundingBox();
      const step = await ep.locator('.grid').evaluate(n => { const s = getComputedStyle(n); return { x: parseFloat(s.gridTemplateColumns) + parseFloat(s.columnGap), y: parseFloat(s.gridAutoRows) + parseFloat(s.rowGap) }; });
      const x = original.x + original.width / 2, y = original.y + original.height / 2;
      await down(x, y);
      await ep.waitForTimeout(1150);
      assert.equal(await ep.locator('#edit').getAttribute('aria-pressed'), 'true');
      assert.equal(await ep.locator('.drag-preview').count(), 1);
      const previewBox = await ep.locator('.drag-preview').boundingBox();
      assert(Math.abs(previewBox.width - original.width) < 1 && Math.abs(previewBox.height - original.height) < 1);
      await move(x + step.x * 2, y + step.y * 4);
      assert.equal(await ep.locator('.ghost.invalid').count(), 0);
      const ghost = await ep.locator('.ghost').boundingBox();
      assert(Math.abs(ghost.width - original.width) < 1 && Math.abs(ghost.height - original.height) < 1);
      if (!touch) await ep.screenshot({ path: '/tmp/newtab-direct-edit.png' });
      await up();
      assert.equal(await ep.locator('.drag-preview, .ghost').count(), 0);
      let dropped = await clock.boundingBox();
      assert(Math.abs(dropped.x - (original.x + step.x * 2)) < 1 && Math.abs(dropped.y - (original.y + step.y * 4)) < 1, 'The card must stay where the preview was dropped');
      const resize = await clock.locator('.resize').boundingBox();
      await down(resize.x + resize.width / 2, resize.y + resize.height / 2);
      await move(resize.x + resize.width / 2, resize.y + resize.height / 2 + step.y);
      const resized = await ep.locator('.ghost').boundingBox();
      await up();
      assert(Math.abs((await clock.boundingBox()).height - resized.height) < 1);
      await ep.locator('#undo').click();
      assert(Math.abs((await clock.boundingBox()).height - original.height) < 1);
      const saved = await ep.evaluate(() => localStorage.getItem(NewTabCore.KEY));
      dropped = await clock.boundingBox();
      await down(dropped.x + dropped.width / 2, dropped.y + dropped.height / 2);
      await move(dropped.x + dropped.width / 2, y);
      assert.equal(await ep.locator('.ghost.invalid').count(), 1);
      await up();
      assert.equal(await ep.evaluate(() => localStorage.getItem(NewTabCore.KEY)), saved, 'An overlapping drop must preserve saved data');
      await clock.focus();
      await ep.keyboard.press('Enter');
      await ep.locator('#sheet[data-pane-ready=true]').waitFor();
      assert.equal(await ep.getByRole('spinbutton', { name: '列', exact: true }).inputValue(), '3');
      assert.equal(await ep.getByRole('spinbutton', { name: '行', exact: true }).inputValue(), '5');
      await ep.keyboard.press('Escape');
      await ep.locator('#sheet').waitFor({ state: 'hidden' });
      const edited = await clock.boundingBox();
      await ep.locator('#edit').click();
      assert.deepEqual(await clock.boundingBox(), edited);
      await ep.reload({ waitUntil: 'domcontentloaded' });
      assert.deepEqual(await clock.boundingBox(), edited, 'Reload must preserve the displayed drop position');
      assert.deepEqual(editor.errors, []);
      await noOverflow(ep);
      await editor.context.close();
    }
    pass('Mouse and touch: normal tap, long-press direct drag, accurate drop/resize, undo, collision rejection, keyboard alternative and reload');

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
      const cache = await caches.open('newtab-original-shell-edit-6');
      return (await cache.keys()).map(r => r.url);
    });
    assert(cachedFiles.some(url => url.endsWith('settings.css?v=20261016-edit-6')));
    assert.equal(await offlinePage.evaluate(async () => (await caches.keys()).includes('newtab-original-shell-2')), false);
    await offlineContext.setOffline(true);
    await offlinePage.reload({ waitUntil: 'domcontentloaded' });
    await offlinePage.locator('#settings').click();
    await offlinePage.locator('#sheet[data-pane-ready=true]').waitFor();
    assert.equal(await offlinePage.locator('#settings-sidebar').isVisible(), true);
    assert.equal(await offlinePage.locator('#sheet .pane').evaluate(n => getComputedStyle(n).width), '980px');
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
