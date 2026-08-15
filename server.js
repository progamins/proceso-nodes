/**
 * API REST del IESTP — Servidor principal.
 *
 * Arranca Express con middlewares de seguridad (helmet), CORS,
 * logging (winston) y monta las rutas de estudiantes, justificaciones,
 * horarios y autenticación.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const config = require('./config/env');
const logger = require('./utils/logger');
const pool = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const estudianteRoutes = require('./routes/estudiantes.routes');
const horarioRoutes = require('./routes/horarios.routes');
const justificacionesRoutes = require('./routes/justificaciones.routes');

const app = express();

// ─── Middlewares globales ───────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.cors.origin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
  })
);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Logging de peticiones
app.use((req, res, next) => {
  res.on('finish', () => {
    logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode}`);
  });
  next();
});

// ─── Endpoints de salud y estado ────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'API IESTP',
    version: '2.0.0',
    status: 'ok',
    endpoints: [
      'GET /health',
      'GET /test-db',
      'POST /login',
      'GET /estudiante/:dni',
      'GET /estudiante/:dni/notas',
      'GET /estudiante/:dni/unidades-didacticas',
      'GET /estudiante/:dni/qr_code',
      'GET /estudiante/:dni/imagen',
      'POST /estudiante/:dni/imagen',
      'PUT /estudiante/:dni/update',
      'GET /horario/:programaId',
      'POST /justificacion',
      'GET /justificaciones/:dni',
    ],
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Prueba de conexión a la base de datos
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT 1 AS test');
    res.json({ message: 'Conexión a la base de datos exitosa', data: rows });
  } catch (err) {
    res.status(500).json({
      message: 'Fallo de conexión a la base de datos',
      error: err.message,
    });
  }
});

// ─── Rutas de la aplicación ─────────────────────────────────────
app.use(authRoutes);
app.use('/estudiante', estudianteRoutes);
app.use('/horario', horarioRoutes);
app.use(justificacionesRoutes);

// ─── Manejo de errores ──────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Arranque ───────────────────────────────────────────────────
// Solo escucha cuando se ejecuta directamente (permite importar la app en tests)
if (require.main === module) {
  app.listen(config.port, () => {
    logger.info(`API IESTP corriendo en http://localhost:${config.port} (${config.nodeEnv})`);
  });
}

module.exports = app;
