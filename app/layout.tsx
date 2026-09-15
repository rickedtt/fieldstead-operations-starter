import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Harbor & Pine Operations',
  description: 'Every job, clearly handed off — a local-first job operations demo for Harbor & Pine Property Care.',
  openGraph: {
    title: 'Harbor & Pine Operations',
    description: 'Every job, clearly handed off.',
    images: [{ url:'/og.png', width:1731, height:909, alt:'Harbor & Pine Operations — Every job, clearly handed off.' }],
  },
  twitter: { card:'summary_large_image', title:'Harbor & Pine Operations', description:'Every job, clearly handed off.', images:['/og.png'] },
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
