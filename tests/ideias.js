// Teste do modo Ideias do Modelador V3 SE no Chromium, com o Claude, o banco da conta (db),
// o usuário e os downloads simulados. Usa o mesmo servidor e os mesmos pacotes do tests/modelador.js:
//   python3 -m http.server 8765 &
//   node tests/modelador.js   (na primeira vez, baixa os pacotes do OpenSCAD para tests/out/cdn-npm)
//   node tests/ideias.js
// Capturas em tests/out/ideias_*.png e o kit baixado em tests/out/ideias_kit.zip.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = process.env.BASE || 'http://localhost:8765';
const OUT = path.join(__dirname, 'out');
const THREE = path.join(__dirname, '..', 'vendor', 'three.min.js');
const PAGINA = path.join(__dirname, '..', 'modelador', 'index.html');
if (!fs.existsSync(path.join(OUT, 'cdn-npm', 'openscad-wasm@0.0.4', 'openscad.js'))) {
  console.log('Rode antes node tests/modelador.js (baixa os pacotes do OpenSCAD).'); process.exit(1);
}
const ESQUELETO = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

let falhas = 0;
function confere(cond, msg) { console.log((cond ? 'ok    ' : 'FALHA ') + msg); if (!cond) falhas++; }

// Roda dentro da página antes de tudo: window.claude com sample, db, user e downloads.
function simula(semente) {
  const BASE_SCAD = (largura) => '/* [Medidas funcionais] */\n// Diâmetro do tubo da cadeira (mm)\ndiametro_tubo = 22; // [10:0.5:40]\n' +
    '/* [Forma] */\n// Largura (mm)\nlargura = ' + largura + '; // [20:1:80]\n/* [Hidden] */\n$fa = 2; $fs = 0.4;\n' +
    'difference() { cube([largura, 30, 30]); translate([largura / 2, -1, 15]) rotate([-90, 0, 0]) cylinder(d = diametro_tubo + 0.6, h = 32); }\n';
  const ACAB = (cod) => cod.replace('diametro_tubo = 22;', 'diametro_tubo = 25;')
    .replace('/* [Hidden] */', '/* [Acabamento] */\n// Raio dos cantos (mm)\nraio = 3; // [0:0.5:6]\n/* [Hidden] */')
    .replace('cube([largura, 30, 30]);', 'linear_extrude(30) offset(r = raio) offset(delta = -raio) square([largura, 30]);');
  const SVG = (t) => '<svg viewBox="0 0 480 320"><rect width="480" height="320" fill="#fff"/><rect x="40" y="80" width="200" height="140" fill="#f2601d" stroke="#000" stroke-width="2"/>' +
    '<text x="40" y="40" font-family="sans-serif" font-size="13">' + t + '</text><script>window.__ataque = 1</script></svg>';
  let nIdeia = 0, nMais = 0;
  const ideia = (titulo) => ({ titulo: titulo || 'Ideia ' + (++nIdeia), problema: 'Resolve um problema da praia', descricao: 'Peça simples presa no tubo da cadeira.', como_usa: 'Encaixa no tubo.',
    medidas: [{ nome: 'Tubo', valor: '22 mm' }, { nome: 'Largura', valor: '40 mm' }], funcionais: ['Diâmetro do tubo: 22 mm'], pecas: 1, dificuldade: 'fácil', tempo: '≈ 40 min', riscos: ['Não deixar no carro ao sol'] });
  window.__chamadas = [];
  async function sample(prompt, opts = {}) {
    const reg = { tipo: '', imagens: (opts.images || []).length, tools: !!opts.tools, tier: opts.modelTier };
    window.__chamadas.push(reg);
    let text = '', code = null;
    const n = +((/Exatamente (\d+) ideia/.exec(prompt) || [])[1] || 1);
    if (prompt.includes('Entender a situação e levantar')) {
      reg.tipo = 'analisar';
      text = '```json\n' + JSON.stringify({ titulo: 'Kit praia', resumo: 'Família de quatro vai à praia de carro, com guarda-sol e cadeiras de alumínio.',
        restricoes: [{ tipo: 'calor', texto: 'Não deixar as peças no carro fechado.' }, { tipo: 'areia', texto: 'Folga maior nos encaixes por causa da areia.' }],
        perguntas: [{ texto: 'Qual o diâmetro do tubo da cadeira?', tipo: 'medida', sugestao: '22 mm', porque: 'para o encaixe' },
          { texto: 'Quantas pessoas?', tipo: 'escolha', opcoes: ['2', '3', '4'], sugestao: '4' }, { texto: 'O que já levam?', tipo: 'texto', sugestao: 'guarda-sol' }] }) + '\n```';
    } else if (prompt.includes('Ver se ainda falta alguma dúvida')) {
      reg.tipo = 'mais_perguntas'; reg.temResposta = prompt.includes('→ 25') && prompt.includes('→ 4');
      text = '```json\n' + JSON.stringify({ resumo: 'Família de quatro, cadeiras com tubo de 25 mm.', restricoes: [], perguntas: [{ texto: 'A cadeira tem tubo redondo ou quadrado?', tipo: 'escolha', opcoes: ['redondo', 'quadrado'], sugestao: 'redondo' }] }) + '\n```';
    } else if (prompt.includes('CRITÉRIOS\n- Utilidade real')) {
      const modo = /variações da ideia/.test(prompt) ? 'parecidas' : /Reescrever a ideia/.test(prompt) ? 'revisar' : /ideias novas no lugar/.test(prompt) ? 'refazer' : /Sugerir mais/.test(prompt) ? 'mais' : 'inicial';
      reg.tipo = 'ideias_' + modo; reg.n = n; reg.texto = (/PEDIDO DO USUÁRIO PARA ESTA RODADA[\s\S]*?"""\n([\s\S]*?)\n"""/.exec(prompt) || [])[1] || '';
      reg.temEstilo = prompt.includes('ESTILO DO CONJUNTO'); reg.temResposta = prompt.includes('→ 25');
      const lista = [];
      for (let k = 0; k < (modo === 'inicial' ? 4 : n); k++) lista.push(ideia(modo === 'revisar' ? 'Ideia refeita' : modo === 'parecidas' ? 'Variação ' + (k + 1) : modo === 'mais' ? 'Extra ' + (++nMais) : null));
      text = '```json\n' + JSON.stringify(modo === 'inicial' ? { ideias: lista, evitar: [{ item: 'Copo para bebida', porque: 'camadas guardam sujeira' }] } : { ideias: lista }) + '\n```';
    } else if (prompt.includes('Desenhar o esboço da peça')) {
      reg.tipo = 'esboco';
      await new Promise((r) => setTimeout(r, 60));
      text = '```svg\n' + SVG(JSON.parse(prompt.split('IDEIA\n')[1].split('\n')[0]).titulo) + '\n```';
    } else if (prompt.includes('MODELO BASE')) {
      reg.tipo = 'base'; reg.svg = prompt.includes('<svg'); reg.funcionais = prompt.includes('[Medidas funcionais]'); reg.resposta = prompt.includes('→ 25');
      const t = (/Peça: (.*)/.exec(prompt) || [])[1] || '';
      code = BASE_SCAD(40 + (t.length % 4) * 5);
      text = '```openscad\n' + code + '```\nSupus folga de 0,3 mm.';
    } else if (prompt.includes('acabamento estético do modelo')) {
      reg.tipo = 'acabamento'; reg.estilo = /Arredondado e macio/.test(prompt); reg.gravar = prompt.includes('"PRAIA"'); reg.outras = prompt.includes('OUTRAS PEÇAS DO CONJUNTO');
      code = ACAB(prompt.split('CÓDIGO ATUAL\n```openscad\n')[1].split('```')[0]);
      text = '```openscad\n' + code + '```\nCantos arredondados.';
    } else if (prompt.includes('VEREDITO')) { reg.tipo = 'conferir'; text = 'VEREDITO: OK\n- confere'; }
    else { reg.tipo = 'outro'; text = 'nada'; }
    if (opts.tools && code) reg.ferramenta = await opts.tools[0].execute({ codigo: code }, { signal: opts.signal });
    if (opts.onText) opts.onText({ text, delta: text });
    return { text, truncated: false };
  }
  sample.json = async () => { throw { code: 'invalid_request' }; };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ['image/jpeg', 'image/png'] }, tools: { maxCount: 8 }, modelTiers: ['default', 'complex', 'quick'] });

  // Banco da conta em memória, com o formato da capacidade db.
  const store = window.__dbStore = semente ? JSON.parse(semente) : {};
  const ouvintes = [];
  const avisa = () => setTimeout(() => ouvintes.forEach((f) => f()), 0);
  const snap = (p) => { const d = store[p]; return { id: p.split('/').pop(), exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) }; };
  const docRef = (p) => ({ id: p.split('/').pop(), get: async () => snap(p), set: async (d) => { store[p] = JSON.parse(JSON.stringify(d)); avisa(); },
    update: async (d) => { store[p] = Object.assign(store[p] || {}, JSON.parse(JSON.stringify(d))); avisa(); }, delete: async () => { delete store[p]; avisa(); } });
  const collection = (c) => {
    const q = { ord: null, dir: 'asc', lim: 1000 };
    const docs = () => {
      const pre = c + '/';
      const ds = Object.keys(store).filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(snap);
      if (q.ord) ds.sort((a, b) => ((a.data()[q.ord] || 0) - (b.data()[q.ord] || 0)) * (q.dir === 'desc' ? -1 : 1));
      return ds.slice(0, q.lim);
    };
    const api = { doc: (id) => docRef(c + '/' + id), orderBy: (f, d) => { q.ord = f; q.dir = d || 'asc'; return api; }, limit: (n) => { q.lim = n; return api; },
      get: async () => ({ docs: docs() }), onSnapshot: (cb) => { const f = () => cb({ docs: docs() }); ouvintes.push(f); setTimeout(f, 0); return () => {}; } };
    return api;
  };
  const db = { collection, doc: docRef };
  const user = { id: async () => 'u1', me: async () => ({ id: 'u1' }), isOwner: () => true };
  const downloads = { save: async (r) => { window.__download = { filename: r.filename, size: r.data.size }; window.__blob = r.data; return { status: 'saved' }; } };
  window.claude = { use: async (n) => ({ sample, db, user, downloads })[n] || null };
}

