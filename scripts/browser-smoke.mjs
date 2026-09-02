#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildHtml} from './build-offline.mjs';
import {ROOT, loadCatalog, sha256Hex, stableStringify} from './lib/core.mjs';
import {sampleSpec} from '../tests/helpers.mjs';

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

async function findChrome() {
  const {access} = await import('node:fs/promises');
  for (const candidate of CHROME_CANDIDATES) {
    try { await access(candidate); return candidate; }
    catch { /* следующий кандидат */ }
  }
  throw new Error('Chromium или Google Chrome не найден. Укажите путь в CHROME_BIN.');
}

function waitForDebugger(child) {
  return new Promise((resolve,reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Chrome не открыл отладочный интерфейс')),15000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data',chunk => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('exit',code => { clearTimeout(timer); reject(new Error(`Chrome завершился с кодом ${code}`)); });
  });
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener('message',event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      this.listeners.forEach(listener => listener(message));
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.sequence;
    return new Promise((resolve,reject) => {
      this.pending.set(id,{resolve,reject});
      this.socket.send(JSON.stringify({id,method,params,...(sessionId ? {sessionId} : {})}));
    });
  }

  on(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  waitFor(method, sessionId, timeout = 10000) {
    return new Promise((resolve,reject) => {
      const stop = this.on(message => {
        if (message.method === method && (!sessionId || message.sessionId === sessionId)) {
          clearTimeout(timer);
          stop();
          resolve(message.params);
        }
      });
      const timer = setTimeout(() => { stop(); reject(new Error(`Не дождались события ${method}`)); },timeout);
    });
  }
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve,reject) => {
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  return new Cdp(socket);
}

async function stopChrome(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit',resolve));
  child.kill('SIGTERM');
  const graceful = await Promise.race([exited.then(() => true),new Promise(resolve => setTimeout(() => resolve(false),2000))]);
  if (graceful || child.exitCode !== null) return;
  child.kill('SIGKILL');
  await Promise.race([exited,new Promise(resolve => setTimeout(resolve,2000))]);
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
  if (result.exceptionDetails) throw new Error('Исключение при проверке страницы');
  return result.result.value;
}

async function waitReady(cdp, sessionId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate(cdp,sessionId,'document.documentElement.dataset.lieflatReady || ""');
    if (ready) return ready;
    await new Promise(resolve => setTimeout(resolve,50));
  }
  throw new Error('Рендерер не сообщил о готовности');
}

