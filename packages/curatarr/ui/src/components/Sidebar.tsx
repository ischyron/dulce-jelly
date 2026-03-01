import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Library, Search, ScanLine, Settings, ShieldCheck, GitMerge } from 'lucide-react';
import { api } from '../api/client.js';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/library', icon: Library, label: 'Library' },
  { to: '/scout', icon: Search, label: 'Scout Queue' },
  { to: '/scan', icon: ScanLine, label: 'Scan / Sync' },
  { to: '/disambiguate', icon: GitMerge, label: 'Disambiguate', badge: true },
  { to: '/verify', icon: ShieldCheck, label: 'Verify' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const { data: disData } = useQuery({
    queryKey: ['disambiguate-pending-count'],
    queryFn: api.disambiguatePending,
    refetchInterval: 30_000,
    select: (d) => d.pending,
  });

  const pendingCount = disData ?? 0;

  return (
    <aside className="w-56 shrink-0 border-r flex flex-col"
      style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
      {/* Wordmark */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b"
        style={{ borderColor: 'var(--c-border)' }}>
        <img src="/logo.svg" alt="Curatarr logo" width={24} height={24} />
        <span className="text-sm font-bold tracking-widest uppercase"
          style={{ color: 'var(--c-accent)', letterSpacing: '0.15em' }}>
          CURATARR
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3">
        {navItems.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative ` +
              (isActive
                ? 'border-r-2'
                : '')
            }
            style={({ isActive }) => isActive
              ? {
                  background: 'rgba(124,58,237,0.15)',
                  borderColor: 'var(--c-accent)',
                  color: '#c4b5fd',
                }
              : {
                  color: 'var(--c-muted)',
                }
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={17} style={isActive ? { color: 'var(--c-accent)' } : undefined} />
                <span className="flex-1">{label}</span>
                {badge && pendingCount > 0 && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: 'var(--c-accent)', color: 'white', minWidth: '1.25rem', textAlign: 'center' }}>
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 text-xs border-t"
        style={{ color: 'var(--c-muted)', borderColor: 'var(--c-border)' }}>
        v0.2.0
      </div>
    </aside>
  );
}