async function abrir(browser, viewport, semente) {
  const page = await browser.newPage({ viewport });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', (r) => r.fulfill({ path: THREE, contentType: 'application/javascript' }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route(BASE + '/modelador/index.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: ESQUELETO + fs.readFileSync(PAGINA, 'utf8') + '</body></html>' }));
  await page.addInitScript((cdn) => { window.__CDN_MODELADOR = cdn; }, BASE + '/tests/out/cdn-npm/');
  await page.addInitScript(simula, semente || null);
  await page.goto(BASE + '/modelador/index.html');
  return { page, erros };
}
async function espera(page, fn, arg, ms, rotulo) {
  try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; }
  catch (e) {
    const est = await page.evaluate(() => ({ et: PJ && PJ.etapa, oc: OC, i4: document.getElementById('act-i4').innerText, mod: document.getElementById('act-modelo').innerText, erro: document.getElementById('erro-comp').innerText }));
    confere(false, rotulo + ' (travou) ' + JSON.stringify(est).slice(0, 900));
    return false;
  }
}
const visivel = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.closest('[hidden]'); }, sel);
const chamadas = (page, tipo) => page.evaluate((t) => window.__chamadas.filter((c) => c.tipo === t), tipo);
async function semRolagem(page, w, rot) { const l = await page.evaluate(() => document.documentElement.scrollWidth); confere(l <= w, 'sem rolagem lateral ' + rot + ' (' + l + ' px)'); }

