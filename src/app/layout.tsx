import type { Metadata } from 'next';
import { IBM_Plex_Mono, Source_Sans_3, Source_Serif_4 } from 'next/font/google';
import '@/styles/tokens.css';
import './globals.css';

// Self-hosted at build time: the browser never contacts fonts.gstatic.com,
// so member IP addresses are not disclosed to Google. This is a GDPR
// requirement for the data this app holds, not a performance tweak.
const sourceSans = Source_Sans_3({
  subsets: ['latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ui',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin-ext'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-naglowek',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin-ext'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Kartoteka DK',
  description: 'Kartoteka Domowego Kościoła — archidiecezja gdańska',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${sourceSans.variable} ${sourceSerif.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
