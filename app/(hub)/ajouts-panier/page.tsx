import { redirect } from 'next/navigation';

/** Remplacée par Statistiques site (section "Pages où l'on ajoute au panier"), alimentée par le
 * pixel d'analyse complet — on garde l'adresse pour ne pas casser un ancien lien. */
export default function AjoutsPanierPage() {
  redirect('/statistiques-site');
}
