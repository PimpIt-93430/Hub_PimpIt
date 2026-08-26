import { definirApercuProfil } from '@/app/(hub)/profil/actions';
import { DeconnexionBouton } from '@/components/DeconnexionBouton';
import { determinerRoleHub } from '@/lib/roles';

/** Espace "Local" — équipe qui prépare les commandes envoyées aux pop-up, pèse le stock général,
 * tient le catalogue. Volontairement minimal (pas de sidebar façon admin) : ces personnes n'ont
 * besoin que de ça, pas de tout le Hub. Un admin peut aussi passer par ici (utile pour vérifier ce
 * que voit l'équipe), mais atterrit normalement plutôt sur le Hub complet (cf. layout du Hub) — sauf
 * s'il prévisualise ce rôle depuis Profil ("Se connecter en tant que"), auquel cas un bandeau
 * permet de revenir à son propre compte. */
export default async function LocalLayout({ children }: { children: React.ReactNode }) {
  const { role, profil, enApercu } = await determinerRoleHub();

  return (
    <div className="min-h-screen bg-slate-50">
      {enApercu && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs font-semibold text-amber-800">
          Tu vois cet espace comme {profil?.nom_complet ?? profil?.email} le verrait
          <form action={definirApercuProfil.bind(null, null)}>
            <button type="submit" className="underline">
              Revenir à mon compte
            </button>
          </form>
        </div>
      )}

      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <p className="text-lg font-bold text-slate-900">Pimp It — Local</p>
          {role !== 'inconnu' && (
            <p className="text-xs text-slate-400">{profil?.nom_complet ?? profil?.email}</p>
          )}
        </div>
        <DeconnexionBouton />
      </header>

      <main className="mx-auto max-w-[960px] px-6 py-8">{children}</main>
    </div>
  );
}
