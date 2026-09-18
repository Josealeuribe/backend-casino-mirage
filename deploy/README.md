# Despliegue de Centro Club Mirage (Casino-arauca)

Este proyecto vive en **dos repositorios separados** (`backend-casino-mirage` y
`frontend-casino-mirage`), pero se levanta como **un solo stack de Docker
Compose** que los construye a ambos desde una carpeta padre común. Estos 4
archivos son copias de los que se usan en esa carpeta padre — viven aquí para
que queden versionados, ya que esa carpeta padre en sí no es un repositorio
git.

## Estructura esperada

```
casino-arauca/                  <- carpeta padre (no es un repo en sí)
├── backend/                    <- clon de backend-casino-mirage
├── frontend/                   <- clon de frontend-casino-mirage
├── docker-compose.yml          <- copiado de backend/deploy/
├── docker-compose.prod.yml     <- copiado de backend/deploy/
├── .env.example                <- copiado de backend/deploy/
└── .env.production.example     <- copiado de backend/deploy/
```

Los `context: ./backend` y `context: ./frontend` de ambos docker-compose
son relativos a esa carpeta padre, no a este repositorio — por eso los
archivos deben copiarse (o symlinkearse) un nivel arriba, con las carpetas
clonadas usando exactamente esos nombres (`backend/`, `frontend/`).

## Desarrollo local

```
cp backend/deploy/docker-compose.yml .
cp backend/deploy/.env.example .env
docker compose up -d --build
```

Ver los comentarios dentro de `docker-compose.yml` para el resto (seed
inicial, puertos, etc.).

## Producción (MySQL gestionado en Aiven)

```
cp backend/deploy/docker-compose.prod.yml .
cp backend/deploy/.env.production.example .env.production
# Editar .env.production con las credenciales reales de Aiven -- este
# archivo NUNCA se commitea.
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`RUN_MIGRATIONS=false` en este stack a propósito: levantar el contenedor no
toca el esquema de la base de datos. Aplicar el esquema y sembrar el
catálogo inicial son pasos manuales y deliberados, ver los comentarios de
`docker-compose.prod.yml`.

También hace falta el certificado CA de Aiven en
`backend/prisma/aiven-ca.pem` (no es secreto, pero sí necesario para que la
conexión SSL funcione) -- ya está commiteado en este repo.
