// Webhook de Clerk → tabla public.usuarios (migración 0018).
//
// El panel de "cuentas y accesos" vive en el Dashboard de Clerk: ahí se crean
// o invitan usuarios, se les pone el perfil en el public metadata y se bloquean.
// Clerk avisa aquí cada cambio (user.created / user.updated / user.deleted) y
// esta función lo refleja en usuarios con la RPC sincronizar_usuario_clerk.
//
// public_metadata que entiende (todo opcional salvo perfil para dar acceso):
//   { "perfil": "becario" | "ingeniero" | "administrador",
//     "matricula": "1234567", "coordinacion": "Coordinación de Sistemas",
//     "estado": "egresado" }
//
// Seguridad: se despliega con verify_jwt=false (Clerk no manda JWT de Supabase);
// en su lugar se verifica la firma Svix. El secreto se lee de la variable de
// entorno CLERK_WEBHOOK_SIGNING_SECRET o, si no existe, de Supabase Vault
// (migración 0019). La service_role key solo vive aquí, en el servidor.

import { Webhook } from "npm:svix@1";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface CorreoClerk {
  id: string;
  email_address: string;
}

interface UsuarioClerk {
  id: string;
  first_name: string | null;
  last_name: string | null;
  banned?: boolean;
  primary_email_address_id: string | null;
  email_addresses: CorreoClerk[];
  public_metadata: Record<string, unknown> | null;
}

interface EventoClerk {
  type: string;
  data: UsuarioClerk | { id: string; deleted?: boolean };
}

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respuesta({ error: "Método no permitido." }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false }
  });

  let secreto = Deno.env.get("CLERK_WEBHOOK_SIGNING_SECRET");
  if (!secreto) {
    const { data } = await supabase.rpc("secreto_webhook_clerk");
    secreto = typeof data === "string" ? data : undefined;
  }
  if (!secreto) return respuesta({ error: "Falta CLERK_WEBHOOK_SIGNING_SECRET." }, 500);

  const cuerpo = await req.text();
  let evento: EventoClerk;
  try {
    evento = new Webhook(secreto).verify(cuerpo, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? ""
    }) as EventoClerk;
  } catch {
    return respuesta({ error: "Firma inválida." }, 401);
  }

  if (evento.type === "user.deleted") {
    const { error } = await supabase.rpc("desactivar_usuario_clerk", { p_clerk_id: evento.data.id });
    if (error) return respuesta({ error: error.message }, 500);
    return respuesta({ ok: true });
  }

  if (evento.type !== "user.created" && evento.type !== "user.updated") {
    return respuesta({ ok: true, ignorado: evento.type });
  }

  const u = evento.data as UsuarioClerk;
  const meta = u.public_metadata ?? {};
  const correo =
    u.email_addresses.find((e) => e.id === u.primary_email_address_id)?.email_address ?? u.email_addresses[0]?.email_address ?? null;
  const nombre = [u.first_name, u.last_name].filter(Boolean).join(" ") || texto(meta.nombre);

  const { data, error } = await supabase.rpc("sincronizar_usuario_clerk", {
    p_clerk_id: u.id,
    p_email: correo,
    p_nombre: nombre,
    p_perfil: texto(meta.perfil),
    p_matricula: texto(meta.matricula),
    p_coordinacion: texto(meta.coordinacion),
    // Solo "Ban user" quita el acceso; un bloqueo temporal por intentos fallidos no.
    p_bloqueado: Boolean(u.banned),
    p_estado: texto(meta.estado)
  });
  // Un error 500 hace que Clerk reintente el envío.
  if (error) return respuesta({ error: error.message }, 500);
  return respuesta({ ok: true, usuario: data });
});
