# Memory

## Proposito

- El proyecto automatiza la confirmacion periodica de hostnames DDNS gratuitos en No-IP para evitar que expiren.
- El flujo actual usa navegador para No-IP y tambien navegador para Gmail.

## Stack

- Node.js
- CommonJS
- Playwright para automatizar el navegador
- `dotenv` para configuracion local

## Flujo automatizado actual

1. Abrir `https://www.noip.com/login`.
2. Completar usuario y password de No-IP.
3. Si No-IP pide verificacion por email, detectar la pantalla `https://www.noip.com/2fa/verify`.
4. Abrir Gmail en otra pestana del mismo navegador.
5. Si Gmail no tiene sesion, permitir login manual una vez.
6. Buscar el mail mas reciente de No-IP en Gmail.
7. Extraer un codigo de 6 digitos desde el contenido del mail.
8. Volver a No-IP e ingresar ese codigo.
9. Navegar a la pagina de hostnames usando primero la UI autenticada y solo despues rutas fallback.
10. Buscar el boton `Confirm` o `Renew`.
11. Validar el resultado leyendo el mensaje visible en pantalla.
12. Guardar screenshot y HTML como evidencia.

## Archivos importantes

- `index.js`: script principal de automatizacion end-to-end.
- `.env.example`: plantilla de variables sin secretos reales.
- `README.md`: setup, uso y limitaciones.
- `.gitignore`: excluye `.env`, `artifacts/` y `.playwright-profile/`.
- `.playwright-profile/`: perfil persistente local para conservar la sesion de Gmail.
- `artifacts/`: evidencia de ejecuciones exitosas o fallidas.
- `run-confirm.bat`: lanzador rapido en Windows.
- `run-confirm.sh`: lanzador rapido para shell script.
- `.codex/skills/no-ip-ddns-maintainer/`: skill local del proyecto para mantenimiento y debugging del flujo No-IP + Gmail.

## Variables de entorno esperadas

- `NOIP_USERNAME`
- `NOIP_PASSWORD`
- `NOIP_HOSTNAME` o `NOIP_HOSTNAMES`
- `GMAIL_EMAIL`
- `GMAIL_SENDER_FILTER`
- `HEADLESS`
- `VERIFICATION_TIMEOUT_MS`
- `POLL_INTERVAL_MS`

## Hallazgos importantes

- El login en No-IP funciona con las credenciales correctas.
- No-IP puede pedir verificacion mensual por email y la URL real observada fue `https://www.noip.com/2fa/verify`.
- El flujo anterior por IMAP fue descartado por preferencia del usuario.
- La navegacion a hostnames no debe asumir rutas fijas viejas; primero conviene seguir links reales del area autenticada.

## Riesgos conocidos

- La UI de No-IP puede cambiar y romper selectores.
- La UI de Gmail puede cambiar y romper la lectura visual del codigo.
- Si Gmail no tiene sesion en el perfil persistente, la primera corrida requiere login manual.
- Despues del 2FA, algunas rutas fallback pueden devolver `404`; por eso el script ahora intenta primero navegacion por UI.

## Seguridad

- `.env.example` llego a contener credenciales reales en un momento y el repo ya fue publicado.
- Aunque el archivo ya fue saneado localmente, esos secretos pudieron quedar en el historial git remoto.
- Recomendacion: rotar credenciales expuestas y luego limpiar historial del repo publico si se quiere eliminar rastros.

## Estado actual

- El script ya esta adaptado al flujo visual con Gmail en navegador.
- `node --check index.js` paso correctamente.
- Falta probar de nuevo el flujo completo con Gmail visual ya logueado en `.playwright-profile/`.

## Proximos pasos razonables

- Ejecutar `npm run confirm` y completar login manual en Gmail si aparece.
- Ajustar selectores de Gmail o No-IP si la UI mostrada difiere.
- Hacer commit de los cambios pendientes.
- Limpiar el historial del repo publico si se quiere remover los secretos del commit inicial.
