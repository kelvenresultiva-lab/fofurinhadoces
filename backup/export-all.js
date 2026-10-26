require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const OUT = __dirname;
const DATA_DIR = path.join(OUT, 'data');
const SCHEMA_DIR = path.join(OUT, 'schema');
const STORAGE_DIR = path.join(OUT, 'storage');
for (const d of [DATA_DIR, SCHEMA_DIR, STORAGE_DIR]) fs.mkdirSync(d, { recursive: true });

async function dumpDatabase(client) {
  const tablesRes = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  const tables = tablesRes.rows.map(r => r.table_name);

  const schema = {};
  for (const table of tables) {
    const columns = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
       FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [table]
    );
    const pk = await client.query(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       WHERE tc.table_schema='public' AND tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY'`,
      [table]
    );
    const fks = await client.query(
      `SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
       WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' AND tc.table_name=$1`,
      [table]
    );
    schema[table] = { columns: columns.rows, primaryKey: pk.rows.map(r => r.column_name), foreignKeys: fks.rows };

    console.log(`Exportando dados de "${table}"...`);
    const dataRes = await client.query(`SELECT * FROM "${table}"`);
    fs.writeFileSync(path.join(DATA_DIR, `${table}.json`), JSON.stringify(dataRes.rows, null, 2), 'utf8');
    console.log(`  -> ${dataRes.rowCount} linhas salvas`);
  }

  const policies = await client.query('SELECT * FROM pg_policies WHERE schemaname = $1', ['public']);
  const functions = await client.query(
    `SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public'`
  );
  const triggers = await client.query(
    `SELECT trigger_name, event_manipulation, event_object_table, action_timing, action_statement
     FROM information_schema.triggers WHERE trigger_schema = 'public'`
  );

  fs.writeFileSync(path.join(SCHEMA_DIR, 'tables.json'), JSON.stringify(schema, null, 2), 'utf8');
  fs.writeFileSync(path.join(SCHEMA_DIR, 'policies.json'), JSON.stringify(policies.rows, null, 2), 'utf8');
  fs.writeFileSync(path.join(SCHEMA_DIR, 'functions.json'), JSON.stringify(functions.rows, null, 2), 'utf8');
  fs.writeFileSync(path.join(SCHEMA_DIR, 'triggers.json'), JSON.stringify(triggers.rows, null, 2), 'utf8');

  console.log(`\nSchema exportado: ${tables.length} tabelas, ${policies.rowCount} policies, ${functions.rowCount} functions, ${triggers.rowCount} triggers.`);
}

async function dumpStorage() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error('Erro ao listar buckets:', error.message);
    return;
  }
  if (!buckets.length) {
    console.log('Nenhum bucket de Storage encontrado.');
    return;
  }

  for (const bucket of buckets) {
    console.log(`\nBucket: ${bucket.name}`);
    await walkAndDownload(supabase, bucket.name, '', path.join(STORAGE_DIR, bucket.name));
  }
}

async function walkAndDownload(supabase, bucketName, prefix, localDir) {
  const { data: items, error } = await supabase.storage.from(bucketName).list(prefix, { limit: 1000 });
  if (error) {
    console.error(`  Erro ao listar "${prefix}":`, error.message);
    return;
  }
  fs.mkdirSync(localDir, { recursive: true });

  for (const item of items) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
    const isFolder = item.id === null;
    if (isFolder) {
      await walkAndDownload(supabase, bucketName, itemPath, path.join(localDir, item.name));
    } else {
      const { data: fileData, error: dlErr } = await supabase.storage.from(bucketName).download(itemPath);
      if (dlErr) {
        console.error(`  Erro ao baixar "${itemPath}":`, dlErr.message);
        continue;
      }
      const buf = Buffer.from(await fileData.arrayBuffer());
      fs.writeFileSync(path.join(localDir, item.name), buf);
      console.log(`  -> ${itemPath} (${buf.length} bytes)`);
    }
  }
}

(async () => {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('=== Exportando banco de dados ===');
    await dumpDatabase(client);
  } finally {
    await client.end();
  }

  console.log('\n=== Exportando Storage ===');
  await dumpStorage();

  console.log('\nBackup completo! Arquivos em:', OUT);
})().catch(err => {
  console.error('Falha no backup:', err);
  process.exit(1);
});
