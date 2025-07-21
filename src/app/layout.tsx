// src/app/layout.tsx
import './globals.scss';
import './font-styles.scss';
import { ReactNode } from 'react';
import { RequestCourseProvider } from '../context/RequestCourseContext';
import { AuthProvider } from '@/hooks/useAuth';

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <AuthProvider>
          <RequestCourseProvider>
            {children}
          </RequestCourseProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
