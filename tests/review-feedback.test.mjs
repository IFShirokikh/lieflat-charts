import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {buildHtml} from '../scripts/build-offline.mjs';
import {loadCatalog, stableStringify} from '../scripts/lib/core.mjs';
import {validateOutputHtml} from '../scripts/lib/output-validation.mjs';
import {SpecValidationError, validateSpec} from '../scripts/lib/validation.mjs';
import {clone, sampleSpec} from './helpers.mjs';

class FakeNode {
  constructor() {
    this.children = [];
    this.classList = {add:() => {}};
    this.style = {setProperty:() => {}};
    this.dataset = {};
    this.textContent = '';
  }

  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
}

async function captureOptions(spec, template) {
  const runtime = await readFile(new URL('../scripts/runtime.js',import.meta.url),'utf8');
  const data = Buffer.from(stableStringify({spec,template}),'utf8').toString('base64');
  const root = new FakeNode();
  const documentElement = new FakeNode();
  const options = [];
  const context = {
    atob:value => Buffer.from(value,'base64').toString('binary'),
    TextDecoder,
    Uint8Array,
    document:{
      documentElement,
      title:'',
      createElement:() => new FakeNode(),
      getElementById:id => id === 'lieflat-data' ? {textContent:data} : id === 'lieflat-root' ? root : null
    },
    window:{addEventListener:() => {}},
    echarts:{
      init:() => ({setOption:option => options.push(option),resize:() => {}}),
      registerMap:() => {}
    },
    console:{error:() => {}}
  };
  vm.runInNewContext(runtime,context);
  assert.equal(documentElement.dataset.lieflatReady,'true');
  return JSON.parse(JSON.stringify(options));
}

test('валидатор требует полную каноническую CSP', async () => {
  const catalog = await loadCatalog();
  const html = await buildHtml(sampleSpec(catalog.get('F1')));
  const weakened = html
    .replace('img-src data:','img-src http:')
    .replace('</body>','<img srcset="http&#58;//127.0.0.1:9/утечка"></body>');
  await assert.rejects(() => validateOutputHtml(weakened),/CSP/u);
  await assert.rejects(() => validateOutputHtml(html.replace('</head>','<meta http-equiv="refresh" content="0;url=&#104;ttp://127.0.0.1:9"></head>')),/meta/u);
  await assert.rejects(() => validateOutputHtml(html.replace('</head>','<meta http-equiv="re&#102;resh" content="0;url=&#104;ttp://127.0.0.1:9"></head>')),/meta/u);
});

test('Sankey отклоняет циклы, а обычный граф их принимает', async () => {
  const catalog = await loadCatalog();
  const sankey = sampleSpec(catalog.get('L12'));
  sankey.payload.links.push({source:'n2',target:'n1',value:1});
  assert.throws(() => validateSpec(sankey,catalog),error => error instanceof SpecValidationError && /ациклический/u.test(error.message));
  const graph = sampleSpec(catalog.get('L5'));
  graph.payload.links.push({source:'n2',target:'n1',value:1});
  assert.doesNotThrow(() => validateSpec(graph,catalog));
});

test('одно-серийные шаблоны и gauge не отбрасывают принятые данные', async () => {
  const catalog = await loadCatalog();
  for (const id of ['L13','L14','F4','F9','F13','G2','G4','G13']) {
    const spec = sampleSpec(catalog.get(id));
    spec.payload.series.push(clone(spec.payload.series[0]));
    assert.throws(() => validateSpec(spec,catalog),SpecValidationError);
  }
  const gauge = sampleSpec(catalog.get('F11'));
  assert.doesNotThrow(() => validateSpec(gauge,catalog));
  for (const value of [-1,101]) {
    const invalid = clone(gauge);
    invalid.payload.series[0].values[0] = value;
    assert.throws(() => validateSpec(invalid,catalog),SpecValidationError);
  }
});

