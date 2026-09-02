import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT, loadCatalog, loadManifest, sha256Csp, sha256Hex, stableStringify} from './core.mjs';
import {validateSpec} from './validation.mjs';

const BANNED_RUNTIME = [
  ['fetch(',/\bfetch\s*\(/u],
  ['XMLHttpRequest',/\bXMLHttpRequest\b/u],
  ['WebSocket',/\bWebSocket\b/u],
  ['EventSource',/\bEventSource\b/u],
  ['sendBeacon',/\bsendBeacon\b/u],
  ['dynamic import',/\bimport\s*\(/u],
  ['eval',/\beval\s*\(/u],
  ['Function',/\bFunction\s*\(/u],
  ['innerHTML',/\.innerHTML\b/u],
  ['outerHTML',/\.outerHTML\b/u],
  ['insertAdjacentHTML',/\.insertAdjacentHTML\b/u],
  ['document.write',/\bdocument\.write\b/u],
  ['location',/\b(?:window\.)?location\s*=/u],
  ['window.open',/\bwindow\.open\s*\(/u]
];

function assert(condition, message) {
  if (!condition) throw new Error(`Небезопасный HTML: ${message}`);
}

function decodeBase64(value, label) {
  assert(/^[A-Za-z0-9+/]*={0,2}$/.test(value),`${label} содержит не-Base64 данные`);
  return Buffer.from(value,'base64');
}

export function buildContentSecurityPolicy(echarts, runtime) {
  return [
    `default-src 'none'`,
    `script-src 'sha256-${sha256Csp(echarts)}' 'sha256-${sha256Csp(runtime)}'`,
    `style-src 'unsafe-inline'`,
    `font-src data:`,
    `img-src data:`,
    `connect-src 'none'`,
    `object-src 'none'`,
    `frame-src 'none'`,
    `child-src 'none'`,
    `worker-src 'none'`,
    `media-src 'none'`,
    `form-action 'none'`,
    `base-uri 'none'`,
    `manifest-src 'none'`,
    `navigate-to 'none'`
  ].join('; ');
}

export async function validateOutputHtml(html) {
  assert(typeof html === 'string' && html.startsWith('<!doctype html>'),'ожидался полный HTML5-документ');
  assert(/<html\s+lang="ru"/u.test(html),'не указан lang="ru"');
  const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*>/u);
  assert(cspMatch,'отсутствует CSP');
  const csp = cspMatch[1];

  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gu)].map(match => ({attributes:match[1],body:match[2]}));
  const executable = scripts.filter(script => !/type="application\/octet-stream"/u.test(script.attributes));
  assert(executable.length === 2,'должно быть ровно два доверенных исполняемых скрипта');
  assert(csp === buildContentSecurityPolicy(executable[0].body,executable[1].body),'CSP не совпадает с обязательной политикой');
  for (const script of executable) assert(csp.includes(`'sha256-${sha256Csp(script.body)}'`),'хеш исполняемого скрипта отсутствует в CSP');

  const manifest = await loadManifest();
  const echartsEntry = manifest.files['vendor/echarts/echarts-6.1.0.min.js'];
  assert(sha256Hex(executable[0].body) === echartsEntry.sha256,'ECharts отличается от зафиксированного файла');
  const runtime = await readFile(path.join(ROOT,'scripts/runtime.js'),'utf8');
  assert(executable[1].body === runtime,'локальный рендерер изменён или подменён');
  for (const [name,pattern] of BANNED_RUNTIME) assert(!pattern.test(executable[1].body),`рендерер содержит запрещённую конструкцию ${name}`);

  const dataScript = scripts.find(script => /id="lieflat-data"/u.test(script.attributes));
  assert(dataScript,'отсутствует блок данных');
  const bundle = JSON.parse(decodeBase64(dataScript.body.trim(),'блок данных').toString('utf8'));
  const catalog = await loadCatalog();
  const template = validateSpec(bundle.spec,catalog);
  assert(stableStringify(bundle.template) === stableStringify(template),'метаданные шаблона не совпадают с каталогом');

  const mapScript = scripts.find(script => /id="lieflat-map"/u.test(script.attributes));
  if (template.profile === 'map') {
    assert(mapScript,'для карты отсутствует встроенный GeoJSON');
    const mapBuffer = decodeBase64(mapScript.body.trim(),'блок карты');
    JSON.parse(mapBuffer.toString('utf8'));
    const mapPath = template.kind === 'map-usa' ? 'vendor/geo/usa.json' : 'vendor/geo/world.json';
    assert(sha256Hex(mapBuffer) === manifest.files[mapPath].sha256,'GeoJSON отличается от зафиксированного файла');
  } else {
    assert(!mapScript,'GeoJSON добавлен в шаблон, которому карта не нужна');
  }

  const withoutScripts = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gu,'');
  assert(!/(?:src|href)\s*=\s*["']\s*(?:https?:|\/\/|ftp:|file:)/iu.test(withoutScripts),'обнаружен внешний ресурс');
  assert(!/<(?:iframe|frame|object|embed|form|base|link)\b/iu.test(withoutScripts),'обнаружен запрещённый HTML-элемент');
  assert(!/<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b/iu.test(withoutScripts),'обнаружена навигация через meta refresh');
  assert(!/\son[a-z]+\s*=/iu.test(withoutScripts),'обнаружен инлайн-обработчик событий');
  assert(!/url\(\s*["']?(?!data:)/iu.test(withoutScripts),'CSS ссылается на внешний ресурс');
  assert(!/(?:https?|ftp|file):\/\//iu.test(withoutScripts),'обнаружен внешний URL');
  return {templateId:template.id, profile:template.profile};
}
