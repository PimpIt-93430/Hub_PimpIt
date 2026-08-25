'use client';

import type { ReactNode } from 'react';

import { initiales, LIBELLE_TYPE_CONTRAT } from './lib';
import type { Role, TypeContrat } from './types';

const champBase =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-none disabled:opacity-50';

export function AvatarInitiales({
  nom,
  email,
  couleur,
  taille = 36,
}: {
  nom?: string | null;
  email: string;
  couleur: string;
  taille?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: taille, height: taille, backgroundColor: couleur, fontSize: taille * 0.38 }}
    >
      {initiales(nom, email)}
    </div>
  );
}

export function BadgeRole({ role, typeContrat }: { role: Role; typeContrat: TypeContrat }) {
  return (
    <div className="mt-0.5 flex items-center gap-1">
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
        {LIBELLE_TYPE_CONTRAT[typeContrat] ?? typeContrat}
      </span>
      {role === 'admin' && (
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">Admin</span>
      )}
    </div>
  );
}

export function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold text-slate-900">{titre}</h3>
      <div className="flex flex-wrap gap-4">{children}</div>
    </div>
  );
}

export function Champ({
  label,
  valeur,
  onChangeText,
  type = 'text',
  disabled,
}: {
  label: string;
  valeur: string;
  onChangeText: (v: string) => void;
  type?: 'text' | 'email' | 'tel' | 'number';
  disabled?: boolean;
}) {
  return (
    <label className="block w-60 text-xs font-semibold text-slate-500">
      {label}
      <input
        type={type}
        value={valeur}
        onChange={(e) => onChangeText(e.target.value)}
        disabled={disabled}
        className={`mt-1.5 ${champBase}`}
      />
    </label>
  );
}

export function ChampDate({ label, valeur, onChange }: { label: string; valeur: string; onChange: (v: string) => void }) {
  return (
    <label className="block w-60 text-xs font-semibold text-slate-500">
      {label}
      <input type="date" value={valeur} onChange={(e) => onChange(e.target.value)} className={`mt-1.5 ${champBase}`} />
    </label>
  );
}

export function ChampSelect({
  label,
  valeur,
  options,
  onChange,
  disabled,
}: {
  label: string;
  valeur: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block w-60 text-xs font-semibold text-slate-500">
      {label}
      <select value={valeur} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`mt-1.5 ${champBase}`}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ChampBool({ label, valeur, onChange }: { label: string; valeur: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex w-60 items-center justify-between border-b border-slate-100 pb-2 text-xs font-semibold text-slate-500">
      {label}
      <input
        type="checkbox"
        checked={valeur}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
    </label>
  );
}

export function TexteAlerte({ children }: { children: ReactNode }) {
  return <p className="py-2 text-center text-sm text-slate-400">{children}</p>;
}

export function BoutonEnregistrer({
  onClick,
  enCours,
  label = 'Enregistrer',
}: {
  onClick: () => void;
  enCours: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={enCours}
      className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {enCours ? 'Enregistrement...' : label}
    </button>
  );
}
