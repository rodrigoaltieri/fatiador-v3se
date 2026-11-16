# Histórico: impressões e versões

## Resultados de calibração (Ender-3 V3 SE, PLA)

| Passo | Data | Resultado |
| --- | --- | --- |
| 0. Primeira camada | 13–14/11/2026 | Variação entre pontos era nivelamento/chapa; resolvida limpando a chapa e refazendo o nivelamento automático. Conferido |
| 1. Temperatura | 13/11 | **205 °C** (1ª camada 210). Fiapos de 220 °C para cima |
| 2–3. Fluxo | 14/11 | **0,98** nas duas passadas |
| 4. Retração | 14/11 | **1,2 mm** |
| 5. Vazão máxima | 14/11 | Falha a partir de 16 mm³/s → **13 mm³/s** |
| 6. Cantos e costura | 14–15/11 | Inconclusivo: todos os cubos com cantos estufados, a velocidade não mudou nada. Lados de 19,9 a 20,1 mm. Costura na quina ficou melhor no cubo |
| Cubo v12 × cubo do Orca | 15/11 | **Os dois com as mesmas protuberâncias nos cantos.** O G-code do próprio OrcaSlicer 2.5.1, com o perfil calibrado, dá o mesmo defeito: a causa não é a trajetória do fatiador |
| 6. Cantos (teste novo) | 15/11 | **Os quatro cubos iguais**, todos com os cantos um pouco inchados. Parede externa primeiro, cantos mais rápidos (jerk 20, J0,250) e fluxo 6% menor não mudaram nada perceptível |
| 7. Encaixe | 15–16/11 | O pino entrou sem forçar a partir do **furo 2 (folga 0,1 mm)** → compensação de furos **+0,05 mm**. Cubo medido no meio da face → compensação XY **+0,05 mm** |
| 8. Aceleração (ghosting) | 16/11 | Nenhuma faixa com ondulações → aceleração da parede externa **2500 mm/s²** (era 700) |

## Problemas vistos nas impressões e o que resolveu

- **Dentinhos e buraco no canto da 1ª camada:** linhas de preenchimento sólido soltas junto à parede → ligadas ao longo da borda (v6). Deslocamento de 39 mm antes do preenchimento → começa pela ponta mais próxima (v7).
- **Fiapo entre saia e peça:** não retraía em deslocamento longo por fora → retrai (v6).
- **Ponta da rampa enrolada na torre de temperatura:** as três paredes começavam no canto em balanço → costura evita balanço e paredes internas começam junto da externa (v5).
- **Material pendurado no bico e marca onde a impressão acabava:** fim do G-code desligava tudo com o bico parado em cima da peça → fim igual ao oficial do Orca (v8).
- **Costura ruim no teste de vazão (parede única):** recuo "para dentro" sobre o ar → só recua quando há plástico por dentro; teste passou a usar modo vaso como o Orca (v9).
- **Cantos estufados:** G-code não escrevia limites de máquina (desvio de junção) → limites iguais aos do Orca (v11). A comparação com o Orca real mostrou que a parede externa já era idêntica; o que diferia era a parede interna 0,037 mm mais perto da externa, o salto brusco até a externa e pontinhos de sólido nas quinas do preenchimento → igualados ao Orca (v12). Impressos os dois cubos (v12 e o do próprio Orca) em 15/11: **mesmas protuberâncias nos dois**. O defeito vem de algo que os dois arquivos têm em comum (valores do perfil calibrado: fluxo, temperatura, velocidade e aceleração da parede externa, ordem das paredes) ou da máquina (firmware sem linear advance, correias, filamento). Em aberto.
- **Costura em zigue-zague em peças redondas** (visto na comparação, não em impressão): a costura andava até 2 mm de lado entre camadas do cilindro, porque emendas de trechos curtos contavam como quina → quina medida numa janela de 0,6 mm e costura presa à da camada de baixo (v12).

## Versões do motor

