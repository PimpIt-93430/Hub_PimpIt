import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface PopUp {
  id: string;
  nom: string;
  couleur: string | null;
}

interface ChaussureInventaireRow {
  pop_up_id: string;
  couleur: string;
  taille: string;
  quantite_comptee: number | string;
  created_at: string;
}
interface ChaussureStockRow {
  couleur: string;
  taille: string;
  stock_initial: number | string;
}

interface CoqueInventaireRow {
  pop_up_id: string;
  modele: string;
  variante: string;
  couleur: string;
  quantite_comptee: number | string;
  created_at: string;
}
interface CoqueStockRow {
  modele: string;
  variante: string;
  couleur: string;
  stock_initial: number | string;
}

interface SacInventaireRow {
  pop_up_id: string;
  produit: string;
  couleur: string;
  quantite_comptee: number | string;
  created_at: string;
}
interface SacStockRow {
  produit: string;
  couleur: string;
  stock_initial: number | string;
}

interface LigneVariante {
  popUpId: string;
  variante: string;
  label: string;
  quantite: number;
}

interface LigneAffichage extends LigneVariante {
  cible: number | null;
}

/** `numeric` côté Postgres peut revenir sous forme de string selon le client — on normalise ici
 * plutôt que de faire confiance au typage brut de Supabase. */
function versNombre(valeur: number | string): number {
  return typeof valeur === 'string' ? Number(valeur) : valeur;
}

/** Réduit une liste de lignes triées `created_at` desc au dernier comptage par pop-up + variante
 * (une même combinaison peut apparaître plusieurs fois dans l'historique, on ne garde que la plus
 * récente, cf. simplification voulue pour cette première itération). */
function dernierParVariante<T extends { pop_up_id: string; quantite_comptee: number | string }>(
  rows: T[],
  cleEtLabel: (r: T) => { variante: string; label: string },
): LigneVariante[] {
  const vus = new Set<string>();
  const lignes: LigneVariante[] = [];
  for (const r of rows) {
    const { variante, label } = cleEtLabel(r);
    const cleComplete = `${r.pop_up_id}|${variante}`;
    if (vus.has(cleComplete)) continue;
    vus.add(cleComplete);
    lignes.push({ popUpId: r.pop_up_id, variante, label, quantite: versNombre(r.quantite_comptee) });
  }
  return lignes;
}

function SectionCategorie({
  titre,
  lignes,
  popUps,
}: {
  titre: string;
  lignes: LigneAffichage[];
  popUps: PopUp[];
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-slate-900">{titre}</h2>

      {lignes.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400 shadow-sm">
          Aucun inventaire encore fait.
        </p>
      ) : (
        <div className="space-y-6">
          {popUps
            .filter((popUp) => lignes.some((l) => l.popUpId === popUp.id))
            .map((popUp) => {
              const lignesPopUp = lignes
                .filter((l) => l.popUpId === popUp.id)
                .sort((a, b) => a.label.localeCompare(b.label));

              return (
                <div key={popUp.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: popUp.couleur ?? '#94a3b8' }}
                    />
                    <span className="text-sm font-semibold text-slate-700">{popUp.nom}</span>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Variante</th>
                          <th className="px-4 py-3 text-right">Dernier compte</th>
                          <th className="px-4 py-3 text-right">Cible</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignesPopUp.map((l) => (
                          <tr key={`${l.popUpId}-${l.variante}`} className="border-b border-slate-50 last:border-0">
                            <td className="px-4 py-2.5 font-semibold text-slate-800">{l.label}</td>
                            <td className="px-4 py-2.5 text-right text-slate-700">{l.quantite}</td>
                            <td className="px-4 py-2.5 text-right text-slate-500">{l.cible ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}

/** Lecture seule — dernier inventaire compté par pop-up et par catégorie (chaussures/coques/sacs).
 * Ne reproduit pas le calcul « stock estimé = dernier compte moins ventes depuis » que fait l'app :
 * simplification volontaire pour cette première itération, cf. plan. */
export default async function StockPage() {
  const supabase = await creerClientSupabaseServeur();

  const [
    { data: popUpsData },
    { data: chaussuresInventairesData },
    { data: chaussuresStockData },
    { data: coquesInventairesData },
    { data: coquesStockData },
    { data: sacsInventairesData },
    { data: sacsStockData },
  ] = await Promise.all([
    supabase.from('pop_ups').select('id, nom, couleur').order('nom', { ascending: true }),
    supabase
      .from('chaussures_inventaires')
      .select('pop_up_id, couleur, taille, quantite_comptee, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('chaussures_stock').select('couleur, taille, stock_initial'),
    supabase
      .from('coques_inventaires')
      .select('pop_up_id, modele, variante, couleur, quantite_comptee, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('coques_stock').select('modele, variante, couleur, stock_initial'),
    supabase
      .from('sacs_inventaires')
      .select('pop_up_id, produit, couleur, quantite_comptee, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('sacs_stock').select('produit, couleur, stock_initial'),
  ]);

  const popUps = (popUpsData ?? []) as PopUp[];

  const cibleChaussures = new Map<string, number>();
  for (const s of (chaussuresStockData ?? []) as ChaussureStockRow[]) {
    cibleChaussures.set(`${s.couleur}|${s.taille}`, versNombre(s.stock_initial));
  }
  const lignesChaussures: LigneAffichage[] = dernierParVariante(
    (chaussuresInventairesData ?? []) as ChaussureInventaireRow[],
    (r) => ({ variante: `${r.couleur}|${r.taille}`, label: `${r.couleur} · ${r.taille}` }),
  ).map((l) => ({ ...l, cible: cibleChaussures.get(l.variante) ?? null }));

  const cibleCoques = new Map<string, number>();
  for (const s of (coquesStockData ?? []) as CoqueStockRow[]) {
    cibleCoques.set(`${s.modele}|${s.variante}|${s.couleur}`, versNombre(s.stock_initial));
  }
  const lignesCoques: LigneAffichage[] = dernierParVariante(
    (coquesInventairesData ?? []) as CoqueInventaireRow[],
    (r) => ({
      variante: `${r.modele}|${r.variante}|${r.couleur}`,
      label: `${r.modele} · ${r.variante} · ${r.couleur}`,
    }),
  ).map((l) => ({ ...l, cible: cibleCoques.get(l.variante) ?? null }));

  const cibleSacs = new Map<string, number>();
  for (const s of (sacsStockData ?? []) as SacStockRow[]) {
    cibleSacs.set(`${s.produit}|${s.couleur}`, versNombre(s.stock_initial));
  }
  const lignesSacs: LigneAffichage[] = dernierParVariante(
    (sacsInventairesData ?? []) as SacInventaireRow[],
    (r) => ({ variante: `${r.produit}|${r.couleur}`, label: `${r.produit} · ${r.couleur}` }),
  ).map((l) => ({ ...l, cible: cibleSacs.get(l.variante) ?? null }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Stock pop-up</h1>
      <p className="mb-6 text-sm text-slate-400">
        Dernier inventaire compté par lieu — depuis Supabase, même compte que l&apos;app Pimp It.
      </p>

      <SectionCategorie titre="Chaussures" lignes={lignesChaussures} popUps={popUps} />
      <SectionCategorie titre="Coques" lignes={lignesCoques} popUps={popUps} />
      <SectionCategorie titre="Sacs" lignes={lignesSacs} popUps={popUps} />
    </div>
  );
}
