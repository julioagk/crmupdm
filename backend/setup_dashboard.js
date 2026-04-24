const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { db } = require('./config/database');
const googleSheets = require('./lib/googleSheetsService');

async function setup() {
    console.log('🛠️ Configurando Dashboard en tiempo real...');

    try {
        const usuarios = await db.prepare('SELECT nombre FROM usuarios WHERE activo = 1').all();
        await googleSheets.setupRealtimeDashboard(usuarios);
        console.log('✅ Dashboard configurado con éxito.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

setup();
