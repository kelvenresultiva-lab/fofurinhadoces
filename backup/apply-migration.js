require('dotenv').config({ path: process.argv[2] || require('path').join(__dirname, '..', '.env.novo'), quiet: true });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'migration_completa.sql'), 'utf8');
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('Aplicando migration em', process.env.SUPABASE_URL, '...');
    await client.query(sql);
    console.log('Migration aplicada com sucesso!');
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    console.log('Tabelas criadas:', res.rows.map(r => r.table_name).join(', '));
  } catch (err) {
    console.error('ERRO ao aplicar migration:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
