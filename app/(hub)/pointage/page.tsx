import Link from 'next/link';
import QRCode from 'qrcode';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { exigerAdmin } from '@/lib/roles';
import { BoutonImprimer, BoutonRegenerer } from './BoutonsPointage';

// Même préfixe que l'écran de scan de l'app (app/(app)/pointage.tsx).
const PREFIXE_QR = 'pimpit-pointage:';

/** QR codes de pointage à imprimer et coller dans chaque pop-up (cf. migrations 0130-0133 de
 * l'app) : l'employé scanne à l'arrivée et au départ, puis prend la caisse en photo. Seuls les
 * pop-ups avec la case "Pointage" cochée (page Pop up) apparaissent ici. Réservé à l'admin — le
 * code secret d'un QR ne doit pas circuler. "Nouveau QR code" rend l'ancien inutilisable. */
export default async function PointagePage() {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const [{ data: popUps, error: erreurPopUps }, { data: codes, error: erreurCodes }] = await Promise.all([
    supabase.from('pop_ups').select('id, nom, couleur').eq('actif', true).eq('pointage_actif', true).order('nom'),
    supabase.from('pop_up_pointage').select('pop_up_id, code'),
  ]);
  if (erreurPopUps) throw new Error(erreurPopUps.message);
  if (erreurCodes) throw new Error(erreurCodes.message);

  const cartes = await Promise.all(
    (popUps ?? []).map(async (p) => {
      const ligne = (codes ?? []).find((c) => c.pop_up_id === p.id);
      const svg = ligne
        ? await QRCode.toString(PREFIXE_QR + ligne.code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
        : null;
      return { ...p, svg };
    }),
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pointage</h1>
          <p className="mt-1 text-sm text-slate-500">
            Imprime le QR code de chaque pop-up et colle-le près de la caisse. L&apos;équipe scanne avec l&apos;appli
            (Planning → Pointer) en arrivant et en partant, puis prend la caisse en photo.
          </p>
        </div>
        {cartes.length > 0 && <BoutonImprimer />}
      </div>

      {cartes.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucun pop-up avec le pointage activé — coche la case « Pointage » sur la page{' '}
          <Link href="/pop-ups" className="font-semibold text-indigo-600 underline">
            Pop up
          </Link>
          .
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-1 print:gap-0">
          {cartes.map((c) => (
            <div
              key={c.id}
              className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 print:h-screen print:justify-center print:break-after-page print:border-0"
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
                Scanne avec l&apos;appli Pimp It à ton arrivée et à ton départ, puis prends la caisse en photo
              </p>
              <div className="mt-4 w-full border-t border-slate-100 pt-3 print:hidden">
                <BoutonRegenerer popUpId={c.id} nom={c.nom} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
