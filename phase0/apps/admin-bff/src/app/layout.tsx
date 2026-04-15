import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Sidebar } from '@/components/Layout';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kill Switch Admin — Chaos Safety Console',
  description: 'Emergency stop for chaos experiments. Ollama request observability.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased">
        <AuthProvider>
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto bg-gray-950">
              <div className="p-6">
                {children}
              </div>
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}