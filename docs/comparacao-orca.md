# Comparação com o OrcaSlicer de verdade

Feita em 15/11/2026, com o motor v11 como ponto de partida. O que foi copiado virou o motor v12.

## Resumo

- **No cubo de 20 mm, a parede externa do v11 já era idêntica à do Orca**: mesmas coordenadas, mesmo fluxo, mesma velocidade (40 mm/s) e mesma aceleração (700). Os limites de máquina no cabeçalho também (são iguais desde a v11).
- O que era diferente estava **em volta** da parede externa: as paredes internas (largura e distância até a externa), a retração depois da parede externa, a aceleração do pequeno salto até ela e a costura em peças redondas.
- No v12, **todas as paredes do cubo coincidem com as do Orca** (3.564 pontos comparados, desvio 0,0000 mm, mesmo fluxo). No cilindro ficam a 0,025 mm (o Orca simplifica o círculo de 128 para 64 lados) e a costura fica parada no mesmo ponto, como a dele.
- **Cantos estufados:** se o v12 ainda estufar os cantos, a causa não está mais na trajetória das paredes. O teste que decide é imprimir os dois arquivos do mesmo cubo, o do v12 e o do próprio Orca (`ref/orca/gcode/cubo20_orca-2.5.1.gcode`), e comparar.
- **three-slicer:** não é o motor do Orca. O próprio G-code dele diz `OrcaSlicer RE mini-kernel — NOT full libslic3r`, e a saída difere do Orca em pontos básicos. Não recomendo trocar o nosso motor por ele.

## Como a comparação foi feita

| Item | O que foi usado |
| --- | --- |
| OrcaSlicer | 2.5.1, pacote oficial do Flathub (`com.orcaslicer.OrcaSlicer`), rodando pela linha de comando, sem interface |
| Perfis do Orca | `Creality Ender-3 V3 SE 0.4 nozzle`, `0.20mm Standard @Creality Ender3V3SE 0.4`, `Generic PLA @Creality Ender-3V3-all` (os de `ref/orca/` são idênticos aos do 2.5.1) |
| Valores trocados | Só os do perfil calibrado: 205/210 °C, mesa 55/60, fluxo 0,98, vazão máx. 13 mm³/s, retração 1,2 mm a 40/30, z-hop 0,2, 3 paredes, topo 5, fundo 4, 15% em linhas, velocidades 25/40/70/40/80/120/150, acelerações 700/1500/1000/2000/2500 |
| Modelos | Cubo de 20 mm, cilindro Ø20 × 20 (128 lados), 3DBenchy oficial, todos na mesma posição e orientação |
| Nosso motor | v11 e v12 com `perfil-inicial.json` |
| three-slicer | 0.4.3 do npm, em Node, com os presets da V3 SE que vêm no pacote mais os mesmos valores calibrados |

O AppImage da página de releases do GitHub não pôde ser baixado: nesta sessão o GitHub só libera leitura por `git`, e os arquivos de release ficam fora disso. O pacote do Flathub é o canal Linux que o README do Orca recomenda e é a mesma versão.

Para repetir: `tests/orca/rodar_orca.sh modelo.stl pasta` (instruções de instalação no começo do arquivo), `tests/orca/analyze.py` para o resumo por tipo de trecho e `tests/orca/comparar_paredes.py` para a comparação ponto a ponto. O `npm test` agora inclui `tests/orca.js`, que compara as paredes do nosso motor com o G-code de referência guardado em `ref/orca/gcode/`.

## Números gerais

