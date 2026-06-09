/**
 * Tests for the browser pane element inspector.
 * Verifies: inspect mode activates/stays active, hover highlights elements,
 * click sends element info to chat, color is configurable.
 *
 * Run: node test-inspector.mjs
 */
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME || '/home/Nxe5/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:14200';

const TEST_PAGE_HTML = `<!DOCTYPE html>
<html>
<head><style>body{margin:0;font:14px sans-serif;} .box{padding:40px;background:#eee;} p{color:#333;}</style></head>
<body>
  <div class="box" id="main-box">
    <h1 id="title">Hello Inspector</h1>
    <p id="para">Some paragraph text here</p>
    <button id="btn">Click me</button>
  </div>
</body>
</html>`;

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else       { console.log(`  ✗ ${label}`); failed++; }
}

// Specific helpers that check ONLY the Select/Stop button, not sidebar toggles
async function isInspecting(page) {
  return page.evaluate(() => !!document.querySelector('[title="Stop selecting (Esc)"]'));
}
async function isNotInspecting(page) {
  return page.evaluate(() => !!document.querySelector('[title="Select an element to add to chat"]'));
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  await ctx.route(`${BASE}/sb-inspector-test.html`, async route => {
    await route.fulfill({ contentType: 'text/html', body: TEST_PAGE_HTML });
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION_REFUSED')) {
      errors.push(m.text());
    }
  });

  await page.goto(BASE);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Preview UI'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(600);

  // Open browser tab via ··· menu
  await page.evaluate(() => document.querySelector('[title="Editor actions"]')?.click());
  await page.waitForTimeout(200);
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.editor-actions-item')].find(i => i.textContent?.includes('browser'));
    if (b) { b.click(); return true; }
    return false;
  });
  ok('browser tab opened via ··· menu', opened);
  await page.waitForTimeout(400);

  // Navigate the browser pane to the test page
  const urlInput = await page.$('.preview-pane__toolbar input');
  ok('URL input found in preview pane', !!urlInput);
  if (urlInput) {
    await urlInput.fill(`${BASE}/sb-inspector-test.html`);
    await urlInput.press('Enter');
    await page.waitForTimeout(800);
  }

  const frameLoaded = await page.evaluate(() => !!document.querySelector('.preview-pane__frame'));
  ok('iframe rendered after navigation', frameLoaded);

  // ─── Test: toolbar structure ───
  console.log('\n── Test: toolbar buttons ──');
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('.preview-pane__toolbar button')]
      .map(b => b.getAttribute('title') || b.textContent?.trim())
  );
  console.log('  buttons:', btns.join(', '));
  ok('Back button', btns.some(t => t?.includes('back') || t?.includes('Back')));
  ok('Forward button', btns.some(t => t?.includes('forward') || t?.includes('Forward')));
  ok('Reload button', btns.some(t => t?.includes('Reload') || t?.includes('reload')));
  ok('Go button', btns.includes('Go'));
  ok(':3000 button', btns.includes(':3000'));
  ok(':14200 button', btns.includes(':14200'));
  ok('Select element button', btns.some(t => t?.includes('Select') || t?.includes('element')));

  // ─── Test: inspect mode activation persists ───
  console.log('\n── Test: inspect mode activation ──');

  ok('initially not inspecting', await isNotInspecting(page));

  const selectBtn = await page.$('[title="Select an element to add to chat"]');
  ok('"Select element" button found', !!selectBtn);

  if (selectBtn) {
    await selectBtn.click();
    await page.waitForTimeout(300);

    ok('button switches to "Stop" state (inspect mode persists — untrack fix)', await isInspecting(page));
    const overlayVisible = await page.evaluate(() => !!document.querySelector('.inspect-overlay'));
    ok('inspect overlay appears', overlayVisible);
  }

  // ─── Test: hover highlight ───
  console.log('\n── Test: hover highlight in iframe ──');
  const frame = page.frame({ url: `${BASE}/sb-inspector-test.html` });
  ok('iframe frame handle obtained', !!frame);

  if (frame) {
    const h1 = await frame.$('#title');
    ok('#title element found in iframe', !!h1);

    if (h1) {
      await h1.hover();
      await page.waitForTimeout(250);

      const hasHoverClass = await frame.evaluate(() => !!document.querySelector('.__sb_hover'));
      ok('.__sb_hover class applied on hover', hasHoverClass);

      const hasStyle = await frame.evaluate(() => !!document.getElementById('__sb_insp_style'));
      ok('inspector style injected into iframe document', hasStyle);

      const isTitleHovered = await frame.evaluate(() => document.querySelector('.__sb_hover')?.id === 'title');
      ok('hovered element is #title', isTitleHovered);

      // Move to paragraph — class should move
      const para = await frame.$('#para');
      if (para) {
        await para.hover();
        await page.waitForTimeout(200);
        const isParaHovered = await frame.evaluate(() => document.querySelector('.__sb_hover')?.id === 'para');
        ok('hovering new element moves highlight to #para', isParaHovered);
        const onlyOneHovered = await frame.evaluate(() => document.querySelectorAll('.__sb_hover').length === 1);
        ok('only one element highlighted at a time', onlyOneHovered);
      }
    }
  }

  // ─── Test: click sends element info to chat ───
  console.log('\n── Test: element click → chat ──');
  if (frame) {
    await page.evaluate(() => {
      window.__inspectorLastEvent = null;
      window.addEventListener('spacebar:element-selected', (e) => {
        window.__inspectorLastEvent = e.detail?.text ?? '(no detail)';
      }, { once: true });
    });

    const btn = await frame.$('#btn');
    ok('#btn found in iframe', !!btn);
    if (btn) {
      await btn.click();
      await page.waitForTimeout(400);

      const eventDetail = await page.evaluate(() => window.__inspectorLastEvent);
      ok('spacebar:element-selected fired on element click', !!eventDetail);
      ok('event detail mentions button tag', eventDetail?.includes('button'));
      ok('event detail mentions element id (btn)', eventDetail?.includes('btn'));
      console.log('  detail:', eventDetail?.slice(0, 150));

      ok('inspect mode stops after element picked', await isNotInspecting(page));
      ok('overlay removed after pick', !(await page.evaluate(() => !!document.querySelector('.inspect-overlay'))));

      // Chip should appear in the composer instead of raw text
      const chipCount = await page.evaluate(() => document.querySelectorAll('.attachment-chip').length);
      ok('element chip inserted in composer', chipCount >= 1);
      const chipName = await page.evaluate(() => document.querySelector('.attachment-chip-name')?.textContent);
      ok('chip label is just the tag name ("button")', chipName === 'button');
      console.log('  chip label:', chipName);
      const chipKind = await page.evaluate(() => document.querySelector('.attachment-chip')?.dataset?.kind);
      ok('chip has data-kind="element"', chipKind === 'element');

      // Backspace with cursor right after chip should remove it
      const composerEl = await page.$('.composer-textarea[contenteditable="true"]');
      if (composerEl) {
        await composerEl.click();
        await page.waitForTimeout(100);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);
        const chipsAfterBackspace = await page.evaluate(() => document.querySelectorAll('.attachment-chip').length);
        ok('Backspace removes element chip from composer', chipsAfterBackspace === 0);
      }
    }
  }

  // ─── Test: Esc cancels inspection ───
  console.log('\n── Test: Esc cancels inspection ──');
  const selectBtn2 = await page.$('[title="Select an element to add to chat"]');
  if (selectBtn2) {
    await selectBtn2.click();
    await page.waitForTimeout(300);
    ok('inspection re-activated for Esc test', await isInspecting(page));

    // Esc dispatched inside the iframe should cancel inspection
    if (frame) {
      await frame.evaluate(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      await page.waitForTimeout(300);
      ok('Esc inside iframe cancels inspection', await isNotInspecting(page));
    }
  }

  // ─── Test: overlay uses highlight color ───
  console.log('\n── Test: inspector highlight color ──');
  const selectBtn3 = await page.$('[title="Select an element to add to chat"]');
  if (selectBtn3) {
    await selectBtn3.click();
    await page.waitForTimeout(300);

    const borderColor = await page.evaluate(() => {
      const overlay = document.querySelector('.inspect-overlay');
      return overlay ? overlay.style.borderColor : null;
    });
    ok('overlay has inline border-color', !!borderColor);
    // Default is #ff6b8b = rgb(255, 107, 139)
    ok('default color is #ff6b8b (rgb(255,107,139))', borderColor?.includes('255') && borderColor?.includes('107'));
    console.log('  border-color:', borderColor);

    // Verify default color is stored in settings
    const storedColor = await page.evaluate(() => {
      const raw = localStorage.getItem('sidebar.settings.v4');
      return JSON.parse(raw || '{}')?.inspectorHighlightColor ?? null;
    });
    ok('inspectorHighlightColor key exists in settings (default #ff6b8b)', storedColor === '#ff6b8b');

    // Stop inspecting
    await page.evaluate(() => document.querySelector('[title="Stop selecting (Esc)"]')?.click());
    await page.waitForTimeout(200);
  }

  // ─── Test: no JS errors ───
  console.log('\n── Test: no console errors ──');
  ok('no unexpected JS errors', errors.length === 0);
  if (errors.length) errors.forEach(e => console.log('    error:', e));

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
