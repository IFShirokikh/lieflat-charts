#!/usr/bin/env node
import {open, mkdir, rename, rm, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCanonicalHtml} from './lib/canonical-html.mjs';
import {validateOutputHtml} from './lib/output-validation.mjs';

function usage() {
  return `Lieflat Charts — локальная офлайн-сборка\n\nИспользование:\n  node scripts/build-offline.mjs --spec <input.json> --out <result.html>\n\nПараметры:\n  --spec   JSON-спецификация версии 1\n  --out    итоговый самодостаточный HTML\n  --help   показать эту справку`;
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return {help:true};
  const allowed = new Set(['--spec','--out']);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith('--')) throw new Error('Неверные параметры. Используйте --help для справки.');
    if (result[key]) throw new Error('Параметр указан больше одного раза.');
    result[key] = value;
  }
  if (!result['--spec'] || !result['--out']) throw new Error('Обязательны параметры --spec и --out.');
  return {spec:result['--spec'],out:result['--out']};
}

async function writeAtomic(target, data) {
  const directory = path.dirname(target);
  await mkdir(directory,{recursive:true});
  const temporary = path.join(directory,`.${path.basename(target)}.tmp-${process.pid}`);
  let handle;
  try {
    handle = await open(temporary,'wx',0o600);
    await handle.writeFile(data,{encoding:'utf8'});
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary,target);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary,{force:true}).catch(() => {});
    throw error;
  }
}

export async function buildHtml(spec) {
  const html = await buildCanonicalHtml(spec);
  await validateOutputHtml(html);
  return html;
}

export async function buildFile(specPath, outputPath) {
  const input = path.resolve(specPath);
  const output = path.resolve(outputPath);
  if (input === output) throw new Error('Входной JSON и итоговый HTML должны быть разными файлами.');
  const raw = await readFile(input,'utf8');
  if (Buffer.byteLength(raw,'utf8') > 10 * 1024 * 1024) throw new Error('Спецификация превышает 10 МБ.');
  let spec;
  try { spec = JSON.parse(raw); }
  catch { throw new Error('Спецификация не является корректным JSON.'); }
  const html = await buildHtml(spec);
  await writeAtomic(output,html);
  return output;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    await buildFile(args.spec,args.out);
    process.stdout.write('Готово: безопасный офлайн-HTML собран и проверен.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
