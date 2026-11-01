import type { ReactNode } from 'react';
import { Menu as MenuIcon } from 'lucide-react';
import { useShell } from '@/layouts/shell';
import { GlobalSearch } from './GlobalSearch';

/** Cream band across the top of every page: global search plus page-specific controls (reference: search, Sort by, Filters, Me, Add). */
export function TopBand({ children }: { children?: ReactNode }) {
  const { openNav } = useShell();
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-5 pb-1 pt-5 sm:px-8">
      <button aria-label="Open navigation" onClick={openNav} className="-ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-white lg:hidden"><MenuIcon size={18} /></button>
      <GlobalSearch className="min-w-0 flex-1 basis-56 sm:max-w-[460px]" />
      {children && <div className="flex flex-wrap items-center gap-2 sm:ml-1">{children}</div>}
    </div>
  );
}
