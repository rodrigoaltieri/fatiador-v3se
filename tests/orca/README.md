# Comparação com o OrcaSlicer

Ferramentas usadas em `docs/comparacao-orca.md`. Os comandos para instalar o Orca estão no começo de `rodar_orca.sh` e no `CLAUDE.md`.

| Arquivo | Para quê |
| --- | --- |
| `perfis/` | Perfis de usuário do Orca: herdam os oficiais da V3 SE 0.4 e trocam só os valores calibrados |
| `rodar_orca.sh` | Fatia um STL com o OrcaSlicer de verdade, sem interface |
| `modelos.js` | Gera `cube20.stl` e `cyl20.stl` (os mesmos modelos dos botões de exemplo) |
| `nosso.js` | Fatia um STL com o nosso motor e o `perfil-inicial.json` |
| `three_slicer.mjs` | Fatia um STL com o pacote `three-slicer` (instale-o numa pasta fora do repositório) |
| `analyze.py` | Resumo de um G-code por tipo de trecho: largura, velocidade, aceleração, retrações, limpeza, ventilador |
| `comparar_paredes.py` | Compara as paredes de dois G-codes ponto a ponto |
| `costura.py` | Mede quanto a costura salta de uma camada para a outra |

O teste automático é `tests/orca.js` (entra no `npm test`): compara as paredes do nosso motor com `ref/orca/gcode/`.
