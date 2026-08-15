/**
 * Pruebas de la API con supertest (runner nativo de Node).
 *
 * Las pruebas dependientes de la base de datos usan la instancia local
 * de MariaDB (configurada en .env) con los datos de ejemplo; si la base
 * no está disponible se omiten automáticamente en tiempo de ejecución.
 *
 * Ejecutar: npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const config = require('../config/env');
const pool = require('../config/db');
const app = require('../server');

const DB = {
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
};

let dbAvailable = false;

test.before(async () => {
  try {
    const conn = await mysql.createConnection(DB);
    await conn.execute('SELECT 1');
    await conn.end();
    dbAvailable = true;
  } catch (err) {
    console.error('Base de datos no disponible, se omitirán las pruebas que la requieren:', err.message);
  }
});

test.after(async () => {
  // Cierra el pool para que el proceso de pruebas termine
  await pool.end();
});

// Datos de ejemplo sembrados en la base local (ver README)
const EXAMPLE_DNI = '72345678';

// DNI de 8 dígitos que no colisiona con los datos de ejemplo
const randomDni = () => '9' + String(crypto.randomInt(1_000_000, 9_999_999));

// Salta el test en tiempo de ejecución si la base no está disponible
const skipIfNoDb = (t) => {
  if (!dbAvailable) return t.skip('Base de datos no disponible');
};

test('GET / responde con la información de la API', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'API IESTP');
  assert.ok(Array.isArray(res.body.endpoints));
});

test('GET /health responde ok', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.ok(res.body.uptime >= 0);
});

test('GET /ruta-inexistente responde 404 JSON', async () => {
  const res = await request(app).get('/ruta-inexistente');
  assert.equal(res.status, 404);
  assert.equal(res.body.message, 'Ruta no encontrada');
});

test('GET /test-db verifica la conexión a la base', async (t) => {
  skipIfNoDb(t);
  const res = await request(app).get('/test-db');
  assert.equal(res.status, 200);
  assert.equal(res.body.message, 'Conexión a la base de datos exitosa');
});

test('GET /estudiante/:dni devuelve los datos del estudiante', async (t) => {
  skipIfNoDb(t);
  const res = await request(app).get(`/estudiante/${EXAMPLE_DNI}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.dni, EXAMPLE_DNI);
  assert.ok(res.body.data.nombre);
  assert.ok(Array.isArray(res.body.data.unidades_didacticas));
});

test('GET /estudiante/:dni con DNI inexistente responde 404', async (t) => {
  skipIfNoDb(t);
  const res = await request(app).get('/estudiante/00000000');
  assert.equal(res.status, 404);
});

test('GET /estudiante/:dni/notas devuelve las notas', async (t) => {
  skipIfNoDb(t);
  const res = await request(app).get(`/estudiante/${EXAMPLE_DNI}/notas`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
});

test('GET /estudiante/:dni/unidades-didacticas devuelve las unidades', async (t) => {
  skipIfNoDb(t);
  const res = await request(app).get(`/estudiante/${EXAMPLE_DNI}/unidades-didacticas`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.unidades_didacticas));
});

test('GET /horario/:programaId responde con el horario (o aviso de PDF)', async (t) => {
  skipIfNoDb(t);
  const res = await request(app).get('/horario/1');
  // 200 si el PDF existe, 404 si el archivo no está disponible; ambos son respuestas válidas
  assert.ok([200, 404].includes(res.status));
  assert.ok(res.body.message);
});

test('POST /login con campos vacíos responde 400', async () => {
  const res = await request(app).post('/login').send({ usuario: '', clave: '' });
  assert.equal(res.status, 400);
});

test('POST /login con credenciales inválidas responde 401', async () => {
  const res = await request(app)
    .post('/login')
    .send({ usuario: 'usuario_inexistente', clave: 'incorrecta' });
  assert.equal(res.status, 401);
  assert.equal(res.body.message, 'Credenciales inválidas');
});

test('Login con contraseña en texto plano emite JWT y migra a bcrypt', async (t) => {
  skipIfNoDb(t);
  const conn = await mysql.createConnection(DB);

  const dni = randomDni();
  const usuario = `test_${crypto.randomBytes(4).toString('hex')}`;
  const clave = 'ClaveTest123';

  try {
    await conn.execute(
      'INSERT INTO estudiantes (nombre, dni, usuario, clave, programa, programa_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['Estudiante de Prueba', dni, usuario, clave, 'Desarrollo de Sistemas de Información', 1]
    );

    // 1) Login con contraseña en texto plano → emite token
    const login = await request(app).post('/login').send({ usuario, clave });
    assert.equal(login.status, 200);
    assert.equal(login.body.message, 'Login exitoso');
    assert.ok(login.body.token, 'el login debe devolver un token JWT');
    assert.equal(login.body.data.dni, dni);

    // 2) La contraseña quedó migrada a hash bcrypt
    const [rows] = await conn.execute('SELECT clave FROM estudiantes WHERE dni = ?', [dni]);
    assert.match(rows[0].clave, /^\$2[aby]\$\d{2}\$/, 'la clave debe quedar como hash bcrypt');
    assert.notEqual(rows[0].clave, clave);

    // 3) Sin token, la actualización es rechazada
    const sinToken = await request(app)
      .put(`/estudiante/${dni}/update`)
      .send({ field: 'email', value: 'test@example.com' });
    assert.equal(sinToken.status, 401);

    // 4) Con el token, la actualización funciona
    const conToken = await request(app)
      .put(`/estudiante/${dni}/update`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ field: 'email', value: 'test@example.com' });
    assert.equal(conToken.status, 200);
    assert.equal(conToken.body.data.correo_personal, 'test@example.com');

    // 5) Un campo no permitido se rechaza aunque haya token
    const campoProhibido = await request(app)
      .put(`/estudiante/${dni}/update`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ field: 'dni', value: '12345678' });
    assert.equal(campoProhibido.status, 400);

    // 6) Un token inválido se rechaza
    const tokenInvalido = await request(app)
      .put(`/estudiante/${dni}/update`)
      .set('Authorization', 'Bearer token-falso')
      .send({ field: 'email', value: 'x@example.com' });
    assert.equal(tokenInvalido.status, 401);
  } finally {
    await conn.execute('DELETE FROM estudiantes WHERE dni = ?', [dni]);
    await conn.end();
  }
});
