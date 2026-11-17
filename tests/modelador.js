// Teste do Modelador V3 SE no Chromium, com o Claude e os downloads simulados.
// O OpenSCAD vem do jsDelivr no artefato; aqui o teste baixa os mesmos pacotes pelo npm
// (npm confere a integridade) e os serve localmente. Antes, um servidor na raiz do repositório:
//   python3 -m http.server 8765 &
//   node tests/modelador.js            (BASE=http://localhost:8765 por padrão)
// Saídas (capturas, esboço e as vistas mandadas à IA) em tests/out/.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = process.env.BASE || 'http://localhost:8765';
const OUT = path.join(__dirname, 'out');
const THREE = path.join(__dirname, '..', 'vendor', 'three.min.js');
const PAGINA = path.join(__dirname, '..', 'modelador', 'index.html');
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

// O artefato embrulha a página num esqueleto com doctype e charset; o teste faz o mesmo.
const ESQUELETO = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

let falhas = 0;
function confere(cond, msg) { console.log((cond ? 'ok    ' : 'FALHA ') + msg); if (!cond) falhas++; }

function simulaClaude() {
  const A = '/* [Medidas] */\n// Largura (mm)\nlargura = 40; // [10:1:100]\n// Furo (mm)\nfuro = 4.5; // [2:0.1:10]\n/* [Hidden] */\n$fa = 2; $fs = 0.4;\n' +
    'difference() { cube([largura, 20, 5]); translate([largura / 2, 10, -1]) cylinder(d = furo, h = 7); }\n';
  const B = A.replace('20, 5]', '20, 6]');
  const SVG = '<svg viewBox="0 0 640 360"><rect width="640" height="360" fill="#fff"/><text x="40" y="30" font-family="sans-serif" font-size="14">FRENTE</text>' +
    '<rect x="40" y="60" width="240" height="30" fill="none" stroke="#000" stroke-width="2"/><text x="140" y="120" fill="#1f5fbf" font-family="sans-serif" font-size="14">40 mm</text>' +
    '<script>window.__ataque = 1</script><rect x="340" y="60" width="240" height="120" fill="none" stroke="#000" stroke-width="2" onclick="alert(1)"/></svg>';
  window.__chamadas = [];
  let revisoes = 0;
  async function sample(prompt, opts = {}) {
    const reg = { tools: !!opts.tools, imagens: (opts.images || []).length, tier: opts.modelTier, cache: opts.cache, tipo: '', svgNoPrompt: prompt.includes('<svg') };
    let code = A, text;
    if (prompt.includes('devolver um esboço rápido')) {
      reg.tipo = 'entender'; reg.correcao = prompt.includes('CORREÇÕES DO USUÁRIO'); code = null;
      const titulo = reg.correcao ? 'Placa com furo (corrigida)' : 'Placa com furo';
      text = '```json\n' + JSON.stringify({ titulo, resumo: 'Placa retangular com um furo no meio.', medidas: [{ nome: 'Largura', valor: '40 mm' }, { nome: 'Furo', valor: '4,5 mm' }],
        suposicoes: ['Espessura de 5 mm'], pergunta: { texto: 'Qual parafuso?', sugestao: 'M4' } }) + '\n```\n```svg\n' + SVG + '\n```';
    } else if (prompt.includes('VEREDITO')) {
      reg.tipo = 'conferir'; revisoes++;
      if (revisoes === 1) { code = B; text = 'VEREDITO: CORRIGIR\n- base fina demais\n```openscad\n' + B + '```'; }
      else { code = null; text = 'VEREDITO: OK\n- confere com o pedido'; }
    } else if (prompt.includes('MUDANÇA PEDIDA')) {
      reg.tipo = 'mudar'; code = prompt.split('```openscad\n')[1].split('```')[0].replace(/largura = \d+/, 'largura = 55');
      text = '```openscad\n' + code + '```\nLargura aumentada.';
    } else { reg.tipo = 'gerar'; reg.spec = prompt.split('ESPECIFICAÇÃO CONFIRMADA PELO USUÁRIO\n')[1].split('\n\nPEDIDO ORIGINAL')[0]; text = 'Pronto.\n```openscad\n' + A + '```\nSupus furo para M4.'; }
    window.__chamadas.push(reg);
    if (opts.tools && code) reg.ferramenta = await opts.tools[0].execute({ codigo: code }, { signal: opts.signal });
    if (opts.onText) opts.onText({ text, delta: text });
    return { text, truncated: false, modelTierApplied: 'complex' };
  }
  sample.json = async () => { throw { code: 'invalid_request', message: 'não usado' }; };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ['image/jpeg', 'image/png'] }, tools: { maxCount: 8 }, modelTiers: ['default', 'complex', 'quick'] });
  const downloads = { save: async (r) => { window.__download = { filename: r.filename, size: r.data.size }; return { status: 'saved' }; } };
  window.claude = { use: async (n) => (n === 'sample' ? sample : n === 'downloads' ? downloads : null) };
}

