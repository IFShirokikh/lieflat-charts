#!/usr/bin/env node
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from './lib/core.mjs';

const files = ['README.md','SKILL.md','catalog.md','report-catalog.md','agents/openai.yaml','templates/catalog.ru.json','references/spec-v1.md','references/threat-model.md','references/glossary.ru.md','references/vendor-update.md'];
try {
  for (const relative of files) {
    const text = await readFile(path.join(ROOT,relative),'utf8');
    if (/\p{Script=Han}/u.test(text)) throw new Error(`Найдены иероглифы: ${relative}`);
  }
  const names = await readdir(ROOT,{recursive:true});
  const forbidden = names.find(name => /(?:\.en|\.zh)\.html$/u.test(name) || name === 'README.en.md');
  if (forbidden) throw new Error(`Найден языковой вариант, отличный от русского: ${forbidden}`);
  process.stdout.write('Русская локализация прошла проверку.\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
