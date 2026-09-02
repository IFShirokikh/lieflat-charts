const MAX_NUMBER = 1e15;
const MAX_TOTAL_NODES = 50000;
const MAX_DEPTH = 12;
const FORBIDDEN_KEYS = new Set(['__proto__','prototype','constructor']);
const FORBIDDEN_STRING_PATTERNS = [
  {pattern:/<\s*\/?\s*[a-z!][^>]*>/iu, reason:'HTML и SVG-разметка запрещены'},
  {pattern:/\b(?:on[a-z]+)\s*=/iu, reason:'обработчики событий запрещены'},
  {pattern:/(?:https?|ftp|file|data|javascript|vbscript|blob|mailto|tel):/iu, reason:'URL и URI-схемы запрещены'},
  {pattern:/(?:^|\s)\/\/[a-z0-9]/iu, reason:'сетевые адреса запрещены'},
  {pattern:/\bwww\.[a-z0-9]/iu, reason:'сетевые адреса запрещены'},
  {pattern:/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u, reason:'управляющие символы запрещены'}
];

export class SpecValidationError extends Error {
  constructor(path, reason) {
    super(`Ошибка спецификации в ${path}: ${reason}`);
    this.name = 'SpecValidationError';
  }
}

function fail(path, reason) {
  throw new SpecValidationError(path, reason);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function object(value, path) {
  if (!isPlainObject(value)) fail(path,'ожидался объект');
  return value;
}

function array(value, path, minimum = 1, maximum = 5000) {
  if (!Array.isArray(value)) fail(path,'ожидался массив');
  if (value.length < minimum || value.length > maximum) fail(path,`допустимо от ${minimum} до ${maximum} элементов`);
  return value;
}

function string(value, path, minimum = 1, maximum = 5000) {
  if (typeof value !== 'string') fail(path,'ожидалась строка');
  if (value.length < minimum || value.length > maximum) fail(path,`допустимо от ${minimum} до ${maximum} символов`);
  return value;
}

function number(value, path, {minimum = -MAX_NUMBER, maximum = MAX_NUMBER} = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path,'ожидалось конечное число');
  if (value < minimum || value > maximum) fail(path,`число должно быть в диапазоне от ${minimum} до ${maximum}`);
  return value;
}

function allowedKeys(value, allowed, path) {
  object(value,path);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key) || !allowed.includes(key)) fail(`${path}.${key}`,'поле не разрешено');
  }
}

function requiredKeys(value, required, path) {
  for (const key of required) if (!Object.hasOwn(value,key)) fail(`${path}.${key}`,'обязательное поле отсутствует');
}

function safeTree(value, path = '$', depth = 0, state = {nodes:0}) {
  state.nodes += 1;
  if (state.nodes > MAX_TOTAL_NODES) fail('$','спецификация слишком велика');
  if (depth > MAX_DEPTH) fail(path,'превышена допустимая глубина');
  if (typeof value === 'string') {
    for (const item of FORBIDDEN_STRING_PATTERNS) if (item.pattern.test(value)) fail(path,item.reason);
    return;
  }
  if (typeof value === 'number') {
    number(value,path);
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    if (value.length > 5000) fail(path,'слишком много элементов');
    value.forEach((item,index) => safeTree(item,`${path}[${index}]`,depth + 1,state));
    return;
  }
  if (!isPlainObject(value)) fail(path,'недопустимый тип значения');
  for (const [key,item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail(`${path}.${key}`,'опасное имя поля запрещено');
    safeTree(item,`${path}.${key}`,depth + 1,state);
  }
}

function validateContent(content) {
  allowedKeys(content,['title','subtitle','source','note','eyebrow','period'],'$.content');
  requiredKeys(content,['title'],'$.content');
  string(content.title,'$.content.title',1,240);
  for (const [key,maximum] of [['subtitle',500],['source',300],['note',1000],['eyebrow',120],['period',120]]) {
    if (content[key] !== undefined) string(content[key],`$.content.${key}`,0,maximum);
  }
}

function validatePalette(palette) {
  if (typeof palette === 'string') {
    if (!['mono','palm','porcelain','wire'].includes(palette)) fail('$.palette','неизвестная палитра');
    return;
  }
  allowedKeys(palette,['name','colors'],'$.palette');
  requiredKeys(palette,['name','colors'],'$.palette');
  if (palette.name !== 'custom') fail('$.palette.name','ожидалось значение custom');
  array(palette.colors,'$.palette.colors',2,8).forEach((color,index) => {
    if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) fail(`$.palette.colors[${index}]`,'цвет должен иметь формат #RRGGBB');
  });
}

