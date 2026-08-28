import { NextResponse } from 'next/server';

import { determinerRoleHub } from '@/lib/roles';
import { recupererDocumentEtiquette } from '@/lib/sendcloud';

/** Proxy pour l'étiquette PDF d'un colis Sendcloud — cf. discussion 2026-08-29 : contrairement à
 * Boxtal (URLs signées ouvrables directement), l'endpoint Sendcloud (GET
 * /parcels/{id}/documents/label) exige l'auth Basic à chaque appel, donc pas de simple <a href=...>
 * possible côté client sans exposer les clés API au navigateur. Cette route sert d'intermédiaire
 * authentifié côté serveur. Accès réservé aux admins (mêmes données que le reste de l'écran
 * "Commandes Shopify", cf. lib/roles.ts). */
export async function GET(_req: Request, { params }: { params: Promise<{ parcelId: string }> }) {
  const { role } = await determinerRoleHub();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { parcelId } = await params;
  try {
    const pdf = await recupererDocumentEtiquette(Number(parcelId));
    return new NextResponse(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Étiquette introuvable' }, { status: 502 });
  }
}
