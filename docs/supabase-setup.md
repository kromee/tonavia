# Configurar Supabase

## 1. Crear el proyecto

1. Crea un proyecto en [Supabase](https://supabase.com/dashboard).
2. En **Authentication → Providers**, habilita **Anonymous sign-ins**. Los invitados lo usan para tener una identidad temporal, sin registro ni contraseña.
3. En **Project Settings → API**, copia la URL del proyecto y la clave `anon` o `publishable`.

No uses ni compartas la clave `service_role`; Tonavia no la necesita.

## 2. Aplicar el esquema

En el SQL Editor del proyecto, ejecuta el contenido de:

```text
supabase/migrations/20260928160000_initial_schema.sql
```

El script crea salas, invitados y solicitudes, además de:

- políticas RLS;
- funciones para que un invitado se una por código y solicite música;
- límite de tres solicitudes activas por invitado;
- bloqueo de canciones duplicadas;
- publicación de los cambios en Supabase Realtime.

## 3. Configurar variables

Copia `.env.example` a `.env` y reemplaza sus valores:

```bash
cp .env.example .env
```

Para Vercel, crea las mismas variables en **Project Settings → Environment Variables**. La clave pública puede estar en el navegador; no contiene privilegios administrativos. Las políticas RLS son las que protegen los datos.

## 4. Migraciones posteriores

Ejecuta en orden, una sola vez cada una:

```text
supabase/migrations/20260928175000_fix_room_access_policies.sql
supabase/migrations/20260928180000_fix_join_room_function.sql
supabase/migrations/20260928181000_public_room_queue.sql
supabase/migrations/20260929130000_spotify_playback_sync.sql
```

La última añade la sincronización con Spotify: marca la canción que está sonando, la retira al terminar y libera el lugar del invitado en cuanto su canción empieza.

## 5. Conectar Spotify del anfitrión

En [Spotify for Developers](https://developer.spotify.com/dashboard), dentro de la app de Tonavia:

1. **Settings → Redirect URIs**: agrega `https://tonavia.vercel.app/admin` y, para desarrollo, `http://127.0.0.1:4200/admin` (Spotify no acepta `localhost`).
2. **User Management**: mientras la app esté en modo desarrollo, agrega el correo de la cuenta de Spotify del anfitrión.
3. La cuenta del anfitrión necesita Spotify Premium para que Tonavia reproduzca y encole canciones.

El panel `/admin` debe permanecer abierto durante la reunión: es quien sincroniza lo que suena con la cola.
