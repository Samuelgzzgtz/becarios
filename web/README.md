# DocenCheck Web (PWA)

Versión web de DocenCheck que reemplaza a la app Android nativa (`../app`). Se
instala en el celular como una app (icono en la pantalla de inicio, pantalla
completa, funciona sin red para registrar asistencia) en **Android y iPhone**,
sin pasar por Play Store ni App Store.

| Capa | Antes (Android) | Ahora (web) |
| --- | --- | --- |
| UI | Kotlin + Jetpack Compose | React 19 + TypeScript (Vite) |
| Instalación | APK | PWA: "Agregar a pantalla de inicio" |
| Hosting | — | Vercel |
| Login | Supabase Auth | **Clerk** (correo y contraseña o cuenta Microsoft UANL) |
| Cuentas y accesos | Pantallas del admin en la app | **Dashboard de Clerk** |
| Backend | Supabase Cloud | El mismo Supabase Cloud (migración `0018_clerk.sql`) |
| Cámara | CameraX | `getUserMedia` |
| Detección de rostro | ML Kit | MediaPipe Face Detector (WASM) |
| Embedding facial | TFLite `mobilefacenet.tflite` | El mismo modelo con LiteRT.js (WASM) |
| Cola sin red | Room + WorkManager | IndexedDB + sincronización al abrir/volver la red |

Vercel solo sirve la app; los datos (usuarios, asistencias, reportes SIASE) siguen
en Supabase, que ya está en la nube.

## Desarrollo

```bash
cd web
cp .env.example .env.local   # URL y publishable key de Supabase
npm install
npm run dev                  # http://localhost:5173
npm test                     # pruebas de lógica de negocio (Vitest)
npm run build                # genera dist/
```

La cámara solo funciona en `localhost` o con HTTPS. Para probar en un celular
de la misma red usa el despliegue de Vercel (o un túnel HTTPS).

## Login con Clerk

### Cómo funciona

- Clerk hace el inicio de sesión. Supabase confía en los tokens de Clerk (Third-Party Auth)
  y RLS identifica al usuario con `public.uid_actual()`, que traduce el id de Clerk al
  `usuarios.id` de siempre. Así se conserva el historial.
- **Cuentas y accesos se administran en el Dashboard de Clerk.** El webhook
  `clerk-webhook` (Edge Function de Supabase) copia cada cambio a `public.usuarios`.
- En la app, el admin conserva asignaciones, traspasos, semestres, SIASE, metas y exportación.

### Dar acceso a alguien

1. Clerk Dashboard → **Users → Create user** (o **Invite**), con su correo institucional.
2. En el usuario → **Metadata → Public**:
   ```json
   { "perfil": "becario", "matricula": "1234567", "coordinacion": "Coordinación de Sistemas" }
   ```
   `perfil` puede ser `becario`, `ingeniero` o `administrador`. Sin `perfil`, la cuenta
   queda **sin acceso**: la persona puede iniciar sesión, pero la app le dice que pida acceso.
3. **Quitar acceso:** botón **Ban user** (se conserva su historial). Para devolverlo: **Unban**.
4. Las cuentas que ya existían en Supabase se enlazan solas si se crean en Clerk con **el mismo correo**.

### Configuración (una sola vez)

1. **Clerk** (clerk.com) → crea la aplicación "DocenCheck" con **Email + Password** y **Microsoft**.
   - **Configure → Restrictions → Sign-up mode: Restricted** (solo entran las cuentas que tú creas o invitas).
   - Abre <https://dashboard.clerk.com/setup/supabase> y activa la integración con Supabase
     (agrega el claim `role: authenticated` a los tokens). Copia el **Clerk domain** que muestra.
   - **Microsoft:** en desarrollo funciona con las credenciales compartidas de Clerk; en
     producción hay que registrar una app en Microsoft Entra (Clerk lo guía paso a paso).
2. **Supabase** → Authentication → Sign In / Providers → **Third-Party Auth → Add provider → Clerk**
   y pega el Clerk domain.
