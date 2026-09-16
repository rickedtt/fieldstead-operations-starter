import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Fieldstead Systems Operations Starter',
  description: 'Fieldstead Systems dogfooding its local-first operations starter using confirmed Fieldstead records only.',
  openGraph: {
    title: 'Fieldstead Systems Operations Starter',
    description: 'Fieldstead using its own local-first operations product using confirmed Fieldstead records only.',
    images: [{ url:'/og.png', width:1731, height:909, alt:'Fieldstead Systems Operations Starter — internal dogfood demo.' }],
  },
  twitter: { card:'summary_large_image', title:'Fieldstead Systems Operations Starter', description:'Internal dogfood demo using confirmed Fieldstead records only.', images:['/og.png'] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
