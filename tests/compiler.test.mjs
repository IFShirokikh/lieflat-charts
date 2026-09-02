import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildFile, buildHtml} from '../scripts/build-offline.mjs';
import {loadCatalog} from '../scripts/lib/core.mjs';
import {validateOutputHtml} from '../scripts/lib/output-validation.mjs';
import {validateSpec, SpecValidationError} from '../scripts/lib/validation.mjs';
import {sampleSpec, clone} from './helpers.mjs';

test('все 76 технических ID собираются в самодостаточный HTML', async () => {
  const catalog = await loadCatalog();
  assert.equal(catalog.size,76);
  for (const template of catalog.values()) {
    const html = await buildHtml(sampleSpec(template));
    const result = await validateOutputHtml(html);
    assert.equal(result.templateId,template.id);
    assert.match(html,/<html lang="ru"/u);
    assert.doesNotMatch(html,/(?:src|href)=["']https?:/iu);
  }
});

test('одинаковая спецификация даёт побайтово одинаковый HTML', async () => {
  const template = (await loadCatalog()).get('F1');
  const first = await buildHtml(sampleSpec(template));
  const second = await buildHtml(clone(sampleSpec(template)));
  assert.equal(first,second);
});

test('XSS, URL и обработчики событий отклоняются без вывода значений', async () => {
  const catalog = await loadCatalog();
  const attacks = ['</script><script>alert(1)</script>','<svg onload=alert(1)>','javascript:alert(1)','https://example.invalid/collect','onerror = alert(1)'];
  for (const attack of attacks) {
    const spec = sampleSpec(catalog.get('F1'));
    spec.content.title = attack;
    assert.throws(() => validateSpec(spec,catalog),error => error instanceof SpecValidationError && !error.message.includes(attack));
  }
  const fields = [
    spec => { spec.content.subtitle = '</style><img src=x>'; },
    spec => { spec.content.source = 'data:text/html,boom'; },
    spec => { spec.payload.categories[0] = '<b>категория</b>'; },
    spec => { spec.payload.series[0].name = 'www.example.invalid'; }
  ];
  for (const mutate of fields) {
    const spec = sampleSpec(catalog.get('F1'));
    mutate(spec);
    assert.throws(() => validateSpec(spec,catalog),SpecValidationError);
  }
});

test('опасные и лишние поля запрещены', async () => {
  const catalog = await loadCatalog();
  const spec = sampleSpec(catalog.get('F1'));
  spec.payload.options = {formatter:'код'};
  assert.throws(() => validateSpec(spec,catalog),SpecValidationError);
  const polluted = JSON.parse('{"version":1,"templateId":"F1","locale":"ru","palette":"mono","content":{"title":"Тест"},"payload":{"categories":["А"],"series":[{"name":"Ряд","values":[1]}],"__proto__":{"polluted":true}}}');
  assert.throws(() => validateSpec(polluted,catalog),SpecValidationError);
});

test('custom-палитра принимает только #RRGGBB', async () => {
  const catalog = await loadCatalog();
  const valid = sampleSpec(catalog.get('F1'));
  valid.palette = {name:'custom',colors:['#112233','#AABBCC']};
  assert.doesNotThrow(() => validateSpec(valid,catalog));
  const invalid = clone(valid);
  invalid.palette.colors[0] = 'rgb(1,2,3)';
  assert.throws(() => validateSpec(invalid,catalog),SpecValidationError);
});

test('валидатор замечает подмену runtime и CSP', async () => {
  const html = await buildHtml(sampleSpec((await loadCatalog()).get('F1')));
  await assert.rejects(() => validateOutputHtml(html.replace('connect-src \'none\'','connect-src data:')),/CSP/u);
  await assert.rejects(() => validateOutputHtml(html.replace("'use strict';","'use strict';console.log('x');")),/CSP|хеш|рендерер/u);
});

test('CLI пишет результат атомарно и не оставляет файл при ошибке', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(),'lieflat-cli-'));
  const input = path.join(directory,'input.json');
  const output = path.join(directory,'output.html');
  await writeFile(input,JSON.stringify(sampleSpec((await loadCatalog()).get('F1'))),'utf8');
  await buildFile(input,output);
  assert.match(await readFile(output,'utf8'),/Content-Security-Policy/u);
  await writeFile(input,'{"bad":true}','utf8');
  await assert.rejects(() => buildFile(input,path.join(directory,'broken.html')));
  await assert.rejects(() => readFile(path.join(directory,'broken.html'),'utf8'));
});
