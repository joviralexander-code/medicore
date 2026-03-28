'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CertificateForm } from './certificate-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Plus, Download } from 'lucide-react';

interface CertRow {
  id: string;
  certificate_type: string;
  certificate_number: string | null;
  issued_at: string;
  is_signed: boolean;
  content: Record<string, unknown>;
}

interface Props {
  tenantId: string;
  patientId: string;
  patientName: string;
  consultationId: string;
  doctorId: string;
}

const TYPE_LABELS: Record<string, string> = {
  reposo: 'Reposo', salud: 'Salud', atencion: 'Atención', personalizado: 'Personalizado',
};
const TYPE_VARIANTS: Record<string, 'default'|'secondary'|'success'|'info'> = {
  reposo: 'info', salud: 'success', atencion: 'secondary', personalizado: 'default',
};

export function ConsultationCertificates({ tenantId, patientId, patientName, consultationId, doctorId }: Props) {
  const supabase = createClient();
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('medical_certificates')
      .select('id, certificate_type, certificate_number, issued_at, is_signed, content')
      .eq('consultation_id', consultationId)
      .order('issued_at', { ascending: false });
    setCerts((data as CertRow[]) ?? []);
  }, [consultationId, supabase]);

  useEffect(() => { load(); }, [load]);

  function handleSuccess(_id: string) {
    setShowForm(false);
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Certificados médicos</h3>
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
          <Plus size={14} className="mr-1" />
          Nuevo certificado
        </Button>
      </div>

      {certs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No hay certificados para esta consulta.</p>
      ) : (
        <div className="space-y-2">
          {certs.map((cert) => {
            const content = cert.content;
            const subtitle = cert.certificate_type === 'reposo'
              ? `${content.days ?? '?'} días de reposo`
              : cert.certificate_type === 'salud'
                ? `Apto/a para ${content.purpose ?? ''}`
                : cert.certificate_type === 'personalizado'
                  ? String(content.title ?? '')
                  : 'Constancia de atención';

            return (
              <div key={cert.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                <FileText size={16} className="text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={TYPE_VARIANTS[cert.certificate_type] ?? 'secondary'}>
                      {TYPE_LABELS[cert.certificate_type] ?? cert.certificate_type}
                    </Badge>
                    {cert.is_signed && <Badge variant="success">Firmado</Badge>}
                    <span className="text-xs text-muted-foreground">{cert.certificate_number}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>
                </div>
                <a
                  href={`/api/certificates/${cert.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
                >
                  <Download size={13} />
                  PDF
                </a>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <CertificateForm
          tenantId={tenantId}
          patientId={patientId}
          patientName={patientName}
          consultationId={consultationId}
          doctorId={doctorId}
          onSuccess={handleSuccess}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
