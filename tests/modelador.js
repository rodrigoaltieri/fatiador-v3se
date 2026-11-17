// Teste do Modelador V3 SE no Chromium, com o Claude e os downloads simulados.
// O OpenSCAD vem do jsDelivr no artefato; aqui o teste baixa os mesmos pacotes pelo npm
// (npm confere a integridade) e os serve localmente. Antes, um servidor na raiz do repositório:
//   python3 -m http.server 8765 &
//   node tests/modelador.js            (BASE=http://localhost:8765 por padrão)
// Saídas (capturas e as vistas mandadas à IA) em tests/out/.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = process.env.BASE || 'http://localhost:8765';
const OUT = path.join(__dirname, 'out');
const THREE = path.join(__dirname, '..', 'vendor', 'three.min.js');
fs.mkdirSync(OUT, { recursive: true });

// Mesmos pacotes e versões que o artefato pede ao jsDelivr.
const NPM = path.join(OUT, 'cdn-npm');
const PACOTES = [['openscad-wasm@0.0.4', 'openscad-wasm@0.0.4/openscad.js', 'openscad.js'],
  ['@lofcz/openscad-wasm@0.0.2', '@lofcz/openscad-wasm@0.0.2/openscad.fonts.js', 'openscad.fonts.js']];
for (const [spec, destino, arquivo] of PACOTES) {
  const alvo = path.join(NPM, destino);
  if (fs.existsSync(alvo)) continue;
  const tmp = fs.mkdtempSync(path.join(OUT, 'npm-'));
  const tgz = execSync('npm pack --silent ' + spec, { cwd: tmp }).toString().trim().split('\n').pop();
  execSync('tar xzf ' + JSON.stringify(tgz), { cwd: tmp });
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.copyFileSync(path.join(tmp, 'package', arquivo), alvo);
  fs.rmSync(tmp, { recursive: true, force: true });
}

let falhas = 0;
function confere(cond, msg) { console.log((cond ? 'ok    ' : 'FALHA ') + msg); if (!cond) falhas++; }

function simulaClaude() {
  const A = '/* [Medidas] */\nlargura = 40; // [10:1:100] Largura (mm)\nfuro = 4.5; // [2:0.1:10] Furo (mm)\n/* [Hidden] */\n$fa = 2; $fs = 0.4;\n' +
    'difference() { cube([largura, 20, 5]); translate([largura / 2, 10, -1]) cylinder(d = furo, h = 7); }\n';
  const B = A.replace('20, 5]', '20, 6]');
  window.__chamadas = [];
  let revisoes = 0;
  async function sample(prompt, opts = {}) {
    const reg = { tools: !!opts.tools, imagens: (opts.images || []).length, tier: opts.modelTier, cache: opts.cache, tipo: '' };
    let code = A, text;
    if (prompt.includes('VEREDITO')) {
      reg.tipo = 'conferir'; revisoes++;
      if (revisoes === 1) { code = B; text = 'VEREDITO: CORRIGIR\n- base fina demais\n```openscad\n' + B + '```'; }
      else { code = null; text = 'VEREDITO: OK\n- confere com o pedido'; }
    } else if (prompt.includes('MUDANÇA PEDIDA')) {
      reg.tipo = 'mudar'; code = prompt.split('```openscad\n')[1].split('```')[0].replace(/largura = \d+/, 'largura = 55');
      text = '```openscad\n' + code + '```\nLargura aumentada.';
    } else { reg.tipo = 'gerar'; text = 'Pronto.\n```openscad\n' + A + '```\nSupus furo para M4.'; }
    window.__chamadas.push(reg);
    if (opts.tools && code) reg.ferramenta = await opts.tools[0].execute({ codigo: code }, { signal: opts.signal });
    if (opts.onText) opts.onText({ text, delta: text });
    return { text, truncated: false, modelTierApplied: 'complex' };
  }
  sample.json = async (prompt, opts = {}) => {
    window.__chamadas.push({ tipo: 'entender', imagens: (opts.images || []).length });
    return { titulo: 'Placa com furo', resumo: 'Placa retangular com um furo no meio.', medidas: [{ nome: 'Largura', valor: '40 mm', origem: 'pedido' }, { nome: 'Furo', valor: '4,5 mm', origem: 'suposicao' }],
      suposicoes: ['Espessura de 5 mm'], perguntas: [{ pergunta: 'Qual parafuso?', sugestao: 'M4' }], orientacao: 'Deitada na mesa.', riscos: [] };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ['image/jpeg', 'image/png'] }, tools: { maxCount: 8 }, modelTiers: ['default', 'complex', 'quick'] });
  const downloads = { save: async (r) => { window.__download = { filename: r.filename, size: r.data.size }; return { status: 'saved' }; } };
  window.claude = { use: async (n) => (n === 'sample' ? sample : n === 'downloads' ? downloads : null) };
}

