# Notaría Digital · web local

Aplicación en español para registrar, verificar y consultar documentos CMS/PKCS#7 (.p7s) mediante OpenSSL y el contrato Solidity existente. Interfaz adaptable, demostración interactiva, aprobaciones, anulaciones, bitácora y administración de cuentas.

## Ejecutar en Laragon / Windows

En la terminal de Laragon:

```bat
cd C:\laragon\www\proto
npm.cmd install
npm.cmd start
```

Inicia **Apache en Laragon** y abre **http://proto.test** (Menú de Laragon → www → proto). Mantén la terminal con `npm.cmd start` abierta: Node ejecuta OpenSSL y Ganache; Apache es la entrada web. No requiere MySQL. La dirección directa **http://localhost:3000** también funciona. `npm start` también funciona en CMD/Laragon; se recomienda `npm.cmd` porque PowerShell puede bloquear `npm.ps1` por su política de ejecución. Detén el servidor con Ctrl+C antes de volver a iniciarlo; si ya está activo, no abras una segunda instancia.

La integración usa `.htaccess` e `index.php`, con PHP/cURL de Laragon, sin modificar su configuración global. Solo permite rutas públicas de la aplicación y bloquea el acceso a `data/`, código y certificados. Si Node está detenido, `proto.test` muestra instrucciones para iniciarlo. La entrada de Laragon conecta al puerto 3000; si cambias `PORT`, ajusta también el destino en `index.php`. Se verificaron HTML, CSS, JavaScript y la verificación de firma por HTTP a través de `proto.test`, además del bloqueo de archivos internos y orígenes externos.

Requisitos: Node.js 24 y OpenSSL. El servidor detecta OpenSSL de `C:/laragon/bin/git/mingw64/bin/openssl.exe`, o usa `openssl` en PATH. Para otra instalación, en CMD:

```bat
set OPENSSL_PATH=C:\ruta\openssl.exe
npm.cmd start
```

En PowerShell: `$env:OPENSSL_PATH='C:\ruta\openssl.exe'`. No hay dependencias npm nuevas. Ganache puede avisar que µWS no es compatible con la versión de Node; utiliza su implementación JavaScript y las pruebas pasan. Las 9 pruebas originales y las 14 pruebas web se ejecutaron también con Node v24.13.0 de Laragon (`C:/laragon/bin/nodejs/node-v24/node.exe`) y pasaron.

## Recorrido por la web

1. En **Registrar documento**, selecciona Cuenta B (funcionario), pulsa **Usar ejemplo** y **Verificar firma y registrar**. Se muestra expediente, estado, bloque, hash y transacción completa.
2. Copia el hash y búscalo en **Consultar registro**. El ciudadano también puede consultar.
3. En **Verificar integridad**, carga el mismo ejemplo y pulsa **Verificar documento**.
4. En **Demostración**, verifica el original, la copia alterada y la fecha modificada. Si ya registraste el ejemplo, no es necesario volver a registrarlo.
5. Para probar dos aprobaciones, carga el ejemplo, cambia el expediente y selecciona 2 aprobaciones. Registra desde B; cambia a C y consulta ese hash para **Aprobar documento**. B no puede aprobarlo dos veces.
6. Una cuenta autorizada puede anular un registro indicando un motivo. El registro permanece existente, pero deja de estar vigente. La bitácora conserva los eventos.
7. **Cuentas y permisos** permite al administrador habilitar/retirar funcionarios y transferir la administración. El selector de cuenta es una simulación académica, no autenticación. Los permisos provienen del contrato y también se aplican en servidor.

| Caso (después de registrar el original) | Firma | Existe | Vigente |
|---|---|---|---|
| Original y metadatos originales | Válida | Sí | Sí |
| Copia con un bit alterado | Inválida | No | No |
| Original con fecha 2026-11-07 | Válida | No | No |
| Original registrado y luego anulado | Válida | Sí | No |

Un registro pendiente también existe, pero aún no está vigente. La fecha del formulario es declarada: OpenSSL no comprueba que coincida con el instante de firma. No se afirma validez oficial de los certificados de demo.

## Persistencia y privacidad

Hay **un proveedor Ganache y una instancia del contrato por proceso**. La cadena se guarda en `data/chain/` y la dirección del contrato en `data/deployment.json`; se reutilizan después del reinicio. Se verificó un cierre y apertura completos conservando contrato, registros, anulación y administración. No ejecutes dos servidores sobre el mismo directorio. Respalda **toda la carpeta data con el servidor detenido**. Si la eliminas, perderás esta cadena local. `NOTARIA_DATA_DIR` permite elegir otro directorio y `PORT` cambiar el puerto.

La persistencia en disco es una mejora local: no convierte Ganache en una red pública, descentralizada o resistente a la manipulación de su dueño. Los recibos se presentan como confirmados en la cadena local, no como finalidad de Ethereum.

El archivo y los cinco metadatos se procesan fuera de cadena. El temporal de OpenSSL se elimina al terminar. No se implementa un archivo documental institucional: conserva tus originales y sus metadatos. En el contrato se publican hash, tipo, expediente, referencia externa, direcciones, fechas, aprobaciones y motivo de anulación. No incluyas datos personales en los campos públicos.

El servidor solo escucha en `127.0.0.1`, valida Host/origen y exige un token por sesión para escrituras. Las cuentas deterministas con claves conocidas son exclusivamente de prueba. No expongas este servidor en Internet.

## Correspondencia con el informe

Se revisaron las **26 páginas del PDF proporcionado** cuyo título empieza «La Diseño de Implementación de Blockchain en el Sector Público…». No había un archivo separado llamado `Informe_Notaria_Digital.pdf`. El documento termina en «Costos y escalabilidad»: menciona un capítulo siguiente, bibliografía y Anexo A que no están en el PDF recibido.

