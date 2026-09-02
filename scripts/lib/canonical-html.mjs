import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT, loadCatalog, loadManifest, sha256Csp, sha256Hex, stableStringify} from './core.mjs';
import {validateSpec} from './validation.mjs';

const FONT_NAMES = {
  inter:'Inter',
  'source-serif-4':'Source Serif 4',
  'playfair-display':'Playfair Display',
  'roboto-slab':'Roboto Slab',
  oswald:'Oswald',
  'jetbrains-mono':'JetBrains Mono'
};

async function trustedAsset(relativePath, manifest) {
  const entry = manifest.files[relativePath];
  if (!entry) throw new Error('В манифесте отсутствует обязательный локальный ресурс.');
  const buffer = await readFile(path.join(ROOT,relativePath));
  if (sha256Hex(buffer) !== entry.sha256) throw new Error('Контрольная сумма локального ресурса не совпала.');
  return buffer;
}

function fontCss(fontId, cyrillic, latin) {
  const name = FONT_NAMES[fontId];
  return `@font-face{font-family:"Lieflat Embedded";src:url(data:font/woff2;base64,${cyrillic.toString('base64')}) format("woff2");font-style:normal;font-weight:100 900;font-display:block;unicode-range:U+0400-052F,U+2DE0-2DFF,U+A640-A69F,U+1C80-1C8F}\n@font-face{font-family:"Lieflat Embedded";src:url(data:font/woff2;base64,${latin.toString('base64')}) format("woff2");font-style:normal;font-weight:100 900;font-display:block;unicode-range:U+0000-024F}\n:root{--paper:#F0EFEB;--ink:#1C1C1A;--muted:#777771;--grid:#CDCBC3;color-scheme:light;font-family:"Lieflat Embedded",sans-serif;background:var(--paper);color:var(--ink)}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink)}body{font-family:"Lieflat Embedded",sans-serif}.page{width:min(1180px,100%);min-height:100vh;margin:0 auto;padding:clamp(28px,5vw,72px)}.header{position:relative}.eyebrow,.template-id,.source,.note{font-size:12px;line-height:1.5;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.title,.subtitle,.source,.note,.section-title,.section-text,.kpi-label,.kpi-value{overflow-wrap:anywhere}.title{max-width:980px;margin:8px 0 10px;font-family:"Lieflat Embedded",serif;font-size:clamp(34px,6vw,78px);font-weight:680;line-height:.98;letter-spacing:-.035em}.subtitle{max-width:780px;margin:0;color:var(--muted);font-size:clamp(16px,2vw,22px);line-height:1.45}.template-id{margin-top:14px;text-align:left}.chart{width:100%;height:min(68vh,720px);min-height:430px;margin:28px 0 22px;border-top:1px solid var(--grid);border-bottom:1px solid var(--grid);overflow:hidden}.footer{display:flex;justify-content:space-between;gap:24px;border-top:1px solid var(--grid);padding-top:14px}.note{text-transform:none;letter-spacing:0;max-width:620px}.fatal{max-width:620px;margin:20vh auto;font-size:20px;line-height:1.5}.report{max-width:1080px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;margin:34px 0;background:var(--grid);border:1px solid var(--grid)}.kpi{background:var(--paper);padding:22px}.kpi-value{font-size:clamp(30px,4vw,52px);font-weight:700;line-height:1}.kpi-label{margin-top:10px;color:var(--muted);font-size:13px}.sections{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:26px;margin:34px 0}.section-copy{border-top:2px solid var(--ink);padding-top:14px}.section-title{margin:0 0 8px;font-size:20px}.section-text{margin:0;color:var(--muted);line-height:1.6;white-space:pre-wrap}.report-charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:36px 0}.report-chart{height:320px;border:1px solid var(--grid);overflow:hidden}@media(max-width:700px){.page{padding:24px}.chart{min-height:360px}.footer{display:block}.report-charts{grid-template-columns:1fr}.report-chart{height:300px}}@media print{.page{width:100%;padding:18mm}.chart{height:150mm}.report-chart{break-inside:avoid}}/* ${name} embedded locally */`;
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

export async function buildCanonicalHtml(spec) {
  const catalog = await loadCatalog();
  const template = validateSpec(spec,catalog);
  const manifest = await loadManifest();
  const echarts = (await trustedAsset('vendor/echarts/echarts-6.1.0.min.js',manifest)).toString('utf8');
  const runtime = await readFile(path.join(ROOT,'scripts/runtime.js'),'utf8');
  const cyrillic = await trustedAsset(`vendor/fonts/${template.font}/cyrillic.woff2`,manifest);
  const latin = await trustedAsset(`vendor/fonts/${template.font}/latin.woff2`,manifest);
  const css = fontCss(template.font,cyrillic,latin);
  const data = Buffer.from(stableStringify({spec,template}),'utf8').toString('base64');
  let mapBlock = '';
  if (template.profile === 'map') {
    const mapPath = template.kind === 'map-usa' ? 'vendor/geo/usa.json' : 'vendor/geo/world.json';
    const mapData = await trustedAsset(mapPath,manifest);
    mapBlock = `<script id="lieflat-map" type="application/octet-stream">${mapData.toString('base64')}</script>\n`;
  }
  const csp = buildContentSecurityPolicy(echarts,runtime);
  return `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="referrer" content="no-referrer">\n<title>Lieflat Charts</title>\n<style>${css}</style>\n</head>\n<body>\n<div id="lieflat-root" class="page"><noscript>Для отображения графика требуется локальное выполнение JavaScript.</noscript></div>\n<script id="lieflat-data" type="application/octet-stream">${data}</script>\n${mapBlock}<script>${echarts}</script>\n<script>${runtime}</script>\n</body>\n</html>\n`;
}
