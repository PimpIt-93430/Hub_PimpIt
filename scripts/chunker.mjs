// Découpe un fichier sync-sql/hub_X.sql (une ligne = une ligne de VALUES, format garanti par
// generer-sql-sync.mjs) en plusieurs fichiers de N lignes de données chacun, chacun un bloc SQL
// autonome (begin/insert/on conflict/commit), pour rester sous la limite de lecture par appel.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , nomTable, lignesParChunk] = process.argv;
const n = Number(lignesParChunk) || 100;

const sql = readFileSync(new URL(`../sync-sql/${nomTable}.sql`, import.meta.url), 'utf8');
const lignes = sql.split('\n');

const headerLigne = lignes.findIndex((l) => l.startsWith('insert into'));
const onConflictLigne = lignes.findIndex((l) => l.trim().startsWith('on conflict'));

const header = lignes[headerLigne];
const onConflict = lignes[onConflictLigne];
const dataLignes = lignes.slice(headerLigne + 1, onConflictLigne).filter((l) => l.trim().length > 0);

let chunkIndex = 0;
for (let i = 0; i < dataLignes.length; i += n) {
  const chunk = dataLignes.slice(i, i + n);
  const dernier = chunk[chunk.length - 1].replace(/,\s*$/, '');
  const corps = [...chunk.slice(0, -1), dernier].join('\n');
  const contenu = `begin;\n${header}\n${corps}\n${onConflict}\ncommit;\n`;
  chunkIndex++;
  writeFileSync(new URL(`../sync-sql/${nomTable}.chunk${String(chunkIndex).padStart(2, '0')}.sql`, import.meta.url), contenu);
}
console.log(`${nomTable} → ${chunkIndex} chunks (${dataLignes.length} lignes)`);
