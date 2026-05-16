# No-IP DDNS Confirm Automation

Este proyecto automatiza la renovacion de un hostname DDNS gratuito de No-IP.

El flujo actual es visual:

1. Abre No-IP en el navegador con Playwright.
2. Hace login con tu usuario y password.
3. Si No-IP pide verificacion por email, abre Gmail en otra pestana del mismo navegador.
4. Si Gmail no tiene sesion iniciada, puedes iniciar sesion manualmente una sola vez.
5. El script busca el ultimo correo de No-IP y extrae el codigo de 6 digitos.
6. Vuelve a No-IP, ingresa el codigo y continua.
7. Navega a la pagina de hostnames.
8. Busca el boton `Confirm` o `Renew` del hostname indicado.
9. Verifica el resultado leyendo el mensaje visible en pantalla.

## Requisitos

- Node.js 18 o superior.
- Chromium instalado para Playwright.
- Una cuenta de Gmail accesible desde navegador.

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
- `NOIP_HOSTNAME`: hostname a confirmar. Si quieres varios, puedes usar `NOIP_HOSTNAMES` separado por comas.
- `GMAIL_EMAIL`: cuenta de Gmail donde llega el codigo.
- `GMAIL_SENDER_FILTER`: texto usado para buscar mails de No-IP en Gmail. Por defecto `No-IP`.
- `HEADLESS`: `true` o `false`. Para Gmail visual, conviene `false`.
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

## Como funciona Gmail

- El script usa un perfil persistente en `.playwright-profile/`.
- Eso permite que Gmail recuerde la sesion entre ejecuciones.
- Si Gmail te pide login la primera vez, hazlo manualmente en la ventana que se abre y el script seguira solo.

## Salidas

- Si el hostname necesitaba confirmacion y fue confirmado, el script lo informa por consola y guarda evidencia en `artifacts/`.
- Si el hostname no tenia boton `Confirm`, el script lo reporta como `not-needed` en vez de fallar.
- Ante error, tambien guarda screenshot y HTML de la pagina para diagnostico.

## Notas

- Este proyecto automatiza el sitio web de No-IP y la UI de Gmail, asi que puede requerir ajustes menores si alguna interfaz cambia.
- No guardes secretos reales en `.env.example`; solo en `.env`.