3. **Migración:** aplica `backend/sql/0018_clerk.sql`.
4. **Webhook:** despliega `backend/supabase/functions/clerk-webhook` con `verify_jwt = false`.
   En Clerk → **Webhooks → Add endpoint**:
   `https://rcvpowylehewvsxquhip.supabase.co/functions/v1/clerk-webhook`, eventos
   `user.created`, `user.updated` y `user.deleted`. Copia el **Signing secret** y guárdalo en
   Supabase como secreto de Edge Functions `CLERK_WEBHOOK_SIGNING_SECRET`.
5. **Primer administrador:** crea tu usuario en Clerk con `{ "perfil": "administrador" }`.

La función `admin-crear-usuario` ya no se usa (creaba cuentas de Supabase Auth); puedes
borrarla del proyecto de Supabase.

## Desplegar en Vercel

1. En Vercel: **Add New → Project** e importa el repositorio de GitHub.
2. **Root Directory:** `web` (el framework se detecta como Vite; `vercel.json` ya trae build, salida y rutas).
3. **Environment Variables** (Production y Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_CLERK_PUBLISHABLE_KEY`
4. Deploy. Cada push a la rama principal publica una nueva versión; la app instalada
   en los teléfonos se actualiza sola al abrirla.

Por ahora se usa la **instancia de desarrollo** de Clerk, que funciona en el dominio
`*.vercel.app` pero muestra un aviso "Development mode" y tiene límite de usuarios. Para
producción, Clerk exige un dominio propio (p. ej. `docencheck.mx`): se agrega en Vercel y
en Clerk (registros DNS) y se cambia la clave a `pk_live_…`.

## Instalar en el celular

- **Android (Chrome):** abre la URL → menú ⋮ → **Instalar app** (o "Agregar a pantalla principal").
- **iPhone (Safari):** abre la URL → botón **Compartir** → **Agregar a inicio**.
  En iPhone hay que abrirla desde Safari para que quede instalada; los permisos de
  cámara se piden la primera vez que se registra asistencia.

## Reconocimiento facial

Todo corre en el teléfono; la foto nunca sale de él. `src/facial/rostro.ts`
detecta el rostro con MediaPipe, lo recorta a 112×112 y calcula el embedding con
el mismo `mobilefacenet.tflite` de Android (licencia en `public/models/NOTICE.md`).

- **Calibración:** la caja de MediaPipe es más chica que la de ML Kit, así que el
  recorte se agranda ×1.3 y se sube 20 %. Con retratos públicos de 6 personas
  (fotos de años distintos), la misma persona dio similitud ≥ 0.62 y personas
  distintas ≤ 0.35 (antes de calibrar se traslapaban). El umbral quedó en **0.55**
  (`src/facial/comparar.ts`). Conviene revisarlo con fotos del equipo tras las
  primeras semanas.
- **Enrolamientos hechos con la app Android:** el recorte cambió, así que pueden
  no coincidir. Los enrolamientos nuevos se guardan con `modelo = 'mobilefacenet-web'`;
  si un becario enrolado en Android no es reconocido, su ingeniero debe volver a
  enrolarlo desde la web.
- Los WASM (~22 MB) y modelos (~5 MB) se descargan la primera vez que se usan y
  quedan en caché del service worker. La pantalla de inicio del becario los
  precarga para que el registro sin red funcione después.

## Sin conexión

El login con Clerk necesita internet. Si el teléfono ya inició sesión antes, sin red la
app usa la copia local del perfil para registrar asistencia. Si no hay red al registrar asistencia, el registro se guarda en IndexedDB y se
sube automáticamente al abrir la app, al volver la red, al regresar a la app o
cada 5 minutos mientras está abierta. A diferencia de Android, **iOS no permite
sincronizar con la app cerrada**: los registros se suben la siguiente vez que se
abra.

## Estructura

```
web/
├── public/models/      # mobilefacenet.tflite y detector de rostro
├── scripts/            # copia los WASM de MediaPipe/LiteRT a public/vendor
├── src/
│   ├── lib/            # fechas (zona Monterrey), errores, modelos, IndexedDB, cliente Supabase
│   ├── datos/          # repositorios (mismas consultas/RPC que la app Android)
│   ├── facial/         # detección + embedding + comparación
│   ├── ui/             # componentes, estilos, cámara, navegación
│   └── pantallas/      # becario/, ingeniero/, admin/, compartido/
└── vercel.json
```
