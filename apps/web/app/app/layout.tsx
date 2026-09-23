import { DevIndicator } from '../../components/dev-indicator';
import { SessionProvider } from '../../lib/session';

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider>
      <DevIndicator />
      {children}
    </SessionProvider>
  );
}
