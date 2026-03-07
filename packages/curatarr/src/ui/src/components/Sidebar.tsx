import { useQuery } from '@tanstack/react-query';
import { Bot, GitMerge, LayoutDashboard, Library, ScanLine, Settings, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { api } from '../api/client';

export function Sidebar() {
  const { t } = useTranslation('common');
  const location = useLocation();
  const { data: disData } = useQuery({
    queryKey: ['disambiguate-pending-count'],
    queryFn: api.disambiguatePending,
    refetchInterval: 30_000,
    select: (d) => d.pending,
  });

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/library', icon: Library, label: t('nav.library') },
    { to: '/scout', icon: Bot, label: t('nav.scoutQueue') },
    { to: '/scan', icon: ScanLine, label: t('nav.scanSync') },
    { to: '/disambiguate', icon: GitMerge, label: t('nav.disambiguate'), badge: true },
    { to: '/verify', icon: ShieldCheck, label: t('nav.verify') },
  ];
  const inSettings = location.pathname.startsWith('/settings');

  const pendingCount = disData ?? 0;

  return (
    <aside
      className="w-56 shrink-0 border-r flex flex-col"
      style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
    >
      {/* Wordmark */}
      <Link
        to="/"
        className="flex items-center gap-2.5 px-4 py-5 border-b hover:opacity-80 transition-opacity"
        aria-label={t('brand.name')}
        style={{ borderColor: 'var(--c-border)' }}
      >
        <img src="/logo.svg" alt={t('brand.logoAlt')} width={24} height={24} />
        <span
          className="text-sm font-bold tracking-widest uppercase"
          style={{ color: 'var(--c-accent)', letterSpacing: '0.15em' }}
        >
          {t('brand.name')}
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 py-3" aria-label="Primary navigation">
        {navItems.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative ${isActive ? 'border-r-2' : ''}`
            }
            style={({ isActive }) =>
              isActive
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
                  <span
                    className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: 'var(--c-accent)', color: 'white', minWidth: '1.25rem', textAlign: 'center' }}
                  >
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
        <NavLink
          to="/settings/general"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative ${isActive || inSettings ? 'border-r-2' : ''}`
          }
          style={({ isActive }) =>
            isActive || inSettings
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
              <Settings size={17} style={isActive || inSettings ? { color: 'var(--c-accent)' } : undefined} />
              <span className="flex-1">{t('nav.settings')}</span>
            </>
          )}
        </NavLink>
        {inSettings && (
          <div className="ml-7 mt-1 mb-1 space-y-0.5">
            <NavLink
              to="/settings/general"
              className={({ isActive }) =>
                `block text-xs px-3 py-1.5 rounded-md transition-colors ${isActive ? 'font-semibold' : ''}`
              }
              style={({ isActive }) =>
                isActive ? { color: '#ddd6fe', background: 'rgba(124,58,237,0.22)' } : { color: 'var(--c-muted)' }
              }
            >
              {t('nav.general')}
            </NavLink>
            <NavLink
              to="/settings/scout"
              className={({ isActive }) =>
                `block text-xs px-3 py-1.5 rounded-md transition-colors ${isActive ? 'font-semibold' : ''}`
              }
              style={({ isActive }) =>
                isActive ? { color: '#ddd6fe', background: 'rgba(124,58,237,0.22)' } : { color: 'var(--c-muted)' }
              }
            >
              {t('nav.scout')}
            </NavLink>
          </div>
        )}
      </nav>

      <div className="px-4 py-3 text-xs border-t" style={{ color: 'var(--c-muted)', borderColor: 'var(--c-border)' }}>
        v0.2.0
      </div>
    </aside>
  );
}