async function main() {
  const chromePath = await findChrome();
  const temporary = await mkdtemp(path.join(os.tmpdir(),'lieflat-browser-'));
  const profileDir = path.join(temporary,'profile');
  const htmlDir = path.join(temporary,'html');
  const snapshots = path.join(ROOT,'output/browser-smoke');
  await mkdir(profileDir,{recursive:true});
  await mkdir(htmlDir,{recursive:true});
  await rm(snapshots,{recursive:true,force:true});
  await mkdir(snapshots,{recursive:true});
  const catalog = await loadCatalog();
  const files = [];
  for (const template of catalog.values()) {
    const file = path.join(htmlDir,`${template.id}.html`);
    await writeFile(file,await buildHtml(sampleSpec(template)),'utf8');
    files.push({template,file});
  }
  const attackTemplate = catalog.get('F1');
  const safeAttackSpec = sampleSpec(attackTemplate);
  let attackHtml = await buildHtml(safeAttackSpec);
  const attackSpec = sampleSpec(attackTemplate);
  attackSpec.content.title = '</script><script>document.documentElement.dataset.pwned="yes"</script>';
  attackSpec.content.subtitle = 'https://127.0.0.1:9/проверка-утечки';
  attackSpec.content.source = '<svg onload=document.documentElement.dataset.pwned="svg">';
  attackSpec.payload.categories[0] = '<img src=x onerror=document.documentElement.dataset.pwned="img">';
  attackSpec.payload.series[0].name = 'javascript:document.documentElement.dataset.pwned="uri"';
  const attackData = Buffer.from(stableStringify({spec:attackSpec,template:attackTemplate}),'utf8').toString('base64');
  attackHtml = attackHtml.replace(/(<script id="lieflat-data" type="application\/octet-stream">)[A-Za-z0-9+/=]+(<\/script>)/u,`$1${attackData}$2`);
  const attackFile = path.join(htmlDir,'xss-defense.html');
  await writeFile(attackFile,attackHtml,'utf8');
  files.push({template:attackTemplate,file:attackFile,attack:true});

  const child = spawn(chromePath,['--headless=new','--disable-gpu','--disable-extensions','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profileDir}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  const debuggerUrl = await waitForDebugger(child);
  const cdp = await connect(debuggerUrl);
  const target = await cdp.send('Target.createTarget',{url:'about:blank'});
  const attached = await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const sessionId = attached.sessionId;
  await cdp.send('Page.enable',{},sessionId);
  await cdp.send('Runtime.enable',{},sessionId);
  await cdp.send('Network.enable',{},sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  let requests = [];
  let exceptions = [];
  const stopEvents = cdp.on(message => {
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text || 'исключение');
  });

  const capturedProfiles = new Set();
  try {
    for (const {template,file,attack = false} of files) {
      requests = [];
      exceptions = [];
      const loaded = cdp.waitFor('Page.loadEventFired',sessionId,15000);
      const navigation = await cdp.send('Page.navigate',{url:pathToFileURL(file).href},sessionId);
      if (navigation.errorText) throw new Error(`${template.id}: ${navigation.errorText}`);
      await loaded;
      const ready = await waitReady(cdp,sessionId);
      if (ready !== 'true') throw new Error(`${template.id}: runtime завершился ошибкой`);
      const metrics = await evaluate(cdp,sessionId,`(() => { const svgs=[...document.querySelectorAll('svg')]; return {svgCount:svgs.length,tofu:(document.body.textContent||'').includes('�'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,badSvg:svgs.some(svg=>{const r=svg.getBoundingClientRect();return r.width<20||r.height<20}),font:document.fonts.check('16px "Lieflat Embedded"','Проверка кириллицы')}; })()`);
      if (!metrics.font || metrics.tofu || metrics.overflow || metrics.badSvg) throw new Error(`${template.id}: нарушена визуальная проверка (${JSON.stringify(metrics)})`);
      if (template.profile !== 'report' && metrics.svgCount < 1) throw new Error(`${template.id}: SVG-график не создан`);
      const external = requests.filter(url => /^(?:https?|wss?|ftp):/iu.test(url));
      if (external.length) throw new Error(`${template.id}: обнаружен сетевой запрос`);
      if (exceptions.length) throw new Error(`${template.id}: исключение JavaScript`);
      if (attack) {
        const defense = await evaluate(cdp,sessionId,`({pwned:document.documentElement.dataset.pwned||'',literal:(document.body.textContent||'').includes('</script><script>')})`);
        if (defense.pwned || !defense.literal) throw new Error('XSS-защита браузерного runtime не прошла проверку');
      }
      if (!capturedProfiles.has(template.profile)) {
        capturedProfiles.add(template.profile);
        const screenshot = await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);
        const image = Buffer.from(screenshot.data,'base64');
        if (image.length < 1000) throw new Error(`${template.id}: пустой контрольный снимок`);
        await writeFile(path.join(snapshots,`${template.profile}-${template.id}.png`),image);
        await writeFile(path.join(snapshots,`${template.profile}-${template.id}.sha256`),`${sha256Hex(image)}\n`,'utf8');
      }
    }
    process.stdout.write(`Проверено в браузере: ${files.length - 1} шаблонов и XSS-сценарий, сетевых запросов нет. Контрольные снимки: ${path.relative(ROOT,snapshots)}\n`);
  } finally {
    stopEvents();
    await Promise.race([cdp.send('Browser.close').catch(() => {}),new Promise(resolve => setTimeout(resolve,1000))]);
    cdp.socket.close();
    await stopChrome(child);
    await rm(temporary,{recursive:true,force:true});
  }
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