async function abrir(browser, viewport, extra) {
  const page = await browser.newPage({ viewport });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(m.text()); });
  page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) erros.push('falhou ' + r.url()); });
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', (r) => r.fulfill({ path: THREE, contentType: 'application/javascript' }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route(BASE + '/modelador/index.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: ESQUELETO + fs.readFileSync(PAGINA, 'utf8') + '</body></html>' }));
  await page.addInitScript((cdn) => { window.__CDN_MODELADOR = cdn; }, BASE + '/tests/out/cdn-npm/');
  if (extra) await page.addInitScript(extra);
  await page.goto(BASE + '/modelador/index.html');
  // A página abre na tela de entrada; o modo Modelar fica atrás de um dos dois botões grandes.
  await page.click('#ir-modelar');
  return { page, erros };
}
async function espera(page, fn, arg, ms, rotulo) {
  try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; }
  catch (e) {
    const est = await page.evaluate(() => ({ trilha: document.getElementById('act-modelo').innerText, pedido: document.getElementById('act-pedido').innerText, erro: document.getElementById('erro-comp').innerText, dim: document.getElementById('dim').textContent }));
    confere(false, rotulo + ' (travou) ' + JSON.stringify(est).slice(0, 900));
    return false;
  }
}
const visivel = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.closest('[hidden]'); }, sel);

