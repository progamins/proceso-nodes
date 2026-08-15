/**
 * Configuración de Multer para la subida de archivos.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

const PROFILE_IMAGES_DIR = path.join(__dirname, '..', config.uploads.profileImagesDir);
const TEMP_UPLOADS_DIR = path.join(__dirname, '..', config.uploads.tempUploadsDir);

// Garantiza que los directorios existan
fs.mkdirSync(PROFILE_IMAGES_DIR, { recursive: true });
fs.mkdirSync(TEMP_UPLOADS_DIR, { recursive: true });

/**
 * Almacenamiento para imágenes de perfil: el nombre del archivo es el DNI.
 */
const profileImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROFILE_IMAGES_DIR),
  filename: (req, file, cb) => {
    const dni = req.params.dni;
    const fileExt = path.extname(file.originalname);
    cb(null, `${dni}${fileExt}`);
  },
});

/**
 * Almacenamiento temporal para justificaciones (se borran tras subirlas al servidor PHP).
 */
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMP_UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const imageFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen'));
  }
};

const profileImageFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png/;
  const mimetype = filetypes.test(file.mimetype);
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  if (mimetype && extname) return cb(null, true);
  cb(new Error('Solo se permiten imágenes (jpeg, jpg, png)'));
};

/**
 * Upload de una sola imagen de perfil (campo "imagen").
 */
const uploadProfileImage = multer({
  storage: profileImageStorage,
  limits: { fileSize: config.uploads.maxFileSize },
  fileFilter: profileImageFilter,
});

/**
 * Upload de hasta N imágenes para justificaciones (campo "imagenes").
 */
const uploadJustificacionImages = multer({
  storage: tempStorage,
  limits: { fileSize: config.uploads.maxFileSize },
  fileFilter: imageFileFilter,
});

module.exports = {
  PROFILE_IMAGES_DIR,
  TEMP_UPLOADS_DIR,
  uploadProfileImage,
  uploadJustificacionImages,
};
