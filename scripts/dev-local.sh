#!/bin/sh
# Levanta el mostrador para trabajar en esta máquina.
#
# Carga .env.local (que git ignora) y arranca el servidor. Ahí va la clave del
# Estudio: en el código nunca, porque el archivo del navegador la mostraría.
set -eu
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
else
  echo "[iman] no hay .env.local — el Estudio va a pedir la clave que no está cargada."
fi

exec npm run dev