| Peça | Motor | Tempo estimado | Filamento | Retrações | Deslocamento em vazio |
| --- | --- | --- | --- | --- | --- |
| Cubo 20 mm | Orca 2.5.1 | 17,4 min | 1,40 m (4,16 g) | 199 | 4,0 m |
| | v11 | 17,1 min | 1,27 m (3,77 g) | 101 | 8,5 m |
| | v12 | 16,8 min | 1,37 m (4,09 g) | 201 | 3,3 m |
| | three-slicer | 14,4 min | 1,37 m (4,10 g) | 202 | 21,1 m |
| Cilindro Ø20 | Orca 2.5.1 | 16,1 min | 1,09 m (3,25 g) | 156 | 3,1 m |
| | v11 | 14,3 min | 1,00 m (2,97 g) | 101 | 4,2 m |
| | v12 | 14,3 min | 1,06 m (3,16 g) | 205 | 2,5 m |
| | three-slicer | 17,4 min | 1,08 m (3,22 g) | 178 | 15,8 m |
| 3DBenchy | Orca 2.5.1 | 64,0 min | 4,17 m (12,4 g) | 1.853 | 34,4 m |
| | v11 | 66,4 min | 3,78 m (11,3 g) | 968 | 23,5 m |
| | v12 | 69,6 min | 3,86 m (11,5 g) | 1.815 | 23,0 m |
| | three-slicer | 81,7 min | 3,61 m (10,8 g) | 4.474 | 110,5 m |

O tempo é a estimativa de cada fatiador, não tempo medido na impressora. O deslocamento do Orca inclui as voltinhas do z-hop em espiral.

## Diferenças por tipo de trecho

"Copiado" quer dizer que o v12 passou a fazer como o Orca.

### Cabeçalho, limites de máquina, início e fim

| Trecho | Orca | Nosso (v11) | Efeito na peça | No v12 |
| --- | --- | --- | --- | --- |
| Limites de máquina | `M201 X2500 Y2500 Z500 E5000`, `M203 X250 Y250 Z5 E40`, `M204 P2500 R500 T2500`, `M205 X10 Y10 Z0.40 E5`, `M205 J0.100` | Idênticos | Nenhum | Igual |
| Aquecimento | Bico direto a 210 °C enquanto a mesa aquece e a máquina faz o home | Bico a 140 °C até chegar à linha de purga | O nosso escorre menos durante o home | Mantido o nosso |
| Nivelamento | Não manda `M420 S1` | Manda `M420 S1` depois do `G28` | Garante a malha salva, sem custo | Mantido o nosso |
| Purga | Duas linhas em X−2,1 e X−2,4, depois recolhe 1,0 mm | Iguais, recolhe 1,2 mm | Nenhum | Mantido |
| Fim | Recolhe, afasta, sobe, apresenta a peça, desliga | Idêntico | Nenhum | Igual |
| Marcadores | `;TYPE:`, `;LAYER_CHANGE`, `;Z:`, `;HEIGHT:`, `;WIPE_START/END` | Só `;LAYER:n` | Visualizadores de G-code não coloriam por tipo | Copiado |
| Deslocamentos | `G1` | `G0` | Nenhum na prática; evita depender de como o firmware trata `G0` | Copiado |

### Paredes

| Trecho | Orca | Nosso (v11) | Efeito na peça | No v12 |
| --- | --- | --- | --- | --- |
| Ordem | Internas de dentro para fora, externa por último | Igual | Nenhum | Igual |
| Parede externa | 0,42 mm, 40 mm/s, aceleração 700 | Idêntica, trecho a trecho | Nenhum | Igual |
| Largura das internas | 0,45 mm | 0,42 mm | Casca 0,08 mm mais fina no nosso; 7% menos plástico nas paredes internas | Copiado (`innerW`) |
| Distância externa → 1ª interna | 0,414 mm ("parede externa precisa": metade da sobreposição) | 0,377 mm (sobreposição inteira) | No nosso, a interna fica mais perto e a externa, impressa depois, é empurrada para fora. Aparece mais onde o bico desacelera, que é nos cantos | Copiado |
| Folga no fecho do laço | 0,04 mm em todas as paredes | Só na externa | Bolinha na emenda das internas, que encosta na externa | Copiado |
| Salto da interna para a externa | Com a aceleração da parede externa (`M204 T700`) | Com a aceleração de deslocamento (2500) | A externa começava logo depois de um tranco | Copiado |
| Contornos pequenos | Sem redução (limite 0 no perfil) | 60% da velocidade em laços com menos de 40 mm | No Benchy, 22% da parede externa sai a 24 mm/s no nosso. Mais lento, furos e pinos mais na medida | Mantido o nosso |
| Balanço | 20, 15 e 10 mm/s conforme o grau | 20 e 12 mm/s | Parecido | Mantido |
| Vãos e paredes finas | Arachne: uma linha de largura variável | Duas passadas de fluxo reduzido | Resultado parecido; o do Orca é mais limpo em paredes muito finas | Não copiado (seria reescrever a geração de paredes) |

