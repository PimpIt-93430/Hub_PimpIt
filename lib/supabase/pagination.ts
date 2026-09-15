/** PostgREST plafonne silencieusement `.select()` à sa limite de lignes par défaut (1000, aucune
 * erreur renvoyée) — cf. incident du 2026-09-15 : le cache Commandes Shopify passé 1000 lignes
 * (lib/commandes-shopify-cache.ts) et le "CA du mois"/Finance de ce Hub, qui lisent ventes_sumup /
 * ventes_sumup_lignes sans borne, tronquaient en silence les ventes les plus ANCIENNES de la
 * période demandée (triées par horodatage décroissant) une fois le volume dépassé — chiffre
 * d'affaires affiché trop bas, sans le moindre message d'erreur. À utiliser pour toute requête sur
 * une table qui peut dépasser 1000 lignes sur la période demandée (ventes, historiques) — boucle
 * par blocs de 1000 jusqu'à une page incomplète (fin des données). */
export async function paginerToutesLesLignes<T>(
  requete: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const TAILLE_PAGE = 1000;
  const lignes: T[] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await requete(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message);
    lignes.push(...(data ?? []));
    if (!data || data.length < TAILLE_PAGE) break;
  }
  return lignes;
}
