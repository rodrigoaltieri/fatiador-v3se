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
| 7. Encaixe | — | Falta |
| 8. Aceleração (ghosting) | — | Falta |

## Problemas vistos nas impressões e o que resolveu

- **Dentinhos e buraco no canto da 1ª camada:** linhas de preenchimento sólido soltas junto à parede → ligadas ao longo da borda (v6). Deslocamento de 39 mm antes do preenchimento → começa pela ponta mais próxima (v7).
- **Fiapo entre saia e peça:** não retraía em deslocamento longo por fora → retrai (v6).
- **Ponta da rampa enrolada na torre de temperatura:** as três paredes começavam no canto em balanço → costura evita balanço e paredes internas começam junto da externa (v5).
- **Material pendurado no bico e marca onde a impressão acabava:** fim do G-code desligava tudo com o bico parado em cima da peça → fim igual ao oficial do Orca (v8).
- **Costura ruim no teste de vazão (parede única):** recuo "para dentro" sobre o ar → só recua quando há plástico por dentro; teste passou a usar modo vaso como o Orca (v9).
- **Cantos estufados:** G-code não escrevia limites de máquina (desvio de junção) → limites iguais aos do Orca (v11). A comparação com o Orca real mostrou que a parede externa já era idêntica; o que diferia era a parede interna 0,037 mm mais perto da externa, o salto brusco até a externa e pontinhos de sólido nas quinas do preenchimento → igualados ao Orca (v12). A confirmar imprimindo o cubo do v12 e o do Orca.
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
- **GitHub Pages (15/11/2026):** bibliotecas locais, download direto de `.gcode`, exportar/importar ajustes, perfil calibrado inicial, funciona sem internet.

## Comparação com o OrcaSlicer (15/11/2026)

- OrcaSlicer 2.5.1 rodado pela linha de comando (pacote do Flathub) com os perfis oficiais da V3 SE e os valores calibrados; cubo de 20 mm, cilindro Ø20 e 3DBenchy.
- Antes de mexer no motor: `npm test` com 21 "OK sem erros" e `tests/pages.py` passando. Depois: 23 (os 21 mais cubo e cilindro comparados com o Orca) e `tests/pages.py` passando.
- `three-slicer` 0.4.3 avaliado em Node: fatia o Benchy em 1,9 s, mas não reproduz o Orca (parede externa primeiro, 0,46 mm, 20% de preenchimento com o perfil de 15%, borda de 5 mm com o perfil sem borda). Descartado como substituto.
