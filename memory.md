# Memory

## Proposito

- El proyecto automatiza la confirmacion periodica de hostnames DDNS gratuitos en No-IP para evitar que expiren.
- El flujo esperado entra al sitio de No-IP con la cuenta del usuario, resuelve la verificacion por email, navega a la pagina de hostnames y confirma el DDNS.

## Stack

- Node.js
- CommonJS
- Playwright para automatizar el navegador
- Gmail IMAP con `imapflow`
- `mailparser` para extraer el codigo del ultimo correo de No-IP
- `dotenv` para configuracion local

## Flujo automatizado actual

1. Abrir `https://www.noip.com/login`.
2. Completar usuario y password de No-IP.
3. Si No-IP pide verificacion por email, consultar Gmail por IMAP.
4. Buscar el correo mas reciente de No-IP posterior al intento de login.
5. Extraer un codigo de 6 digitos.
6. Volver a No-IP e ingresar ese codigo.
7. Ir a la pagina de hostnames en `my.noip.com`.
8. Buscar el boton `Confirm` o `Renew` del hostname objetivo.
9. Validar el resultado leyendo el mensaje visible en pantalla.
10. Guardar screenshot y HTML como evidencia.

## Archivos importantes

- `index.js`: script principal de automatizacion end-to-end.
- `.env.example`: variables necesarias para ejecutar el flujo.
- `README.md`: setup, uso y limitaciones.
- `artifacts/`: evidencia de ejecuciones exitosas o fallidas.

## Variables de entorno esperadas

- `NOIP_USERNAME`
- `NOIP_PASSWORD`
- `NOIP_HOSTNAME` o `NOIP_HOSTNAMES`
- `GMAIL_EMAIL`
- `GMAIL_APP_PASSWORD`
- `GMAIL_SENDER_FILTER`
- `HEADLESS`
- `VERIFICATION_TIMEOUT_MS`
- `POLL_INTERVAL_MS`

## Supuestos operativos

- El correo de verificacion de No-IP llega a Gmail.
- Gmail se accede por IMAP usando App Password.
- No-IP sigue enviando un codigo de 6 digitos por email para este flujo.
- La UI de No-IP puede cambiar, por eso los selectores priorizan texto visible y roles.

## Riesgos conocidos

- Si cambia fuerte la UI de No-IP, puede haber que ajustar selectores.
- Si Gmail no permite IMAP o App Password, el lector de correo debe cambiar.
- Si el hostname todavia no esta en ventana de confirmacion, no va a existir boton `Confirm`; el script lo trata como `not-needed`.
- Si llegan varios correos parecidos, la extraccion depende de encontrar el codigo correcto en los mensajes posteriores al login.

## Estado actual

- Hay un script ejecutable y documentacion basica.
- El proyecto no incluye tests de integracion reales porque el flujo depende de credenciales y servicios externos.
- La validacion disponible en local es sintactica con `node --check index.js`.

## Proximos pasos razonables

- Probar con credenciales reales y ajustar selectores finos si hiciera falta.
- Guardar estado de sesion si se quiere reducir frecuencia de verificacion por email.
- Agregar logging estructurado.
- Programar la ejecucion periodica con el scheduler que prefiera el usuario.
