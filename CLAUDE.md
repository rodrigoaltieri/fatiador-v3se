# Fatiador V3 SE

Fatiador (slicer) web feito para o Rodrigo usar no iPad, específico para a **Creality Ender-3 V3 SE** com bico 0,4 e **PLA**. Roda 100% no navegador e é publicado pelo GitHub Pages. Rodrigo não tem computador no momento: tudo precisa funcionar no Safari do iPad (e no celular).

Responda e escreva textos de interface em português do Brasil.

## Princípio de trabalho

**Copiar o comportamento do OrcaSlicer de propósito, não reinventar.** Em quase todos os problemas vistos nas impressões, a solução estava no que o Orca já faz para a V3 SE (fim do G-code, limites de máquina, costura, modo vaso no teste de vazão). Antes de criar um método, olhe o perfil oficial em `ref/orca/` e o código-fonte do Orca (github.com/OrcaSlicer/OrcaSlicer, `src/libslic3r/GCode.cpp`, `PrintConfig.cpp`, `GCodeWriter.cpp`). Dá para rodar o OrcaSlicer de verdade pela linha de comando (seção "Comparar com o Orca"): gere o G-code de referência e compare. O que já foi comparado e o que ficou de fora está em `docs/comparacao-orca.md`.

## Arquivos

- `index.html`: interface inteira (ajustes, aba Calibração com 9 testes, prévia 3D com three.js r128, downloads, exportar/importar ajustes). Ao abrir um modelo, `meshWarning` avisa se o STL veio cortado ou se a superfície está aberta (o Orca recusa STL cortado; nós abrimos e avisamos). `var STANDALONE` liga o modo GitHub Pages (sem as APIs `window.claude` do artefato: baixa `.gcode` direto, ajustes só no aparelho).
- `core.v14.js`: motor de fatiamento. `SlicerCore.slice(job, onProgress)` → `{ gcode, preview, stats }`. Usa ClipperLib (escala inteira SC=1000).
- `worker.v14.js`: roda o motor num Web Worker.
- `vendor/`: three.min.js r128 e clipper.js 6.4.2 (locais, para funcionar sem internet).
- `sw.js`: service worker, rede primeiro e cache como reserva.
- `modelos/3DBenchy.stl`: 3DBenchy original (CC0, sem alterações; origem em `modelos/LEIA-ME.md`). O botão "3DBenchy" da tela inicial baixa o arquivo só quando tocado (11 MB, fora da lista `FILES` do `sw.js`); depois o service worker guarda a cópia.
- `perfil-inicial.json`: ajustes e resultados de calibração do Rodrigo, carregados quando o aparelho não tem nada salvo.
- `ref/orca/`: perfis oficiais da V3 SE no OrcaSlicer 2.5.1 (máquina, processo, filamento e os perfis de que herdam). Vêm do OrcaSlicer (AGPL-3.0).
- `ref/orca/gcode/`: G-code gerado pelo OrcaSlicer 2.5.1 de verdade com o perfil calibrado (cubo de 20 mm e cilindro Ø20). É a referência do teste `tests/orca.js`; o do cubo pode ser impresso direto para comparar com o nosso. No site, o botão "Baixar cubo fatiado pelo Orca" no fim da aba Calibração baixa esse arquivo com o nome certo (pelo github.com o iPad salva como `.txt`).
- `tests/`: verificador de G-code e modelos de teste (Node) e teste de navegador (Playwright).
- `tests/orca/`: como rodar o OrcaSlicer e o three-slicer e comparar os G-codes por tipo de trecho.
- `docs/historico.md`: resultados das impressões e o que cada versão mudou.
- `docs/comparacao-orca.md`: comparação com o OrcaSlicer 2.5.1 e com o three-slicer, diferença por diferença.

**Ao mudar o motor:** suba a versão no nome do arquivo (`core.v15.js`, `worker.v15.js`), atualize as referências em `index.html`, `worker`, `sw.js` (lista `FILES` e nome do `CACHE`) e `tests/lib.js` (padrão de `CORE`). O nome versionado evita o iPad usar um motor velho em cache.

## G-code

