import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Download, Plus } from 'lucide-react';
import { SendByEmailButton } from '@/components/shared/send-by-email-button';

export const metadata: Metadata = { title: 'Certificados Médicos' };

interface Props { params: Promise<{ slug: string }> }

const TYPE_LABELS: Record<string, string> = {
  reposo: 'Reposo', salud: 'Salud', atencion: 'Atención', personalizado: 'Personalizado',
};
const TYPE_VARIANTS: Record<string, 'default'|'secondary'|'success'|'info'> = {
  reposo: 'info', salud: 'success', atencion: 'secondary', personalizado: 'default',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function CertificatesPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', slug).single();
  if (!tenant) redirect('/onboarding');

  const { data: certs } = await supabase
    .from('medical_certificates')
    .select(`
      id, certificate_type, certificate_number, issued_at, is_signed, content,
      patient:patients(first_name, last_name)
    `)
    .eq('tenant_id', tenant.id)
    .order('issued_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Certificados médicos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Historial de certificados emitidos</p>
        </div>
        <Button asChild>
          <Link href={`/app/${slug}/certificates/new`}>
            <Plus size={16} className="mr-1.5" />
            Nuevo certificado
          </Link>
        </Button>
      </div>

      {!certs?.length ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText size={24} className="text-primary" />
            </div>
            <p className="text-muted-foreground text-sm">No hay certificados emitidos aún.</p>
            <Button asChild size="sm" className="mt-1">
              <Link href={`/app/${slug}/certificates/new`}>
                <Plus size={14} className="mr-1.5" />
                Nuevo certificado
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {certs.map((cert) => {
                const patient = (Array.isArray(cert.patient) ? cert.patient[0] : cert.patient) as { first_name: string; last_name: string } | null;
                const content = cert.content as Record<string, unknown>;
                const subtitle = cert.certificate_type === 'reposo'
                  ? `${content.days ?? '?'} día(s) de reposo`
                  : cert.certificate_type === 'salud'
                    ? `Apto/a para ${content.purpose ?? ''}`
                    : cert.certificate_type === 'personalizado'
                      ? String(content.title ?? '')
                      : 'Constancia de atención';

                return (
                  <div key={cert.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {patient ? `${patient.first_name} ${patient.last_name}` : '—'}
                        </span>
                        <Badge variant={TYPE_VARIANTS[cert.certificate_type] ?? 'secondary'}>
                          {TYPE_LABELS[cert.certificate_type] ?? cert.certificate_type}
                        </Badge>
                        {cert.is_signed && <Badge variant="success">Firmado</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cert.certificate_number} · {subtitle} · {formatDate(cert.issued_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link
                        href={`/api/certificates/${cert.id}/pdf`}
                        target="_blank"
                        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        <Download size={14} />
                        PDF
                      </Link>
                      <SendByEmailButton
                        type="certificate"
                        id={cert.id}
                        label="Enviar"
                        variant="ghost"
                        size="sm"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
