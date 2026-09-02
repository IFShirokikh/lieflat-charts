import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256Csp(value) {
  return createHash('sha256').update(value).digest('base64');
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function readJson(file) {
  return JSON.parse(await readFile(file,'utf8'));
}

export async function loadCatalog() {
  const raw = await readJson(path.join(ROOT,'templates/catalog.ru.json'));
  if (raw.version !== 1 || !Array.isArray(raw.templates)) throw new Error('Некорректный каталог шаблонов');
  const catalog = new Map();
  for (const template of raw.templates) {
    if (catalog.has(template.id)) throw new Error('В каталоге есть повторяющийся ID');
    catalog.set(template.id,Object.freeze({...template}));
  }
  return catalog;
}

export async function loadManifest() {
  return readJson(path.join(ROOT,'vendor/manifest.json'));
}
