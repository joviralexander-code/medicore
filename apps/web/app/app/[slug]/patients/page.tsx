import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus, Search } from 'lucide-react';

/** Escapa caracteres especiales del filtro ilike para prevenir filter injection en Supabase .or() */
function escapeIlike(value: string): string {
  return value.replace(/[%_,]/g, '\\$&');
}

export const metadata: Metadata = { title: 'Pacientes' };

interface PatientsPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function PatientsPage({
  params,
  searchParams,
}: PatientsPageProps) {
  const { slug } = await params;
  const { q, page } = await searchParams;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  const pageNum = Math.max(1, parseInt(page ?? '1', 10));
  const pageSize = 20;
  const offset = (pageNum - 1) * pageSize;

  let query = supabase
    .from('patients')
    .select('id, first_name, last_name, cedula, phone, birth_date, created_at', {
      count: 'exact',
    })
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (q && q.trim()) {
    const safe = escapeIlike(q.trim());
    query = query.or(
      `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,cedula.ilike.%${safe}%`
    );
  }

  const { data: patients, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  function calcAge(birthDate: string | null): string {
    if (!birthDate) return '—';
    const diff = Date.now() - new Date(birthDate).getTime();
    return `${Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))} años`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pacientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {count ?? 0} paciente{(count ?? 0) !== 1 ? 's' : ''} registrado{(count ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <Button asChild>
          <Link href={`/app/${slug}/patients/new`}>
            <UserPlus size={16} />
            Nuevo paciente
          </Link>
        </Button>
      </div>

      {/* Search */}
      <form method="GET" className="flex gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre o cédula…"
            className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
          />
        </div>
        <Button type="submit" variant="outline" size="default">
          Buscar
        </Button>
      </form>

      {/* Patients table */}
      <Card variant="flat">
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-sm font-semibold">Lista de pacientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!patients || patients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
              <UserPlus size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {q ? 'Sin resultados para esa búsqueda' : 'Aún no tienes pacientes registrados'}
              </p>
              {!q && (
                <Button asChild size="sm" variant="outline" className="mt-4">
                  <Link href={`/app/${slug}/patients/new`}>Registrar primer paciente</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Paciente</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cédula</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Edad</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Teléfono</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {patients.map((patient) => (
                    <tr key={patient.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/app/${slug}/patients/${patient.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {patient.first_name} {patient.last_name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">
                        {patient.cedula ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {calcAge(patient.birth_date)}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {patient.phone ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/app/${slug}/patients/${patient.id}`}
                          className="text-xs text-primary font-medium hover:underline"
                        >
                          Ver historial →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          {pageNum > 1 && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`?q=${q ?? ''}&page=${pageNum - 1}`}>Anterior</Link>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Página {pageNum} de {totalPages}
          </span>
          {pageNum < totalPages && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`?q=${q ?? ''}&page=${pageNum + 1}`}>Siguiente</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
