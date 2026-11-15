#!/bin/bash
# Fatia um STL com o OrcaSlicer de verdade (pacote do Flathub), sem interface gráfica.
# uso: tests/orca/rodar_orca.sh modelo.stl pasta_de_saida
# Antes (uma vez):  apt-get install -y flatpak && flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
#                   flatpak install --user -y flathub com.orcaslicer.OrcaSlicer
# "flatpak run" não funciona em contêiner sem D-Bus; por isso o programa é chamado direto, com as bibliotecas do runtime.
set -e
A=$(readlink -f ~/.local/share/flatpak/app/com.orcaslicer.OrcaSlicer/current/active/files)
R=$(readlink -f ~/.local/share/flatpak/runtime/org.gnome.Platform/x86_64/*/active/files | tail -1)
HERE=$(cd "$(dirname "$0")" && pwd)
STL=$(readlink -f "$1"); OUT=$(mkdir -p "$2" && cd "$2" && pwd)
[ -e /app ] || ln -s "$A" /app   # o Orca procura os recursos em /app/share/OrcaSlicer
# pasta de dados: perfis de sistema (caches .opc que vêm no pacote) + os três perfis de usuário desta pasta
D="$OUT/datadir"; mkdir -p "$D/system" "$D/user/default/machine" "$D/user/default/process" "$D/user/default/filament" "$OUT/home"
cp /app/share/OrcaSlicer/profiles/Creality.opc /app/share/OrcaSlicer/profiles/OrcaFilamentLibrary.opc "$D/system/"
cp "$HERE/perfis/maquina.json" "$D/user/default/machine/Rodrigo V3SE 0.4.json"
cp "$HERE/perfis/processo.json" "$D/user/default/process/Rodrigo 0.20 calibrado.json"
cp "$HERE/perfis/filamento.json" "$D/user/default/filament/Rodrigo PLA calibrado.json"
cd "$OUT"
export LC_ALL=C LC_NUMERIC=C HOME="$OUT/home" XDG_DATA_DIRS="$A/share:$R/share" FONTCONFIG_PATH="$R/etc/fonts"
# --align-to-y-axis=0: sem isso o Orca gira a peça 90° ao arrumar a mesa (impressoras de mesa móvel)
"$R/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2" --library-path "$A/lib:$R/lib/x86_64-linux-gnu:$R/lib" /app/bin/orca-slicer \
  --datadir "$D" --debug 1 \
  --load-settings "$D/user/default/machine/Rodrigo V3SE 0.4.json;$D/user/default/process/Rodrigo 0.20 calibrado.json" \
  --load-filaments "$D/user/default/filament/Rodrigo PLA calibrado.json" \
  --arrange 1 --align-to-y-axis=0 --orient 0 --slice 0 --outputdir "$OUT" "$STL"
echo "G-code em $OUT/plate_1.gcode"
