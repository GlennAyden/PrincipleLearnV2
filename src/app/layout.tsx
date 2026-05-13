// src/app/layout.tsx
import './globals.scss';
import './font-styles.scss';
import { cookies } from 'next/headers';
import { ReactNode } from 'react';
import { RequestCourseProvider } from '../context/RequestCourseContext';
import { LocaleProvider } from '../context/LocaleContext';
import { AuthProvider } from '@/hooks/useAuth';
import { LOCALE_COOKIE, parseLocale } from '@/lib/i18n/locale';

// Metadata for the app
export const metadata = {
  title: 'PrincipleLearn - Belajar Lebih Cerdas. Berpikir Lebih Dalam. Kuasai Apapun!',
  description: 'Dengan belajar lebih cerdas menggunakan strategi efektif dan tetap penasaran, serta berpikir lebih dalam dengan mempertanyakan asumsi dan mengeksplorasi perspektif baru, kamu bisa menguasai apapun.',
  keywords: 'belajar, pendidikan, kursus online, pengembangan keterampilan',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const locale = parseLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  return (
    <html lang={locale}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <LocaleProvider initialLocale={locale}>
          <AuthProvider>
            <RequestCourseProvider>
              {children}
            </RequestCourseProvider>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
