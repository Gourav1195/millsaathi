import { formatDate } from './format';
import type { Session } from './session';

export function millHeaderMeta(session: Session | null | undefined) {
  return {
    date: formatDate(),
    season: session?.mill.season_label ?? '',
  };
}
