import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import path from 'node:path';
import {ROOT, loadManifest, sha256Hex} from '../scripts/lib/core.mjs';

test('контрольные суммы всех локальных ресурсов совпадают', async () => {
  const manifest = await loadManifest();
  for (const [relative,entry] of Object.entries(manifest.files)) {
    const data = await readFile(path.join(ROOT,relative));
    assert.equal(sha256Hex(data),entry.sha256,relative);
    assert.ok(entry.source);
    assert.ok(entry.license);
  }
});

test('лицензии ECharts и всех шрифтов сохранены', async () => {
  for (const file of ['vendor/echarts/LICENSE','vendor/echarts/NOTICE','vendor/fonts/inter/LICENSE','vendor/fonts/source-serif-4/LICENSE','vendor/fonts/playfair-display/LICENSE','vendor/fonts/roboto-slab/LICENSE','vendor/fonts/oswald/LICENSE','vendor/fonts/jetbrains-mono/LICENSE']) await access(path.join(ROOT,file));
});
