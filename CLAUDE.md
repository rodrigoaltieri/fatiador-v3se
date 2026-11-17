# Fatiador V3 SE

Fatiador (slicer) web feito para o Rodrigo usar no iPad, específico para a **Creality Ender-3 V3 SE** com bico 0,4 e **PLA**. Roda 100% no navegador e é publicado pelo GitHub Pages. Rodrigo não tem computador no momento: tudo precisa funcionar no Safari do iPad (e no celular).

Responda e escreva textos de interface em português do Brasil.

## Princípio de trabalho

**Copiar o comportamento do OrcaSlicer de propósito, não reinventar.** Em quase todos os problemas vistos nas impressões, a solução estava no que o Orca já faz para a V3 SE (fim do G-code, limites de máquina, costura, modo vaso no teste de vazão). Antes de criar um método, olhe o perfil oficial em `ref/orca/` e o código-fonte do Orca (github.com/OrcaSlicer/OrcaSlicer, `src/libslic3r/GCode.cpp`, `PrintConfig.cpp`, `GCodeWriter.cpp`). Dá para rodar o OrcaSlicer de verdade pela linha de comando (seção "Comparar com o Orca"): gere o G-code de referência e compare. O que já foi comparado e o que ficou de fora está em `docs/comparacao-orca.md`.

## Prioridade: qualidade antes de tempo

Definido pelo Rodrigo em 16/11/2026. **A qualidade da impressão vem primeiro.** Uma impressão 10 ou 20% mais longa não é problema, e o tempo de fatiamento menos ainda. Não cortar nem simplificar um comportamento do Orca para ganhar tempo de impressão ou de fatiamento. Otimizar tempo fica para depois que tudo estiver funcionando bem por um tempo, e por decisão do Rodrigo.

## Arquivos

