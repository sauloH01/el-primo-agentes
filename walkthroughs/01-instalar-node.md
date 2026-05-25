# Walkthrough 01 — Instalar Node.js

> Si el alumno no tiene Node.js (o tiene una versión vieja), guíalo a instalarlo según su sistema operativo.

---

## ¿Por qué Node.js?

Decirle al alumno:

```
Tu agente va a ser un programa hecho en un lenguaje llamado JavaScript
(o TypeScript, que es JavaScript con superpoderes).

Para que tu compu pueda LEER y EJECUTAR ese código, necesitamos instalar
un programa llamado "Node.js". Es como instalar Microsoft Word para poder
abrir archivos .docx — sin Node, tu compu no entendería tu agente.

Es 100% gratis y lo usa mucha gente. Va incluido con "npm", que es el
"App Store" que vamos a usar para descargar las piezas de tu agente.
```

---

## Instalación en macOS

### Opción A — Recomendada para nuevos: descarga directa

```
1. Abre tu navegador (Chrome, Safari, lo que uses)
2. Ve a esta dirección: https://nodejs.org
3. Vas a ver dos botones: "LTS" y "Current". Tap el de "LTS"
   (significa Long Term Support, es la versión más estable)
4. Se descarga un archivo .pkg
5. Abre el archivo descargado
6. Sigue el instalador (Continue, Continue, Install, te pide tu password)
7. Cuando termine, cierra el instalador
```

Pedirle que verifique:

```
Ahora abre la app "Terminal" (Spotlight → Terminal).

Pega este comando y dale enter:

  node --version

Te debe responder algo como "v22.11.0" o cualquier número que empiece con
"v20" o superior. Si te dice eso, estás listo.
```

### Opción B — Si ya tiene Homebrew (devs intermedios)

```bash
brew install node
```

---

## Instalación en Windows

### Opción A — Recomendada: descarga directa

```
1. Abre tu navegador
2. Ve a https://nodejs.org
3. Tap el botón "LTS" (Long Term Support)
4. Se descarga un archivo .msi (instalador de Windows)
5. Abre el archivo descargado
6. Sigue el instalador:
   - Next, Next, acepta términos, Next
   - ⚠️ MUY IMPORTANTE: cuando te pregunte "Custom Setup" o "Choose
     components", DEJA TODO MARCADO. Especialmente "Add to PATH" y
     "Install npm".
   - Next, Install (te pide permisos de administrador)
7. Cuando termine, cierra el instalador
8. CIERRA y vuelve a abrir tu PowerShell / Git Bash. Esto es importante
   porque las variables nuevas solo aparecen en ventanas nuevas.
```

Pedirle que verifique:

```
Abre PowerShell de nuevo (Search → "PowerShell").

Pega este comando y dale enter:

  node --version

Te debe responder algo como "v22.11.0" o cualquier número que empiece
con "v20" o superior. Si te dice eso, estás listo.
```

### Opción B — Si ya tiene Chocolatey (devs)

```powershell
choco install nodejs-lts
```

---

## Instalación en Linux

### Ubuntu / Debian

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Fedora / RHEL

```bash
sudo dnf install -y nodejs
```

---

## Verificación final

Después de instalar, en cualquier OS:

```bash
node --version
npm --version
```

Debe devolver versiones (ej. `v22.11.0` y `10.9.0`).

Si dice `command not found` o `not recognized`:

### En Mac

```
Cierra y vuelve a abrir Terminal. A veces necesita reiniciarse para
ver el cambio.

Si después de reabrir sigue sin reconocerlo, prueba:

  source ~/.zshrc

Y vuelve a intentar.
```

### En Windows

```
Cierra y vuelve a abrir TODAS las ventanas de PowerShell / CMD / Git Bash.
El instalador de Node agrega su ruta a las variables del sistema, pero
las ventanas viejas no lo saben hasta que las reabres.

Si después de reabrir sigue sin reconocerlo, reinicia tu compu y prueba
de nuevo.
```

---

## Si nada funciona

Decirle al alumno:

```
A veces la instalación de Node se complica por la configuración del
sistema. No te frustres, esto es 100% solucionable.

Mándame screenshot de:
1. El error que te sale
2. Tu sistema operativo (versión exacta)
3. Cuál opción de instalación intentaste

Y te ayudo a resolverlo. Lo más común son rutas del sistema mal
configuradas.

Si quieres, también puedes preguntarme en la comunidad de Horizontes IA
en Skool — ahí tenemos un canal de #soporte-tecnico donde otros alumnos
también te pueden ayudar.
```

---

## Cuando esté instalado correctamente

Decirle:

```
¡Listo! Ya tienes Node.js instalado en tu compu. Esto es como tener
el "motor" listo. Ahora vamos a darle los demás componentes a tu agente.

(Volver al SKILL.md Fase 0 y continuar)
```
