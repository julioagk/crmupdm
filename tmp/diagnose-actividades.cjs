(async () => {
  const { db } = require('../backend/config/database');
  const total = (await db.prepare('SELECT COUNT(*) as c FROM actividades').get())?.c || 0;
  const hu = (await db.prepare('SELECT COUNT(*) as c FROM actividades a LEFT JOIN clientes c ON c.id = a.cliente WHERE c.id IS NULL').get())?.c || 0;
  const sin = (await db.prepare("SELECT COUNT(*) as c FROM actividades a LEFT JOIN clientes c ON c.id = a.cliente WHERE c.id IS NOT NULL AND COALESCE(TRIM(c.nombres),'')='' AND COALESCE(TRIM(c.correo),'')='' AND COALESCE(TRIM(c.telefono),'')='' AND COALESCE(TRIM(c.empresa),'')=''").get())?.c || 0;
  console.log(JSON.stringify({ total, hu, sin }, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