function validateSeries(payload, templateOrOptions = {}) {
  const optional = templateOrOptions.optional === true;
  const template = templateOrOptions.id ? templateOrOptions : undefined;
  if (optional && payload.series === undefined) return;
  const categories = array(payload.categories,'$.payload.categories',1,500);
  categories.forEach((item,index) => string(item,`$.payload.categories[${index}]`,1,160));
  const singleSeries = template && ['pie','funnel','treemap','waterfall','gauge'].includes(template.kind);
  const series = array(payload.series,'$.payload.series',1,singleSeries ? 1 : 20);
  series.forEach((item,index) => {
    allowedKeys(item,['name','values'],`$.payload.series[${index}]`);
    requiredKeys(item,['name','values'],`$.payload.series[${index}]`);
    string(item.name,`$.payload.series[${index}].name`,1,160);
    const values = array(item.values,`$.payload.series[${index}].values`,categories.length,categories.length);
    values.forEach((value,valueIndex) => number(value,`$.payload.series[${index}].values[${valueIndex}]`));
  });
  if (template?.kind === 'gauge') {
    if (categories.length !== 1 || series[0].values.length !== 1) fail('$.payload','шкала прогресса принимает одну категорию и одно значение');
    number(series[0].values[0],'$.payload.series[0].values[0]',{minimum:0,maximum:100});
  }
}

function validatePoints(payload) {
  array(payload.points,'$.payload.points',1,2000).forEach((item,index) => {
    allowedKeys(item,['name','x','y','value'],`$.payload.points[${index}]`);
    requiredKeys(item,['name','x','y'],`$.payload.points[${index}]`);
    string(item.name,`$.payload.points[${index}].name`,1,160);
    number(item.x,`$.payload.points[${index}].x`);
    number(item.y,`$.payload.points[${index}].y`);
    if (item.value !== undefined) number(item.value,`$.payload.points[${index}].value`,{minimum:0});
  });
}

function validateMatrix(payload) {
  const matrix = object(payload.matrix,'$.payload.matrix');
  allowedKeys(matrix,['x','y','values'],'$.payload.matrix');
  requiredKeys(matrix,['x','y','values'],'$.payload.matrix');
  const xs = array(matrix.x,'$.payload.matrix.x',1,100);
  const ys = array(matrix.y,'$.payload.matrix.y',1,100);
  xs.forEach((item,index) => string(item,`$.payload.matrix.x[${index}]`,1,160));
  ys.forEach((item,index) => string(item,`$.payload.matrix.y[${index}]`,1,160));
  array(matrix.values,'$.payload.matrix.values',1,Math.min(5000,xs.length * ys.length)).forEach((item,index) => {
    allowedKeys(item,['x','y','value'],`$.payload.matrix.values[${index}]`);
    requiredKeys(item,['x','y','value'],`$.payload.matrix.values[${index}]`);
    if (!xs.includes(item.x)) fail(`$.payload.matrix.values[${index}].x`,'категория отсутствует в matrix.x');
    if (!ys.includes(item.y)) fail(`$.payload.matrix.values[${index}].y`,'категория отсутствует в matrix.y');
    number(item.value,`$.payload.matrix.values[${index}].value`);
  });
}

