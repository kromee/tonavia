# Configurar Supabase

## 1. Crear el proyecto

1. Crea un proyecto en [Supabase](https://supabase.com/dashboard).
2. En **Authentication → Providers**, habilita **Anonymous sign-ins**. Los invitados lo usan para tener una identidad temporal, sin registro ni contraseña.
3. En **Project Settings → API**, copia la URL del proyecto y la clave `anon` o `publishable`.

No uses ni compartas la clave `service_role`: solo se utiliza en funciones privadas de Vercel cuando se implemente Spotify.

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

## Próxima integración

Cuando las variables estén disponibles, se añadirá el cliente `@supabase/supabase-js` al navegador para:

1. iniciar una sesión anónima del invitado;
2. llamar `join_room` al escanear el QR;
3. cargar y suscribirse a `queue_items`;
4. llamar `request_queue_item` al pedir una canción.
