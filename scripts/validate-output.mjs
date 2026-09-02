#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {validateOutputHtml} from './lib/output-validation.mjs';

async function main() {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) {
    process.stderr.write('Использование: node scripts/validate-output.mjs <result.html>\n');
    process.exitCode = 1;
    return;
  }
  try {
    const html = await readFile(path.resolve(file),'utf8');
    const result = await validateOutputHtml(html);
    process.stdout.write(`Проверено: ${result.templateId}, внешних ресурсов и запрещённых каналов не найдено.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

await main();