function validateNetwork(payload, template) {
  const identifiers = new Set();
  array(payload.nodes,'$.payload.nodes',1,500).forEach((item,index) => {
    allowedKeys(item,['id','name','value'],`$.payload.nodes[${index}]`);
    requiredKeys(item,['id','name'],'$.payload.nodes');
    string(item.id,`$.payload.nodes[${index}].id`,1,120);
    string(item.name,`$.payload.nodes[${index}].name`,1,160);
    if (identifiers.has(item.id)) fail(`$.payload.nodes[${index}].id`,'ID должен быть уникальным');
    identifiers.add(item.id);
    if (item.value !== undefined) number(item.value,`$.payload.nodes[${index}].value`,{minimum:0});
  });
  const links = array(payload.links,'$.payload.links',0,2000);
  links.forEach((item,index) => {
    allowedKeys(item,['source','target','value'],`$.payload.links[${index}]`);
    requiredKeys(item,['source','target'],`$.payload.links[${index}]`);
    if (!identifiers.has(item.source)) fail(`$.payload.links[${index}].source`,'узел не найден');
    if (!identifiers.has(item.target)) fail(`$.payload.links[${index}].target`,'узел не найден');
    if (item.value !== undefined) number(item.value,`$.payload.links[${index}].value`,{minimum:0});
  });
  if (template?.kind === 'sankey') {
    const outgoing = new Map([...identifiers].map(id => [id,[]]));
    const indegree = new Map([...identifiers].map(id => [id,0]));
    for (const link of links) {
      outgoing.get(link.source).push(link.target);
      indegree.set(link.target,indegree.get(link.target) + 1);
    }
    const queue = [...identifiers].filter(id => indegree.get(id) === 0);
    let visited = 0;
    while (queue.length) {
      const source = queue.pop();
      visited += 1;
      for (const target of outgoing.get(source)) {
        const next = indegree.get(target) - 1;
        indegree.set(target,next);
        if (next === 0) queue.push(target);
      }
    }
    if (visited !== identifiers.size) fail('$.payload.links','Sankey-связи должны образовывать направленный ациклический граф');
  }
}

function validateBoxes(payload) {
  const categories = array(payload.categories,'$.payload.categories',1,100);
  categories.forEach((item,index) => string(item,`$.payload.categories[${index}]`,1,160));
  array(payload.boxes,'$.payload.boxes',categories.length,categories.length).forEach((box,index) => {
    array(box,`$.payload.boxes[${index}]`,5,5).forEach((value,valueIndex) => number(value,`$.payload.boxes[${index}][${valueIndex}]`));
    for (let valueIndex = 1; valueIndex < box.length; valueIndex += 1) if (box[valueIndex] < box[valueIndex - 1]) fail(`$.payload.boxes[${index}]`,'пять чисел должны идти по возрастанию');
  });
}

function validateParallel(payload) {
  const dimensions = array(payload.dimensions,'$.payload.dimensions',3,6);
  dimensions.forEach((item,index) => string(item,`$.payload.dimensions[${index}]`,1,120));
  array(payload.rows,'$.payload.rows',1,200).forEach((row,index) => {
    allowedKeys(row,['name','values'],`$.payload.rows[${index}]`);
    requiredKeys(row,['name','values'],`$.payload.rows[${index}]`);
    string(row.name,`$.payload.rows[${index}].name`,1,160);
    array(row.values,`$.payload.rows[${index}].values`,dimensions.length,dimensions.length).forEach((value,valueIndex) => number(value,`$.payload.rows[${index}].values[${valueIndex}]`));
  });
}

function validDate(value, path) {
  string(value,path,10,10);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) fail(path,'дата должна иметь формат YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) fail(path,'указана несуществующая календарная дата');
}

function validateOhlc(payload) {
  array(payload.ohlc,'$.payload.ohlc',1,1000).forEach((item,index) => {
    allowedKeys(item,['date','open','close','low','high'],`$.payload.ohlc[${index}]`);
    requiredKeys(item,['date','open','close','low','high'],`$.payload.ohlc[${index}]`);
    validDate(item.date,`$.payload.ohlc[${index}].date`);
    for (const key of ['open','close','low','high']) number(item[key],`$.payload.ohlc[${index}].${key}`);
    if (item.low > Math.min(item.open,item.close) || item.high < Math.max(item.open,item.close) || item.low > item.high) fail(`$.payload.ohlc[${index}]`,'нарушен порядок OHLC');
  });
}

