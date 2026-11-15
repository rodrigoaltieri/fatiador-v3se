# Fatiador V3 SE

Fatiador (slicer) web feito para o Rodrigo usar no iPad, específico para a **Creality Ender-3 V3 SE** com bico 0,4 e **PLA**. Roda 100% no navegador e é publicado pelo GitHub Pages. Rodrigo não tem computador no momento: tudo precisa funcionar no Safari do iPad (e no celular).

Responda e escreva textos de interface em português do Brasil.

## Princípio de trabalho

**Copiar o comportamento do OrcaSlicer de propósito, não reinventar.** Em quase todos os problemas vistos nas impressões, a solução estava no que o Orca já faz para a V3 SE (fim do G-code, limites de máquina, costura, modo vaso no teste de vazão). Antes de criar um método, olhe o perfil oficial em `ref/orca/` e o código-fonte do Orca (github.com/OrcaSlicer/OrcaSlicer, `src/libslic3r/GCode.cpp`, `PrintConfig.cpp`, `GCodeWriter.cpp`). Se der para rodar o OrcaSlicer de verdade (AppImage Linux, linha de comando) no ambiente, gere o G-code de referência e compare.

## Arquivos

- `index.html`: interface inteira (ajustes, aba Calibração com 9 testes, prévia 3D com three.js r128, downloads, exportar/importar ajustes). `var STANDALONE` liga o modo GitHub Pages (sem as APIs `window.claude` do artefato: baixa `.gcode` direto, ajustes só no aparelho).
- `core.v11.js`: motor de fatiamento. `SlicerCore.slice(job, onProgress)` → `{ gcode, preview, stats }`. Usa ClipperLib (escala inteira SC=1000).
- `worker.v11.js`: roda o motor num Web Worker.
- `vendor/`: three.min.js r128 e clipper.js 6.4.2 (locais, para funcionar sem internet).
- `sw.js`: service worker, rede primeiro e cache como reserva.
- `perfil-inicial.json`: ajustes e resultados de calibração do Rodrigo, carregados quando o aparelho não tem nada salvo.
- `ref/orca/`: perfis oficiais da V3 SE no OrcaSlicer (máquina, processo, filamento). Vêm do OrcaSlicer (AGPL-3.0).
- `tests/`: verificador de G-code e modelos de teste (Node) e teste de navegador (Playwright).
- `docs/historico.md`: resultados das impressões e o que cada versão mudou.

**Ao mudar o motor:** suba a versão no nome do arquivo (`core.v12.js`, `worker.v12.js`), atualize as referências em `index.html`, `worker`, `sw.js` (lista `FILES` e nome do `CACHE`) e `tests/lib.js` (padrão de `CORE`). O nome versionado evita o iPad usar um motor velho em cache.

## G-code

Marlin, extrusão relativa (M83). Início e fim seguem o perfil oficial do Orca para a V3 SE (`ref/orca/v3se.json`): espera a mesa antes do G28, M420 S1, purga em X−2,1/X−2,4 a Z0,28; no fim recolhe, afasta, sobe, apresenta a peça em X0 Y220 e só então desliga. Desde a v11 escreve os mesmos limites de máquina que o Orca: `M201 X2500 Y2500 Z500 E5000`, `M203 X250 Y250 Z5 E40`, `M204 P2500 R500 T2500`, `M205 X10 Y10 Z0.4 E5`, `M205 J0.100`.

Firmware de fábrica sem linear advance (drivers TMC2208). Firmwares da comunidade (navaismo, queeup) têm M900, e o do navaismo tem M593. Trocar firmware é decisão do Rodrigo.

## Perfil calibrado (PLA)

Bico 205 °C (1ª camada 210), mesa 55 (1ª camada 60), fluxo 0,98, retração 1,2 mm a 40/30 mm/s, z-hop 0,2, vazão máxima 13 mm³/s, 3 paredes, topo 5, fundo 4, preenchimento 15% em linhas. Velocidades: 1ª camada 25, parede externa 40, interna 70, topo 40, sólido 80, preenchimento 120, deslocamento 150. Acelerações: externa 700, interna 1500, topo 1000, padrão 2000, deslocamento 2500.

## Testes

```bash
npm install                      # clipper-lib para os testes em Node
npm test                         # modelos sintéticos + as 9 peças de calibração; deve dar "OK sem erros" em todos
node tests/benchy.js caminho/benchy.stl
python3 -m http.server 8765 &    # depois:
python3 tests/pages.py           # navegador: perfil inicial, fatiar sem CDN, baixar .gcode, exportar ajustes
```

Saídas vão para `tests/out/` (ignorada pelo git). `tests/plot.py` desenha camadas de um `.json` de prévia.

## Pendências

1. **Cantos estufados** (todos os cubos do teste 6, a 25 e a 40 mm/s; não acontecia no Orca/Cura). Hipótese: faltavam os limites de máquina, sobretudo `M205 J0.100`. Corrigido na v11, **falta confirmar imprimindo um cubo de 20 mm**.
2. Comparar com o OrcaSlicer real (cubo 20 mm e Benchy) e fechar as diferenças relevantes.
3. Avaliar o pacote `three-slicer` (npm, AGPL-3.0, motor WASM derivado do Orca, já traz o perfil da V3 SE) como substituto do motor próprio, mantendo a interface e a calibração. Se for adotado, o repositório passa a ser AGPL.
4. Calibração restante: passo 7 (encaixe) e passo 8 (aceleração/ghosting).
5. Ainda não tem: suporte em árvore, desvio de paredes nos deslocamentos, input shaping.