(async () => {
  const browser = await chromium.launch();
  const { page, erros } = await abrir(browser, { width: 1180, height: 820 });

  // 1. Tela de entrada com os dois modos
  confere(await visivel(page, '#ir-ideias') && await visivel(page, '#ir-modelar'), 'tela de entrada com os dois botões grandes');
  confere(!(await visivel(page, '#tela-modelador')) && !(await visivel(page, '#tela-ideias')), 'nenhum dos modos aberto no começo');
  await page.screenshot({ path: path.join(OUT, 'ideias_0_entrada.png') });
  await page.click('#ir-ideias');
  confere(await visivel(page, '#et-1') && !(await visivel(page, '#et-2')), 'modo Ideias abre na etapa 1');
  confere(await page.evaluate(() => document.getElementById('view').parentNode.id === 'slot-view' && document.getElementById('card-modelo').parentNode.id === 'slot-modelo'), 'bancada (prévia e cartão Modelo) foi para o modo Ideias');
  await espera(page, () => /pronto/.test(document.getElementById('chip-motor').textContent), null, 90000, 'motor pronto');

  // 2. Situação → dúvidas
  await page.fill('#situacao', 'Vou para a praia semana que vem com a família e quero imprimir coisinhas úteis.');
  await page.click('#btn-analisar');
  await espera(page, () => !OC && PJ.etapa === 2, null, 30000, 'análise');
  confere((await page.locator('#i-perguntas .perg').count()) === 3, 'três perguntas na primeira rodada');
  confere((await page.locator('#i-restricoes li').count()) === 2, 'dois cuidados com o PLA');
  confere((await page.textContent('#i-titulo')) === 'Kit praia', 'título do projeto');
  await page.fill('#q_0_0', '25');
  await page.click('#i-perguntas .opcoes button:has-text("4")');
  await page.screenshot({ path: path.join(OUT, 'ideias_2_duvidas.png'), fullPage: true });
  await page.click('#btn-mais-perguntas');
  await espera(page, () => !OC && PJ.rodadas.length === 2, null, 30000, 'mais perguntas');
  confere((await chamadas(page, 'mais_perguntas'))[0].temResposta, 'segunda rodada recebe as respostas (25 mm, 4 pessoas)');
  confere(await visivel(page, '#i-respondidas') && (await page.locator('#i-perguntas .perg').count()) === 1, 'rodada nova com uma pergunta e as anteriores em “Respondidas antes”');
  await page.click('#i-estilos button:has-text("Arredondado")');
  await page.fill('#i-gravar', 'PRAIA'); await page.dispatchEvent('#i-gravar', 'change');

  // 3. Ideias com esboços
  await page.click('#btn-gerar-ideias');
  await espera(page, () => !OC && PJ.etapa === 3 && PJ.ideias.length === 4, null, 30000, 'ideias');
  confere(!(await chamadas(page, 'ideias_inicial'))[0].temEstilo && (await chamadas(page, 'ideias_inicial'))[0].temResposta, 'ideias usam as respostas e ainda não o estilo');
  await espera(page, () => PJ.ideias.every((i) => i.svg), null, 20000, 'esboços');
  confere((await page.locator('#i-grade .ideia-esboco img').count()) === 4, 'quatro esboços na tela');
  const svg0 = await page.evaluate(() => PJ.ideias[0].svg);
  confere(!/<script/i.test(svg0), 'esboço limpo (sem script)');
  confere(await visivel(page, '#i-evitar'), 'mostra o que não vale em PLA');
  await page.screenshot({ path: path.join(OUT, 'ideias_3_ideias.png'), fullPage: true });
  const cards = page.locator('#i-grade .ideia');
  await cards.nth(0).locator('.quero input').check();
  await cards.nth(1).locator('.quero input').check();
  confere((await page.textContent('#i-escolhidas')) === '2 ideias marcadas', 'contador de marcadas');
  // Mais parecidas com a 1ª: duas variações logo depois dela
  await cards.nth(0).locator('button:has-text("Mais parecidas")').click();
  await espera(page, () => !OC && PJ.ideias.length === 6, null, 30000, 'parecidas');
  confere(await page.evaluate(() => PJ.ideias[1].titulo === 'Variação 1' && PJ.ideias[2].titulo === 'Variação 2'), 'variações entram logo depois da ideia de origem');
  // Refazer esta (a última)
  const ult = page.locator('#i-grade .ideia').last();
  await ult.locator('button:has-text("Refazer esta")').click();
  await ult.locator('textarea').fill('mais compacta');
  await ult.locator('button:has-text("Refazer")').last().click();
  await espera(page, () => !OC && PJ.ideias[PJ.ideias.length - 1].titulo === 'Ideia refeita', null, 30000, 'refazer esta');
  confere((await chamadas(page, 'ideias_revisar'))[0].texto === 'mais compacta' && (await page.evaluate(() => PJ.ideias.length)) === 6, 'refazer esta troca só a ideia, com o pedido');
  // Refazer as não marcadas: ficam as duas marcadas
  await page.fill('#i-iterar', 'menos coisas para o carro');
  await page.click('#btn-refazer-todas');
  await espera(page, () => !OC && (window.__chamadas.filter((c) => c.tipo === 'ideias_refazer').length === 1), null, 30000, 'refazer não marcadas');
  const depois = await page.evaluate(() => PJ.ideias.map((i) => ({ t: i.titulo, e: i.escolhida })));
  confere(depois.filter((i) => i.e).length === 2 && depois.length === 2 + (await chamadas(page, 'ideias_refazer'))[0].n, 'ficam as marcadas e entram ideias novas: ' + depois.map((i) => i.t).join(', '));
  await page.click('#btn-mais-ideia');
  await espera(page, () => !OC && window.__chamadas.some((c) => c.tipo === 'ideias_mais'), null, 30000, 'mais uma');
  await espera(page, () => PJ.ideias.every((i) => i.svg), null, 20000, 'esboços das novas');

  // 4. Modelos base
  await page.click('#btn-modelos-base');
  await espera(page, () => !OC && PJ.pecas.length === 2 && PJ.pecas.every((P) => P.estado === 'base'), null, 180000, 'modelos base');
  const bases = await chamadas(page, 'base');
  confere(bases.length === 2 && bases.every((b) => b.svg && b.funcionais && b.resposta && b.imagens === 1 && b.ferramenta && b.ferramenta.compilou !== false), 'base com esboço (SVG e PNG), grupo de medidas funcionais, respostas e compilação');
  confere(!(await chamadas(page, 'conferir')).length, 'modelos base sem a conferência das vistas (fica para o acabamento)');
  confere((await page.locator('#lista-pecas .peca .mini img').count()) === 2, 'miniaturas das duas peças');
  const linha = await page.textContent('#lista-pecas .peca .linha2');
  confere(/mm · ≈ \d+ (min|h)/.test(linha) && / g$/.test(linha), 'medidas, tempo e filamento na lista: ' + linha);
  confere((await page.locator('#kit-tab tbody tr').count()) === 2, 'kit com as duas peças');
  await page.screenshot({ path: path.join(OUT, 'ideias_4_modelos.png'), fullPage: true });
  // Abrir a outra peça e mexer num parâmetro
  const titulo1 = await page.evaluate(() => PJ.pecas[0].titulo);
  await page.click('#lista-pecas .peca >> nth=0');
  await espera(page, () => S === PJ.pecas[0] && S.compiledCode === S.codigo, null, 30000, 'abrir peça');
  confere((await page.inputValue('#titulo')) === titulo1 && (await page.locator('#params .param').count()) === 2, 'peça aberta na bancada com os parâmetros dela');
  await page.fill('#p_largura', '60'); await page.dispatchEvent('#p_largura', 'change');
  await espera(page, () => document.getElementById('dim').textContent.startsWith('60,0'), null, 30000, 'parâmetro');
  confere(await page.evaluate(() => PJ.pecas[0].codigoBase.includes('largura = 60')), 'ajuste na base vira a nova base');

  // 5. Acabamento: a IA muda o diâmetro do tubo e a página volta ao valor da base
  await page.click('#etapas button[data-etapa="5"]');
  await page.click('#btn-acabamento');
  await espera(page, () => !OC && PJ.pecas.every((P) => P.estado === 'acabada'), null, 240000, 'acabamento');
  const acs = await chamadas(page, 'acabamento');
  confere(acs.length === 2 && acs.every((a) => a.estilo && a.gravar && a.outras), 'acabamento com o estilo, o texto gravado e as outras peças do conjunto');
  confere(await page.evaluate(() => PJ.pecas.every((P) => P.codigo.includes('diametro_tubo = 25;') === false && P.codigo.includes('diametro_tubo = 25.6') === false && /diametro_tubo = 25\b/.test(P.codigo) === false)), 'medida funcional mudada pela IA voltou ao valor da base');
  confere(await page.evaluate(() => PJ.pecas.every((P) => /raio = 3/.test(P.codigo) && /largura = (60|4\d|5\d)/.test(P.codigo))), 'acabamento ficou (raio) e o ajuste do usuário também');
  confere(/Voltei 1 medida/.test(await page.textContent('#act-modelo')), 'trilha avisa que a medida voltou');
  const nconf = (await chamadas(page, 'conferir')).length;
  confere(nconf === 2, 'uma conferência das vistas por peça no acabamento (a IA disse OK na primeira): ' + nconf);
  confere((await page.locator('#lista-pecas .estado.acabada').count()) === 2, 'as duas peças acabadas');
  await page.screenshot({ path: path.join(OUT, 'ideias_5_acabamento.png'), fullPage: true });

  // 6. Kit
  await page.click('#btn-baixar-kit');
  await espera(page, () => window.__download && /_kit\.zip$/.test(window.__download.filename), null, 60000, 'kit');
  const b64 = await page.evaluate(async () => { const u = new Uint8Array(await window.__blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); });
  const zip = path.join(OUT, 'ideias_kit.zip'); fs.writeFileSync(zip, Buffer.from(b64, 'base64'));
  let nomes = '';
  try { nomes = execSync('python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip() or \'\'); print(\'\\n\'.join(z.namelist()))" ' + JSON.stringify(zip)).toString(); } catch (e) { nomes = 'erro ' + e.message; }
  confere(/LEIA-ME\.txt/.test(nomes) && (nomes.match(/\.stl/g) || []).length === 2 && (nomes.match(/\.scad/g) || []).length === 2 && /^\n/.test(nomes), 'kit .zip íntegro com 2 .stl, 2 .scad e LEIA-ME: ' + nomes.trim().split('\n').join(', '));
  const leia = execSync('python3 -c "import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read(\'LEIA-ME.txt\').decode())" ' + JSON.stringify(zip)).toString();
  confere(/Kit praia/.test(leia) && /carro fechado/.test(leia) && /Copo para bebida/.test(leia), 'LEIA-ME com cuidados e o que evitar');
  await page.locator('#kit-tab tbody tr >> nth=1').locator('button').click();
  await espera(page, () => window.__download && !/_kit\.zip$/.test(window.__download.filename), null, 30000, 'baixar peça');

  // 7. Celular e tema escuro
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(300);
  await semRolagem(page, 390, 'no celular, etapa 4');
  await page.screenshot({ path: path.join(OUT, 'ideias_celular_4.png'), fullPage: true });
  await page.click('#etapas button[data-etapa="3"]');
  await page.waitForTimeout(200);
  await semRolagem(page, 390, 'no celular, etapa 3');
  await page.screenshot({ path: path.join(OUT, 'ideias_celular_3.png'), fullPage: true });
  await page.click('#etapas button[data-etapa="2"]');
  await semRolagem(page, 390, 'no celular, etapa 2');
  await page.screenshot({ path: path.join(OUT, 'ideias_celular_2.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });

  // 8. Voltar ao início e ir ao Modelar: bancada volta, peça do projeto não aparece lá
  await page.click('#btn-inicio');
  await espera(page, () => !document.getElementById('recentes').hidden, null, 5000, 'lista de projetos');
  confere((await page.locator('#lista-projetos li').count()) === 1, 'projeto aparece na tela de entrada');
  await page.click('#ir-modelar');
  confere(await page.evaluate(() => S === SM && document.getElementById('view').closest('#tela-modelador') && document.getElementById('card-modelo').closest('#tela-modelador') && document.getElementById('card-modelo').hidden), 'no modo Modelar a bancada volta e começa vazia');
  confere(/Nenhum modelo ainda/.test(await page.textContent('#stage-msg')), 'prévia do Modelar sem a peça do projeto');
  await page.click('#btn-inicio');
  await page.click('#ir-ideias');
  confere(await page.evaluate(() => PJ.etapa === 2 && PJ.pecas.length === 2), 'voltar ao modo Ideias mantém o projeto');
  await page.screenshot({ path: path.join(OUT, 'ideias_6_volta.png') });
  confere(!(await page.evaluate(() => window.__ataque)), 'script de esboço não rodou');
  confere(erros.length === 0, 'sem erros no console' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));

  // 9. Reabrir o projeto guardado na conta, noutra página
  await page.waitForTimeout(3000);
  const semente = await page.evaluate(() => JSON.stringify(window.__dbStore));
  const chaves = Object.keys(JSON.parse(semente));
  confere(chaves.filter((k) => /\/ideias\/projetos\/[^/]+$/.test(k)).length === 1 && chaves.filter((k) => /\/pecas\//.test(k)).length === 2, 'conta guarda o projeto e as duas peças: ' + chaves.length + ' documentos');
  const p2 = await abrir(browser, { width: 1180, height: 820 }, semente);
  await espera(p2.page, () => !document.getElementById('recentes').hidden, null, 10000, 'lista na página nova');
  await p2.page.click('#lista-projetos li button:has-text("Abrir")');
  await espera(p2.page, () => PJ && PJ.pecas.length === 2 && PJ.pecas.every((P) => P.analise), null, 90000, 'reabrir e compilar');
  confere(await p2.page.evaluate(() => PJ.ideias.length > 0 && PJ.ideias.every((i) => i.svg) && PJ.rodadas.length === 2 && PJ.estilo === 'macio' && PJ.gravar === 'PRAIA'), 'projeto reaberto com ideias, esboços, respostas e estilo');
  confere(await p2.page.evaluate(() => PJ.pecas.every((P) => P.estado === 'acabada' && P.thumb && P.codigoBase)), 'peças reabertas acabadas, com miniatura e a base guardada');
  await espera(p2.page, () => (document.querySelectorAll('#kit-tab tbody tr').length === 2), null, 10000, 'kit reaberto');
  await p2.page.click('#etapas button[data-etapa="4"]');
  await p2.page.click('#lista-pecas .peca >> nth=1');
  await espera(p2.page, () => S === PJ.pecas[1] && !!S.pos && document.getElementById('dim').textContent !== '—', null, 30000, 'abrir peça reaberta');
  await p2.page.locator('#lista-pecas .peca >> nth=1').locator('button:has-text("Voltar à base")').click();
  await espera(p2.page, () => PJ.pecas[1].estado === 'base' && !/raio/.test(PJ.pecas[1].codigo) && S.compiledCode === S.codigo, null, 30000, 'voltar à base');
  confere(await p2.page.evaluate(() => !document.getElementById('btn-acabamento').disabled), '“Voltar à base” libera o acabamento de novo');
  confere(p2.erros.length === 0, 'sem erros na página reaberta' + (p2.erros.length ? ': ' + p2.erros.slice(0, 3).join(' | ') : ''));

  await browser.close();
  console.log(falhas ? falhas + ' falha(s)' : 'OK sem erros');
  process.exit(falhas ? 1 : 0);
})();
