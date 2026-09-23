'use client';

import Link, { type LinkProps } from 'next/link';
import type { AnchorHTMLAttributes } from 'react';

type AppLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>;

// Static export on Workers cannot serve Next 16's RSC prefetch payloads, and the
// sidebar exposes every route at once. Disable prefetch to avoid a request storm.
export function AppLink({ prefetch = false, ...props }: AppLinkProps) {
  return <Link prefetch={prefetch} {...props} />;
}
