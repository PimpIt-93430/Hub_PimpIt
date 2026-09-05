import { NextResponse } from 'next/server';

import { determinerRoleHub } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

/** Sert le PDF (base64 stocké à la création, cf. lib/expeditions-laposte.ts — l'API La Poste n'a
 * pas d'endpoint pour retélécharger une étiquette déjà générée) d'une étiquette La Poste par id de
 * ligne `expeditions_laposte`. Même principe que /api/etiquette-sendcloud/[parcelId] (proxy
 * authentifié plutôt qu'un lien direct). Accès réservé aux admins. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { role } = await determinerRoleHub();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('expeditions_laposte').select('visual_output_base64').eq('id', id).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'Étiquette introuvable' }, { status: 404 });
  }

  return new NextResponse(Buffer.from(data.visual_output_base64, 'base64'), { headers: { 'Content-Type': 'application/pdf' } });
}
