/**
 * Configuración de base de datos
 * Soporta SQLite (desarrollo) y PostgreSQL (producción)
 */

const { Pool } = require('pg');
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
  const Database = require('better-sqlite3');
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

// Helper para normalizar nombres de columnas de Postgres (minúsculas) a camelCase para la app
const normalizeRow = (row) => {
  if (!row || !isPostgres) return row;
  const mapping = {
    etapaembudo: 'etapaEmbudo',
    proximallamada: 'proximaLlamada',
    prospectorasignado: 'prospectorAsignado',
    closerasignado: 'closerAsignado',
    fechatransferencia: 'fechaTransferencia',
    fechaultimaetapa: 'fechaUltimaEtapa',
    historialembudo: 'historialEmbudo',
    vendedorasignado: 'vendedorAsignado',
    fecharegistro: 'fechaRegistro',
    ultimainteraccion: 'ultimaInteraccion',
    apellido_paterno: 'apellidoPaterno', // Por si acaso hay variantes
    apellido_materno: 'apellidoMaterno',
    googlerefreshtoken: 'googleRefreshToken',
    googleaccesstoken: 'googleAccessToken',
    googletokenexpiry: 'googleTokenExpiry',
    fechacreacion: 'fechaCreacion'
  };
  const normalized = {};
  for (const key in row) {
    const targetKey = mapping[key] || key;
    normalized[targetKey] = row[key];
  }
  return normalized;
};

// Shim para imitar better-sqlite3 de forma asíncrona
const db = {
  pragma: (sql) => {
    if (isPostgres) return; // No-op en Postgres
    return internalDb.pragma(sql);
  },
  prepare: (sql) => {
    const finalSql = convertSql(sql);
    return {
      get: async (...params) => {
        if (isPostgres) {
          const res = await internalDb.query(finalSql, params);
          return normalizeRow(res.rows[0]);
        } else {
          return internalDb.prepare(sql).get(...params);
        }
      },
      all: async (...params) => {
        if (isPostgres) {
          const res = await internalDb.query(finalSql, params);
          return res.rows.map(normalizeRow);
        } else {
          return internalDb.prepare(sql).all(...params);
        }
      },
      run: async (...params) => {
        if (isPostgres) {
          let query = finalSql;
          // Si es un INSERT y no tiene RETURNING, lo agregamos para obtener el ID
          const trimmed = query.trim().toUpperCase();
          if (trimmed.startsWith('INSERT') && !trimmed.includes('RETURNING')) {
            query += ' RETURNING id';
            const res = await internalDb.query(query, params);
            return {
              lastInsertRowid: res.rows[0]?.id || null,
              changes: res.rowCount
            };
          }
          const res = await internalDb.query(query, params);
          return { lastInsertRowid: null, changes: res.rowCount };
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

    // Verificar si ya hay usuarios; si no, insertar los predeterminados
    const userCount = await db.prepare('SELECT COUNT(*) as count FROM usuarios').get();
    if (userCount && parseInt(userCount.count) === 0) {
      console.log('🌱 Base de datos vacía, insertando usuarios predeterminados...');
      const bcrypt = require('bcryptjs');
      const hashProspector = await bcrypt.hash('prospector123', 10);
      const hashCloser = await bcrypt.hash('closer123', 10);

      await db.prepare('INSERT INTO usuarios (usuario, contraseña, rol, nombre, email, telefono) VALUES (?, ?, ?, ?, ?, ?)')
        .run('prospector', hashProspector, 'prospector', 'Alex Mendoza', 'prospector@crm.com', '5554444444');

      await db.prepare('INSERT INTO usuarios (usuario, contraseña, rol, nombre, email, telefono) VALUES (?, ?, ?, ?, ?, ?)')
        .run('closer', hashCloser, 'closer', 'Fernando Ruiz', 'closer@crm.com', '5555555555');

      console.log('✅ Usuarios predeterminados creados');
    }
  } catch (e) {
    console.error('❌ Error al inicializar o seedear DB:', e.message);
  }
};

initDb();

module.exports = { db, isPostgres };

