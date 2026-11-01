import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase, Database, Eye, LayoutDashboard, LogOut, MapPin, Network, Package, ScrollText, UserRound, UserSearch, Users, Lightbulb, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLookups } from '@/hooks/useData';
import { api } from '@/lib/api';
import { cx, humanize } from '@/lib/format';
import type { CaseRow, Page } from '@/types';
import { Avatar } from '@/components/ui/primitives';
import { ShellContext } from './shell';

const linkCls = ({ isActive }: { isActive: boolean }) =>
  cx('group flex h-9 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition',
    isActive ? 'bg-mist text-ink' : 'text-muted hover:bg-mist/70 hover:text-ink');

function Item({ to, icon: Icon, children, end }: { to: string; icon: typeof Briefcase; children: string; end?: boolean }) {
  return <NavLink to={to} end={end} className={linkCls}><Icon size={18} strokeWidth={1.9} />{children}</NavLink>;
}
const Heading = ({ children }: { children: string }) => <p className="px-3 pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">{children}</p>;

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, can, signOut } = useAuth();
  const nav = useNavigate();
  const lookups = useLookups();
  const recent = useQuery({ queryKey: ['sidebar-cases'], queryFn: () => api.get<Page<CaseRow>>('/cases', { pageSize: 2, sort: 'updated', order: 'desc' }), staleTime: 30_000 });

  return (
    <div className="flex h-full flex-col" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) onNavigate?.(); }}>
      <div className="flex items-center gap-2.5 px-5 pb-2 pt-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink">
          <svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="#f6f7ed" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="21" r="3.2" /><circle cx="22" cy="10" r="3.2" /><path d="M13.3 18.7l6.4-6.4" /><circle cx="23" cy="23" r="2" fill="#f6f7ed" stroke="none" /></svg>
        </span>
        <span className="text-[19px] font-semibold tracking-tight">TraceNet</span>
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <Heading>Workspace</Heading>
        <Item to="/" icon={LayoutDashboard} end>Dashboard</Item>
        <Item to="/cases" icon={Briefcase}>Cases</Item>
        <Item to="/graph" icon={Network}>Relationship graph</Item>

        <Heading>Records</Heading>
        <Item to="/suspects" icon={UserSearch}>Suspects</Item>
        <Item to="/victims" icon={UserRound}>Victims</Item>
        <Item to="/witnesses" icon={Eye}>Witnesses</Item>
        <Item to="/evidence" icon={Package}>Evidence</Item>
        <Item to="/clues" icon={Lightbulb}>Clues</Item>
        <Item to="/locations" icon={MapPin}>Locations</Item>

        <Heading>Recent cases</Heading>
        <ul className="space-y-0.5">
          {(recent.data?.items ?? []).map((c) => (
            <li key={c.id}>
              <NavLink to={`/cases/${c.id}`} className={({ isActive }) => cx('flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-[13.5px] transition', isActive ? 'bg-mist font-medium' : 'text-muted hover:bg-mist/70 hover:text-ink')}>
                <span className={cx('h-2 w-2 shrink-0 rounded-full', c.priority === 'critical' ? 'bg-danger' : c.priority === 'high' ? 'bg-warn' : c.priority === 'medium' ? 'bg-info' : 'bg-faint')} />
                <span className="truncate">{c.title}</span>
              </NavLink>
            </li>
          ))}
          {recent.isPending && <li className="px-3 py-1.5 text-[13px] text-faint">Loading…</li>}
        </ul>

        <Heading>Team</Heading>
        <ul className="space-y-0.5">
          {(lookups.data?.users ?? []).slice(0, 2).map((u) => (
            <li key={u.id}>
              <NavLink to={`/investigators/${u.id}`} className={({ isActive }) => cx('flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-[13.5px] transition', isActive ? 'bg-mist font-medium' : 'text-muted hover:bg-mist/70 hover:text-ink')}>
                <Avatar name={u.full_name} size={22} />
                <span className="truncate">{u.full_name}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <Heading>System</Heading>
        <Item to="/investigators" icon={Users}>Investigators</Item>
        <Item to="/activity" icon={ScrollText}>Activity log</Item>
        {can('lab:use') && <Item to="/lab" icon={Database}>ADBMS lab</Item>}
      </nav>

      {user && (
        <div className="m-3 flex items-center gap-3 rounded-2xl border border-line bg-cream/60 p-2.5">
          <button onClick={() => { nav('/settings'); onNavigate?.(); }} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left" aria-label="Account settings">
            <Avatar name={user.full_name} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold leading-tight">{user.full_name}</span>
              <span className="block truncate text-[12px] text-muted">{humanize(user.role)}</span>
            </span>
          </button>
          <button onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-white hover:text-ink"><LogOut size={18} /></button>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setDrawer(false); window.scrollTo(0, 0); }, [pathname]);
  const shell = useMemo(() => ({ openNav: () => setDrawer(true) }), []);

  return (
    <ShellContext.Provider value={shell}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
      <div className="flex min-h-screen bg-cream">
        <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 border-r border-line bg-white lg:block"><SidebarContent /></aside>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-ink/45" onClick={() => setDrawer(false)} />
            <aside className="anim-fade absolute inset-y-0 left-0 w-[280px] max-w-[86vw] bg-white shadow-[var(--shadow-pop)]">
              <button onClick={() => setDrawer(false)} aria-label="Close navigation" className="absolute right-3 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-mist"><X size={18} /></button>
              <SidebarContent onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}
        <main id="main" className="min-w-0 flex-1"><Outlet /></main>
      </div>
    </ShellContext.Provider>
  );
}
