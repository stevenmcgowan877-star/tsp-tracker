// Inline <style> blocks must not be JSX text children. React escapes quotes and angle brackets in text, a <style>
// element shows its content raw, so a font name like 'Space Mono' reached the browser as &#x27;Space Mono&#x27;: the
// server's CSS differed from the client's and every load threw a hydration error on /backtest, /crises and /lfunds.
// Each block is written with dangerouslySetInnerHTML instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
for (const dir of ['pages', 'components']) {
  for (const name of readdirSync(dir)) if (/\.(js|jsx)$/.test(name)) files.push(join(dir, name));
}

test('no <style> element takes its CSS as a JSX text child', () => {
  const offenders = files.filter((f) => /<style[^>]*>\s*\{`/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('the three pages that interpolate a quoted font name write their CSS raw', () => {
  for (const f of ['pages/backtest.js', 'pages/crises.js', 'pages/lfunds.js']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /<style dangerouslySetInnerHTML=\{\{ __html: `[\s\S]*?\$\{mono\}[\s\S]*?` \}\} \/>/, f);
  }
});