function validateCalendar(payload) {
  const dates = [];
  array(payload.calendar,'$.payload.calendar',1,732).forEach((item,index) => {
    allowedKeys(item,['date','value'],`$.payload.calendar[${index}]`);
    requiredKeys(item,['date','value'],`$.payload.calendar[${index}]`);
    validDate(item.date,`$.payload.calendar[${index}].date`);
    dates.push(item.date);
    number(item.value,`$.payload.calendar[${index}].value`,{minimum:0});
  });
  dates.sort();
  const span = (Date.parse(`${dates.at(-1)}T00:00:00Z`) - Date.parse(`${dates[0]}T00:00:00Z`)) / 86400000;
  if (span > 731) fail('$.payload.calendar','календарный диапазон не должен превышать 732 дня');
}

function validateRiver(payload) {
  array(payload.river,'$.payload.river',1,5000).forEach((item,index) => {
    allowedKeys(item,['date','name','value'],`$.payload.river[${index}]`);
    requiredKeys(item,['date','name','value'],`$.payload.river[${index}]`);
    validDate(item.date,`$.payload.river[${index}].date`);
    string(item.name,`$.payload.river[${index}].name`,1,160);
    number(item.value,`$.payload.river[${index}].value`,{minimum:0});
  });
}

function validateMap(payload) {
  array(payload.regions,'$.payload.regions',1,500).forEach((item,index) => {
    allowedKeys(item,['name','value'],`$.payload.regions[${index}]`);
    requiredKeys(item,['name','value'],`$.payload.regions[${index}]`);
    string(item.name,`$.payload.regions[${index}].name`,1,160);
    number(item.value,`$.payload.regions[${index}].value`,{minimum:0});
  });
}

function validateReport(payload) {
  if (!payload.kpis && !payload.sections && !payload.series) fail('$.payload','отчёт должен содержать kpis, sections или series');
  if (payload.kpis) array(payload.kpis,'$.payload.kpis',1,8).forEach((item,index) => {
    allowedKeys(item,['label','value'],`$.payload.kpis[${index}]`);
    requiredKeys(item,['label','value'],`$.payload.kpis[${index}]`);
    string(item.label,`$.payload.kpis[${index}].label`,1,160);
    string(item.value,`$.payload.kpis[${index}].value`,1,120);
  });
  if (payload.sections) array(payload.sections,'$.payload.sections',1,12).forEach((item,index) => {
    allowedKeys(item,['title','text'],`$.payload.sections[${index}]`);
    requiredKeys(item,['title','text'],`$.payload.sections[${index}]`);
    string(item.title,`$.payload.sections[${index}].title`,1,200);
    string(item.text,`$.payload.sections[${index}].text`,1,3000);
  });
  validateSeries(payload,{optional:true});
}

const PAYLOAD_KEYS = ['categories','series','points','matrix','nodes','links','boxes','dimensions','rows','ohlc','calendar','river','regions','kpis','sections'];

export function validateSpec(spec, catalog) {
  object(spec,'$');
  allowedKeys(spec,['version','templateId','locale','palette','content','payload'],'$');
  requiredKeys(spec,['version','templateId','locale','palette','content','payload'],'$');
  safeTree(spec);
  if (spec.version !== 1) fail('$.version','поддерживается только версия 1');
  if (spec.locale !== 'ru') fail('$.locale','поддерживается только русская локаль ru');
  string(spec.templateId,'$.templateId',2,3);
  const template = catalog.get(spec.templateId);
  if (!template) fail('$.templateId','неизвестный ID шаблона');
  validatePalette(spec.palette);
  validateContent(spec.content);
  allowedKeys(spec.payload,PAYLOAD_KEYS,'$.payload');
  const validators = {series:validateSeries,points:validatePoints,matrix:validateMatrix,network:validateNetwork,boxplot:validateBoxes,parallel:validateParallel,ohlc:validateOhlc,calendar:validateCalendar,river:validateRiver,map:validateMap,report:validateReport};
  validators[template.profile](spec.payload,template);
  return template;
}
