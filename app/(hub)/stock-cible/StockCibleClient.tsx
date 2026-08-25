'use client';

import { useState, useTransition } from 'react';

import {
  definirMappingChaussures,
  definirMappingCoques,
  definirMappingSacs,
  definirStockChaussures,
  definirStockCoques,
  definirStockSacs,
  supprimerMappingChaussures,
  supprimerMappingCoques,
  supprimerMappingSacs,
} from './actions';

const COULEURS_CHAUSSURES = ['Noir', 'Kaki', 'Rose', 'Gris'];
const TAILLES_CHAUSSURES = ['36-37', '38-39', '40-41', '41-42', '43-44', '45-46'];
const MODELES_COQUES = ['Iphone 13', 'Iphone 14', 'Iphone 15', 'Iphone 16', 'Iphone 17'];
const VARIANTES_COQUES = ['Normal', 'Pro', 'Pro Max', 'Plus'];
const COULEURS_COQUES_SACS = ['Rose', 'Noir'];
const PRODUITS_SACS = ['Grandes Pochettes', 'Petites Pochettes', "Sac Pimp-it + 6 pin's"];

interface ChaussureStock {
  id: string;
  couleur: string;
  taille: string;
  stock_initial: number;
}
interface CoqueStock {
  id: string;
  modele: string;
  variante: string;
  couleur: string;
  stock_initial: number;
}
interface SacStock {
  id: string;
  produit: string;
  couleur: string;
  stock_initial: number;
}
interface MappingChaussure {
  id: string;
  nom_produit: string;
  couleur: string;
  taille: string;
}
interface MappingCoque {
  id: string;
  nom_produit: string;
  modele: string;
  variante: string;
  couleur: string;
}
interface MappingSac {
  id: string;
  nom_produit: string;
  produit: string;
  couleur: string;
}

/** Cellule éditable qui s'enregistre en quittant le focus — même principe que
 * CelluleStockInitial côté app (src/components/stock/StockCibleEcran.tsx). */
function CelluleStock({ sousLabel, quantite, onDefinir }: { sousLabel: string; quantite: number; onDefinir: (q: number) => void }) {
  const [valeur, setValeur] = useState(quantite > 0 ? String(quantite) : '');
  const [, demarrer] = useTransition();

  return (
    <div className="flex flex-col items-center">
      <span className="mb-1 text-[11px] font-semibold text-slate-400">{sousLabel}</span>
      <input
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        onBlur={() => {
          const n = valeur.trim() === '' ? 0 : Number(valeur);
          if (!Number.isFinite(n) || n < 0) return;
          if (n !== quantite) demarrer(() => onDefinir(n));
        }}
        inputMode="numeric"
        placeholder="0"
        className={`h-11 w-14 rounded-lg border text-center text-sm font-semibold focus:outline-none ${
          quantite > 0 ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700'
        }`}
      />
    </div>
  );
}

