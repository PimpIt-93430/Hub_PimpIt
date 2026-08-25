import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pimp It Hub',
  description: 'Tout Pimp It au même endroit — Shopify, pin\'s/commandes fournisseurs, et le reste de l\'app.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