### Costura

| Trecho | Orca | Nosso (v11) | Efeito na peça | No v12 |
| --- | --- | --- | --- | --- |
| Cubo | Sempre na mesma quina (traseira direita) | Sempre na mesma quina (traseira esquerda) | Nenhum | Igual (a quina é a que você escolheu nos ajustes) |
| Cilindro | Exatamente no mesmo ponto nas 100 camadas | Atrás, mas andando até 2 mm de lado nas camadas 6 a 28 | Costura em zigue-zague em peças redondas | Copiado: variação de 0,005 mm |
| Benchy | 9% das camadas com salto maior que 1 mm | 22% | Costura mais espalhada no casco | Copiado: 7% |

A causa no v11 era tratar como "quina" qualquer emenda de trechos curtinhos de um contorno curvo. O v12 mede a quina numa janela de 0,6 mm para cada lado e, como o Orca, mantém a costura onde ela estava na camada de baixo.

### Retração, limpeza e z-hop

| Trecho | Orca | Nosso (v11) | Efeito na peça | No v12 |
| --- | --- | --- | --- | --- |
| Quando retrai | Sempre ao sair da parede externa e sempre ao ir para uma parede; só não retrai dentro da região interna da camada, com preenchimento | Só ao cruzar o contorno da peça ou passar por fora | No nosso, o bico saía da costura direto para o preenchimento, sem recolher e sem limpar, e atravessava topo e paredes carregado | Copiado |
| Retrações no cubo | 2 por camada | 1 por camada | | 2 por camada |
| Distância mínima | 2 mm | 1 mm (ajuste `retMinTravel`) | O nosso retrai em saltos mais curtos | Mantido o ajuste |
| Limpeza (wipe) | 70% da retração parado, o resto em 1 mm ao longo do próprio laço, na velocidade do trecho, em toda retração | 70% parado, o resto em 1,5 mm deslocado para dentro da peça, a 120 mm/s, só depois da parede externa | O nosso tira o bico da face externa; o do Orca também limpa depois do preenchimento | Mantido o nosso; passou a acontecer em toda saída da parede externa |
| Z-hop | Em espiral, 16 trechos, subindo durante o movimento | Vertical, a 5 mm/s | A espiral não deixa o bico parado em cima da costura. Custa 16 linhas de G-code por salto | Não copiado |
| Sobra de retração | Não tem | Comandos `G1 E-0.00001` depois de algumas limpezas | Nenhum, mas o extrusor era chamado à toa | Corrigido |

### Preenchimento, topo e fundo

| Trecho | Orca | Nosso (v11) | Efeito na peça | No v12 |
| --- | --- | --- | --- | --- |
| Linhas do preenchimento | Ligadas uma à outra junto da parede, extrudando sem parar | Cada linha separada, com salto em vazio entre elas | No nosso, 8,5 m de deslocamento no cubo contra 4,0 m; cada linha começava com o bico meio vazio | Copiado |
| Largura do preenchimento | 0,45 mm, linhas a cada 2,71 mm | 0,42 mm, a cada 2,51 mm | Praticamente o mesmo plástico | Copiado (`infillW`) |
| Quinas do preenchimento | Nada | Um pontinho de "sólido" de 0,2 mm em cada quina, em toda camada | Quatro paradas por camada a 1,2 mm de cada canto do cubo | Removido |
| Primeira camada sólida sobre o preenchimento | "Ponte interna": linha grossa de 0,64 mm a 111 mm/s | Camada sólida normal | O Orca fecha o topo com menos camadas | Não copiado (com 5 camadas de topo não faz falta) |
| Topo | Linhas monotônicas de 0,42 mm a 40 mm/s, sobreposição de 25% com a parede | Linhas num só sentido, 0,42 mm, 40 mm/s, sobreposição de 15% | No nosso pode sobrar uma frestinha entre topo e parede | Não copiado; candidato para a próxima versão |
| Área tratada como topo | Maior (3,5 m no Benchy) | Menor (1,9 m) | O Orca imprime devagar uma faixa em volta de cada área exposta | Não copiado |
| Primeira camada | 0,46 mm, sem compensação de pé de elefante | 0,50 mm, compensação de 0,1 mm | Conferida no passo 0 da calibração | Mantido o nosso |
| Saia | Nenhuma no perfil | 1 volta | Ajuste seu | Mantido |

