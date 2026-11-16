# Plano: rodar o motor do OrcaSlicer no navegador (WebAssembly)

Ideia registrada em 16/11/2026, **para começar depois**, por decisão do Rodrigo. Nada disto foi tentado ainda.

## Por quê

O nosso motor (`core.vN.js`) é uma reescrita própria de cerca de 1.500 linhas. O motor do Orca (`src/libslic3r`) tem cerca de 340 mil linhas em 605 arquivos. Copiar trecho por trecho nunca chega a ser igual, e cada diferença só aparece quando uma impressão falha: foi assim com o fim do G-code, os limites de máquina, as paredes, o suporte e a casca vertical. Rodar o código do próprio Orca acaba com esse ciclo.

Com a prioridade "qualidade antes de tempo" (`CLAUDE.md`), arquivo maior e fatiamento mais lento deixam de ser objeção.

## O que já se sabe

- O `libslic3r` 2.5.1 depende de Boost, TBB, CGAL, OpenCASCADE, OpenCV, assimp, Draco, OpenVDB, Eigen, Clipper2, qhull e outras. Várias servem só para importar formatos (STEP, 3MF com miniaturas, malhas) e podem ficar de fora; o fatiamento de STL precisa de bem menos.
- O código-fonte clona com `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --branch v2.5.1 https://github.com/OrcaSlicer/orcaslicer`.
- O Orca nativo já roda pela linha de comando no ambiente da nuvem (seção "Comparar com o Orca" do `CLAUDE.md`), então há G-code de referência para comparar.
- O pacote `three-slicer` (npm) **não** serve de atalho: não é o `libslic3r`, é uma reescrita parcial (ver `docs/comparacao-orca.md`).

## Riscos

1. **Compilar:** nunca tentado com esse conjunto de dependências. TBB e Boost.Thread precisam de threads no WebAssembly (SharedArrayBuffer, que exige cabeçalhos de isolamento que o GitHub Pages não manda) ou de ser trocados por execução numa linha só.
2. **iPad:** o Safari limita a memória de uma página. O Benchy pode não caber.
3. **Licença:** o repositório passa a ser AGPL-3.0, como o Orca.

## Teste proposto (antes de qualquer troca)

1. Compilar o `libslic3r` para WebAssembly (Emscripten), sem as dependências de importação, e fatiar o cubo de 20 mm e o Benchy em Node.
2. Comparar com o Orca nativo: o esperado é G-code idêntico, ou diferente só no cabeçalho.
3. Publicar uma página de teste separada (sem mexer no site) e o Rodrigo abrir no iPad: o Benchy tem de fatiar sem travar.

Se passar nos três, o motor é trocado mantendo a interface, a calibração e os perfis. O que hoje é ajuste nosso vira configuração do Orca.

Se travar, anotar onde. O plano B é uma auditoria automática: comparar o nosso G-code com o do Orca num conjunto grande de peças, região por região, para achar as diferenças antes que cheguem à impressora. Melhora o motor atual, mas não o torna igual.

## Enquanto isso

Não investir em recursos grandes no motor próprio (paredes de largura variável, suporte em árvore) antes de saber o resultado do teste.
