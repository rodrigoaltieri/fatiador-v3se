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
- **Cantos estufados:** G-code não escrevia limites de máquina (desvio de junção) → limites iguais aos do Orca (v11). A confirmar.

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
- **GitHub Pages (15/11/2026):** bibliotecas locais, download direto de `.gcode`, exportar/importar ajustes, perfil calibrado inicial, funciona sem internet.
