/**
 * Servicio de integración con el servidor PHP del IESTP
 * (subida de imágenes de justificaciones).
 */
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * Sube un archivo de imagen al servidor PHP y devuelve su URL pública.
 * @param {string} filePath - Ruta local del archivo a subir.
 * @param {string} originalname - Nombre original del archivo.
 * @returns {Promise<string>} URL pública de la imagen subida.
 */
async function uploadImageToPhp(filePath, originalname) {
  const formData = new FormData();
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const filename = uniqueSuffix + '-' + originalname;

  formData.append('imagen', fs.createReadStream(filePath), {
    filename,
    contentType: 'image/jpeg',
  });

  await axios.post(`${config.phpUrl}/upload.php`, formData, {
    headers: formData.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const url = `${config.phpUrl}/imagenesJ/${filename}`;
  logger.info(`Imagen subida al servidor PHP: ${url}`);
  return url;
}

module.exports = { uploadImageToPhp };
