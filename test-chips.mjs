/**
 * Tests for inline attachment chip behavior in the chat composer.
 * Run: node test-chips.mjs
 */
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME || '/home/Nxe5/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:14200';

let passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else       { console.log(`  ✗ ${label}`); failed++; }
}

async function enterWorkspace(page) {
  // Trigger preview UI mode so we get the full workspace without a folder
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Preview UI'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
}

async function getComposer(page) {
  return page.$('.composer-textarea[contenteditable="true"]');
}

async function getChips(page) {
  return page.$$('.attachment-chip');
}

async function injectChip(page, name) {
  // Simulate a file drop by calling insertChipInComposer via page.evaluate
  await page.evaluate((n) => {
    const event = new CustomEvent('__test:inject-chip', { detail: { name: n } });
    window.dispatchEvent(event);
  }, name);
  await page.waitForTimeout(100);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

  // Intercept console errors — filter out expected Tauri IPC network failures
  const errors = [];
  page.on('console', m => {
    if (m.type() === 'error') {
      const t = m.text();
      // ERR_CONNECTION_REFUSED is expected in browser-preview mode (no Tauri IPC backend)
      if (t.includes('ERR_CONNECTION_REFUSED')) return;
      errors.push(t);
    }
  });

  await page.goto(BASE);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // ─── Setup: inject a test hook so we can insert chips programmatically ───
  // We'll use a DataTransfer simulation instead — drag a fake file into the chat pane
  await enterWorkspace(page);
  await page.waitForTimeout(500);

  console.log('\n── Test: PreviewPane toolbar ──');
  // Navigate to preview tab — open settings or look for preview
  const has5173 = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === ':5173')
  );
  ok(':5173 button removed', !has5173);

  const hasBrowserBtn = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Browser')
  );
  ok('"Browser" button removed from preview toolbar', !hasBrowserBtn);

  console.log('\n── Test: composer is contenteditable div ──');
  const composerTag = await page.evaluate(() => {
    const el = document.querySelector('.composer-textarea');
    return el ? el.tagName + ':' + el.getAttribute('contenteditable') : 'not found';
  });
  ok('composer is <div contenteditable="true">', composerTag === 'DIV:true');

  console.log('\n── Test: placeholder shows when empty ──');
  const placeholderCss = await page.evaluate(() => {
    const el = document.querySelector('.composer-textarea[data-empty="true"]');
    return !!el;
  });
  ok('data-empty="true" when composer is empty', placeholderCss);

  console.log('\n── Test: typing in composer ──');
  const composer = await getComposer(page);
  if (composer) {
    await composer.click();
    await page.keyboard.type('hello world');
    const text = await page.evaluate(() => {
      const el = document.querySelector('.composer-textarea');
      return el?.textContent ?? '';
    });
    ok('typed text appears in composer', text.includes('hello world'));

    // Clear with Ctrl+A + Delete
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);
    const cleared = await page.evaluate(() => {
      const el = document.querySelector('.composer-textarea');
      return (el?.textContent ?? '').trim();
    });
    ok('composer clears correctly', cleared === '');
  } else {
    ok('composer found', false);
  }

  console.log('\n── Test: chip injection via drag-drop simulation ──');
  // We'll simulate a drop event with a DataTransfer
  const chatPane = await page.$('.chat-pane');
  if (chatPane) {
    // Create a fake File and dispatch drop event
    const chipAdded = await page.evaluate(async () => {
      const chatPane = document.querySelector('.chat-pane');
      if (!chatPane) return 'no chat pane';

      const dt = new DataTransfer();
      const file = new File(['test content'], 'test-file.txt', { type: 'text/plain' });
      dt.items.add(file);

      const dropEvent = new DragEvent('drop', { dataTransfer: dt, bubbles: true });
      chatPane.dispatchEvent(dropEvent);
      await new Promise(r => setTimeout(r, 200));

      const chips = document.querySelectorAll('.attachment-chip');
      return chips.length;
    });
    ok('chip appears after file drop', Number(chipAdded) >= 1);

    // Test: chip name shows correctly
    const chipName = await page.evaluate(() => {
      const nameEl = document.querySelector('.attachment-chip-name');
      return nameEl?.textContent?.trim() ?? '';
    });
    ok('chip shows filename', chipName === 'test-file.txt');

    // Test: file chip has data-kind="file"
    const fileChipKind = await page.evaluate(() => document.querySelector('.attachment-chip')?.dataset?.kind);
    ok('file chip has data-kind="file"', fileChipKind === 'file');

    // Test: composer is NOT empty now (chip exists)
    const notEmpty = await page.evaluate(() => {
      const el = document.querySelector('.composer-textarea[data-empty="true"]');
      return !el; // should NOT have data-empty="true" when chip exists
    });
    ok('composer not empty when chip present', notEmpty);

    // Test: × button removes chip
    const removeBtnExists = await page.$('.attachment-chip-remove');
    if (removeBtnExists) {
      await removeBtnExists.click({ force: true });
      await page.waitForTimeout(400);
      const chipsAfterRemove = await page.$$('.attachment-chip');
      ok('× button removes chip from DOM', chipsAfterRemove.length === 0);

      const pendingAfterRemove = await page.evaluate(() => {
        // We can't access Svelte internals directly, but we can check the data-empty attribute
        const el = document.querySelector('.composer-textarea[data-empty="true"]');
        return !!el;
      });
      ok('composer shows empty state after chip removal', pendingAfterRemove);
    } else {
      ok('× button found', false);
    }

    // Test: Backspace removes chip when cursor is right after it
    console.log('\n── Test: Backspace removes chip ──');
    // Add two chips in sequence
    for (const name of ['alpha.txt', 'beta.txt']) {
      await page.evaluate(async (n) => {
        const chatPane = document.querySelector('.chat-pane');
        if (!chatPane) return;
        const dt = new DataTransfer();
        dt.items.add(new File(['x'], n, { type: 'text/plain' }));
        chatPane.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
      }, name);
      await page.waitForTimeout(120);
    }
    const chipsBefore = (await page.$$('.attachment-chip')).length;
    ok('two chips added before backspace test', chipsBefore === 2);

    const composerForBackspace = await getComposer(page);
    if (composerForBackspace) {
      await composerForBackspace.click();
      await page.waitForTimeout(100);

      // First backspace removes beta.txt (most recently inserted, cursor is right after it)
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(150);
      const chipsAfterFirst = (await page.$$('.attachment-chip')).length;
      ok('first Backspace removes the last chip', chipsAfterFirst === 1);

      // Second backspace removes alpha.txt
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(150);
      const chipsAfterSecond = (await page.$$('.attachment-chip')).length;
      ok('second Backspace removes the remaining chip', chipsAfterSecond === 0);

      const emptyAfterBackspace = await page.evaluate(() => !!document.querySelector('.composer-textarea[data-empty="true"]'));
      ok('composer shows empty state after all chips removed by Backspace', emptyAfterBackspace);
    } else {
      ok('composer found for backspace test', false);
    }
  } else {
    ok('chat pane found', false);
  }

  console.log('\n── Test: chip + text, then send clears both ──');
  const composer2 = await getComposer(page);
  if (composer2) {
    // Add a chip
    const chatPane2 = await page.$('.chat-pane');
    if (chatPane2) {
      await page.evaluate(async () => {
        const chatPane = document.querySelector('.chat-pane');
        if (!chatPane) return;
        const dt = new DataTransfer();
        dt.items.add(new File(['content'], 'readme.md', { type: 'text/plain' }));
        chatPane.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
      });
      await page.keyboard.type(' some text');
      await page.waitForTimeout(100);

      const hasChip = (await page.$$('.attachment-chip')).length > 0;
      const text = await page.evaluate(() => document.querySelector('.composer-textarea')?.textContent ?? '');
      ok('chip + text coexist in composer', hasChip && text.includes('some text'));
    }
  }

  console.log('\n── Test: editor actions menu ──');
  const dotsBtn = await page.$('[title="Editor actions"]');
  if (dotsBtn) {
    await dotsBtn.click();
    await page.waitForTimeout(200);
    const menuVisible = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.editor-actions-item')];
      return items.map(b => b.textContent?.trim());
    });
    ok('menu shows "New file"', menuVisible.some(t => t?.includes('New file')));
    ok('menu shows "Open terminal"', menuVisible.some(t => t?.includes('Open terminal')));
    ok('menu shows "Open browser"', menuVisible.some(t => t?.includes('Open browser')));

    // Close by clicking outside
    await page.keyboard.press('Escape');
    await page.mouse.click(640, 400);
    await page.waitForTimeout(200);
    const menuGone = await page.evaluate(() => !document.querySelector('.editor-actions-menu'));
    ok('menu closes on outside click', menuGone);
  } else {
    ok('editor actions (···) button found', false);
  }

  console.log('\n── Test: no console errors ──');
  ok('no JS errors', errors.length === 0);
  if (errors.length) errors.forEach(e => console.log('    error:', e));

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
