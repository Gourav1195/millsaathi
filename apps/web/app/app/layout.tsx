import { ArchiveDialogProvider } from '../../components/archive-dialog';
import { HelpAssistant } from '../../components/help-assistant';
import { RouteGuard } from '../../components/route-guard';
import { OperationalCountsProvider } from '../../lib/operational-counts';
import { SessionProvider } from '../../lib/session';

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider>
      <OperationalCountsProvider>
        <ArchiveDialogProvider>
          <RouteGuard>{children}</RouteGuard>
          <HelpAssistant />
        </ArchiveDialogProvider>
      </OperationalCountsProvider>
    </SessionProvider>
  );
}
