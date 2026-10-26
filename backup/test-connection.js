require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    console.log('Conectado! Tabelas encontradas:');
    res.rows.forEach(r => console.log(' -', r.table_name));
  } catch (err) {
    console.error('ERRO:', err.message);
  } finally {
    await client.end();
  }
})();