| Referencia | Situación inicial | Implementado / alcance |
|---|---|---|
| p. 9, alcance y limitaciones | Prototipo local, PKI simulada; portal expresamente excluido | La web amplía el alcance por solicitud del usuario. PKI oficial continúa pendiente. |
| p. 18, tabla 4 | Registro, consulta y permisos disponibles en Solidity | Formularios y API conectados al contrato; comprobación CMS obligatoria antes de registrar. |
| pp. 21–22, modelo de datos y tabla 7 | Estados, aprobaciones distintas, anulación y administración ya implementados | Interfaz con campos del contrato, permisos consultados y simulación de llamadas antes de mostrar aprobar/anular. Administración y retiro de permisos. Contrato sin cambios. |
| pp. 22–23, auditoría | Eventos emitidos, sin visor | Bitácora obtenida de eventos reales, con bloque y transacción. |
| pp. 23–24, tres fases y tabla 8 | Demo consola con firma, hash y registro; no bloqueaba explícitamente registro por firma inválida | Verificación OpenSSL en servidor, rechazo antes de transaccionar y cinco metadatos exactos. |
| p. 24, fórmula del hash | SHA-256(bytes .p7s + salto de línea + JSON con claves ordenadas) | Misma fórmula. Se validan campos sin recortar espacios, cambiar mayúsculas ni normalizar Unicode. |
| p. 25, verificación por terceros | La demo mostraba principalmente existencia | Firma, existencia y vigencia independientes; consulta de pendientes y anulados. Tres casos de demostración. |
| pp. 18, 24 y 26, privacidad | Datos personales fuera del contrato | Archivos temporales eliminados, límites de 5 MB, validación de campos, salida HTML escapada y detalle técnico en terminal. |
| pp. 6–7 y 22–23, conservación y trazabilidad | Cada ejecución de consola desplegaba una cadena nueva | Persistencia local en disco y prueba de reinicio. El informe no exige explícitamente un mecanismo local de persistencia al reiniciar; se añadió para preservar la evidencia entre sesiones. |
| pp. 19 y 26, finalidad / escalabilidad | Red local y script Sepolia | Futuro: finalidad de red pública, reintentos/tarifas, capa 2 y lotes Merkle. No se simulan como implementados. |

## Pendiente para una implementación institucional

Según pp. 9, 17, 19, 23, 25–26: integración DNIe/ECEP acreditada y raíces de confianza oficiales; estado de revocación CRL/OCSP; asociación verificada entre certificado, funcionario y cuenta Ethereum; autenticación real; custodia segura de claves/HSM o multifirma; repositorio institucional y política de respaldo; revisión jurídica y reconocimiento institucional; auditoría externa; acceso RPC, fondos y credenciales de Sepolia/red elegida; espera de finalidad pública; costos/reintentos y optimizaciones de volumen. El enlace URI no sube archivos a IPFS. La validación actual confía solamente en `demo/ca.crt`, comprueba firma y cadena/vigencia del certificado mediante OpenSSL, sin consultar revocación oficial. No se deshabilitan las comprobaciones de fecha del certificado; cuando caduque el ejemplo habrá que generar otro.

El contrato admite cualquier número de aprobaciones entre 1 y 255; la web limita a 1–3 para las tres cuentas inicialmente autorizadas. No obliga automáticamente a que todo tipo CONTRATO tenga dos aprobaciones: el informe lo presenta como ejemplo y el contrato recibe ese parámetro. Transferir administración no revoca automáticamente al administrador anterior: se conserva la regla real del contrato.

## Compilar y probar

```bat
npm.cmd run compile
npm.cmd test
npm.cmd run test:web
node flujo.js
```

La demo de consola necesita OpenSSL en PATH; en Laragon ya suele estar disponible. La web detecta la instalación de Laragon adicionalmente. Las pruebas originales continúan intactas (9/9). `test-web.js` ejecuta 14 comprobaciones por HTTP: registro, consulta, original, alteración, cambio de fecha, rechazo sin crear registro, duplicados/permisos, aprobaciones, anulación, validaciones, administración, reinicio, eventos y entrega HTML. Usa cadenas independientes bajo `tmp/web-test-*`; no modifica `data/`.

Verificación realizada: compilación, sintaxis JavaScript, 9 pruebas originales y 14 pruebas HTTP aprobadas. **La revisión visual y los clics en navegador quedaron bloqueados porque el controlador nativo de navegador/Windows no estaba disponible**. Las pruebas HTTP verifican los mismos endpoints de los formularios, pero no sustituyen una prueba visual de escritorio y móvil.

## Archivos

- `server.js`: servidor HTTP local, Ganache persistente, API, permisos y transacciones.
- `lib/document.js`: normalización, SHA-256, validaciones y OpenSSL con argumentos separados.
- `public/index.html`, `public/style.css`, `public/app.js`: interfaz y conexiones al servidor.
- `test-web.js`: pruebas de integración y reinicio.
- `package.json`: comandos start, compile, test, test:web y demo.
- `.gitignore`: datos locales, temporales, dependencias y claves de prueba excluidos.
- `README.md`: ejecución, trazabilidad al informe, pruebas y límites.

`contracts/NotariaDigital.sol`, `test.js`, `flujo.js`, `compile.js` y los ejemplos se conservan. `build/NotariaDigital.json` se regeneró ejecutando el compilador existente. Si cambias el bytecode después de tener registros, el servidor exige migración explícita u otro directorio de datos; no borra ni sustituye el contrato existente silenciosamente.

