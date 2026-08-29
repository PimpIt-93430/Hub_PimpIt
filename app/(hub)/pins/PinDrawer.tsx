'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { chargerProchainSku, creerPin, modifierPin, supprimerPin, type PinParams } from './actions';
import { BOITE_VALEURS, FOURNISSEUR_VALEURS, type HubPin } from './types';
import { uploaderPhotoPinNavigateur } from '@/lib/uploadPhotoPin';

const champLabel = 'mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400';
const champInput =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400';

/** Réplique le tiroir latéral "Nouveau pin / Modifier le pin" de l'ancien admin (new-pin-drawer
 * dans public/index.html) : mêmes champs, même ordre, SKU Pimpit auto-assigné et jamais
 * modifiable. L'ancien site n'exposait pas de suppression dans ce tiroir — un lien discret est
 * ajouté ici pour ne pas perdre la fonctionnalité, sans en faire un élément visuel dominant. */
export function PinDrawer({ pin, onClose }: { pin: HubPin | null; onClose: () => void }) {
  const enEdition = pin !== null;
  const [nom, setNom] = useState(pin?.name ?? '');
  const [sku, setSku] = useState<string>(pin?.sku_pimpit ?? '');
  const [stock, setStock] = useState(pin?.stock != null ? String(pin.stock) : '0');
  const [seuil, setSeuil] = useState(pin?.seuil_cible != null ? String(pin.seuil_cible) : '');
  const [skuFourn, setSkuFourn] = useState(pin?.sku_fournisseur ?? '');
  const [fournisseur, setFournisseur] = useState(pin?.fournisseur ?? '');
  const [boites, setBoites] = useState<Set<string>>(
    new Set((pin?.boite ?? '').split(',').map((b) => b.trim()).filter(Boolean)),
  );
  const [poidsUnit, setPoidsUnit] = useState(pin?.poids_unitaire != null ? String(pin.poids_unitaire) : '');
  const [poidsTotal, setPoidsTotal] = useState(pin?.poids_total != null ? String(pin.poids_total) : '');
  const [imageUrl, setImageUrl] = useState(pin?.image_url ?? '');
  const [description, setDescription] = useState(pin?.description ?? '');
  const [custom, setCustom] = useState(pin?.custom ?? false);
  const [pasSite, setPasSite] = useState(pin?.pas_dans_unite ?? false);

  const [photoEnCours, setPhotoEnCours] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enEdition) {
      chargerProchainSku()
        .then((n) => setSku(String(n)))
        .catch(() => setSku(''));
    }
  }, [enEdition]);

  // Coller une image (Ctrl+V) — actif seulement pendant que le tiroir est ouvert, même principe
  // que l'ancien admin.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) traiterFichier(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function traiterFichier(file: File) {
    setPhotoEnCours(true);
    setErreur(null);
    try {
      const url = await uploaderPhotoPinNavigateur(file);
      setImageUrl(url);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'envoi de la photo");
    } finally {
      setPhotoEnCours(false);
    }
  }

  function toggleBoite(val: string) {
    setBoites((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(val)) suivant.delete(val);
      else suivant.add(val);
      return suivant;
    });
  }

  function valider() {
    if (!nom.trim()) {
      setErreur('Le nom est requis');
      return;
    }
    const params: PinParams = {
      name: nom.trim(),
      skuFournisseur: skuFourn.trim() || null,
      fournisseur: fournisseur || null,
      boite: boites.size > 0 ? [...boites].join(',') : null,
      stock: stock.trim() !== '' ? Number(stock) : null,
      seuilCible: seuil.trim() !== '' ? Number(seuil) : null,
      poidsUnitaire: poidsUnit.trim() !== '' ? Number(poidsUnit) : null,
      poidsTotal: poidsTotal.trim() !== '' ? Number(poidsTotal) : null,
      description: description.trim() || null,
      imageUrl: imageUrl.trim() || null,
      custom,
      pasDansUnite: pasSite,
    };
    setErreur(null);
    demarrer(async () => {
      try {
        if (enEdition) await modifierPin(pin.airtable_id, params);
        else await creerPin(params);
        onClose();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  function supprimer() {
    if (!pin || !confirm(`Supprimer le pin « ${pin.name ?? pin.airtable_id} » ?`)) return;
    setErreur(null);
    demarrer(async () => {
      try {
        await supprimerPin(pin.airtable_id);
        onClose();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <p className="text-lg font-bold text-slate-900">{enEdition ? (pin.name || 'Modifier le pin') : 'Nouveau pin'}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          <div>
            <p className={champLabel}>Photo</p>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file?.type.startsWith('image/')) traiterFichier(file);
              }}
              className={`relative flex min-h-[120px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition ${
                dragOver ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:border-slate-400'
              }`}
            >
              {photoEnCours ? (
                <p className="text-sm text-slate-400">Envoi…</p>
              ) : imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="max-h-[180px] max-w-full rounded-lg object-contain" />
              ) : (
                <p className="text-sm leading-relaxed text-slate-400">
                  Cliquer, glisser-déposer
                  <br />
                  ou coller une image (Ctrl+V)
                </p>
              )}
              {imageUrl && !photoEnCours && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageUrl('');
                  }}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-sm text-white"
                >
                  ×
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) traiterFichier(file);
                e.target.value = '';
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={champLabel}>
                Nom <span className="text-red-500">*</span>
              </p>
              <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex: Diamant Argent" className={champInput} />
            </div>
            <div>
              <p className={champLabel}>SKU Pimpit</p>
              <input value={sku} readOnly placeholder="Auto" className={`${champInput} bg-slate-50 text-slate-400`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={champLabel}>Stock</p>
              <input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} className={champInput} />
            </div>
            <div>
              <p className={champLabel}>Seuil cible</p>
              <input type="number" min={0} value={seuil} onChange={(e) => setSeuil(e.target.value)} className={champInput} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={champLabel}>SKU Fournisseur</p>
              <input value={skuFourn} onChange={(e) => setSkuFourn(e.target.value)} placeholder="Ex: ABC-123" className={champInput} />
            </div>
            <div>
              <p className={champLabel}>Fournisseur</p>
              <select value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} className={champInput}>
                <option value="">— Aucun —</option>
                {FOURNISSEUR_VALEURS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <p className={champLabel}>Boîte</p>
            <div className="flex flex-wrap gap-1.5">
              {BOITE_VALEURS.map((val) => {
                const sel = boites.has(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => toggleBoite(val)}
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      sel ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={champLabel}>Poids unitaire ×10</p>
              <input type="number" min={0} value={poidsUnit} onChange={(e) => setPoidsUnit(e.target.value)} className={champInput} />
            </div>
            <div>
              <p className={champLabel}>Poids total</p>
              <input type="number" min={0} value={poidsTotal} onChange={(e) => setPoidsTotal(e.target.value)} className={champInput} />
            </div>
          </div>

          <div>
            <p className={champLabel}>Image (URL)</p>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className={champInput}
            />
          </div>

          <div>
            <p className={champLabel}>Description</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${champInput} resize-y`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Custom ?
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={pasSite}
                onChange={(e) => setPasSite(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Pas dans pin&apos;s unité (à rajouter sur le site)
            </label>
          </div>

          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        </div>

        <div className="flex items-center gap-2.5 border-t border-slate-100 px-6 py-4">
          {enEdition && (
            <button onClick={supprimer} disabled={enCours} className="mr-auto text-xs font-semibold text-red-500 hover:text-red-700">
              Supprimer
            </button>
          )}
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">
            Annuler
          </button>
          <button
            onClick={valider}
            disabled={enCours}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {enCours ? (enEdition ? 'Enregistrement...' : 'Création...') : enEdition ? 'Enregistrer' : 'Créer le pin'}
          </button>
        </div>
      </div>
    </>
  );
}
