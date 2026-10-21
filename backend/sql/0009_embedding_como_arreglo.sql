-- Fase 3 · 0009 — embedding_vector como real[] en vez de bytea
-- PostgREST serializa bytea como string hex ("\x...") en JSON, lo que exige
-- codificar/decodificar a mano en el cliente. La tabla sigue vacía (nadie se
-- ha enrolado todavía), así que se cambia el tipo antes de que eso importe:
-- real[] llega como arreglo JSON de números, mapeo directo a FloatArray.

alter table public.enrolamientos_faciales drop column embedding_vector;
alter table public.enrolamientos_faciales add column embedding_vector real[] not null;

comment on column public.enrolamientos_faciales.embedding_vector is
  'Dato biométrico. El acceso se restringe por RLS; el cifrado en reposo con llave propia queda pendiente de decidir (ver README de migraciones).';