Marlin, extrusão relativa (M83). Início e fim seguem o perfil oficial do Orca para a V3 SE (`ref/orca/v3se.json`): espera a mesa antes do G28, M420 S1, purga em X−2,1/X−2,4 a Z0,28; no fim recolhe, afasta, sobe, apresenta a peça em X0 Y220 e só então desliga. Desde a v11 escreve os mesmos limites de máquina que o Orca: `M201 X2500 Y2500 Z500 E5000`, `M203 X250 Y250 Z5 E40`, `M204 P2500 R500 T2500`, `M205 X10 Y10 Z0.4 E5`, `M205 J0.100`.

Desde a v12 as paredes saem como as do Orca: externa 0,42 mm, internas e preenchimento 0,45 mm (`innerW`, `infillW`), 1ª interna a 0,414 mm da externa ("parede externa precisa"), folga de 0,04 mm no fecho de todo laço, internas primeiro e externa por último. Retrai e limpa sempre que sai da parede externa ou vai para uma parede; só não retrai dentro da região interna da camada. O salto curto até a parede externa usa a aceleração dela (`M204 T`). O G-code leva os marcadores do Orca (`;TYPE:`, `;LAYER_CHANGE`, `;Z:`), além do nosso `;LAYER:n`.

Desde a v13 há dois ajustes para os cantos, os dois com o padrão do Orca: `wallOrder` (`inner` = internas primeiro; `outer` = externa primeiro, que como no Orca desliga a "parede externa precisa") e `corner` (`orca` = jerk 10 e `M205 J0.100`; `fast` = jerk 20 e `M205 J0.250`). As zonas por peça (`loopZones`) aceitam `order` e `corner`, e é assim que o teste 6 muda uma coisa em cada cubo.

Desde a v14 o suporte segue o estilo "grid" do Orca: a área em balanço é alargada para as células inteiras de uma grade fixa de 2,88 mm (`snapGrid`), o que dá torres largas e iguais de uma camada para a outra; o serrilhado é filtrado com 0,1 × a largura da linha (antes 0,3 mm, o que deixava sem suporte tudo entre uns 13° e o ângulo pedido, inclusive a base arredondada das peças); sobras com menos de 1,2 mm de largura são descartadas. Diferenças que ficaram: ângulo 35° (Orca 30°), folga XY 0,6 mm (Orca 0,35), interface menos densa, sem a borda larga na 1ª camada do suporte.

Diferenças mantidas de propósito em relação ao Orca: pré-aquecimento do bico a 140 °C e `M420 S1` no início, 1ª camada de 0,50 mm com compensação de pé de elefante de 0,1 mm, limpeza deslocada para dentro da peça, z-hop vertical, pontes a 30 mm/s, contornos pequenos a 60%.

Firmware de fábrica sem linear advance (drivers TMC2208). Firmwares da comunidade (navaismo, queeup) têm M900, e o do navaismo tem M593. Trocar firmware é decisão do Rodrigo.

## Perfil calibrado (PLA)

Bico 205 °C (1ª camada 210), mesa 55 (1ª camada 60), fluxo 0,98, retração 1,2 mm a 40/30 mm/s, z-hop 0,2, vazão máxima 13 mm³/s, 3 paredes, topo 5, fundo 4, preenchimento 15% em linhas. Velocidades: 1ª camada 25, parede externa 40, interna 70, topo 40, sólido 80, preenchimento 120, deslocamento 150. Acelerações: externa 700, interna 1500, topo 1000, padrão 2000, deslocamento 2500.

## Testes

```bash
npm install                      # clipper-lib para os testes em Node
npm test                         # modelos sintéticos + as 9 peças de calibração + paredes iguais às do Orca + suporte; deve dar "OK sem erros" em todos
node tests/benchy.js             # usa modelos/3DBenchy.stl; aceita outro STL como argumento
python3 -m http.server 8765 &    # depois:
python3 tests/pages.py /opt/pw-browsers/chromium   # navegador: perfil inicial, fatiar sem CDN, baixar .gcode, exportar ajustes (antes: pip install playwright)
```