- **v2:** conferido com o perfil oficial (retração 1,2 mm, purga oficial, deslocamento 150). Fluxo por espessura em paredes finas, preenchimento de vãos, 100% sólido de verdade, pontes, estimativa de tempo com aceleração.
- **v3:** balanços mais lentos com ventilador a 100%, contornos pequenos a 60%, topo num só sentido, alisamento (ironing), testes de primeira camada e ghosting.
- **v4:** Benchy fatia em ~1,6 s sem erros; costura em rampa (scarf); folga de 0,1 mm na borda.
- **v5:** costura fora de balanços, paredes internas começam junto da externa.
- **v6:** ligações nas linhas sólidas, retração em deslocamentos longos, espera a mesa antes do G28.
- **v7:** início do topo/fundo pela ponta mais próxima; saia de cada peça logo antes dela.
- **v8:** fim do G-code oficial; ajustes sincronizados na conta (versão artefato).
- **v9:** recuo na costura só com plástico por dentro; modo vaso.
- **v10:** costura "atrás, no meio da face"; teste de cantos e costura.
- **v11:** limites de máquina iguais aos do Orca (`M205 J0.100` etc.), aceleração de retração 500.
- **v12 (15/11/2026):** comparação com o OrcaSlicer 2.5.1 real (`docs/comparacao-orca.md`). Paredes internas de 0,45 mm e distância externa → interna do Orca; retração e limpeza sempre que sai da parede externa; salto até a externa com a aceleração dela; costura alinhada entre camadas; folga de 0,04 mm em todas as paredes; tempo mínimo de camada cortando primeiro os trechos mais rápidos; preenchimento em linhas ligadas de 0,45 mm; marcadores `;TYPE:` do Orca. No cubo de 20 mm as paredes coincidem com as do Orca (desvio 0,0000 mm). Benchy: 69,6 min estimados (v11: 66,4), fatia em ~2,3 s.
- **v13 (15/11/2026):** ajustes "Ordem das paredes" (internas primeiro ou externa primeiro) e "Velocidade nos cantos" (jerk 10 / J0,100 do Orca, ou jerk 20 / J0,250), os dois com o padrão do Orca. Teste 6 refeito: em vez de velocidade e posição da costura (que não mudaram nada), quatro cubos de 20 × 20 × 12 mm que mudam uma coisa cada. O G-code padrão não mudou: as paredes do cubo continuam coincidindo com as do Orca.
- **v14 (15/11/2026):** suporte refeito no estilo "grid" do Orca. Na ocarina do Rodrigo o v13 gerava uma lâmina de 2 mm sob o bocal, uma parede curva de uma linha sob a junção e três pilares de 1 mm de lado com 20 a 30 mm de altura, e nenhum calço sob a base arredondada. O OrcaSlicer 2.5.1, na mesma peça, gera blocos de 6 mm ou mais, com interface, e o calço. Causas: a área em balanço era usada crua, sem alargar, e um filtro de 0,3 mm descartava todo balanço entre uns 13° e o ângulo pedido. Agora: 40,9 m de suporte contra 38,1 m do Orca, nos mesmos lugares.
- **v15 (16/11/2026):** casca vertical, como o "ensure vertical shell thickness" do Orca. No primeiro Benchy a parede de trás da cabine soltou do convés: nas camadas sólidas do convés, o pedaço de piso debaixo da parede ficava só com o preenchimento de 15%, porque só era sólido o que ficava exposto. O Orca, nas mesmas camadas, põe sólido ali. Agora toda faixa com parede nas camadas vizinhas leva sólido (mínimo de duas linhas de largura). Benchy: 71,0 min e 12,0 g (v14: 69,6 min e 11,5 g; Orca: 64 min e 12,4 g).
- **GitHub Pages (15/11/2026):** bibliotecas locais, download direto de `.gcode`, exportar/importar ajustes, perfil calibrado inicial, funciona sem internet.

## Primeiro Benchy (16/11/2026)

- **Parede de trás da cabine solta e torta, teto em fiapos:** a parede nascia sobre o preenchimento de 15%, sem sólido por baixo → casca vertical (v15). O teto em fiapos é consequência: foi impresso por cima da parede já fora do lugar. A confirmar reimprimindo.
- **Ainda sem causa confirmada:** tracinhos em relevo no costado perto da popa, aspereza no balanço da proa, fiapos finos.

## Calibração concluída (16/11/2026)

- Os 9 testes estão feitos e o resultado foi gravado em `perfil-inicial.json`, a partir do arquivo exportado pelo Rodrigo. A calibração saiu da frente: fica atrás do botão "Recalibrar", no fim de Avançado.
- **Ajustes que não batiam com a calibração:** no arquivo exportado, os resultados diziam furos 0,05 mm, XY 0,050 mm e aceleração 2500, mas os ajustes estavam em 0, 0 e 700. Aplicar um resultado funciona (conferido no navegador de teste); o que zera esses três e mantém os resultados é o botão "Restaurar perfil PLA Rodrigo", que voltava aos valores de fábrica do fatiador em vez do perfil calibrado. O botão agora carrega o `perfil-inicial.json` (ajustes e resultados juntos).

## Suportes (15/11/2026)

- **Suportes estranhos na ocarina** (visto na prévia, antes de imprimir): torres finas demais para ficar em pé e base arredondada sem calço → suporte em grade como o do Orca (v14). Falta imprimir para conferir.

## Modelos com defeito (15/11/2026)

- **Ocarina com "glitch" num furo:** o STL estava cortado (cabeçalho com 176.264 triângulos, arquivo com 175.633; os 631 que faltam são todos de um furo, entre 116 e 124 mm de altura). A página lia o que havia e fatiava calada; em algumas camadas o contorno aberto era fechado em linha reta por cima do furo. O OrcaSlicer 2.5.1 recusa abrir esse arquivo. Agora a página avisa ao abrir e depois de fatiar quando o STL vem incompleto ou a superfície está aberta, e diz em que altura fica o defeito. Os outros furos fatiam limpos; o "V" que aparece dentro deles na tela Modelo é a forma do furo no próprio modelo.

## Comparação com o OrcaSlicer (15/11/2026)

- OrcaSlicer 2.5.1 rodado pela linha de comando (pacote do Flathub) com os perfis oficiais da V3 SE e os valores calibrados; cubo de 20 mm, cilindro Ø20 e 3DBenchy.
- Antes de mexer no motor: `npm test` com 21 "OK sem erros" e `tests/pages.py` passando. Depois: 23 (os 21 mais cubo e cilindro comparados com o Orca) e `tests/pages.py` passando.
- `three-slicer` 0.4.3 avaliado em Node: fatia o Benchy em 1,9 s, mas não reproduz o Orca (parede externa primeiro, 0,46 mm, 20% de preenchimento com o perfil de 15%, borda de 5 mm com o perfil sem borda). Descartado como substituto.
