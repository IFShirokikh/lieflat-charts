export function sampleSpec(template) {
  const base = {
    version:1,
    templateId:template.id,
    locale:'ru',
    palette:'mono',
    content:{title:`Проверка шаблона ${template.id}`,subtitle:'Длинная русская подпись для проверки переноса строк',source:'Тестовый набор'},
    payload:{}
  };
  if (template.profile === 'series') base.payload = {categories:['Первая категория','Вторая категория','Третья категория'],series:[{name:'Значение',values:[12,28,19]},{name:'Сравнение',values:[9,22,24]}]};
  if (['pie','funnel','treemap'].includes(template.kind)) base.payload.series = [base.payload.series[0]];
  if (template.kind === 'waterfall') base.payload = {categories:['Старт','Снижение','Рост'],series:[{name:'Изменение',values:[100,-20,30]}]};
  if (template.kind === 'gauge') base.payload = {categories:['Выполнение'],series:[{name:'Прогресс',values:[72]}]};
  if (template.profile === 'points') base.payload = {points:[{name:'Объект один',x:1,y:4,value:12},{name:'Объект два',x:3,y:2,value:18},{name:'Объект три',x:5,y:6,value:9}]};
  if (template.profile === 'matrix') base.payload = {matrix:{x:['Версия 1','Версия 2'],y:['Сегмент А','Сегмент Б'],values:[{x:'Версия 1',y:'Сегмент А',value:-4},{x:'Версия 2',y:'Сегмент А',value:-1},{x:'Версия 1',y:'Сегмент Б',value:3},{x:'Версия 2',y:'Сегмент Б',value:9}]}};
  if (template.profile === 'network') base.payload = {nodes:[{id:'n1',name:'Центр',value:8},{id:'n2',name:'Команда А',value:4},{id:'n3',name:'Команда Б',value:6}],links:[{source:'n1',target:'n2',value:3},{source:'n1',target:'n3',value:5}]};
  if (template.kind === 'sankey') base.payload.links[0].value = 0;
  if (template.profile === 'boxplot') base.payload = {categories:['Базовый','Командный'],boxes:[[1,3,5,7,9],[2,4,6,8,11]]};
  if (template.profile === 'parallel') base.payload = {dimensions:['Скорость','Качество','Охват'],rows:[{name:'Продукт А',values:[4,8,6]},{name:'Продукт Б',values:[7,6,9]}]};
  if (template.profile === 'ohlc') base.payload = {ohlc:[{date:'2026-08-01',open:10,close:12,low:9,high:13},{date:'2026-08-02',open:12,close:11,low:10,high:14}]};
  if (template.profile === 'calendar') base.payload = {calendar:[{date:'2025-12-31',value:4},{date:'2026-01-01',value:8},{date:'2026-01-02',value:2}]};
  if (template.profile === 'river') base.payload = {river:[{date:'2026-01-01',name:'Продукт А',value:4},{date:'2026-01-01',name:'Продукт Б',value:2},{date:'2026-02-01',name:'Продукт А',value:5},{date:'2026-02-01',name:'Продукт Б',value:4}]};
  if (template.profile === 'map') base.payload = {regions:[{name:template.kind === 'map-usa' ? 'California' : 'Russia',value:42},{name:template.kind === 'map-usa' ? 'Texas' : 'Germany',value:28}]};
  if (template.profile === 'report') base.payload = {kpis:[{label:'Активные пользователи',value:'12 400'},{label:'Рост',value:'+18%'}],sections:[{title:'Главный вывод',text:'Показатель растёт третью неделю подряд без ухудшения качества.'}],categories:['Неделя 1','Неделя 2','Неделя 3'],series:[{name:'Значение',values:[12,18,24]},{name:'План',values:[15,19,22]}]};
  return base;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
