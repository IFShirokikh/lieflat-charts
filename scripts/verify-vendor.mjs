#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT, loadManifest, sha256Hex} from './lib/core.mjs';

try {
  const manifest = await loadManifest();
  for (const [relative,entry] of Object.entries(manifest.files)) {
    const data = await readFile(path.join(ROOT,relative));
    if (sha256Hex(data) !== entry.sha256) throw new Error(`Не совпала контрольная сумма: ${relative}`);
  }
  process.stdout.write(`Проверено локальных ресурсов: ${Object.keys(manifest.files).length}.\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