- `index.html`: interface inteira (ajustes, 9 testes de calibração, prévia 3D com three.js r128, downloads, exportar/importar ajustes). A calibração está concluída e fica escondida: abre pelo botão "Recalibrar", no fim de Avançado. `DEFAULTS` são os valores de fábrica do fatiador (base dos testes e da comparação com o Orca), não o perfil do Rodrigo. Ao abrir um modelo, `meshWarning` avisa se o STL veio cortado ou se a superfície está aberta (o Orca recusa STL cortado; nós abrimos e avisamos). `var STANDALONE` liga o modo GitHub Pages (sem as APIs `window.claude` do artefato: baixa `.gcode` direto, ajustes só no aparelho). "Abrir modelo" aceita também o `.zip` do Modelador (abre o primeiro `.stl` de dentro).
- `core.v16.js`: motor de fatiamento. `SlicerCore.slice(job, onProgress)` → `{ gcode, preview, stats }`. Usa ClipperLib (escala inteira SC=1000).
- `worker.v16.js`: roda o motor num Web Worker.
- `vendor/`: three.min.js r128 e clipper.js 6.4.2 (locais, para funcionar sem internet).
- `sw.js`: service worker, rede primeiro e cache como reserva.
- `modelos/3DBenchy.stl`: 3DBenchy original (CC0, sem alterações; origem em `modelos/LEIA-ME.md`). O botão "3DBenchy" da tela inicial baixa o arquivo só quando tocado (11 MB, fora da lista `FILES` do `sw.js`); depois o service worker guarda a cópia.
- `perfil-inicial.json`: ajustes e resultados de calibração do Rodrigo. É carregado quando o aparelho não tem nada salvo e pelo botão "Restaurar perfil PLA Rodrigo". Ao fechar uma calibração nova, atualize este arquivo a partir de um "Exportar ajustes" do Rodrigo.
- `ref/orca/`: perfis oficiais da V3 SE no OrcaSlicer 2.5.1 (máquina, processo, filamento e os perfis de que herdam). Vêm do OrcaSlicer (AGPL-3.0).
- `ref/orca/gcode/`: G-code gerado pelo OrcaSlicer 2.5.1 de verdade com o perfil calibrado (cubo de 20 mm e cilindro Ø20). É a referência do teste `tests/orca.js`; o do cubo pode ser impresso direto para comparar com o nosso. No site, o botão "Baixar cubo fatiado pelo Orca" no fim da aba Calibração baixa esse arquivo com o nome certo (pelo github.com o iPad salva como `.txt`).
- `modelador/index.html`: **Modelador V3 SE**, um artefato do Claude separado do site (https://claude.ai/artifact/SnHX3DH2b47KQ7tJq5ZDaR). Gera a peça a partir de descrição, esboço técnico ou foto e entrega o STL; o fatiamento continua no site. A IA roda pela capacidade `sample` do artefato, na conta do Rodrigo, sem chave de API. Fluxo: a IA mostra o que entendeu (medidas editáveis, suposições, perguntas com sugestão), escreve OpenSCAD paramétrico (formato do Customizer: descrição na linha de cima, faixa no comentário), compila e mede com a ferramenta `compilar_e_medir`, e confere quatro vistas renderizadas (frente, direita, topo, perspectiva, grade de 10 mm, balanços em laranja) contra o pedido, em até 2 rodadas. Depois: controles para cada parâmetro, "Pedir mudança", editor de código. "Imagem em relevo" traça o contorno de um logo ou silhueta (quadrados marchantes, sem IA) e gera placa ou chaveiro. Conferências por código: cabe na mesa, apoio, partes, balanços acima de 45°, superfície fechada. O app do Claude só salva `.zip` (não `.stl`): sai um `.zip` com `.stl` e `.scad`. Modelos ficam na conta (db, `data/users/<id>/modelos/lista`, sem as fotos). O OpenSCAD 2025.07 (núcleo Manifold) vem do jsDelivr: `openscad-wasm@0.0.4` (14 MB, `.wasm` embutido no `.js`) num worker criado da própria página, com reserva para compilar na página se o worker não abrir; as fontes do `text()` vêm de `@lofcz/openscad-wasm@0.0.2/openscad.fonts.js`. A mesma instância não aguenta duas execuções: cada compilação cria uma nova (o `.wasm` compilado é reaproveitado). Não há BOSL2 nem outra biblioteca: o artefato só pode carregar scripts dos CDNs permitidos, e Claude não publica arquivos que não consegue ler inteiros (o `.wasm`, a BOSL2). Para atualizar, publique de novo `modelador/index.html` com o Artifact tool (mesma URL); capacidades `sample` com `images: true`, `downloads`, `db`, `user`.
- `tests/`: verificador de G-code e modelos de teste (Node) e testes de navegador (Playwright), inclusive `tests/modelador.js` (Modelador com o Claude simulado).
- `tests/orca/`: como rodar o OrcaSlicer e o three-slicer e comparar os G-codes por tipo de trecho.
- `docs/historico.md`: resultados das impressões e o que cada versão mudou.
- `docs/plano-wasm.md`: plano (ainda não iniciado) de rodar o motor do Orca no navegador via WebAssembly.
- `docs/comparacao-orca.md`: comparação com o OrcaSlicer 2.5.1 e com o three-slicer, diferença por diferença.

**Ao mudar o motor:** suba a versão no nome do arquivo (`core.v17.js`, `worker.v17.js`), atualize as referências em `index.html` (as constantes `CORE_FILE` e `WORKER_FILE`; o selo do cabeçalho mostra "motor vN" a partir delas), `worker`, `sw.js` (lista `FILES` e nome do `CACHE`) e `tests/lib.js` (padrão de `CORE`). O nome versionado evita o iPad usar um motor velho em cache.

## G-code

Marlin, extrusão relativa (M83). Início e fim seguem o perfil oficial do Orca para a V3 SE (`ref/orca/v3se.json`): espera a mesa antes do G28, M420 S1, purga em X−2,1/X−2,4 a Z0,28; no fim recolhe, afasta, sobe, apresenta a peça em X0 Y220 e só então desliga. Desde a v11 escreve os mesmos limites de máquina que o Orca: `M201 X2500 Y2500 Z500 E5000`, `M203 X250 Y250 Z5 E40`, `M204 P2500 R500 T2500`, `M205 X10 Y10 Z0.4 E5`, `M205 J0.100`.

Desde a v12 as paredes saem como as do Orca: externa 0,42 mm, internas e preenchimento 0,45 mm (`innerW`, `infillW`), 1ª interna a 0,414 mm da externa ("parede externa precisa"), folga de 0,04 mm no fecho de todo laço, internas primeiro e externa por último. Retrai e limpa sempre que sai da parede externa ou vai para uma parede; só não retrai dentro da região interna da camada. O salto curto até a parede externa usa a aceleração dela (`M204 T`). O G-code leva os marcadores do Orca (`;TYPE:`, `;LAYER_CHANGE`, `;Z:`), além do nosso `;LAYER:n`.

Desde a v13 há dois ajustes para os cantos, os dois com o padrão do Orca: `wallOrder` (`inner` = internas primeiro; `outer` = externa primeiro, que como no Orca desliga a "parede externa precisa") e `corner` (`orca` = jerk 10 e `M205 J0.100`; `fast` = jerk 20 e `M205 J0.250`). As zonas por peça (`loopZones`) aceitam `order` e `corner`, e é assim que o teste 6 muda uma coisa em cada cubo.

Desde a v14 o suporte segue o estilo "grid" do Orca: a área em balanço é alargada para as células inteiras de uma grade fixa de 2,88 mm (`snapGrid`), o que dá torres largas e iguais de uma camada para a outra; o serrilhado é filtrado com 0,1 × a largura da linha (antes 0,3 mm, o que deixava sem suporte tudo entre uns 13° e o ângulo pedido, inclusive a base arredondada das peças); sobras com menos de 1,2 mm de largura são descartadas. Diferenças que ficaram: ângulo 35° (Orca 30°), folga XY 0,6 mm (Orca 0,35), interface menos densa, sem a borda larga na 1ª camada do suporte.

Desde a v15 há casca vertical, como o "ensure vertical shell thickness" do Orca: onde as camadas vizinhas têm parede (as de cima, até o nº de camadas de topo; as de baixo, até o de fundo), a camada leva sólido, desde que a faixa tenha pelo menos duas linhas de largura. É o que põe sólido debaixo de uma parede que nasce de um piso. Custa uns 30% a mais de tempo de fatiamento em peças muito curvas.

Desde a v16 a compensação de furos tira só o anel em volta de cada furo. Antes subtraía o furo alargado inteiro e apagava tudo o que ficava dentro dele (no Benchy com o perfil calibrado, a caixa de carga e a parede de trás da cabine, camadas 42 a 53).

Diferenças mantidas de propósito em relação ao Orca: pré-aquecimento do bico a 140 °C e `M420 S1` no início, 1ª camada de 0,50 mm com compensação de pé de elefante de 0,1 mm, limpeza deslocada para dentro da peça, z-hop vertical, pontes a 30 mm/s, contornos pequenos a 60%.

Firmware de fábrica sem linear advance (drivers TMC2208). Firmwares da comunidade (navaismo, queeup) têm M900, e o do navaismo tem M593. Trocar firmware é decisão do Rodrigo.

## Perfil calibrado (PLA)

Bico 205 °C (1ª camada 210), mesa 55 (1ª camada 60), fluxo 0,98, retração 1,2 mm a 40/30 mm/s, z-hop 0,2, vazão máxima 13 mm³/s, 3 paredes, topo 5, fundo 4, preenchimento 15% em linhas. Velocidades: 1ª camada 25, parede externa 40, interna 70, topo 40, sólido 80, preenchimento 120, deslocamento 150. Acelerações: externa 2500 (resultado do teste 8; era 700), interna 1500, topo 1000, padrão 2000, deslocamento 2500. Compensação XY +0,05 mm e compensação de furos +0,05 mm (teste 7).

A fonte desses valores é o `perfil-inicial.json`. **Os testes automáticos rodam com `DEFAULTS`, não com o perfil**: foi assim que o defeito da compensação de furos passou despercebido até a v15. `tests/comp.js` roda com as compensações do perfil; ao acrescentar um ajuste que muda a geometria, teste também com o valor do perfil. O G-code de referência do Orca em `ref/orca/gcode/` e os perfis em `tests/orca/perfis/` foram gerados antes do teste 8, com aceleração externa 700 e sem compensações; os testes automáticos usam `DEFAULTS`, que continuam assim.

## Testes

```bash
npm install                      # clipper-lib para os testes em Node
npm test                         # modelos sintéticos + as 9 peças de calibração + paredes iguais às do Orca + suporte + casca vertical + compensações do perfil; deve dar "OK sem erros" em todos
node tests/benchy.js             # usa modelos/3DBenchy.stl; aceita outro STL como argumento
python3 -m http.server 8765 &    # depois:
python3 tests/pages.py /opt/pw-browsers/chromium   # navegador: perfil inicial, fatiar sem CDN, baixar .gcode, exportar ajustes (antes: pip install playwright)
node tests/modelador.js          # Modelador com o Claude simulado: entender, gerar, conferir, mudar, baixar, relevo, texto, sem worker (baixa os pacotes do OpenSCAD pelo npm)
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
4. Calibração concluída em 16/11/2026 (os 9 testes). O único resultado sem solução é o dos cantos (pendência 1).
5. Suporte: falta imprimir uma peça com o suporte em grade da v14 (a ocarina do Rodrigo) e ver se solta bem. Se grudar demais, aproximar a interface da do Orca.
6. **Primeiro Benchy (16/11, motor v14):** a parede de trás da cabine soltou do convés e o teto saiu em fiapos. Causa achada e corrigida na v15 (casca vertical). **Falta reimprimir o Benchy.** Outros defeitos das fotos ainda sem causa confirmada: tracinhos em relevo no costado, perto da popa; superfície áspera no balanço da proa; fiapos finos. Hipótese não verificada para os tracinhos: o preenchimento de vãos entre paredes (11 m no Benchy desde a v12; o Orca, com Arachne, não usa preenchimento de vãos).
7. Desvios do Orca feitos para poupar tempo antes da definição de prioridade, a rever: a casca vertical da v15 descarta faixas com menos de duas linhas de largura (sem o limite o Benchy ia de 70 para 79 min, mas com bem mais sólido que o Orca, sinal de que a nossa conta ainda não é a dele); a máscara da casca usa uma camada sim, outra não.
8. **Ideia guardada para depois (decisão do Rodrigo, 16/11):** rodar o motor de verdade do Orca (`libslic3r`) no navegador, compilado para WebAssembly, em vez de continuar copiando trecho por trecho. Plano, riscos e teste proposto em `docs/plano-wasm.md`. Até lá, não investir em recursos grandes no motor próprio.
9. Ainda não tem: suporte em árvore, desvio de paredes nos deslocamentos, input shaping.
10. **Modelador (17/11):** testado só no Chromium com o Claude simulado. Falta o primeiro uso de verdade no iPad: pedido real com a IA, permissão do Claude, tempo de compilação no Safari, salvar o `.zip` e abrir no Fatiador. Ver também se o nível "Mais capaz" demora demais (cada rodada com a ferramenta leva de 30 s a alguns minutos).
