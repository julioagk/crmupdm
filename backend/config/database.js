/**
 * Configuración de base de datos
 * Soporta SQLite (desarrollo) y PostgreSQL (producción)
 */

const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');

let internalDb;
let isPostgres = false;

if (process.env.DATABASE_URL) {
  console.log('🌐 Conectando a PostgreSQL (Producción)...');
  internalDb = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  isPostgres = true;
} else {
  console.log('🔧 Inicializando base de datos local SQLite...');
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'database.db');
  internalDb = new Database(dbPath);
  internalDb.pragma('journal_mode = WAL');
}

// Helper para convertir '?' a '$1', '$2', etc. para Postgres
const convertSql = (sql) => {
  if (!isPostgres) return sql;
  let count = 1;
  return sql.replace(/\?/g, () => `$${count++}`);
};

// Shim para imitar better-sqlite3 de forma asíncrona
const db = {
  prepare: (sql) => {
    const finalSql = convertSql(sql);
    return {
      get: async (...params) => {
        if (isPostgres) {
          const res = await internalDb.query(finalSql, params);
          return res.rows[0];
        } else {
          return internalDb.prepare(sql).get(...params);
        }
      },
      all: async (...params) => {
        if (isPostgres) {
          const res = await internalDb.query(finalSql, params);
          return res.rows;
        } else {
          return internalDb.prepare(sql).all(...params);
        }
      },
      run: async (...params) => {
        if (isPostgres) {
          const res = await internalDb.query(finalSql, params);
          // Mapear insertId (Postgres) a lastInsertRowid (SQLite) si es posible
          return { lastInsertRowid: res.rows[0]?.id || null, changes: res.rowCount };
        } else {
          return internalDb.prepare(sql).run(...params);
        }
      }
    };
  },
  exec: async (sql) => {
    if (isPostgres) {
      return internalDb.query(sql);
    } else {
      return internalDb.exec(sql);
    }
  }
};

// Inicializar tablas
const initDb = async () => {
  const sql = `
  CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    usuario TEXT UNIQUE NOT NULL,
    contraseña TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('prospector','closer')),
    nombre TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    activo INTEGER DEFAULT 1,
    fechaCreacion TEXT DEFAULT CURRENT_TIMESTAMP,
    googleRefreshToken TEXT,
    googleAccessToken TEXT,
    googleTokenExpiry DOUBLE PRECISION
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nombres TEXT NOT NULL,
    apellidoPaterno TEXT NOT NULL,
    apellidoMaterno TEXT,
    telefono TEXT NOT NULL,
    correo TEXT NOT NULL,
    empresa TEXT,
    estado TEXT DEFAULT 'proceso' CHECK(estado IN ('ganado','perdido','proceso')),
    etapaEmbudo TEXT DEFAULT 'prospecto_nuevo',
    prospectorAsignado INTEGER REFERENCES usuarios(id),
    closerAsignado INTEGER REFERENCES usuarios(id),
    fechaTransferencia TEXT,
    fechaUltimaEtapa TEXT DEFAULT CURRENT_TIMESTAMP,
    historialEmbudo TEXT,
    vendedorAsignado INTEGER NOT NULL REFERENCES usuarios(id),
    fechaRegistro TEXT DEFAULT CURRENT_TIMESTAMP,
    ultimaInteraccion TEXT DEFAULT CURRENT_TIMESTAMP,
    notas TEXT,
    interes INTEGER DEFAULT 0,
    proximaLlamada TEXT
  );

  CREATE TABLE IF NOT EXISTS actividades (
    id SERIAL PRIMARY KEY,
    tipo TEXT NOT NULL CHECK(tipo IN ('llamada','mensaje','correo','whatsapp','cita','prospecto')),
    vendedor INTEGER NOT NULL REFERENCES usuarios(id),
    cliente INTEGER NOT NULL REFERENCES clientes(id),
    fecha TEXT DEFAULT CURRENT_TIMESTAMP,
    descripcion TEXT,
    resultado TEXT DEFAULT 'pendiente' CHECK(resultado IN ('exitoso','pendiente','fallido')),
    cambioEtapa INTEGER DEFAULT 0,
    etapaAnterior TEXT,
    etapaNueva TEXT,
    notas TEXT
  );

  CREATE TABLE IF NOT EXISTS tareas (
    id SERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    vendedor INTEGER REFERENCES usuarios(id),
    cliente INTEGER REFERENCES clientes(id),
    estado TEXT DEFAULT 'pendiente',
    prioridad TEXT DEFAULT 'media',
    fechaLimite TEXT,
    completada INTEGER DEFAULT 0,
    fechaCreacion TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ventas (
    id SERIAL PRIMARY KEY,
    cliente INTEGER NOT NULL REFERENCES clientes(id),
    vendedor INTEGER NOT NULL REFERENCES usuarios(id),
    monto DOUBLE PRECISION NOT NULL,
    fecha TEXT DEFAULT CURRENT_TIMESTAMP,
    estado TEXT DEFAULT 'pendiente',
    notas TEXT
  );
`;

  let finalSql = sql;
  if (!isPostgres) {
    finalSql = sql.replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/DOUBLE PRECISION/g, 'REAL')
      .replace(/CURRENT_TIMESTAMP/g, "(datetime('now'))");
  }

  try {
    await db.exec(finalSql);
    console.log('✅ Base de datos inicializada');
  } catch (e) {
    console.error('❌ Error al inicializar DB:', e.message);
  }
};

initDb();

module.exports = db;

