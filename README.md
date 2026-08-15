<div align="center">

# 🎓 API IESTP

**API REST del Instituto de Educación Superior Tecnológico Público** — estudiantes, notas, unidades didácticas, horarios, justificaciones, códigos QR e imágenes de perfil.

Construida con **Node.js + Express + MySQL**, endurecida con **JWT + bcrypt** y cubierta con **tests automatizados**.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com)
[![Auth](https://img.shields.io/badge/Auth-JWT%20%2B%20bcrypt-6d28d9?style=for-the-badge)](https://jwt.io)
[![Tests](https://img.shields.io/badge/tests-12%2F12%20passing-2ea44f?style=for-the-badge)](#-pruebas)
[![Version](https://img.shields.io/badge/version-2.0.0-0ea5e9?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-ISC-blue?style=for-the-badge)](LICENSE)

</div>

---

## ✨ Características

| | |
|---|---|
| 📊 **Datos de estudiantes** | Datos generales, notas por unidad didáctica y unidades del semestre actual |
| 📅 **Horarios** | PDF del horario vigente por programa de estudios |
| 📝 **Justificaciones** | Registro de inasistencias con hasta 2 imágenes por justificación |
| 🖼️ **Imágenes de perfil** | Subida y consulta de la foto del estudiante |
| 📱 **Códigos QR** | URL pública del QR institucional |
| 🔒 **Seguridad** | Contraseñas con **bcrypt**, tokens **JWT**, rate limiting en el login y `helmet` |
| 🧪 **Calidad** | Arquitectura modular, logging con Winston y **12 tests** con `supertest` |

## 🛠️ Stack

| Capa | Tecnologías |
|---|---|
| **Runtime** | Node.js ≥ 18 |
| **Framework** | Express 4 |
| **Base de datos** | MySQL / MariaDB (`mysql2` con pool de conexiones) |
| **Auth** | `jsonwebtoken` + `bcryptjs` |
| **Seguridad** | `helmet`, `express-rate-limit`, `express-validator` |
| **Archivos** | `multer` (imágenes de perfil y justificaciones) |
| **Integración** | `axios` + `form-data` (servidor PHP del IESTP) |
| **Logging / Tests** | `winston` · `supertest` + runner nativo de Node |

## 🚀 Inicio rápido

```bash
# 1. Clona y entra al proyecto
git clone https://github.com/progamins/proceso-nodes.git
cd proceso-nodes

# 2. Instala las dependencias
npm install

# 3. Configura las variables de entorno
cp .env.example .env
#    → ajusta DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE y JWT_SECRET

# 4. (Opcional) Migra contraseñas en texto plano a bcrypt
npm run migrate:passwords

# 5. Arranca el servidor 🚀
npm start          # o: npm run dev (con nodemon)
```

> 💡 El login también migra automáticamente cada contraseña la primera vez
> que el estudiante inicia sesión; el script solo adelanta la migración.

## 📦 Scripts

| Comando | Descripción |
|---|---|
| `npm start` | Ejecuta el servidor en producción |
| `npm run dev` | Ejecuta el servidor con `nodemon` (reinicia al guardar) |
| `npm test` | Ejecuta las pruebas de la API |
| `npm run health` | Comprueba el estado del servicio (`GET /health`) |
| `npm run migrate:passwords` | Migra contraseñas en texto plano a hashes bcrypt |

## 🔐 Autenticación

`POST /login` verifica las credenciales con **bcrypt** (migrando automáticamente
las contraseñas legadas en texto plano) y devuelve un **token JWT** junto con
los datos del estudiante:

```json
{
  "message": "Login exitoso",
  "token": "<jwt>",
  "data": { "id": 1, "dni": "72345678", "nombre": "Juan Pérez", "programa": "DSI" }
}
```

Las **rutas de escritura** requieren el token en el header:

```
Authorization: Bearer <token>
```

```
📱 App móvil ──▶ POST /login ──▶ 🔑 JWT token
     │
     └────────▶ GET /estudiante/:dni ──▶ 📊 Datos, notas, QR
                PUT /estudiante/:dni/update ──▶ ✏️ (requiere token)
```

## 📡 Endpoints

### Públicos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Información de la API y lista de endpoints |
| `GET` | `/health` | Estado del servicio |
| `GET` | `/test-db` | Prueba de conexión a la base de datos |
| `POST` | `/login` | Inicio de sesión → devuelve token JWT |
| `GET` | `/estudiante/:dni` | Datos completos del estudiante + unidades |
| `GET` | `/estudiante/:dni/notas` | Notas por unidad didáctica |
| `GET` | `/estudiante/:dni/unidades-didacticas` | Unidades del semestre actual |
| `GET` | `/estudiante/:dni/qr_code` | URL pública del código QR |
| `GET` | `/estudiante/:dni/imagen` | Imagen de perfil (archivo) |
| `GET` | `/horario/:programaId` | Horario más reciente del programa |
| `GET` | `/justificaciones/:dni` | Historial de justificaciones |

### 🔒 Protegidos (requieren `Bearer <token>`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/estudiante/:dni/imagen` | Actualiza la imagen de perfil |
| `PUT` | `/estudiante/:dni/update` | Actualiza email, celular o dirección |
| `POST` | `/justificacion` | Crea una justificación de inasistencia |

## ⚙️ Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `NODE_ENV` | `development` \| `production` | `development` |
| `PORT` | Puerto del servidor | `3000` |
| `PHP_URL` | Servidor PHP (upload.php, imágenes, QR, horarios) | `https://www.iestpasist.com` |
| `DB_HOST` / `DB_PORT` | Host / puerto MySQL | `127.0.0.1` / `3306` |
| `DB_USER` / `DB_PASSWORD` | Credenciales de la base | — |
| `DB_DATABASE` | Nombre de la base | `aplicativo` |
| `DB_CONNECTION_LIMIT` | Conexiones simultáneas del pool | `10` |
| `CORS_ORIGIN` | Orígenes permitidos (separados por coma) | `*` |
| `LOGIN_RATE_LIMIT_MAX` | Intentos de login por ventana de 15 min | `100` |
| `JWT_SECRET` | Secreto para firmar tokens (**obligatorio en producción**) | — |
| `JWT_EXPIRES_IN` | Vigencia del token | `24h` |
| `BCRYPT_ROUNDS` | Coste del hash bcrypt | `10` |
| `LOG_LEVEL` | Nivel de logging (`info`, `debug`, …) | `info` |

Genera un `JWT_SECRET` seguro con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 🧪 Pruebas

```bash
npm test
```

12 tests con `supertest` sobre el runner nativo de Node (`node --test`):
endpoints públicos, validaciones y el flujo completo de autenticación
(login → migración a bcrypt → token JWT → ruta protegida). Las pruebas que
dependen de la base de datos se omiten automáticamente si no está disponible.

## 📁 Estructura

```
├── config/        # Configuración centralizada (env, pool de MySQL)
├── middleware/    # auth (JWT), upload (multer), errorHandler
├── routes/        # auth, estudiantes, horarios, justificaciones
├── scripts/       # Utilidades (migrate-passwords)
├── services/      # Integraciones (auth, servidor PHP)
├── tests/         # Pruebas de la API (supertest)
└── utils/         # asyncHandler, logger (winston)
```

## 📄 Licencia

Distribuido bajo la licencia **ISC**.
