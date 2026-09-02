(() => {
  'use strict';

  const PALETTES = {
    mono: {paper:'#F0EFEB', ink:'#1C1C1A', muted:'#777771', grid:'#CDCBC3', colors:['#1C1C1A','#555550','#8E8D87','#B9B7AF']},
    palm: {paper:'#F2ECDD', ink:'#173B2C', muted:'#5E766B', grid:'#C9C4B3', colors:['#173B2C','#4F7A62','#B87544','#D8B56D','#7D5340']},
    porcelain: {paper:'#F5F1EA', ink:'#203247', muted:'#6D7885', grid:'#CDD2D6', colors:['#203247','#51759C','#8DA9C0','#B36A5E','#D1A36F']},
    wire: {paper:'#ECEBE7', ink:'#26272A', muted:'#727377', grid:'#C5C5C2', colors:['#26272A','#62646B','#967D69','#B5A58F','#858B92']}
  };

  function decodeBlock(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error('missing-block');
    const binary = atob(node.textContent.trim());
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function paletteFor(value) {
    if (typeof value === 'string') return PALETTES[value];
    return {paper:'#F0EFEB', ink:'#1C1C1A', muted:'#777771', grid:'#CDCBC3', colors:value.colors.slice()};
  }

  function applyPalette(palette) {
    const root = document.documentElement;
    root.style.setProperty('--paper', palette.paper);
    root.style.setProperty('--ink', palette.ink);
    root.style.setProperty('--muted', palette.muted);
    root.style.setProperty('--grid', palette.grid);
  }

  function baseOption(spec, palette) {
    return {
      animation:true,
      animationDuration:650,
      color:palette.colors,
      aria:{enabled:true},
      textStyle:{fontFamily:'Lieflat Embedded', color:palette.ink},
      tooltip:{trigger:'item', renderMode:'richText', confine:true, backgroundColor:palette.ink, borderWidth:0, textStyle:{color:palette.paper}},
      grid:{left:54, right:28, top:34, bottom:58, containLabel:true}
    };
  }

  function axes(spec, palette, horizontal = false) {
    const category = {type:'category', data:spec.payload.categories || [], axisLine:{lineStyle:{color:palette.grid}}, axisTick:{show:false}, axisLabel:{color:palette.ink, interval:0, hideOverlap:true}};
    const value = {type:'value', axisLine:{show:false}, axisTick:{show:false}, axisLabel:{color:palette.muted}, splitLine:{lineStyle:{color:palette.grid, type:'dashed'}}};
    return horizontal ? {xAxis:value, yAxis:category} : {xAxis:category, yAxis:value};
  }

  function seriesData(spec, type, extra = {}) {
    return (spec.payload.series || []).map((item, index) => ({
      name:item.name,
      type,
      data:item.values,
      symbol:'circle',
      symbolSize:7,
      smooth:type === 'line',
      emphasis:{focus:'series'},
      ...extra,
      z:index + 2
    }));
  }

  function buildSeriesOption(spec, template, palette) {
    const option = baseOption(spec, palette);
    const kind = template.kind;
    if (kind === 'pie') {
      option.legend = {bottom:0, textStyle:{color:palette.ink}};
      option.series = [{type:'pie', radius:['34%','70%'], roseType:template.family === 'glance' ? 'radius' : false, data:spec.payload.categories.map((name, index) => ({name, value:spec.payload.series[0].values[index]})), label:{color:palette.ink}, emphasis:{scale:true}}];
      return option;
    }
    if (kind === 'gauge') {
      option.series = [{type:'gauge', min:0, max:100, progress:{show:true, width:18}, axisLine:{lineStyle:{width:18, color:[[1,palette.grid]]}}, axisTick:{show:false}, splitLine:{show:false}, axisLabel:{show:false}, pointer:{show:false}, detail:{valueAnimation:true, formatter:'{value}%', color:palette.ink, fontSize:48}, data:[{value:spec.payload.series[0].values[0], name:spec.payload.categories[0]}]}];
      return option;
    }
    if (kind === 'funnel') {
      option.series = [{type:'funnel', left:'12%', width:'76%', sort:'descending', gap:3, label:{color:palette.ink}, data:spec.payload.categories.map((name,index) => ({name,value:spec.payload.series[0].values[index]}))}];
      return option;
    }
    if (kind === 'treemap') {
      option.series = [{type:'treemap', roam:false, breadcrumb:{show:false}, label:{show:true, color:palette.paper}, data:spec.payload.categories.map((name,index) => ({name,value:spec.payload.series[0].values[index]}))}];
      return option;
    }
    const horizontal = kind === 'bar-horizontal';
    Object.assign(option, axes(spec, palette, horizontal));
    option.legend = {bottom:0, textStyle:{color:palette.ink}};
    if (kind === 'area') option.series = seriesData(spec, 'line', {areaStyle:{opacity:0.24}, stack:null});
    else if (kind === 'bar-stacked') option.series = seriesData(spec, 'bar', {stack:'total', barMaxWidth:46});
    else if (kind === 'waterfall') {
      const source = spec.payload.series[0];
      let cumulative = 0;
      const baseline = [];
      const changes = source.values.map(value => {
        const previous = cumulative;
        cumulative += value;
        baseline.push(Math.min(previous,cumulative));
        return {value:Math.abs(value),itemStyle:{color:value < 0 ? palette.colors[2] || palette.muted : palette.colors[0]}};
      });
      option.series = [
        {name:'Основание',type:'bar',stack:'waterfall',silent:true,tooltip:{show:false},itemStyle:{color:'transparent'},emphasis:{disabled:true},data:baseline},
        {name:source.name,type:'bar',stack:'waterfall',barMaxWidth:54,data:changes}
      ];
    }
    else if (kind === 'line') option.series = seriesData(spec, 'line');
    else option.series = seriesData(spec, 'bar', {barMaxWidth:54, borderRadius:[3,3,0,0]});
    return option;
  }

  function buildPointsOption(spec, palette) {
    const option = baseOption(spec, palette);
    option.xAxis = {type:'value', splitLine:{lineStyle:{color:palette.grid, type:'dashed'}}, axisLabel:{color:palette.muted}};
    option.yAxis = {type:'value', splitLine:{lineStyle:{color:palette.grid, type:'dashed'}}, axisLabel:{color:palette.muted}};
    option.series = [{type:'scatter', symbolSize:value => Math.max(7, Math.min(34, Number(value[2] || 10))), data:spec.payload.points.map(point => ({name:point.name, value:[point.x, point.y, point.value || 10]})), label:{show:spec.payload.points.length <= 20, position:'top', formatter:'{b}', color:palette.ink}, emphasis:{focus:'self'}}];
    return option;
  }

  function buildMatrixOption(spec, palette) {
    const option = baseOption(spec, palette);
    const matrix = spec.payload.matrix;
    option.grid = {left:80,right:35,top:20,bottom:65,containLabel:true};
    option.xAxis = {type:'category', data:matrix.x, splitArea:{show:true}, axisLabel:{color:palette.ink, interval:0}};
    option.yAxis = {type:'category', data:matrix.y, splitArea:{show:true}, axisLabel:{color:palette.ink}};
    const values = matrix.values.map(item => [matrix.x.indexOf(item.x), matrix.y.indexOf(item.y), item.value]);
    const rawValues = values.map(item => item[2]);
    const minimum = Math.min(...rawValues);
    const rawMaximum = Math.max(...rawValues);
    const maximum = rawMaximum === minimum ? minimum + 1 : rawMaximum;
    option.visualMap = {min:minimum,max:maximum,calculable:false,orient:'horizontal',left:'center',bottom:0,inRange:{color:[palette.paper,...palette.colors.slice(0,3)]},textStyle:{color:palette.ink}};
    option.series = [{type:'heatmap',data:values,label:{show:values.length <= 60,color:palette.ink},emphasis:{itemStyle:{shadowBlur:8,shadowColor:palette.muted}}}];
    return option;
  }

  function buildNetworkOption(spec, template, palette) {
    const option = baseOption(spec, palette);
    if (template.kind === 'sankey') {
      option.series = [{type:'sankey', data:spec.payload.nodes.map(node => ({name:node.id, value:node.value, label:{formatter:node.name}})), links:spec.payload.links.map(link => ({source:link.source,target:link.target,value:link.value ?? 1})), nodeWidth:10, nodeGap:14, draggable:false, emphasis:{focus:'adjacency'}, lineStyle:{color:'gradient',curveness:0.5,opacity:0.45}, label:{color:palette.ink}}];
      return option;
    }
    option.series = [{type:'graph', layout:template.kind === 'graph-circular' ? 'circular' : 'force', circular:{rotateLabel:true}, force:{repulsion:170,edgeLength:[50,130]}, roam:true, draggable:true, data:spec.payload.nodes.map(node => ({id:node.id,name:node.name,value:node.value,symbolSize:Math.max(12,Math.min(46,12 + Number(node.value || 1)))})), links:spec.payload.links, label:{show:spec.payload.nodes.length <= 35,color:palette.ink}, lineStyle:{color:palette.muted,curveness:0.12,opacity:0.55}, emphasis:{focus:'adjacency'}}];
    return option;
  }

  function buildBoxplotOption(spec, palette) {
    const option = baseOption(spec, palette);
    Object.assign(option, axes(spec, palette));
    option.series = [{type:'boxplot',data:spec.payload.boxes,itemStyle:{borderColor:palette.ink,color:palette.paper}}];
    return option;
  }

  function buildParallelOption(spec, palette) {
    const option = baseOption(spec, palette);
    option.parallelAxis = spec.payload.dimensions.map((name,index) => ({dim:index,name,nameTextStyle:{color:palette.ink},axisLabel:{color:palette.muted},axisLine:{lineStyle:{color:palette.grid}}}));
    option.parallel = {left:70,right:60,bottom:50,top:35,parallelAxisDefault:{type:'value'}};
    option.series = [{type:'parallel',lineStyle:{width:2,opacity:0.6},data:spec.payload.rows.map(row => ({name:row.name,value:row.values}))}];
    return option;
  }

  function buildOhlcOption(spec, palette) {
    const option = baseOption(spec, palette);
    option.xAxis = {type:'category',data:spec.payload.ohlc.map(item => item.date),axisLabel:{color:palette.muted,hideOverlap:true}};
    option.yAxis = {scale:true,splitLine:{lineStyle:{color:palette.grid,type:'dashed'}},axisLabel:{color:palette.muted}};
    option.series = [{type:'candlestick',data:spec.payload.ohlc.map(item => [item.open,item.close,item.low,item.high]),itemStyle:{color:palette.colors[1] || palette.ink,color0:palette.paper,borderColor:palette.ink,borderColor0:palette.ink}}];
    return option;
  }

  function buildCalendarOption(spec, palette) {
    const option = baseOption(spec, palette);
    const values = spec.payload.calendar.map(item => [item.date,item.value]);
    const dates = values.map(item => item[0]).sort();
    const range = dates[0].slice(0,4) === dates.at(-1).slice(0,4) ? dates[0].slice(0,4) : [dates[0],dates.at(-1)];
    option.visualMap = {min:0,max:Math.max(1,...values.map(item => item[1])),show:false,inRange:{color:[palette.paper,...palette.colors.slice(0,3)]}};
    option.calendar = {range,cellSize:['auto',18],itemStyle:{borderWidth:2,borderColor:palette.paper},yearLabel:{color:palette.ink},dayLabel:{color:palette.muted,nameMap:['Вс','Пн','Вт','Ср','Чт','Пт','Сб']},monthLabel:{color:palette.muted,nameMap:['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']}};
    option.series = [{type:'heatmap',coordinateSystem:'calendar',data:values}];
    return option;
  }

  function buildRiverOption(spec, palette) {
    const option = baseOption(spec, palette);
    option.singleAxis = {type:'time',axisLabel:{color:palette.muted},axisLine:{lineStyle:{color:palette.grid}}};
    option.series = [{type:'themeRiver',emphasis:{focus:'series'},data:spec.payload.river.map(item => [item.date,item.value,item.name])}];
    return option;
  }

  function buildMapOption(spec, template, palette) {
    const mapName = template.kind === 'map-usa' ? 'lieflat-usa' : 'lieflat-world';
    const geo = JSON.parse(decodeBlock('lieflat-map'));
    echarts.registerMap(mapName, geo);
    const maximum = Math.max(1,...spec.payload.regions.map(item => item.value));
    const option = baseOption(spec, palette);
    option.visualMap = {min:0,max:maximum,left:'center',bottom:0,orient:'horizontal',inRange:{color:[palette.paper,...palette.colors.slice(0,3)]},textStyle:{color:palette.ink}};
    option.series = [{type:'map',map:mapName,roam:true,data:spec.payload.regions,itemStyle:{borderColor:palette.paper,borderWidth:0.6},emphasis:{label:{show:true,color:palette.ink}}}];
    return option;
  }

  function buildOption(spec, template, palette) {
    if (template.profile === 'series') return buildSeriesOption(spec, template, palette);
    if (template.profile === 'points') return buildPointsOption(spec, palette);
    if (template.profile === 'matrix') return buildMatrixOption(spec, palette);
    if (template.profile === 'network') return buildNetworkOption(spec, template, palette);
    if (template.profile === 'boxplot') return buildBoxplotOption(spec, palette);
    if (template.profile === 'parallel') return buildParallelOption(spec, palette);
    if (template.profile === 'ohlc') return buildOhlcOption(spec, palette);
    if (template.profile === 'calendar') return buildCalendarOption(spec, palette);
    if (template.profile === 'river') return buildRiverOption(spec, palette);
    if (template.profile === 'map') return buildMapOption(spec, template, palette);
    throw new Error('unknown-profile');
  }

  function addHeader(host, spec, template) {
    const header = element('header','header');
    if (spec.content.eyebrow || spec.content.period) header.append(element('div','eyebrow',[spec.content.eyebrow,spec.content.period].filter(Boolean).join(' · ')));
    header.append(element('h1','title',spec.content.title));
    if (spec.content.subtitle) header.append(element('p','subtitle',spec.content.subtitle));
    header.append(element('div','template-id',`${template.id} · ${template.name}`));
    host.append(header);
  }

  function addFooter(host, spec) {
    if (!spec.content.source && !spec.content.note) return;
    const footer = element('footer','footer');
    if (spec.content.source) footer.append(element('div','source',`Источник: ${spec.content.source}`));
    if (spec.content.note) footer.append(element('div','note',spec.content.note));
    host.append(footer);
  }

  function initChart(node, option) {
    const chart = echarts.init(node,null,{renderer:'svg'});
    chart.setOption(option,{notMerge:true,lazyUpdate:false});
    return chart;
  }

  function renderChart(host, spec, template, palette) {
    addHeader(host,spec,template);
    const canvas = element('main','chart');
    canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label',spec.content.title);
    host.append(canvas);
    const chart = initChart(canvas,buildOption(spec,template,palette));
    addFooter(host,spec);
    window.addEventListener('resize',() => chart.resize(),{passive:true});
  }

  function renderReport(host, spec, template, palette) {
    host.classList.add('report');
    addHeader(host,spec,template);
    if (spec.payload.kpis && spec.payload.kpis.length) {
      const kpis = element('section','kpis');
      spec.payload.kpis.forEach(item => {
        const card = element('article','kpi');
        card.append(element('div','kpi-value',item.value),element('div','kpi-label',item.label));
        kpis.append(card);
      });
      host.append(kpis);
    }
    if (spec.payload.sections && spec.payload.sections.length) {
      const sections = element('section','sections');
      spec.payload.sections.forEach(item => {
        const block = element('article','section-copy');
        block.append(element('h2','section-title',item.title),element('p','section-text',item.text));
        sections.append(block);
      });
      host.append(sections);
    }
    if (spec.payload.series && spec.payload.series.length) {
      const grid = element('section','report-charts');
      const kinds = ['bar','line','pie','area'];
      const chartNodes = kinds.slice(0,Math.min(4,spec.payload.series.length + 1)).map(kind => {
        const node = element('div','report-chart');
        grid.append(node);
        return {kind,node};
      });
      host.append(grid);
      const charts = chartNodes.map(item => initChart(item.node,buildSeriesOption(spec,{...template,kind:item.kind},palette)));
      window.addEventListener('resize',() => charts.forEach(chart => chart.resize()),{passive:true});
    }
    addFooter(host,spec);
  }

  try {
    const bundle = JSON.parse(decodeBlock('lieflat-data'));
    const spec = bundle.spec;
    const template = bundle.template;
    const palette = paletteFor(spec.palette);
    applyPalette(palette);
    document.title = spec.content.title;
    const host = document.getElementById('lieflat-root');
    host.replaceChildren();
    if (template.profile === 'report') renderReport(host,spec,template,palette);
    else renderChart(host,spec,template,palette);
    document.documentElement.dataset.lieflatReady = 'true';
  } catch (error) {
    const host = document.getElementById('lieflat-root');
    host.replaceChildren(element('p','fatal','Не удалось отобразить график. Проверьте спецификацию локальным валидатором.'));
    document.documentElement.dataset.lieflatReady = 'error';
    console.error('Ошибка безопасного рендеринга Lieflat Charts');
  }
})();
