import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../scripts/lib/core.mjs';

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    if (['.git','vendor','node_modules'].includes(entry.name)) continue;
    const full = path.join(directory,entry.name);
    if (entry.isDirectory()) result.push(...await files(full));
    else result.push(full);
  }
  return result;
}

test('нет английских и китайских вариантов пользовательских HTML', async () => {
  const all = await files(ROOT);
  for (const file of all) {
    const relative = path.relative(ROOT,file);
    assert.doesNotMatch(relative,/(?:\.en|\.zh)\.html$/u);
    assert.notEqual(relative,'README.en.md');
  }
});

test('в русских инструкциях и каталоге нет иероглифов', async () => {
  for (const relative of ['README.md','SKILL.md','catalog.md','report-catalog.md','agents/openai.yaml','templates/catalog.ru.json','references/spec-v1.md','references/threat-model.md','references/glossary.ru.md','references/vendor-update.md']) {
    const text = await readFile(path.join(ROOT,relative),'utf8');
    assert.doesNotMatch(text,/\p{Script=Han}/u,relative);
  }
});
