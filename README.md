# API IESTP

API REST del IESTP: estudiantes, notas, unidades didácticas, horarios,
justificaciones, códigos QR e imágenes de perfil. Construida con Node.js,
Express y MySQL/MariaDB.

## Requisitos

- Node.js >= 18
- MySQL/MariaDB (el proyecto usa una base local con datos de ejemplo)

## Configuración

1. Copia la plantilla de variables de entorno:

   ```bash
   cp .env.example .env
   ```

2. Ajusta los valores en `.env` (host, usuario y contraseña de la base de
   datos, `JWT_SECRET`, etc.). **Nunca subas `.env` al repositorio.**

3. Instala las dependencias:

   ```bash
   npm install
   ```

4. (Opcional, una sola vez) Migra las contraseñas de estudiantes que aún
   estén en texto plano a hashes bcrypt:

   ```bash
   npm run migrate:passwords
   ```

   > El login también migra automáticamente cada contraseña la primera vez
   > que el estudiante inicia sesión, así que este paso es solo para
   > adelantar la migración.

## Ejecutar

```bash
npm start        # producción
npm run dev      # desarrollo (nodemon, reinicia al guardar)
npm run health   # comprueba el estado del servicio
```

## Autenticación

`POST /login` verifica las credenciales con bcrypt y devuelve un **token JWT**
junto con los datos del estudiante:

```json
{
  "message": "Login exitoso",
  "token": "<jwt>",
  "data": { "id": 1, "dni": "72345678", "nombre": "...", "programa": "..." }
}
```

Las rutas de escritura requieren el token en el header:

```
Authorization: Bearer <token>
```

Rutas protegidas:

| Método | Ruta | Descripción |
|---|---|---|
| PUT | `/estudiante/:dni/update` | Actualiza email, celular o dirección |
| POST | `/estudiante/:dni/imagen` | Sube la imagen de perfil |
| POST | `/justificacion` | Crea una justificación de inasistencia |

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Información de la API y lista de endpoints |
| GET | `/health` | Estado del servicio |
| GET | `/test-db` | Prueba de conexión a la base de datos |
| POST | `/login` | Inicio de sesión (devuelve token JWT) |
| GET | `/estudiante/:dni` | Datos completos del estudiante |
| GET | `/estudiante/:dni/notas` | Notas por unidad didáctica |
| GET | `/estudiante/:dni/unidades-didacticas` | Unidades del semestre actual |
| GET | `/estudiante/:dni/qr_code` | URL pública del código QR |
| GET | `/estudiante/:dni/imagen` | Imagen de perfil (archivo) |
| POST | `/estudiante/:dni/imagen` | Actualiza la imagen de perfil 🔒 |
| PUT | `/estudiante/:dni/update` | Actualiza un campo del estudiante 🔒 |
| GET | `/horario/:programaId` | Horario más reciente del programa |
| POST | `/justificacion` | Crea una justificación 🔒 |
| GET | `/justificaciones/:dni` | Historial de justificaciones |

🔒 = requiere `Authorization: Bearer <token>`

## Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `NODE_ENV` | `development` \| `production` | `development` |
| `PORT` | Puerto del servidor | `3000` |
| `PHP_URL` | Servidor PHP (upload.php, imágenes, QR, horarios) | `https://www.iestpasist.com` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_DATABASE` | Conexión MySQL | `127.0.0.1:3306` |
| `DB_CONNECTION_LIMIT` | Conexiones simultáneas del pool | `10` |
| `CORS_ORIGIN` | Orígenes permitidos (coma-separados) | `*` |
| `LOGIN_RATE_LIMIT_MAX` | Intentos de login por ventana de 15 min | `100` |
| `JWT_SECRET` | Secreto para firmar tokens (**obligatorio en producción**) | — |
| `JWT_EXPIRES_IN` | Vigencia del token | `24h` |
| `BCRYPT_ROUNDS` | Coste del hash bcrypt | `10` |
| `LOG_LEVEL` | Nivel de logging (info, debug, ...) | `info` |

Genera un `JWT_SECRET` con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Estructura

```
├── config/        # Configuración (env, pool de MySQL)
├── middleware/    # auth (JWT), upload (multer), errorHandler
├── routes/        # auth, estudiantes, horarios, justificaciones
├── scripts/       # Utilidades (migrate-passwords)
├── services/      # Integraciones (auth, servidor PHP)
├── tests/         # Pruebas de la API
└── utils/         # asyncHandler, logger (winston)
```

## Pruebas

```bash
npm test
```

Las pruebas usan `supertest` con el runner nativo de Node (`node --test`).
Las que dependen de la base de datos se omiten automáticamente si la base
local no está disponible.
