import { ArchiveDialogProvider } from '../../components/archive-dialog';
import { HelpAssistant } from '../../components/help-assistant';
import { PasswordChangeGate } from '../../components/password-change-gate';
import { RouteGuard } from '../../components/route-guard';
import { OperationalCountsProvider } from '../../lib/operational-counts';
import { SessionProvider } from '../../lib/session';

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider>
      <OperationalCountsProvider>
        <ArchiveDialogProvider>
          <PasswordChangeGate>
            <RouteGuard>{children}</RouteGuard>
          </PasswordChangeGate>
          <HelpAssistant />
        </ArchiveDialogProvider>
      </OperationalCountsProvider>
    </SessionProvider>
  );
}