### Velocidade, aceleração e ventilador

| Trecho | Orca | Nosso (v11) | Efeito na peça | No v12 |
| --- | --- | --- | --- | --- |
| Velocidades e acelerações por tipo | As do perfil calibrado | As mesmas | Nenhum | Igual |
| Tempo mínimo de camada | Corta primeiro os trechos mais rápidos até um teto comum. No cubo: internas e preenchimento a 50 mm/s, externa intacta a 40 | Reduzia tudo na mesma proporção, a externa junto | No nosso, a velocidade da parede externa mudava de uma camada para outra, e com ela o brilho | Copiado |
| Valores do tempo mínimo | 8 s, mínimo 20 mm/s (perfil do filamento) | 6 s, mínimo 15 mm/s (seus ajustes) | Com 8 s o Orca desacelera mais em peças pequenas | Mantidos os seus ajustes |
| Pontes | 100 mm/s, aceleração 350 | 30 mm/s, aceleração 2000 | 100 mm/s é agressivo para PLA sem suporte | Mantido o nosso |
| Aceleração de deslocamento | `M204 T` explícito | Só o valor do cabeçalho | Nenhum, fora o salto para a parede externa | Copiado |
| Ventilador | 0 na 1ª camada, 100% a partir da 2ª | 0, 50% na 2ª, 100% a partir da 3ª | Quase igual | Mantido (ajuste `fanFullLayer`) |

## Cantos estufados: o que a comparação mostra

1. **A parede externa não era a diferença.** No cubo, o v11 e o Orca mandam exatamente os mesmos movimentos para a parede externa. Nenhum dos dois faz algo especial nos cantos.
2. **Os limites de máquina eram a única diferença na própria parede** entre o que você imprimiu (v10, sem `M201`–`M205`) e o Orca. Com desvio de junção, a velocidade no canto depende da aceleração e do valor de `J`, não da velocidade pedida. Isso combina com o que você viu: 25 e 40 mm/s deram o mesmo canto. A v11 já corrigiu, e continua faltando imprimir para confirmar.
3. **Em volta da parede havia três diferenças que põem plástico a mais perto do canto**, todas copiadas no v12: a parede interna 0,037 mm mais perto da externa, o salto brusco até o começo da externa e os pontinhos de sólido nas quinas do preenchimento.
4. **Agora o cubo do v12 e o do Orca têm as mesmas paredes.** As diferenças que sobram em camadas do meio são a quina em que fica a costura, a forma da limpeza, o z-hop vertical e o tempo mínimo de 6 s em vez de 8 s.

O que imprimir e como ler o resultado está no fim deste documento.

## three-slicer

Pacote `three-slicer` 0.4.3 (AGPL-3.0-or-later), rodado em Node com os presets da V3 SE que vêm dentro dele.

