const { updateCRMFromDB } = require('./lib/crmSync');

(async () => {
    try {
        await updateCRMFromDB();
        console.log('✅ Hoja crm actualizada correctamente (CLI)');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error actualizando hoja crm (CLI):', error.message || error);
        process.exit(1);
    }
})();