function LigneAMapper({
  nomProduit,
  champs,
  onAssocier,
}: {
  nomProduit: string;
  champs: { cle: string; label: string; options: string[] }[];
  onAssocier: (valeurs: Record<string, string>) => void;
}) {
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const complet = champs.every((c) => !!valeurs[c.cle]);

  return (
    <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="mb-2 text-sm font-semibold text-slate-800">{nomProduit}</p>
      <div className="flex gap-2">
        {champs.map((c) => (
          <select
            key={c.cle}
            value={valeurs[c.cle] ?? ''}
            onChange={(e) => setValeurs((v) => ({ ...v, [c.cle]: e.target.value }))}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">{c.label}</option>
            {c.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ))}
      </div>
      <button
        onClick={() => complet && onAssocier(valeurs)}
        disabled={!complet}
        className={`mt-2 w-full rounded-lg py-2 text-sm font-semibold ${complet ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-500'}`}
      >
        Associer
      </button>
    </div>
  );
}

function LigneMappee({ texte, sousTexte, onRetirer }: { texte: string; sousTexte: string; onRetirer: () => void }) {
  const [, demarrer] = useTransition();
  return (
    <div className="mb-1.5 flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-slate-800">{texte}</p>
        <p className="text-xs text-slate-400">{sousTexte}</p>
      </div>
      <button
        onClick={() => {
          if (confirm(`"${texte}" ne sera plus rapproché du stock.`)) demarrer(onRetirer);
        }}
        className="text-sm font-semibold text-red-500 hover:text-red-700"
      >
        Retirer
      </button>
    </div>
  );
}

export function StockCibleClient({
  chaussures,
  coques,
  sacs,
  mappingChaussures,
  mappingCoques,
  mappingSacs,
  nomsNonMappesChaussures,
  nomsNonMappesCoques,
  nomsNonMappesSacs,
}: {
  chaussures: ChaussureStock[];
  coques: CoqueStock[];
  sacs: SacStock[];
  mappingChaussures: MappingChaussure[];
  mappingCoques: MappingCoque[];
  mappingSacs: MappingSac[];
  nomsNonMappesChaussures: string[];
  nomsNonMappesCoques: string[];
  nomsNonMappesSacs: string[];
}) {
  const [categorie, setCategorie] = useState<'chaussures' | 'coques' | 'sacs'>('chaussures');
  const [onglet, setOnglet] = useState<'stock' | 'mapping'>('stock');

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(['chaussures', 'coques', 'sacs'] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategorie(c)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${categorie === c ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {c === 'chaussures' ? 'Chaussures' : c === 'coques' ? 'Coques' : 'Sacs & pochettes'}
          </button>
        ))}
      </div>
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setOnglet('stock')}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${onglet === 'stock' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Stock cible
        </button>
        <button
          onClick={() => setOnglet('mapping')}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${onglet === 'mapping' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Correspondance SumUp
        </button>
      </div>

      {onglet === 'stock' && categorie === 'chaussures' && (
        <div>
          <p className="mb-3 text-xs text-slate-400">
            Le stock visé par couleur et par taille, commun à tous les pop-ups — sert de référence pour
            calculer ce qu&apos;il faut ramener après un inventaire.
          </p>
          {COULEURS_CHAUSSURES.map((couleur) => (
            <div key={couleur} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-base font-bold text-slate-900">{couleur}</p>
              <div className="flex flex-wrap gap-3">
                {chaussures
                  .filter((c) => c.couleur === couleur)
                  .map((item) => (
                    <CelluleStock
                      key={item.id}
                      sousLabel={item.taille}
                      quantite={item.stock_initial}
                      onDefinir={(q) => definirStockChaussures(item.id, q)}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {onglet === 'stock' && categorie === 'coques' && (
        <div>
          <p className="mb-3 text-xs text-slate-400">
            Le stock visé par modèle/variante/couleur, commun à tous les pop-ups.
          </p>
          {MODELES_COQUES.map((modele) => (
            <div key={modele} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-base font-bold text-slate-900">{modele}</p>
              {VARIANTES_COQUES.map((variante) => (
                <div key={variante} className="mb-3">
                  <p className="mb-1.5 text-xs font-semibold text-slate-500">{variante}</p>
                  <div className="flex flex-wrap gap-3">
                    {coques
                      .filter((c) => c.modele === modele && c.variante === variante)
                      .map((item) => (
                        <CelluleStock
                          key={item.id}
                          sousLabel={item.couleur}
                          quantite={item.stock_initial}
                          onDefinir={(q) => definirStockCoques(item.id, q)}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {onglet === 'stock' && categorie === 'sacs' && (
        <div>
          <p className="mb-3 text-xs text-slate-400">Le stock visé par produit et par couleur, commun à tous les pop-ups.</p>
          {PRODUITS_SACS.map((produit) => (
            <div key={produit} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-base font-bold text-slate-900">{produit}</p>
              <div className="flex flex-wrap gap-3">
                {sacs
                  .filter((s) => s.produit === produit)
                  .map((item) => (
                    <CelluleStock
                      key={item.id}
                      sousLabel={item.couleur}
                      quantite={item.stock_initial}
                      onDefinir={(q) => definirStockSacs(item.id, q)}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {onglet === 'mapping' && categorie === 'chaussures' && (
        <div>
          {nomsNonMappesChaussures.length > 0 && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase text-amber-600">À associer</p>
              {nomsNonMappesChaussures.map((nom) => (
                <LigneAMapper
                  key={nom}
                  nomProduit={nom}
                  champs={[
                    { cle: 'couleur', label: 'Couleur', options: COULEURS_CHAUSSURES },
                    { cle: 'taille', label: 'Taille', options: TAILLES_CHAUSSURES },
                  ]}
                  onAssocier={(v) => definirMappingChaussures(nom, v.couleur, v.taille)}
                />
              ))}
            </>
          )}
          <p className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-400">Déjà associés</p>
          {mappingChaussures.length === 0 && <p className="text-sm text-slate-400">Aucune correspondance pour l&apos;instant.</p>}
          {mappingChaussures.map((m) => (
            <LigneMappee
              key={m.id}
              texte={m.nom_produit}
              sousTexte={`${m.couleur} — ${m.taille}`}
              onRetirer={() => supprimerMappingChaussures(m.id)}
            />
          ))}
        </div>
      )}

      {onglet === 'mapping' && categorie === 'coques' && (
        <div>
          {nomsNonMappesCoques.length > 0 && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase text-amber-600">À associer</p>
              {nomsNonMappesCoques.map((nom) => (
                <LigneAMapper
                  key={nom}
                  nomProduit={nom}
                  champs={[
                    { cle: 'modele', label: 'Modèle', options: MODELES_COQUES },
                    { cle: 'variante', label: 'Variante', options: VARIANTES_COQUES },
                    { cle: 'couleur', label: 'Couleur', options: COULEURS_COQUES_SACS },
                  ]}
                  onAssocier={(v) => definirMappingCoques(nom, v.modele, v.variante, v.couleur)}
                />
              ))}
            </>
          )}
          <p className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-400">Déjà associés</p>
          {mappingCoques.length === 0 && <p className="text-sm text-slate-400">Aucune correspondance pour l&apos;instant.</p>}
          {mappingCoques.map((m) => (
            <LigneMappee
              key={m.id}
              texte={m.nom_produit}
              sousTexte={`${m.modele} — ${m.variante} — ${m.couleur}`}
              onRetirer={() => supprimerMappingCoques(m.id)}
            />
          ))}
        </div>
      )}

      {onglet === 'mapping' && categorie === 'sacs' && (
        <div>
          {nomsNonMappesSacs.length > 0 && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase text-amber-600">À associer</p>
              {nomsNonMappesSacs.map((nom) => (
                <LigneAMapper
                  key={nom}
                  nomProduit={nom}
                  champs={[
                    { cle: 'produit', label: 'Produit', options: PRODUITS_SACS },
                    { cle: 'couleur', label: 'Couleur', options: COULEURS_COQUES_SACS },
                  ]}
                  onAssocier={(v) => definirMappingSacs(nom, v.produit, v.couleur)}
                />
              ))}
            </>
          )}
          <p className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-400">Déjà associés</p>
          {mappingSacs.length === 0 && <p className="text-sm text-slate-400">Aucune correspondance pour l&apos;instant.</p>}
          {mappingSacs.map((m) => (
            <LigneMappee
              key={m.id}
              texte={m.nom_produit}
              sousTexte={`${m.produit} — ${m.couleur}`}
              onRetirer={() => supprimerMappingSacs(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
