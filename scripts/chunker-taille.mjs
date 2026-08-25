// Comme chunker.mjs mais empaquette par taille cible en octets plutôt que par nombre de lignes
// fixe, pour minimiser le nombre de chunks quand les lignes ont des tailles très inégales
// (ex. commandes fournisseurs : certaines ont 2 articles, d'autres 200).
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';

const [, , nomTable, tailleCibleKo] = process.argv;
const cible = (Number(tailleCibleKo) || 15) * 1024;

const dir = new URL('../sync-sql/', import.meta.url);
for (const f of readdirSync(dir)) {
  if (f.startsWith(`${nomTable}.chunk`)) unlinkSync(new URL(f, dir));
}

const sql = readFileSync(new URL(`../sync-sql/${nomTable}.sql`, import.meta.url), 'utf8');
const lignes = sql.split('\n');
const headerLigne = lignes.findIndex((l) => l.startsWith('insert into'));
const onConflictLigne = lignes.findIndex((l) => l.trim().startsWith('on conflict'));
const header = lignes[headerLigne];
const onConflict = lignes[onConflictLigne];
const dataLignes = lignes.slice(headerLigne + 1, onConflictLigne).filter((l) => l.trim().length > 0);

let chunkIndex = 0;
let buffer = [];
let taille = 0;

function flush() {
  if (buffer.length === 0) return;
  const dernier = buffer[buffer.length - 1].replace(/,\s*$/, '');
  const corps = [...buffer.slice(0, -1), dernier].join('\n');
  const contenu = `begin;\n${header}\n${corps}\n${onConflict}\ncommit;\n`;
  chunkIndex++;
  writeFileSync(new URL(`../sync-sql/${nomTable}.chunk${String(chunkIndex).padStart(2, '0')}.sql`, dir), contenu);
  buffer = [];
  taille = 0;
}

for (const ligne of dataLignes) {
  if (taille + ligne.length > cible && buffer.length > 0) flush();
  buffer.push(ligne);
  taille += ligne.length;
}
flush();

console.log(`${nomTable} → ${chunkIndex} chunks (${dataLignes.length} lignes, cible ${tailleCibleKo}Ko)`);
