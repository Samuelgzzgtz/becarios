// Fase 5 — crea cuentas de ingeniero/becario.
//
// Por qué esto es una Edge Function y no algo que la app llame directo:
// crear un usuario en auth.users requiere la service_role key (bypassa RLS
// por completo). Esa llave NUNCA debe viajar dentro del APK — cualquiera que
// lo descompile tendría acceso total a la base. Aquí vive en el servidor,
// como variable de entorno que Supabase inyecta automáticamente.
//
// Seguridad: verify_jwt=true (configurado al desplegar) ya rechaza llamadas
// sin sesión válida antes de que este código corra. Además, se vuelve a
// comprobar aquí que quien llama es administrador, usando su propio JWT
// (no la service_role) para que la política es_admin() se evalúe con su
// identidad real vía RLS.
//
// Contrato de respuesta (auditoría M-01): los errores de validación de negocio
// (correo o matrícula repetidos, campos faltantes) se devuelven con HTTP 200 y
// { "error": "<mensaje en español>" }, para que la app siempre pueda leer el
// mensaje del cuerpo. Los 4xx quedan para permisos y peticiones mal formadas.

import { createClient } from "jsr:@supabase/supabase-js@2";

interface CuerpoPeticion {
  email: string;
  password: string;
  perfil: string;
  nombre: string;
  matricula: string;
  coordinacion?: string | null;
}

const PERFILES_PERMITIDOS = ["ingeniero", "becario"];

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/** Traduce los errores de GoTrue que conocemos a algo que el admin entienda. */
function mensajeDeAuth(error: { message?: string; code?: string; status?: number }): string {
  const codigo = (error.code ?? "").toLowerCase();
  const texto = (error.message ?? "").toLowerCase();
  if (codigo === "email_exists" || codigo === "user_already_exists" || texto.includes("already been registered")) {
    return "Ya existe una cuenta con ese correo.";
  }
  if (codigo === "weak_password" || texto.includes("password")) {
    return "La contraseña es demasiado débil; usa al menos 6 caracteres.";
  }
  if (codigo === "validation_failed" || texto.includes("invalid email") || texto.includes("unable to validate email")) {
    return "El correo no tiene un formato válido.";
  }
  if (texto.includes("database error")) {
    // El trigger manejar_nuevo_usuario falla casi siempre por matrícula repetida.
    return "No se pudo crear la cuenta: la matrícula ya está registrada.";
  }
  return "No se pudo crear la cuenta. Intenta de nuevo en unos minutos.";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Método no permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization") ?? "";

  const clienteDelUsuario = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } }
  });

  const { data: esAdmin, error: errorAdmin } = await clienteDelUsuario.rpc("es_admin");
  if (errorAdmin || !esAdmin) {
    return json({ error: "Solo un administrador puede crear usuarios." }, 403);
  }

  let cuerpo: CuerpoPeticion;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "La petición no es válida." }, 400);
  }

  const email = (cuerpo.email ?? "").trim().toLowerCase();
  const nombre = (cuerpo.nombre ?? "").trim();
  const matricula = (cuerpo.matricula ?? "").trim();
  const coordinacion = (cuerpo.coordinacion ?? "").trim() || null;
  const perfil = (cuerpo.perfil ?? "").trim();
  const password = cuerpo.password ?? "";

  if (!email || !password || !perfil || !nombre || !matricula) {
    return json({ error: "Faltan datos: nombre, matrícula, correo y contraseña son obligatorios." });
  }
  if (!PERFILES_PERMITIDOS.includes(perfil)) {
    return json({ error: "Perfil no válido; solo se pueden crear ingenieros o becarios." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "El correo no tiene un formato válido." });
  }
  if (password.length < 6) {
    return json({ error: "La contraseña temporal necesita al menos 6 caracteres." });
  }

  const clienteAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Matrícula repetida: se revisa antes para no depender del error genérico
  // "Database error creating new user" que devuelve GoTrue cuando falla el trigger.
  const { data: existente, error: errorBusqueda } = await clienteAdmin
    .from("usuarios")
    .select("id")
    .eq("matricula", matricula)
    .maybeSingle();
  if (errorBusqueda) {
    return json({ error: "No se pudo validar la matrícula. Intenta de nuevo." }, 500);
  }
  if (existente) {
    return json({ error: "Ya existe una cuenta con esa matrícula." });
  }

  const { data, error } = await clienteAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { perfil, nombre, matricula, coordinacion }
  });

  if (error) {
    return json({ error: mensajeDeAuth(error) });
  }

  return json({ id: data.user.id, email: data.user.email });
});