(async () => {
  const browser = await chromium.launch();
  const { page, erros } = await abrir(browser, { width: 1280, height: 860 }, simulaClaude);

  // 1. Começa vazio: sem modelo, sem parâmetros, só o pedido
  await espera(page, () => /pronto/.test(document.getElementById('chip-motor').textContent), null, 90000, 'motor pronto');
  confere(!(await visivel(page, '#card-modelo')) && !(await visivel(page, '#card-baixar')), 'começa sem cartão de modelo nem de download');
  confere(/Nenhum modelo ainda/.test(await page.textContent('#stage-msg')), 'prévia diz que não há modelo');
  confere((await page.locator('#params .param').count()) === 0, 'nenhum parâmetro na tela');
  await page.screenshot({ path: path.join(OUT, 'modelador_inicio.png') });

  // 2. Entender: esboço, resumo curto, medidas só para ler, uma pergunta
  await page.fill('#pedido', 'Placa de 40 mm com um furo para parafuso M4 no meio.');
  await page.click('#btn-entender');
  await espera(page, () => !S.ocupado && !document.getElementById('card-ent').hidden, null, 30000, 'esboço');
  const src = await page.getAttribute('#ent-img', 'src');
  confere(/^data:image\/svg\+xml/.test(src || ''), 'esboço aparece como imagem SVG');
  const svg = decodeURIComponent((src || '').split(',')[1] || '');
  confere(!/<script|onclick/i.test(svg) && /xmlns=/.test(svg) && /width="640"/.test(svg), 'esboço limpo (sem script nem onclick, com xmlns e largura)');
  confere(await page.evaluate(() => S.esbocoPNG instanceof Blob && S.esbocoPNG.size > 1000), 'esboço convertido em PNG para mandar à IA');
  confere((await page.locator('#ent-medidas li').count()) === 2 && (await page.locator('#card-ent input').count()) === 0, 'duas medidas para ler, sem campos de edição');
  confere(/Qual parafuso\?/.test(await page.textContent('#ent-perg')), 'pergunta única aparece');
  await page.screenshot({ path: path.join(OUT, 'modelador_esboco.png'), fullPage: true });

  // 3. Corrigir o esboço
  await page.fill('#ent-obs', 'furo de 5 mm');
  await page.click('#btn-redesenhar');
  await espera(page, () => !S.ocupado && /corrigida/.test(document.getElementById('ent-titulo').textContent), null, 30000, 'corrigir esboço');
  let ch = await page.evaluate(() => window.__chamadas);
  const ent2 = ch.filter((c) => c.tipo === 'entender')[1];
  confere(ent2 && ent2.correcao && ent2.imagens === 1, 'correção vai com o esboço anterior como imagem');
  confere(await page.inputValue('#ent-obs') === '', 'campo de correção limpo depois de redesenhar');

  // 4. Está certo, gerar
  await page.fill('#ent-obs', 'M4 cabeça panela');
  await page.click('#btn-gerar');
  await espera(page, () => !S.ocupado && S.origem === 'ia' && S.compiledCode === S.codigo, null, 120000, 'gerar');
  ch = await page.evaluate(() => window.__chamadas);
  const ger = ch.find((c) => c.tipo === 'gerar'), conf = ch.filter((c) => c.tipo === 'conferir');
  confere(ger && ger.svgNoPrompt && ger.imagens === 1, 'geração recebe o esboço (SVG no texto e PNG como imagem)');
  confere(ger && /furo de 5 mm/.test(ger.spec) && /M4 cabeça panela/.test(ger.spec), 'correções entram na especificação');
  confere(ger && ger.tools && ger.ferramenta && ger.ferramenta.caixa_mm.x === 40, 'geração usou a ferramenta e mediu 40 mm');
  confere(conf.length === 2 && conf[0].imagens === 2, 'duas conferências, com vistas e esboço');
  confere((await page.textContent('#dim')) === '40,0 × 20,0 × 6,0 mm', 'conferência corrigiu (6 mm): ' + await page.textContent('#dim'));
  confere((await page.locator('#act-modelo li.fail').count()) === 0, 'nenhum passo falhou');
  confere(await visivel(page, '#card-baixar') && await visivel(page, '#card-ent'), 'download aparece e o esboço continua à vista');
  confere((await page.locator('#params .param').count()) === 2, 'parâmetros do modelo novo: ' + await page.locator('#params .param').count());

  // 5. Parâmetro, mudança, download
  await page.fill('#p_largura', '70');
  await page.dispatchEvent('#p_largura', 'change');
  await espera(page, () => document.getElementById('dim').textContent.startsWith('70,0 × 20,0'), null, 30000, 'parâmetro largura');
  await page.fill('#mudanca', 'largura 55');
  await page.click('#btn-mudar');
  await espera(page, () => !S.ocupado && S.codigo.includes('largura = 55') && S.compiledCode === S.codigo, null, 120000, 'pedir mudança');
  confere((await page.textContent('#dim')).startsWith('55,0 × 20,0'), 'mudança aplicada: ' + await page.textContent('#dim'));
  await page.click('#btn-baixar');
  await espera(page, () => window.__download, null, 30000, 'download');
  const dl = await page.evaluate(() => window.__download);
  confere(dl && /\.zip$/.test(dl.filename), 'download ' + (dl && dl.filename));
  const png = await page.evaluate(() => vistasCanvas().toDataURL('image/png'));
  fs.writeFileSync(path.join(OUT, 'modelador_vistas.png'), Buffer.from(png.split(',')[1], 'base64'));
  await page.screenshot({ path: path.join(OUT, 'modelador_ia.png'), fullPage: true });

  // 6. Pedido novo com "Gerar direto": o modelo anterior sai da tela na hora
  await page.fill('#pedido', 'Outra placa.');
  await page.click('#btn-direto');
  confere(await page.evaluate(() => document.getElementById('card-ent').hidden && Object.keys(S.ajustes).length === 0 && !S.esboco), 'pedido novo apaga esboço e ajustes do anterior');
  await espera(page, () => !S.ocupado && S.compiledCode === S.codigo && S.codigo.includes('largura = 40'), null, 120000, 'gerar direto');
  confere((await page.textContent('#dim')) === '40,0 × 20,0 × 5,0 mm', 'modelo novo: ' + await page.textContent('#dim'));

  // 7. Imagem em relevo
  await page.click('#tab-relevo');
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 240;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 240);
    g.fillStyle = '#111'; g.beginPath(); g.arc(110, 120, 90, 0, 2 * Math.PI); g.moveTo(160, 120); g.arc(110, 120, 50, 0, 2 * Math.PI, true); g.fill('evenodd');
    g.font = 'bold 150px sans-serif'; g.fillText('V3', 210, 180);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await abrirRelevo(new File([blob], 'logo.png', { type: 'image/png' }));
  });
  await espera(page, () => RV.loops && RV.loops.length > 0, null, 10000, 'contornos');
  confere((await page.evaluate(() => RV.loops.length)) >= 4, 'relevo achou ' + await page.evaluate(() => RV.loops.length) + ' contornos (anel, furo, V, 3)');
  await page.click('#btn-relevo');
  await espera(page, () => S.origem === 'relevo' && S.compiledCode === S.codigo, null, 60000, 'relevo');
  confere(/^66,0 × /.test(await page.textContent('#dim')), 'relevo com 60 mm + 3 mm de margem de cada lado: ' + await page.textContent('#dim'));
  await page.selectOption('#p_forma_base', '2');
  await page.check('#p_argola');
  await espera(page, () => S.codigo.includes('argola = true') && S.compiledCode === S.codigo, null, 60000, 'argola');
  const checks = await page.locator('#checks .check b').allTextContents();
  confere(checks.includes('Uma peça só'), 'chaveiro com argola em uma peça: ' + checks.join(', '));

  // 8. Celular e tema escuro
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'modelador_celular.png'), fullPage: true });
  const largo = await page.evaluate(() => document.documentElement.scrollWidth);
  confere(largo <= 390, 'sem rolagem lateral no celular (' + largo + ' px)');
  confere(!(await page.evaluate(() => window.__ataque)), 'script do esboço não rodou');
  confere(erros.length === 0, 'sem erros no console' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));

  // 9. Sem worker e sem Claude: o motor roda na página; colar código com text()
  const p2 = await abrir(browser, { width: 1000, height: 800 }, () => { window.Worker = function () { throw new Error('sem worker'); }; });
  await espera(p2.page, () => /na página/.test(document.getElementById('chip-motor').textContent), null, 90000, 'motor na página');
  confere(/na página/.test(await p2.page.textContent('#chip-motor')), 'reserva sem worker: ' + await p2.page.textContent('#chip-motor'));
  await p2.page.click('#btn-colar');
  confere(await visivel(p2.page, '#codigo'), '"Já tenho o código" abre o editor');
  await p2.page.fill('#codigo', '/* [Texto] */\n// Nome\nnome = "Rodrigo";\nlinear_extrude(1.5) text(nome, size = 10, font = "Liberation Sans:style=Bold");\ntranslate([-3, -4, -1.5]) cube([60, 18, 1.5]);\n');
  await p2.page.click('#btn-compilar');
  await espera(p2.page, () => S.compiledCode === S.codigo && S.codigo.includes('Rodrigo'), null, 60000, 'texto com fontes');
  confere(/^60,0 × 18,0 × 3,0 mm$/.test(await p2.page.textContent('#dim')), 'placa com texto compilou: ' + await p2.page.textContent('#dim'));
  confere((await p2.page.locator('#params input[type="text"]').count()) === 1, 'parâmetro de texto vira campo de texto');
  confere(p2.erros.length === 0, 'sem erros na página sem worker' + (p2.erros.length ? ': ' + p2.erros.slice(0, 3).join(' | ') : ''));

  await browser.close();
  console.log(falhas ? falhas + ' falha(s)' : 'OK sem erros');
  process.exit(falhas ? 1 : 0);
})();
