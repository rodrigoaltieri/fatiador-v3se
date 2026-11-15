"""Teste da versão do GitHub Pages no Chrome: perfil inicial, fatiar sem CDN, baixar .gcode, exportar ajustes.
Uso: (na raiz) python3 -m http.server 8765 &  depois  python3 tests/pages.py [caminho do chrome]"""
import asyncio, re, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('URL', 'http://localhost:8765/index.html')
async def main():
    async with async_playwright() as p:
        kw = {'args': ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']}
        if len(sys.argv) > 1: kw['executable_path'] = sys.argv[1]
        b = await p.chromium.launch(**kw)
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}, accept_downloads=True)
        ext = []
        async def block(r): ext.append(r.request.url); await r.abort()
        await ctx.route(re.compile(r'^https?://(?!localhost)'), block)
        logs = []
        pg = await ctx.new_page()
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type == 'error' and 'GL Driver' not in m.text else None)
        pg.on('pageerror', lambda e: logs.append('PAGEERR ' + str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        print('perfil:', await pg.input_value('#f-tNozzle'), await pg.input_value('#f-maxVol'), '|', await pg.inner_text('#sync-note'))
        print('botão:', await pg.inner_text('#dl-zip'), '| txt visível:', await pg.is_visible('#dl-txt'))
        async def wait_slice():
            for _ in range(80):
                await pg.wait_for_timeout(500)
                st = await pg.inner_text('#status')
                if st.startswith('G-code pronto') or st.startswith('Falhou'): return st
            return 'TIMEOUT: ' + await pg.inner_text('#status')
        await pg.click('#ex-cyl'); await pg.wait_for_timeout(200)
        await pg.click('#go'); print('fatiar:', await wait_slice(), '|', await pg.inner_text('#r-time'))
        async with pg.expect_download() as d: await pg.click('#dl-zip')
        dl = await d.value; path = await dl.path(); txt = open(path, encoding='utf8').read()
        print('download:', dl.suggested_filename, len(txt), 'bytes |', 'M205 J0.100' in txt, '| M104 S205' in txt or 'S205' in txt)
        async with pg.expect_download() as d2: await pg.evaluate("document.getElementById('export-cfg').click()")
        print('exportar:', (await d2.value).suggested_filename)
        print('externo bloqueado:', ext or 'nenhum')
        print('\n'.join(logs) or 'sem erros no console')
        await b.close()
asyncio.run(main())
