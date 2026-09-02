#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from './lib/core.mjs';

try {
  const text = await readFile(path.join(ROOT,'SKILL.md'),'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n/u);
  if (!match) throw new Error('В SKILL.md отсутствует YAML-frontmatter.');
  const name = match[1].match(/^name:\s*(.+)$/mu)?.[1]?.trim();
  const description = match[1].match(/^description:\s*(.+)$/mu)?.[1]?.trim();
  if (name !== 'lieflat-charts') throw new Error('Имя скилла должно оставаться lieflat-charts.');
  if (!description || description.length > 1024) throw new Error('Некорректное описание скилла.');
  if (text.split('\n').length > 500) throw new Error('SKILL.md превышает 500 строк.');
  if (/TODO|PLACEHOLDER|https?:\/\//u.test(text)) throw new Error('SKILL.md содержит незавершённый или сетевой фрагмент.');
  process.stdout.write('SKILL.md прошёл быструю проверку.\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