| Pergunta | Resposta |
| --- | --- |
| É o motor do Orca compilado para WASM? | Não. A descrição diz "reverse-engineered from OrcaSlicer" e o G-code traz `OrcaSlicer RE mini-kernel — NOT full libslic3r`. Os perfis e a lista de ajustes são os do Orca; o código que fatia é outro |
| O G-code bate com o do Orca? | Não. Imprime a parede externa primeiro (o Orca imprime por último), com 0,46 mm em vez de 0,42 e sem sobreposição entre paredes; não faz limpeza nem folga na costura; z-hop vertical; desfaz a retração a 40 mm/s em vez de 30 |
| Respeita o perfil oficial? | Não inteiro. Com o preset oficial sem mexer em nada, usou 20% de preenchimento onde o perfil diz 15%, e pôs uma borda (brim) de 5 mm onde o perfil diz sem borda |
| Deslocamentos | 110 m no Benchy contra 34 m do Orca; 4.474 retrações contra 1.853 |
| Tempo para fatiar o Benchy | 1,9 s em Node (o nosso leva 2,3 s; o Orca nativo, 2,3 s com a carga do programa) |
| Tamanho | 6,5 MB de WASM mais 5,9 MB de dados; o nosso motor tem 77 KB |
| Calibração | Não tem os recursos que a aba Calibração usa (vazão por zona, retração e velocidade por altura, costura por peça) |

**Conclusão:** não vale substituir. Ele não aproxima o resultado do Orca mais do que o v12 aproxima, está mais longe nos pontos que importam para a V3 SE, traria 12 MB para o iPad, obrigaria o repositório a virar AGPL e exigiria refazer os nove testes de calibração. A parte útil do pacote são os dados (perfis e lista de ajustes do Orca), que já temos em `ref/orca/`.

## O que mudou no v12

1. Paredes internas de 0,45 mm e distância externa → interna do Orca ("parede externa precisa").
2. Regra de retração do Orca: retrai e limpa sempre que sai da parede externa.
3. Salto curto até a parede externa com a aceleração dela (`M204 T`).
4. Costura alinhada com a camada de baixo; quina medida numa janela de 0,6 mm.
5. Folga de 0,04 mm no fecho de todas as paredes.
6. Tempo mínimo de camada cortando primeiro os trechos mais rápidos; pontes não desaceleram.
7. Preenchimento em linhas ligadas, com 0,45 mm; sem pontinhos de sólido nas quinas.
8. Marcadores `;TYPE:`, `;LAYER_CHANGE`, `;Z:`, `;HEIGHT:`, `;WIPE_START/END`; deslocamentos em `G1`.
9. Correção das retrações de 0,00001 mm.

Efeito colateral medido no Benchy: como as paredes internas ficaram mais largas, trechos do casco com cerca de 2 mm de espessura deixaram de caber a terceira parede e passaram a ser preenchidos como vão (11 m de "vão" contra 1,3 m no v11, com o mesmo plástico no total). O tempo estimado subiu de 66 para 70 min, pelas retrações a mais e por esses vãos a 40 mm/s.

## O que ficou de fora

- Z-hop em espiral.
- Sobreposição de 25% entre topo e parede, e a faixa maior tratada como topo.
- Ponte interna grossa sobre o preenchimento.
- Paredes de largura variável (Arachne).
- Limpeza depois do preenchimento.

## O que imprimir para confirmar

1. **Cubo de 20 mm pelo fatiador (v12)**, com o perfil calibrado, sem mudar nada.
2. **O mesmo cubo fatiado pelo Orca**: `ref/orca/gcode/cubo20_orca-2.5.1.gcode`. É o arquivo que saiu do OrcaSlicer 2.5.1 com os seus valores calibrados. Não tem saia e a primeira camada é a do Orca (0,46 mm, sem compensação de pé de elefante).

Como ler:

| Resultado | Conclusão |
| --- | --- |
| Os dois com cantos bons | Resolvido: eram os limites de máquina (v11) e as paredes internas (v12) |
| O do Orca bom, o do v12 estufado | A causa está no que ainda é diferente: limpeza, z-hop vertical ou tempo mínimo de camada. Próximo passo: copiar esses três |
| Os dois estufados | Não é o fatiador. Olhar temperatura, fluxo e o firmware (`M503` mostra o desvio de junção e o jerk em uso; sem linear advance o canto sempre recebe um pouco mais de plástico) |

### Resultado (15/11/2026)

Os dois cubos saíram com as mesmas protuberâncias nos cantos. É a terceira linha da tabela: a trajetória do fatiador está descartada como causa. O que os dois arquivos têm em comum são os valores do perfil calibrado e a máquina.
