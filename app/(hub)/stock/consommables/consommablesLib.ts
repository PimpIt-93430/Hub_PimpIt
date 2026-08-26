/** Types et constantes partagés par actions.ts (serveur) et ConsommablesScreen.tsx (client) — pas
 * de 'use server' ici : un fichier "use server" ne peut exporter que des fonctions async (règle
 * Next.js), donc les types/constantes vivent à part. */

export type TypeConsommable = 'pochon' | 'sac_chaussures' | 'scotch_double_face' | 'enveloppes' | 'sac_poubelle' | 'autre';

export const TYPES_CONSOMMABLES: { valeur: TypeConsommable; label: string }[] = [
  { valeur: 'pochon', label: 'Pochon' },
  { valeur: 'sac_chaussures', label: 'Sac pour chaussures' },
  { valeur: 'scotch_double_face', label: 'Scotch double face' },
  { valeur: 'enveloppes', label: 'Enveloppes' },
  { valeur: 'sac_poubelle', label: 'Sac poubelle' },
  { valeur: 'autre', label: 'Autre' },
];

export interface CommandeConsommables {
  id: string;
  pop_up_id: string;
  statut: 'demandee' | 'envoyee' | 'recue';
  demandee_par: string | null;
  demandee_at: string;
  envoyee_par: string | null;
  envoyee_at: string | null;
  recue_par: string | null;
  recue_at: string | null;
}

export interface CommandeConsommableLigne {
  id: string;
  commande_id: string;
  type: TypeConsommable;
  description: string | null;
}

export interface CommandeConsommablesAvecLignes {
  commande: CommandeConsommables;
  lignes: CommandeConsommableLigne[];
}