// O artefato embrulha a página num esqueleto com doctype e charset; o teste faz o mesmo.
const ESQUELETO = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

async function espera(page, fn, arg, ms, rotulo) {
  try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; }
  catch (e) {
    const est = await page.evaluate(() => ({ trilha: document.getElementById('act-modelo').innerText, pedido: document.getElementById('act-pedido').innerText, erro: document.getElementById('erro-comp').innerText, dim: document.getElementById('dim').textContent }));
    confere(false, rotulo + ' (travou) ' + JSON.stringify(est).slice(0, 900));
    return false;
  }
}
async function esperaDim(page, trecho, ms = 90000) {
  return espera(page, (t) => document.getElementById('dim').textContent.includes(t), trecho, ms, 'medidas com ' + trecho);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(m.text()); });
  page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) erros.push('falhou ' + r.url()); });
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', (r) => r.fulfill({ path: THREE, contentType: 'application/javascript' }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route(BASE + '/modelador/index.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: ESQUELETO + fs.readFileSync(path.join(__dirname, '..', 'modelador', 'index.html'), 'utf8') + '</body></html>' }));
  await page.addInitScript((cdn) => { window.__CDN_MODELADOR = cdn; }, BASE + '/tests/out/cdn-npm/');
  await page.addInitScript(simulaClaude);
  await page.goto(BASE + '/modelador/index.html');

  // 1. Exemplo compila e mostra os parâmetros
  await esperaDim(page, 'mm');
  const dim0 = await page.textContent('#dim');
  confere(/70,0 mm$/.test(dim0), 'exemplo compilado: ' + dim0);
  const nParams = await page.locator('#params .param').count();
  confere(nParams === 7, 'exemplo tem 7 parâmetros (' + nParams + ')');
  confere((await page.textContent('label[for="p_largura"]')).startsWith('Largura do suporte (mm)'), 'descrição do parâmetro vem da linha de cima');
  confere(/OpenSCAD 2025\.07/.test(await page.textContent('#chip-motor')), 'motor: ' + await page.textContent('#chip-motor'));
  await page.screenshot({ path: path.join(OUT, 'modelador_inicio.png') });

  // 2. Mexer num parâmetro recompila
  await page.fill('#p_largura', '90');
  await page.dispatchEvent('#p_largura', 'change');
  await esperaDim(page, '90,0 mm');
  confere(true, 'parâmetro largura = 90 recompilou');

  // 3. Entender, gerar (com a ferramenta), conferir e corrigir
  await page.fill('#pedido', 'Placa de 40 mm com um furo para parafuso M4 no meio.');
  await page.click('#btn-entender');
  await page.waitForSelector('#card-ent:not([hidden])', { timeout: 30000 });
  confere((await page.locator('#ent-corpo .medida').count()) === 2, 'entendimento mostra 2 medidas');
  await page.fill('#perg_0', 'M4 cabeça panela');
  await page.click('#btn-gerar');
  await espera(page, () => !S.ocupado && S.origem === 'ia', null, 120000, 'gerar');
  const est = await page.evaluate(() => ({ codigo: S.codigo, spec: S.spec, compilado: S.compiledCode === S.codigo, chamadas: window.__chamadas, trilha: document.getElementById('act-modelo').innerText }));
  confere(est.codigo.includes('20, 6]'), 'a conferência corrigiu o código (base de 6 mm)');
  confere(est.compilado, 'o código final está compilado');
  confere(est.spec.includes('M4 cabeça panela'), 'a resposta do usuário entrou na especificação');
  const ger = est.chamadas.find((c) => c.tipo === 'gerar'), conf = est.chamadas.filter((c) => c.tipo === 'conferir');
  confere(ger && ger.tools && ger.ferramenta && ger.ferramenta.compilou, 'geração usou a ferramenta compilar_e_medir');
  confere(ger && ger.ferramenta && ger.ferramenta.caixa_mm.x === 40, 'ferramenta mediu 40 mm em X');
  confere(conf.length === 2 && conf[0].imagens === 1, 'duas rodadas de conferência, com a imagem das vistas');
  confere(ger && ger.tier === 'complex' && ger.cache === undefined, 'nível "complex" e sem cache junto com ferramentas');
  confere((await page.textContent('#dim')) === '40,0 × 20,0 × 6,0 mm', 'prévia mostra 40 × 20 × 6: ' + await page.textContent('#dim'));
  confere((await page.locator('#act-modelo li.fail').count()) === 0, 'nenhum passo falhou');
  console.log('      trilha: ' + est.trilha.replace(/\n+/g, ' | '));

  // 4. Pedir mudança
  await page.fill('#mudanca', 'largura 55');
  await page.click('#btn-mudar');
  await espera(page, () => !S.ocupado && S.codigo.includes('largura = 55'), null, 120000, 'pedir mudança');
  await esperaDim(page, '55,0 × 20,0');
  confere((await page.evaluate(() => S.spec)).includes('largura 55'), 'mudança registrada na especificação');

  // 5. Baixar
  await page.click('#btn-baixar');
  await page.waitForFunction(() => window.__download, null, { timeout: 30000 });
  const dl = await page.evaluate(() => window.__download);
  confere(/\.zip$/.test(dl.filename) && dl.size > 500, 'download ' + dl.filename + ' (' + dl.size + ' bytes)');

  // 6. Vistas mandadas à IA
  const png = await page.evaluate(() => vistasCanvas().toDataURL('image/png'));
  fs.writeFileSync(path.join(OUT, 'modelador_vistas.png'), Buffer.from(png.split(',')[1], 'base64'));
  await page.screenshot({ path: path.join(OUT, 'modelador_ia.png'), fullPage: true });

  // 7. Imagem em relevo: um anel e um "V3"
  await page.click('#tab-relevo');
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 240;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 240);
    g.fillStyle = '#111'; g.beginPath(); g.arc(110, 120, 90, 0, 7); g.arc(110, 120, 50, 0, 7, true); g.fill('evenodd');
    g.font = 'bold 150px sans-serif'; g.fillText('V3', 210, 180);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await abrirRelevo(new File([blob], 'logo.png', { type: 'image/png' }));
  });
  await page.waitForFunction(() => RV.loops && RV.loops.length > 0, null, { timeout: 10000 });
  const nLoops = await page.evaluate(() => RV.loops.length);
  confere(nLoops >= 4, 'relevo achou ' + nLoops + ' contornos (anel com furo, V, 3)');
  await page.click('#btn-relevo');
  await page.waitForFunction(() => S.origem === 'relevo' && S.compiledCode === S.codigo, null, { timeout: 60000 });
  confere(/^66,0 × /.test(await page.textContent('#dim')), 'relevo com 60 mm de desenho + 3 mm de margem de cada lado: ' + await page.textContent('#dim'));
  await page.selectOption('#p_forma_base', '2');
  await page.check('#p_argola');
  await page.waitForFunction(() => S.codigo.includes('argola = true') && S.compiledCode === S.codigo, null, { timeout: 60000 });
  const checks = await page.locator('#checks .check b').allTextContents();
  confere(checks.includes('Uma peça só'), 'chaveiro com argola sai em uma peça: ' + checks.join(', '));
  await page.screenshot({ path: path.join(OUT, 'modelador_relevo.png') });

  // 8. Celular e tema escuro
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'modelador_celular.png'), fullPage: true });
  const largo = await page.evaluate(() => document.documentElement.scrollWidth);
  confere(largo <= 390, 'sem rolagem lateral no celular (' + largo + ' px)');

  confere(erros.length === 0, 'sem erros no console' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));

  // 9. Sem worker: o motor roda na própria página; e text() com as fontes.
  const p2 = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const erros2 = [];
  p2.on('pageerror', (e) => erros2.push(e.message));
  await p2.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', (r) => r.fulfill({ path: THREE, contentType: 'application/javascript' }));
  await p2.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await p2.route(BASE + '/modelador/index.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: ESQUELETO + fs.readFileSync(path.join(__dirname, '..', 'modelador', 'index.html'), 'utf8') + '</body></html>' }));
  await p2.addInitScript((cdn) => { window.__CDN_MODELADOR = cdn; window.Worker = function () { throw new Error('sem worker'); }; }, BASE + '/tests/out/cdn-npm/');
  await p2.goto(BASE + '/modelador/index.html');
  await espera(p2, () => document.getElementById('dim').textContent.includes('mm'), null, 90000, 'exemplo sem worker');
  confere(/na página/.test(await p2.textContent('#chip-motor')), 'reserva sem worker: ' + await p2.textContent('#chip-motor'));
  await p2.evaluate(() => { document.getElementById('det-codigo').open = true; document.getElementById('codigo').value = '/* [Texto] */\n// Nome\nnome = "Rodrigo";\nlinear_extrude(1.5) text(nome, size = 10, font = "Liberation Sans:style=Bold");\ntranslate([-3, -4, -1.5]) cube([60, 18, 1.5]);\n'; });
  await p2.click('#btn-compilar');
  await espera(p2, () => S.compiledCode === S.codigo && S.codigo.includes('Rodrigo'), null, 60000, 'texto com fontes');
  confere(/^60,0 × 18,0 × 3,0 mm$/.test(await p2.textContent('#dim')), 'placa com texto compilou: ' + await p2.textContent('#dim'));
  confere((await p2.locator('#params input[type="text"]').count()) === 1, 'parâmetro de texto vira campo de texto');
  confere(erros2.length === 0, 'sem erros na página sem worker' + (erros2.length ? ': ' + erros2.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(falhas ? falhas + ' falha(s)' : 'OK sem erros');
  process.exit(falhas ? 1 : 0);
})();
