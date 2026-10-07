# Minecraft 2

Clon de Minecraft en **un único archivo**: `minecraft2.html` (WebGL2, sin servidor). Ábrelo en Chrome/Edge/Firefox.

## Cómo jugar
- **Un jugador**: crea un mundo (semilla, modo Supervivencia/Creativo, dificultad).
- **Multijugador**: abre un mundo → `Esc` → *Abrir a la red* → comparte el código de 6 letras. Los amigos usan *Multijugador → Unirse (Internet)* (P2P WebRTC vía PeerJS) o *LAN local* (pestañas del mismo navegador).
- **Guardar**: los mundos se guardan en el navegador (IndexedDB). *Exportar* descarga un archivo `.mc2world` con construcciones, inventarios, cofres, hornos y entidades; *Importar* lo carga.

## Controles (configurables en Opciones → Controles)
WASD moverse · Espacio saltar (doble = volar en creativo) · Mayús agacharse · Ctrl correr · Clic izq. romper/atacar · Clic der. usar/colocar · Clic central elegir bloque · E inventario · Q soltar · T chat · / comandos · F1 ocultar HUD · F2 captura · F3 depuración (F3+B cajas, F3+G chunks) · F5 perspectiva · Tab jugadores.

Comandos: `/gamemode`, `/time`, `/weather`, `/tp`, `/give`, `/summon`, `/locate`, `/dimension`, `/difficulty`, `/spawnpoint`, `/clear`, `/kill`, `/seed`, `/effect`, `/gamerule keepInventory`.

## Gráficos
Opciones → Gráficos: **Rápidos** (PC de bajos recursos, sin post-proceso) · **Equilibrados** (sombras + bloom) · **Realistas** (sombras PCF, agua con reflejos SSR/refracción/cáusticas, rayos de sol) · **Ultra** (sombras 4K, SSR de 40 pasos, nubes dobles). Culling de caras ocultas, frustum y distancia.

## Código fuente
`src/` contiene los módulos; `./build.sh` los concatena en `minecraft2.html`.