Saídas vão para `tests/out/` (ignorada pelo git). `tests/plot.py` desenha camadas de um `.json` de prévia.

## Comparar com o Orca

O ambiente da nuvem só lê o GitHub por `git clone` (repositórios públicos); páginas de release e a API de outros repositórios respondem 403. Por isso o Orca vem do Flathub, que é o canal Linux oficial dele:

```bash
apt-get update && apt-get install -y flatpak
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user -y flathub com.orcaslicer.OrcaSlicer      # ~3 GB com o runtime
node tests/orca/modelos.js tests/out                              # cube20.stl e cyl20.stl
tests/orca/rodar_orca.sh tests/out/cube20.stl tests/out/orca_cubo # gera plate_1.gcode
python3 -I tests/orca/analyze.py tests/out/orca_cubo/plate_1.gcode            # resumo por tipo de trecho
python3 -I tests/orca/comparar_paredes.py referencia.gcode nosso.gcode        # paredes, ponto a ponto
```

`flatpak run` não funciona no contêiner (sem D-Bus); o script chama o programa direto com as bibliotecas do runtime. A linha de comando do Orca só resolve `inherits` de perfis que estejam dentro da pasta de dados (`user/default/...`) e exige o campo `version`; o script monta essa pasta. Os perfis usados estão em `tests/orca/perfis/` (herdam os oficiais e trocam só os valores calibrados). O código-fonte do Orca clona com `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --branch v2.5.1 https://github.com/OrcaSlicer/orcaslicer`. O Benchy oficial já está em `modelos/3DBenchy.stl`.

## Pendências

1. **Cantos estufados** (todos os cubos do teste 6, a 25 e a 40 mm/s). **Não é a trajetória do fatiador:** em 15/11 o Rodrigo imprimiu o cubo de 20 mm do v12 e o do próprio OrcaSlicer 2.5.1 com o perfil calibrado (`ref/orca/gcode/cubo20_orca-2.5.1.gcode`) e os dois saíram com as mesmas protuberâncias. Sobram os valores que os dois arquivos têm em comum (fluxo 0,98, 205 °C, parede externa a 40 mm/s com aceleração 700, paredes internas antes da externa) e a máquina (firmware sem linear advance, correias, filamento). Antes dizia-se que "não acontecia no Orca/Cura": falta saber com que perfil, filamento e firmware eram aquelas impressões. A foto mostra uma "orelhinha" para fora nas quatro quinas, na altura toda, nos dois cubos. O teste 6 da aba Calibração foi refeito para isso (v13): quatro cubos, cada um mudando uma coisa só (referência, parede externa primeiro, cantos mais rápidos, fluxo 6% menor). **Impresso em 15/11: os quatro saíram iguais**, todos com os cantos um pouco inchados. Com isso estão descartados a trajetória, a ordem das paredes, a velocidade nos cantos e o fluxo. Sobra a pressão no bico ao frear nas quinas, que só o linear advance compensa (o firmware de fábrica não tem), além de temperatura, filamento e correias. Falta medir o tamanho do inchaço com o paquímetro (largura no meio da face contra largura pegando as quinas) e testar um cubo a 195 °C. Não inventar compensação de canto no fatiador: o Orca não tem isso para Marlin sem linear advance.
2. Diferenças do Orca ainda não copiadas: z-hop em espiral, sobreposição de 25% entre topo e parede, ponte interna grossa sobre o preenchimento, limpeza depois do preenchimento, paredes de largura variável (Arachne).
3. `three-slicer` avaliado e descartado como substituto: não é o libslic3r do Orca (o G-code dele diz "NOT full libslic3r"), difere do Orca em ordem e largura das paredes e não respeita o perfil oficial inteiro. Detalhes em `docs/comparacao-orca.md`.
4. Calibração restante: passo 7 (encaixe) e passo 8 (aceleração/ghosting).
5. Suporte: falta imprimir uma peça com o suporte em grade da v14 (a ocarina do Rodrigo) e ver se solta bem. Se grudar demais, aproximar a interface da do Orca.
6. Ainda não tem: suporte em árvore, desvio de paredes nos deslocamentos, input shaping.
