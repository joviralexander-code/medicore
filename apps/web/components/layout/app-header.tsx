'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { LogOut, ChevronDown } from 'lucide-react';

interface AppHeaderProps {
  userName: string;
  userRole: string;
  tenantName?: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin:      'Administrador',
  secretaria: 'Secretaria',
  paciente:   'Paciente',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase();
}

export function AppHeader({ userName, userRole }: AppHeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const initials = getInitials(userName);

  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6 flex-shrink-0 shadow-[0_1px_0_0_hsl(var(--border))]">
      {/* Left: breadcrumb placeholder */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {/* Pages can inject breadcrumbs via a slot — kept minimal for now */}
      </div>

      {/* Right: user menu */}
      <div className="relative flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-semibold">{initials}</span>
          </div>

          {/* Name + role */}
          <div className="text-left hidden sm:block">
            <p className="text-sm font-medium leading-none text-foreground">{userName}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {ROLE_LABELS[userRole] ?? userRole}
            </p>
          </div>

          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />

            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-48 rounded-xl border bg-white shadow-elevated z-50 overflow-hidden animate-scale-in"
            >
              {/* User info header */}
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-medium text-foreground truncate">{userName}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABELS[userRole] ?? userRole}</p>
              </div>

              {/* Actions */}
              <div className="py-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <LogOut size={14} />
                  {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
