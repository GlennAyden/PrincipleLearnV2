// src/app/layout.tsx
import './globals.scss';
import './font-styles.scss';
import { ReactNode } from 'react';
import { RequestCourseProvider } from '../context/RequestCourseContext';
import Head from 'next/head';

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        <RequestCourseProvider>
          {children}
        </RequestCourseProvider>
      </body>
    </html>
  );
}
