import QRCode from 'qrcode';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { exigerAdmin } from '@/lib/roles';
import { BoutonImprimer, BoutonRegenerer, CaseActiverPointage } from './BoutonsPointage';

// Même préfixe que l'écran de scan de l'app (app/(app)/pointage.tsx).
const PREFIXE_QR = 'pimpit-pointage:';

/** QR codes de pointage à imprimer et coller dans chaque pop-up (cf. migration 0130 de l'app) :
 * l'employé scanne à l'arrivée et au départ, le serveur vérifie le code ET sa position GPS.
 * Réservé à l'admin — le code secret d'un QR ne doit pas circuler. "Nouveau QR code" rend
 * l'ancien inutilisable (QR perdu, volé, photo qui circule). */
export default async function PointagePage() {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const [{ data: popUps, error: erreurPopUps }, { data: codes, error: erreurCodes }] = await Promise.all([
    supabase.from('pop_ups').select('id, nom, couleur, lat, lon, pointage_actif').eq('actif', true).order('nom'),
    supabase.from('pop_up_pointage').select('pop_up_id, code, rayon_m'),
  ]);
  if (erreurPopUps) throw new Error(erreurPopUps.message);
  if (erreurCodes) throw new Error(erreurCodes.message);

  const cartes = await Promise.all(
    (popUps ?? []).map(async (p) => {
      const ligne = (codes ?? []).find((c) => c.pop_up_id === p.id);
      const svg = ligne
        ? await QRCode.toString(PREFIXE_QR + ligne.code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
        : null;
      return { ...p, svg, rayon: ligne?.rayon_m ?? null };
    }),
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pointage</h1>
          <p className="mt-1 text-sm text-slate-500">
            Imprime le QR code de chaque pop-up et colle-le sur place. L&apos;équipe scanne avec l&apos;appli (Planning →
            Pointer) en arrivant et en partant ; la position GPS est vérifiée en même temps.
          </p>
        </div>
        <BoutonImprimer />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-1 print:gap-0">
        {cartes.map((c) => (
          <div
            key={c.id}
            // Seuls les pop-ups où le pointage est activé partent à l'impression.
            className={`flex flex-col items-center rounded-2xl border bg-white p-6 print:h-screen print:justify-center print:break-after-page print:border-0 ${
              c.pointage_actif ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-60 print:hidden'
            }`}
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Pointage</p>
            <p className="mb-4 text-2xl font-bold" style={{ color: c.couleur }}>
              {c.nom}
            </p>
            {c.svg ? (
              <div className="w-64 print:w-[12cm]" dangerouslySetInnerHTML={{ __html: c.svg }} />
            ) : (
              <p className="text-sm text-red-600">Pas de code — contacte le support.</p>
            )}
            <p className="mt-4 text-center text-sm text-slate-600">
              Scanne avec l&apos;appli Pimp It à ton arrivée et à ton départ
            </p>
            <div className="mt-4 w-full border-t border-slate-100 pt-3 text-xs text-slate-500 print:hidden">
              <div className="mb-2">
                <CaseActiverPointage popUpId={c.id} actif={c.pointage_actif} />
              </div>
              <p>
                Position :{' '}
                {c.lat != null && c.lon != null ? (
                  <span className="font-semibold text-emerald-600">enregistrée</span>
                ) : (
                  <span className="font-semibold text-amber-600">
                    à enregistrer sur place (appli → Planning → Pointages)
                  </span>
                )}
                {c.rayon != null && <> · rayon accepté {c.rayon} m</>}
              </p>
              <div className="mt-2">
                <BoutonRegenerer popUpId={c.id} nom={c.nom} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
