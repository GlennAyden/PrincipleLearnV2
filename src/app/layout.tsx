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
  title: 'PrincipleLearn - Learn Smarter. Think Deeper. Master Anything!',
  description: 'When you learn smarter by leveraging effective strategies and staying curious and thinking deeper by questioning assumptions and exploring new perspectives you empower yourself to master anything.',
  keywords: 'learning, education, online courses, skill development',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
