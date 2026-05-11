# No-IP DDNS Confirm Automation

Este proyecto automatiza la renovacion de un hostname DDNS gratuito de No-IP.

El flujo que implementa es:

1. Abre No-IP en el navegador con Playwright.
2. Hace login con tu usuario y password.
3. Si No-IP pide verificacion por email, entra a Gmail por IMAP y busca el ultimo codigo de 6 digitos enviado por No-IP.
4. Ingresa ese codigo en No-IP.
5. Navega a la pagina de hostnames.
6. Busca el boton `Confirm` o `Renew` del hostname indicado.
7. Verifica el resultado leyendo el mensaje visible en pantalla.

## Requisitos

- Node.js 18 o superior.
- Gmail con IMAP disponible.
- Un App Password de Google para la cuenta de Gmail.
- Chromium instalado para Playwright.

## Configuracion

1. Copia `.env.example` a `.env`.
2. Completa las credenciales.
3. Instala dependencias si hace falta:

```powershell
npm install
```

4. Instala Chromium para Playwright:

```powershell
npx playwright install chromium
```

## Variables de entorno

- `NOIP_USERNAME`: usuario o email de No-IP.
- `NOIP_PASSWORD`: password de No-IP.
- `NOIP_HOSTNAME`: hostname a confirmar. Si queres varios, podes usar `NOIP_HOSTNAMES` separado por comas.
- `GMAIL_EMAIL`: cuenta de Gmail donde llega el codigo.
- `GMAIL_APP_PASSWORD`: App Password de 16 caracteres de Google.
- `GMAIL_SENDER_FILTER`: filtro de remitente. Por defecto `No-IP Notices`.
- `HEADLESS`: `true` o `false`.
- `VERIFICATION_TIMEOUT_MS`: tiempo maximo para esperar el codigo y el flujo de confirmacion.
- `POLL_INTERVAL_MS`: intervalo de consulta al inbox.

## Uso

Modo visible:

```powershell
npm run confirm
```

Modo headless:

```powershell
npm run confirm:headless
```

## Salidas

- Si el hostname necesitaba confirmacion y fue confirmado, el script lo informa por consola y guarda evidencia en `artifacts/`.
- Si el hostname no tenia boton `Confirm`, el script lo reporta como `not-needed` en vez de fallar.
- Ante error, tambien guarda screenshot y HTML de la pagina para diagnostico.

## Notas

- Este proyecto automatiza el sitio web de No-IP, por lo que puede requerir ajustes menores si la interfaz cambia.
- La lectura de Gmail se hace por IMAP porque suele ser mas estable que automatizar la UI de Gmail.
