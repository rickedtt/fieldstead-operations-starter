import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Fieldstead Systems Operations Starter',
  description: 'Office-first workflow for customers, jobs, schedules, estimate follow-up, payment visibility, and daily attention in small service businesses.',
  openGraph: {
    title: 'Fieldstead Systems Operations Starter',
    description: 'A dependable office workflow for small blue-collar and field-service businesses.',
    images: [{ url:'/og.png', width:1731, height:909, alt:'Fieldstead Systems Operations Starter — office-first workflow.' }],
  },
  twitter: { card:'summary_large_image', title:'Fieldstead Systems Operations Starter', description:'Office-first workflow demo using confirmed Fieldstead records only.', images:['/og.png'] },
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
