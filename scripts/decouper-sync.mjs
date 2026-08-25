// Découpe sync.sql (généré par generer-sql-sync.mjs) en un fichier par table hub_*, pour pouvoir
// les appliquer un par un via l'outil execute_sql plutôt qu'en un seul très gros appel.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const sql = readFileSync(new URL('../sync.sql', import.meta.url), 'utf8');
mkdirSync(new URL('../sync-sql/', import.meta.url), { recursive: true });

const blocks = sql.split(/(?=insert into public\.)/g).filter((b) => b.startsWith('insert into'));

for (const block of blocks) {
  const nomTable = block.match(/insert into public\.(\w+)/)[1];
  const propre = block.replace(/\ncommit;\s*$/, '').trim();
  writeFileSync(new URL(`../sync-sql/${nomTable}.sql`, import.meta.url), `begin;\n${propre}\ncommit;\n`);
  console.log(nomTable, `${(block.length / 1024).toFixed(0)} Ko`);
}
