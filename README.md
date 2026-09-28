# Tonavia

Tonavia es una aplicación web para construir una cola musical colaborativa durante un evento.

El administrador inicia una sala desde su celular o tableta, vincula su cuenta de Spotify Premium y muestra un código QR. Los invitados lo escanean, buscan canciones en el catálogo de Spotify, agregan solicitudes y consultan la cola en tiempo real. No necesitan instalar una aplicación ni iniciar sesión en Spotify.

La reproducción se gestiona desde la aplicación Spotify del administrador; Tonavia gestiona las salas, las solicitudes y el orden de la cola.

## Flujo del MVP

1. El administrador inicia sesión en Tonavia y vincula Spotify.
2. Crea una sala y se genera un QR con una URL pública.
3. Los invitados escanean el QR, eligen un apodo y buscan una canción.
4. La canción entra automáticamente a la cola y a la playlist del evento.
5. Todos ven la cola, la posición de cada solicitud y quién la agregó.
6. El administrador cierra la sala cuando termina el evento.

## Stack

| Capa | Tecnología | Responsabilidad |
| --- | --- | --- |
| Web | Angular + TypeScript + Angular Signals | PWA responsive para administrador e invitados |
| Hosting y API | Vercel + Serverless Functions | Aplicación web, endpoints seguros y OAuth de Spotify |
| Base de datos | Supabase Postgres | Salas, invitados, solicitudes y auditoría |
| Tiempo real | Supabase Realtime | Actualización inmediata de la cola en todos los dispositivos |
| Autenticación | Supabase Auth | Acceso del administrador; invitados con sesión anónima de sala |
| Música | Spotify Web API | Búsqueda de catálogo y creación/actualización de la playlist |
| Validación | Zod | Validación de datos en endpoints y límites de negocio |

## Arquitectura

```text
Angular PWA
├── Administración: /admin
└── Sala pública: /s/:roomCode
          │
          ├── Supabase Auth y Realtime
          └── API de Vercel: /api/*
                    │
                    ├── Supabase Postgres
                    └── Spotify Web API
```

Las claves privadas de Spotify y los tokens de actualización nunca se envían al navegador. Se guardan cifrados en el servidor y solo las funciones de Vercel hablan con Spotify.

## Patrones de diseño

- **Arquitectura por funcionalidades:** `admin`, `rooms`, `queue`, `search` y `spotify` son módulos independientes.
- **Facade + Signals:** cada pantalla depende de una fachada de estado; los componentes no conocen detalles de Supabase o HTTP.
- **Repository:** encapsula consultas de salas, solicitudes y perfiles de invitado.
- **Service layer / casos de uso:** centraliza reglas como crear sala, solicitar canción y cerrar evento.
- **Adapter:** aísla la Spotify Web API para evitar que el dominio dependa de sus endpoints.
- **Strategy:** permite cambiar las reglas de orden de la cola (llegada, turnos o votación) sin reescribir la sala.
- **Observer:** Supabase Realtime alimenta señales reactivas para sincronizar la cola en vivo.
- **DTO + validación:** separa los datos externos de los modelos de dominio y valida cada entrada con Zod.

## Modelo inicial

- `profiles`: administradores autenticados.
- `spotify_connections`: tokens cifrados de Spotify por administrador.
- `rooms`: evento, código público, estado y playlist asociada.
- `guests`: apodo y sesión anónima dentro de una sala.
- `queue_items`: canción solicitada, invitado, posición, estado y fecha.
- `room_events`: historial técnico de apertura, solicitud y cierre.

## Reglas del MVP

- Solo el administrador crea y cierra una sala.
- Cualquier invitado con el QR puede solicitar canciones.
- Las solicitudes entran automáticamente, sin aprobación manual.
- Una misma canción no puede estar dos veces en la cola activa.
- Cada invitado tiene un límite configurable de solicitudes activas.
- Una sala cerrada conserva el historial, pero no acepta nuevas solicitudes.

## Seguridad

- Políticas de Row Level Security en Supabase.
- Código de sala aleatorio, no secuencial.
- Sesiones anónimas limitadas a una sala.
- Rate limit para búsqueda y creación de solicitudes.
- Validación en servidor de canciones, estado de sala y límite por invitado.

## Estado del proyecto

En planificación. El siguiente paso es crear la aplicación Angular y configurar los proyectos de Vercel, Supabase y Spotify.
