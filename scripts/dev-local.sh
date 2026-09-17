#!/bin/sh
# Levanta el mostrador para trabajar en esta máquina.
#
# Carga .env.local (que git ignora) y arranca el servidor. Ahí va la clave del
# Estudio: en el código nunca, porque el archivo del navegador la mostraría.
#
# Antes de arrancar canta las direcciones para entrar desde el celular o desde
# otra PC de la misma wifi, así no hay que ir a buscar la IP a mano.
set -eu
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
else
  echo "[iman] no hay .env.local — el Estudio va a pedir la clave que no está cargada."
fi

# La IP de la wifi cambia cuando el router la reparte de nuevo; el nombre de la
# máquina no, así que se muestran los dos y el dueño usa el que le funcione.
ip_wifi=$(hostname -I 2>/dev/null | awk '{print $1}')
nombre=$(hostname 2>/dev/null || echo "")

echo ""
echo "  IMAN — mostrador"
echo ""
echo "   en esta máquina   http://localhost:8080"
if [ -n "$ip_wifi" ]; then echo "   en la wifi        http://$ip_wifi:8080"; fi
if [ -n "$nombre" ]; then echo "   o por el nombre   http://$nombre.local:8080"; fi
echo ""
echo "   El celular tiene que estar en la misma wifi. Se vende, se cobra y se"
echo "   entra con la clave del dueño igual que acá. Lo único que no anda por"
echo "   la red es instalar IMAN como app y seguir vendiendo sin internet:"
echo "   para eso el navegador exige https, y en la wifi vamos por http."
echo ""

exec npm run dev
