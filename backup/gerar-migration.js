require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const q = (c, sql, p) => c.query(sql, p).then(r => r.rows);

(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const out = [];
  const add = s => out.push(s);

  add('-- Migration gerada a partir do projeto Supabase original (somente schema public + bucket de storage)\n');

  const exts = await q(c, `select extname from pg_extension where extname not in ('plpgsql','pg_stat_statements','pgcrypto','uuid-ossp','supabase_vault','pg_graphql') order by 1`);
  for (const e of exts) add(`create extension if not exists "${e.extname}" with schema extensions;`);
  add('');

  const funcs = await q(c, `
    select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname`);

  const tables = await q(c, `
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by c.relname`);

  add('set check_function_bodies = off;\n');
  add('-- ===== FUNCOES (antes das tabelas: usadas em defaults) =====');
  for (const f of funcs) add(f.def.trim() + ';\n');
  add('-- ===== TABELAS =====');
  for (const t of tables) {
    const cols = await q(c, `
      select a.attname, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull, a.attgenerated,
             pg_get_expr(d.adbin, d.adrelid) as expr
      from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped order by a.attnum`, [t.oid]);
    const lines = cols.map(col => {
      let l = `  "${col.attname}" ${col.type}`;
      if (col.attgenerated === 's') l += ` generated always as (${col.expr}) stored`;
      else if (col.expr) l += ` default ${col.expr}`;
      if (col.attnotnull) l += ' not null';
      return l;
    });
    const pk = await q(c, `select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1 and contype in ('p','u','c') order by contype desc, conname`, [t.oid]);
    for (const k of pk) lines.push(`  constraint "${k.conname}" ${k.def}`);
    add(`create table public."${t.relname}" (\n${lines.join(',\n')}\n);\n`);
  }

  const fkAll = [];
  for (const t of tables) {
    const fks = await q(c, `select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1 and contype = 'f' order by conname`, [t.oid]);
    fks.forEach(f => fkAll.push(`alter table public."${t.relname}" add constraint "${f.conname}" ${f.def};`));
  }
  add('-- ===== FOREIGN KEYS =====');
  fkAll.forEach(s => add(s));
  add('');

  add('-- ===== INDICES =====');
  const idx = await q(c, `
    select i.indexdef from pg_indexes i
    where i.schemaname = 'public'
      and not exists (select 1 from pg_constraint k where k.conname = i.indexname and k.connamespace = 'public'::regnamespace)
    order by i.indexname`);
  idx.forEach(i => add(i.indexdef + ';'));
  add('');

  add('-- ===== TRIGGERS (public) =====');
  const trg = await q(c, `
    select pg_get_triggerdef(t.oid) as def from pg_trigger t
    join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'public' order by c.relname, t.tgname`);
  trg.forEach(t => add(t.def + ';'));
  add('');

  add('-- ===== TRIGGERS EM auth.users (se houver) =====');
  const authTrg = await q(c, `
    select pg_get_triggerdef(t.oid) as def from pg_trigger t
    join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'auth' and c.relname = 'users'`);
  authTrg.forEach(t => add(t.def + ';'));
  add('');

  add('-- ===== RLS =====');
  for (const t of tables) if (t.relrowsecurity) add(`alter table public."${t.relname}" enable row level security;`);
  add('');
  const pols = await q(c, `select * from pg_policies where schemaname in ('public') order by tablename, policyname`);
  for (const p of pols) {
    const roles = String(p.roles).replace(/[{}]/g, '') || 'public';
    add(`create policy "${p.policyname}" on ${p.schemaname}."${p.tablename}" as ${p.permissive.toLowerCase()} for ${p.cmd.toLowerCase()} to ${roles}` +
      (p.qual ? ` using (${p.qual})` : '') + (p.with_check ? ` with check (${p.with_check})` : '') + ';');
  }
  add('');

  add('-- ===== STORAGE =====');
  const buckets = await q(c, `select id, name, public, file_size_limit, allowed_mime_types from storage.buckets`);
  for (const b of buckets) {
    add(`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (${lit(b.id)}, ${lit(b.name)}, ${b.public}, ${b.file_size_limit ?? 'null'}, ${b.allowed_mime_types ? `'{${b.allowed_mime_types.join(',')}}'` : 'null'}) on conflict (id) do nothing;`);
  }
  const spols = await q(c, `select * from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname`);
  for (const p of spols) {
    const roles = String(p.roles).replace(/[{}]/g, '') || 'public';
    add(`create policy "${p.policyname}" on storage.objects as ${p.permissive.toLowerCase()} for ${p.cmd.toLowerCase()} to ${roles}` +
      (p.qual ? ` using (${p.qual})` : '') + (p.with_check ? ` with check (${p.with_check})` : '') + ';');
  }

  function lit(v) { return v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`; }

  const file = path.join(__dirname, 'migration_completa.sql');
  fs.writeFileSync(file, out.join('\n') + '\n', 'utf8');
  console.log('Gerado:', file);
  console.log(`tabelas=${tables.length} funcoes=${funcs.length} indices=${idx.length} triggers=${trg.length} authTriggers=${authTrg.length} policies=${pols.length} storagePolicies=${spols.length} buckets=${buckets.length} extensoes=${exts.map(e => e.extname).join(',')}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
