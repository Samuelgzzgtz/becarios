// Webhook de Clerk → tabla public.usuarios (migración 0018).
//
// El panel de "cuentas y accesos" vive en el Dashboard de Clerk: ahí se crean
// o invitan usuarios, se les da perfil con organizaciones y se bloquean.
// Clerk avisa aquí cada cambio (user.* y organizationMembership.created /
// .deleted) y esta función lo refleja en usuarios con la RPC
// sincronizar_usuario_clerk.
//
// El perfil se elige con organizaciones de Clerk: cada organización que da un
// perfil lo declara en su public metadata ({ "perfil": "ingeniero" } o
// "administrador"); agregar a alguien a ella le da ese perfil y quien no está
// en ninguna es becario. Esta función lo escribe en el public metadata con la API
// de Clerk (CLERK_SECRET_KEY) y el user.updated que sigue sincroniza la base.
// Así el perfil vive solo en Clerk y Ban/Unban siguen funcionando.
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
  verification: { status: string } | null;
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

interface MembresiaClerk {
  organization: { public_metadata: Record<string, unknown> | null };
  public_user_data: { user_id: string };
}

interface EventoClerk {
  timestamp: number;
  type: string;
  data: UsuarioClerk | MembresiaClerk | { id: string; deleted?: boolean };
}

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Si alguien está en las dos, gana administrador. Organizaciones sin perfil se ignoran.
const PERFILES_DE_ORGANIZACION = ["administrador", "ingeniero"];
const perfilDe = (m: MembresiaClerk) => {
  const p = texto(m.organization.public_metadata?.perfil);
  return p && PERFILES_DE_ORGANIZACION.includes(p) ? p : null;
};

async function apiClerk(ruta: string, init?: RequestInit): Promise<Response> {
  const clave = Deno.env.get("CLERK_SECRET_KEY");
  if (!clave) throw new Error("Falta CLERK_SECRET_KEY.");
  const r = await fetch(`https://api.clerk.com/v1${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" }
  });
  // 404: el usuario ya se borró; no hay perfil que escribir.
  if (!r.ok && r.status !== 404) throw new Error(`Clerk respondió ${r.status} en ${ruta}.`);
  return r;
}

// Recalcula el perfil con las organizaciones actuales, así el orden en que
// lleguen los eventos no importa. Si dos cambios del mismo usuario llegan casi
// juntos, el último PATCH puede ganar con datos viejos: se corrige con el
// siguiente cambio de organización. Un error lanzado aquí responde 500 y Clerk
// reintenta.
async function escribirPerfil(usuarioId: string): Promise<void> {
  const r = await apiClerk(`/users/${usuarioId}/organization_memberships?limit=100`);
  if (r.status === 404) return;
  const { data } = (await r.json()) as { data: MembresiaClerk[] };
  const perfiles = data.map(perfilDe);
  const perfil = PERFILES_DE_ORGANIZACION.find((p) => perfiles.includes(p)) ?? "becario";
  // PATCH /metadata mezcla: conserva matricula, coordinacion y estado.
  await apiClerk(`/users/${usuarioId}/metadata`, { method: "PATCH", body: JSON.stringify({ public_metadata: { perfil } }) });
}

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

  if (!Number.isSafeInteger(evento.timestamp) || evento.timestamp <= 0) {
    return respuesta({ error: "Falta la fecha del evento." }, 400);
  }

  if (evento.type === "user.deleted") {
    const { error } = await supabase.rpc("desactivar_usuario_clerk", { p_clerk_id: (evento.data as { id: string }).id, p_actualizado_en: evento.timestamp });
    if (error) return respuesta({ error: error.message }, 500);
    return respuesta({ ok: true });
  }

  if (evento.type === "organizationMembership.created" || evento.type === "organizationMembership.deleted") {
    const m = evento.data as MembresiaClerk;
    if (!perfilDe(m)) return respuesta({ ok: true, ignorado: evento.type });
    await escribirPerfil(m.public_user_data.user_id);
    return respuesta({ ok: true });
  }

  if (evento.type !== "user.created" && evento.type !== "user.updated") {
    return respuesta({ ok: true, ignorado: evento.type });
  }

  const u = evento.data as UsuarioClerk;
  const meta = u.public_metadata ?? {};
  const correo = u.email_addresses.find((e) => e.id === u.primary_email_address_id) ?? u.email_addresses[0];
  const nombre = [u.first_name, u.last_name].filter(Boolean).join(" ") || texto(meta.nombre);

  const { data, error } = await supabase.rpc("sincronizar_usuario_clerk", {
    p_clerk_id: u.id,
    p_email: correo?.email_address ?? null,
    p_nombre: nombre,
    p_perfil: texto(meta.perfil),
    p_matricula: texto(meta.matricula),
    p_coordinacion: texto(meta.coordinacion),
    // Solo "Ban user" quita el acceso; un bloqueo temporal por intentos fallidos no.
    p_bloqueado: Boolean(u.banned),
    p_estado: texto(meta.estado),
    p_actualizado_en: evento.timestamp,
    // Sin verificar, el servidor no enlaza por correo una cuenta existente (0023).
    p_correo_verificado: correo?.verification?.status === "verified"
  });
  // Un error 500 hace que Clerk reintente el envío.
  if (error) return respuesta({ error: error.message }, 500);

  // Cuenta nueva sin perfil: se le escribe (becario si no está en una organización).
  if (evento.type === "user.created" && !texto(meta.perfil)) await escribirPerfil(u.id);
  return respuesta({ ok: true, usuario: data });
});
