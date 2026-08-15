/**
 * Configuración centralizada de la aplicación.
 *
 * Todas las variables de entorno se leen desde un archivo `.env`
 * (ver `.env.example`) y se exponen aquí de forma tipada y validada.
 */
require('dotenv').config();

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  // Servidor PHP que aloja los archivos (upload.php, imágenes, QR, horarios)
  phpUrl: process.env.PHP_URL || 'https://www.iestpasist.com',

  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  },

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'aplicativo',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    waitForConnections: true,
    queueLimit: 0,
  },

  uploads: {
    maxFileSize: 5 * 1024 * 1024, // 5 MB
    maxImagesPerJustificacion: 2,
    profileImagesDir: 'profile_images',
    tempUploadsDir: 'temp_uploads',
  },

  security: {
    loginRateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '100', 10),
    },
  },
};

module.exports = config;
