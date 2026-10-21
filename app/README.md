# DocenCheck — app Android (Fase 3, perfil Becario)

## Antes de abrir esto en Android Studio, lee esto

Este código se escribió en un entorno **sin JDK ni Android SDK** — no se pudo
compilar un APK, ni correr, ni probar en emulador o dispositivo real. Sí hubo
acceso a internet en una segunda pasada, y con eso se verificaron en vivo (no
de memoria) contra Maven Central, maven.google.com y el código fuente real de
`supabase-kt` en GitHub: paquetes, firmas de funciones, y versiones de todas
las dependencias — y se corrigió un bug real que esa verificación encontró
(ver abajo). Sigue sin haber una compilación real de por medio, así que abre
esto en Android Studio, deja que Gradle sincronice, y corrige lo que marque el
compilador — pero el riesgo de "nombre de paquete inventado" ya es bajo.

## Ya resuelto (2026-09-17, segunda pasada)

- **Modelo de reconocimiento facial incluido.** `app/src/main/assets/mobilefacenet.tflite`
  ya está en el repo (~5 MB), bajado de
  [MCarlomagno/FaceRecognitionAuth](https://github.com/MCarlomagno/FaceRecognitionAuth)
  (BSD-3-Clause, atribución en `assets/NOTICE.md`). Se confirmó que su entrada
  `[1,112,112,3]` y salida (192 floats) coinciden exactamente con lo que ya
  esperaba `FaceEmbeddingModel.kt`, y que su normalización de píxel es
  equivalente a la que ya tenía el código. No hace falta tocar nada para esto.
- **`supabase-kt` verificado contra el código fuente real** (repo
  `supabase-community/supabase-kt`, versión 3.8.0): paquetes (`io.github.jan.supabase.*`),
  `createSupabaseClient`, `signInWith(Email)`, `postgrest.rpc`, `select`/`filter`/`eq`/
  `order`/`limit`, `decodeSingle`/`decodeSingleOrNull` — todos coinciden con lo ya escrito.
  Se encontró y corrigió **un bug real**: `Storage.upload()` no tiene un parámetro
  `upsert` — es una propiedad del lambda de opciones (`upload(ruta, bytes) { upsert = true }`,
  no `upload(ruta, bytes, upsert = true)`). Ya está corregido en `SiaseRepository.kt`.
- **Versiones de `gradle/libs.versions.toml` actualizadas a las reales de hoy**
  (verificadas contra Maven Central / maven.google.com), no las que se habían
  puesto de memoria. Como consecuencia también se subió `compileSdk`/`targetSdk`
  a 36 (Google Play exige API 36 desde el 31 de agosto de 2026) y se migró
  `kotlinOptions` (deprecado en Kotlin 2.3) a `compilerOptions`.
- **Wrapper de Gradle agregado** (`gradlew`, `gradlew.bat`, `gradle/wrapper/`),
  bajado del repo oficial de Gradle, pinneado a la 9.7.1. En Mac/Linux hay que
  correr `chmod +x gradlew` después de clonar (el bit de ejecución no viaja
  por este entorno Windows sin git).

## Lo que sigue pendiente

1. **Calibrar `UMBRAL_COINCIDENCIA`** en `facial/FaceMatcher.kt` (hoy en 0.75,
   sin datos reales detrás) una vez que haya fotos de prueba del equipo.
2. **Nunca se compiló de verdad.** Todo lo anterior redujo el riesgo de que
   Gradle no resuelva una dependencia o de que un import no exista, pero no
   sustituye abrir el proyecto y correr un build real.

## Por qué la verificación facial no va a funcionar todavía

El enrolamiento (guardar el embedding de un becario en `enrolamientos_faciales`)
es pantalla de **Fase 4** (ingeniero), no de esta fase. RLS ya lo refleja: un
becario puede leer su propio embedding pero no puede insertarlo. Así que hasta
que exista esa pantalla, "Registrar asistencia" siempre va a decir "todavía no
tienes biometría registrada" para cualquier becario real.

Para probar el flujo de verificación antes de tener Fase 4: correr el mismo
modelo `.tflite` contra una foto de prueba fuera de la app, e insertar a mano
una fila en `enrolamientos_faciales` desde el SQL Editor de Supabase con ese
vector.

## Decisiones de alcance

- **No se capturó geolocalización.** `asistencias.latitud/longitud` son
  nullable en el esquema; se registran como `null` por ahora. Agregarlo
  implica pedir permiso de ubicación y sumar Play Services Location — no
  estaba explícitamente pedido en el plan.
- **Sin framework de inyección de dependencias** (Hilt/Koin). `DocenCheckApp`
  expone los repositorios como propiedades `lazy`; las pantallas los leen vía
  `appActual()` (`core/ui/ContextoApp.kt`). Si el equipo crece mucho el número
  de repositorios, vale la pena reconsiderar esto en Fase 4/5.
- **Todas las pantallas de becario del plan están cubiertas**: Login (con
  redirección por perfil), Home, Registrar Asistencia, Mi Reporte de Horas,
  Consulta de Asistencias, Reporte SIASE, Mi Cuenta.
- **Ingeniero/administrador** llegan a una pantalla "perfil no disponible":
  el login ya redirige por perfil (correcto según el esquema), pero sus
  pantallas son Fase 4 y 5.

## Mapeo a la estructura del repo de GitHub

El proyecto Gradle vive en la raíz (`settings.gradle.kts`, `build.gradle.kts`,
`app/` como módulo Android). Las migraciones SQL están en `backend/sql/` (ver su
README) y la edge function `admin-crear-usuario` en `backend/supabase/functions/`.
La documentación (planes, auditoría UX, sistema de diseño) está en `docs/`.
