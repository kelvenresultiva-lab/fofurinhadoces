require('dotenv').config({ path: process.argv[3] || require('path').join(__dirname, '..', '.env.novo'), quiet: true });
const fs = require('fs');
const { Client } = require('pg');

(async () => {
  const sqlFile = process.argv[2];
  if (!sqlFile) {
    console.error('Uso: node apply-sql.js <arquivo.sql> [arquivo.env]');
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlFile, 'utf8');
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('Aplicando', sqlFile, 'em', process.env.SUPABASE_URL, '...');
    await client.query(sql);
    console.log('SQL aplicado com sucesso!');
  } catch (err) {
    console.error('ERRO ao aplicar SQL:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
