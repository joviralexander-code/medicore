'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Stethoscope,
  Receipt,
  Pill,
  Building2,
  TrendingUp,
  Share2,
  MessageCircle,
  BarChart3,
  Settings,
  Zap,
  FileCheck,
} from 'lucide-react';

interface AppSidebarProps {
  slug: string;
  tenantName: string;
  planTier: string;
  userRole: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function getNavGroups(slug: string): NavGroup[] {
  return [
    {
      label: 'Core',
      items: [
        { label: 'Dashboard',        href: `/app/${slug}/dashboard`,     icon: LayoutDashboard },
        { label: 'Pacientes',        href: `/app/${slug}/patients`,      icon: Users },
        { label: 'Agenda',           href: `/app/${slug}/agenda`,        icon: CalendarDays },
        { label: 'Historia Clínica', href: `/app/${slug}/clinical`,      icon: Stethoscope },
      ],
    },
    {
      label: 'Clínica',
      items: [
        { label: 'Facturación SRI',  href: `/app/${slug}/billing`,      icon: Receipt },
        { label: 'Recetas',          href: `/app/${slug}/prescriptions`, icon: Pill },
        { label: 'Certificados',     href: `/app/${slug}/certificates`,  icon: FileCheck },
        { label: 'Farmacia',         href: `/app/${slug}/pharmacy`,      icon: Building2 },
      ],
    },
    {
      label: 'Gestión',
      items: [
        { label: 'Finanzas',         href: `/app/${slug}/finances`,  icon: TrendingUp,    roles: ['admin'] },
        { label: 'Reportes',         href: `/app/${slug}/reports`,   icon: BarChart3,     roles: ['admin'] },
      ],
    },
    {
      label: 'Marketing',
      items: [
        { label: 'Redes Sociales',   href: `/app/${slug}/social`,    icon: Share2,        roles: ['admin'] },
        { label: 'WhatsApp',         href: `/app/${slug}/whatsapp`,  icon: MessageCircle },
      ],
    },
    {
      label: 'Sistema',
      items: [
        { label: 'Configuración',    href: `/app/${slug}/settings`,  icon: Settings,      roles: ['admin'] },
      ],
    },
  ];
}

const PLAN_BADGE: Record<string, string> = {
  free:       'bg-white/10 text-white/60',
  pro:        'bg-blue-500/25 text-blue-300',
  clinica:    'bg-teal-500/25 text-teal-300',
  enterprise: 'bg-purple-500/25 text-purple-300',
};

const PLAN_LABEL: Record<string, string> = {
  free: 'Free', pro: 'Pro', clinica: 'Clínica', enterprise: 'Enterprise',
};

export function AppSidebar({ slug, tenantName, planTier, userRole }: AppSidebarProps) {
  const pathname = usePathname();
  const groups = getNavGroups(slug);

  return (
    /* Pure Tailwind sidebar colors — no JS inline style manipulation */
    <aside className="w-[240px] flex-shrink-0 flex flex-col h-full bg-sidebar-bg">

      {/* ── Brand + tenant ────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm flex-shrink-0">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <span className="font-semibold text-sm text-sidebar-fg">MediCore</span>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg bg-sidebar-active-bg px-3 py-2">
          <p className="text-xs font-medium text-sidebar-fg truncate flex-1" title={tenantName}>
            {tenantName}
          </p>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0',
            PLAN_BADGE[planTier] ?? PLAN_BADGE['free']
          )}>
            {PLAN_LABEL[planTier] ?? planTier}
          </span>
        </div>
      </div>

      {/* ── Navigation ────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
        {groups.map((group) => {
          const visible = group.items.filter(
            (item) => !item.roles || item.roles.includes(userRole)
          );
          if (visible.length === 0) return null;

          return (
            <div key={group.label}>
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {group.label}
              </p>

              <div className="space-y-0.5">
                {visible.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== `/app/${slug}/dashboard` && pathname.startsWith(item.href));

                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        // base — all items
                        'group relative flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-all duration-150',
                        isActive
                          // active state
                          ? 'bg-sidebar-active-bg text-white font-medium'
                          // idle + hover
                          : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg'
                      )}
                    >
                      {/* Left accent bar for active */}
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-primary" />
                      )}

                      <Icon
                        size={16}
                        strokeWidth={isActive ? 2.5 : 2}
                        className="flex-shrink-0"
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
        {planTier === 'free' && (
          <Link
            href={`/app/${slug}/settings/billing`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-primary/20 text-blue-300 hover:bg-primary/30 transition-colors"
          >
            <Zap size={12} className="flex-shrink-0" />
            Actualizar plan
          </Link>
        )}
        <p className="text-[10px] text-center text-sidebar-muted truncate px-1">
          {slug}.medicore.ec
        </p>
      </div>
    </aside>
  );
}
