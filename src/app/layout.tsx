// src/app/layout.tsx
import './globals.scss';
import './font-styles.scss';
import { ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import { RequestCourseProvider } from '../context/RequestCourseContext';
import { AuthProvider } from '@/hooks/useAuth';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

// Metadata for the app
export const metadata = {
  title: 'PrincipleLearn - Belajar Lebih Cerdas. Berpikir Lebih Dalam. Kuasai Apapun!',
  description: 'Dengan belajar lebih cerdas menggunakan strategi efektif dan tetap penasaran, serta berpikir lebih dalam dengan mempertanyakan asumsi dan mengeksplorasi perspektif baru, kamu bisa menguasai apapun.',
  keywords: 'belajar, pendidikan, kursus online, pengembangan keterampilan',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className={poppins.className}>
        <AuthProvider>
          <RequestCourseProvider>
            {children}
          </RequestCourseProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