test('календарные даты существуют и диапазон ограничен 732 днями', async () => {
  const catalog = await loadCatalog();
  for (const [id,field] of [['L17','calendar'],['F16','river'],['F17','ohlc']]) {
    const spec = sampleSpec(catalog.get(id));
    spec.payload[field][0].date = '2026-02-30';
    assert.throws(() => validateSpec(spec,catalog),error => error instanceof SpecValidationError && /несуществующая/u.test(error.message));
  }
  const leap = sampleSpec(catalog.get('L17'));
  leap.payload.calendar = [{date:'2024-02-29',value:1},{date:'2025-01-01',value:2}];
  assert.doesNotThrow(() => validateSpec(leap,catalog));
  const tooWide = clone(leap);
  tooWide.payload.calendar = [{date:'2024-01-01',value:1},{date:'2026-01-02',value:2}];
  assert.throws(() => validateSpec(tooWide,catalog),SpecValidationError);
});

test('runtime сохраняет семантику waterfall, heatmap, Sankey и календаря', async () => {
  const catalog = await loadCatalog();
  const waterfallTemplate = catalog.get('F9');
  const waterfall = (await captureOptions(sampleSpec(waterfallTemplate),waterfallTemplate))[0];
  assert.equal(waterfall.series[0].type,'custom');
  assert.deepEqual(waterfall.series[0].data.map(item => item.value),[
    ['Старт',0,10,10],
    ['Снижение',10,-10,-20],
    ['Рост',-10,5,15]
  ]);
  assert.deepEqual(waterfall.series[0].encode.tooltip,['Изменение']);

  const matrixTemplate = catalog.get('F10');
  const matrixSpec = sampleSpec(matrixTemplate);
  matrixSpec.payload.matrix.values[0].value = -100;
  matrixSpec.payload.matrix.values[1].value = -1;
  const heatmap = (await captureOptions(matrixSpec,matrixTemplate))[0];
  assert.equal(heatmap.visualMap.min,-100);
  assert.equal(heatmap.visualMap.max,9);

  const sankeyTemplate = catalog.get('B3');
  const sankeySpec = sampleSpec(sankeyTemplate);
  sankeySpec.payload.links[0].value = 0;
  const sankey = (await captureOptions(sankeySpec,sankeyTemplate))[0];
  assert.equal(sankey.series[0].links[0].value,0);

  const calendarTemplate = catalog.get('L17');
  const calendarSpec = sampleSpec(calendarTemplate);
  const calendar = (await captureOptions(calendarSpec,calendarTemplate))[0];
  assert.deepEqual(calendar.calendar.range,['2025-12-31','2026-01-02']);
});

test('JSON Schema назначает строгий payload-профиль каждому templateId', async () => {
  const catalog = await loadCatalog();
  const schema = JSON.parse(await readFile(new URL('../schemas/spec-v1.schema.json',import.meta.url),'utf8'));
  const assignments = new Map();
  for (const rule of schema.allOf) {
    const selector = rule.if.properties.templateId;
    const ids = selector.enum || [selector.const];
    const reference = rule.then.properties.payload.$ref;
    assert.match(reference,/^#\/\$defs\/[A-Za-z]+Payload$/u);
    for (const id of ids) {
      assert.equal(assignments.has(id),false,`${id} назначен нескольким профилям`);
      assignments.set(id,reference);
    }
  }
  assert.deepEqual([...assignments.keys()].sort(),[...catalog.keys()].sort());
  assert.equal(schema.$defs.seriesPayload.additionalProperties,false);
  assert.equal(schema.$defs.networkPayload.additionalProperties,false);
  assert.equal(schema.$defs.reportPayload.additionalProperties,false);
  const eventPattern = schema.$defs.text.allOf.map(rule => rule.not?.pattern).find(pattern => pattern?.includes('[Oo][Nn]'));
  assert.equal(new RegExp(eventPattern,'u').test('conversion=42'),false);
  assert.equal(new RegExp(eventPattern,'u').test('onerror=alert'),true);
});
