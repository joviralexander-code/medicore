import { createClient as createAdmin } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CheckCircle, FileText, User, Stethoscope, Calendar } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Verificar Certificado | PlexoMed',
  robots: 'noindex',
};

interface Props {
  params: Promise<{ code: string }>;
}

export default async function VerificarCertificadoPage({ params }: Props) {
  const { code } = await params;

  const admin = createAdmin(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );

  const { data: cert } = await admin
    .from('medical_certificates')
    .select(`
      certificate_number, certificate_type, issued_at, valid_until, is_signed,
      patient:patients(first_name, last_name, cedula),
      doctor:user_profiles(first_name, last_name, speciality, senescyt_registration),
      tenant:tenants(name, sri_ruc)
    `)
    .eq('verification_code', code.toUpperCase())
    .single();

  if (!cert) notFound();

  const TYPE_LABELS: Record<string, string> = {
    reposo: 'Reposo médico / Incapacidad',
    salud: 'Certificado de salud / Aptitud',
    atencion: 'Constancia de atención',
    personalizado: 'Certificado personalizado',
  };

  const patient = cert.patient as { first_name: string; last_name: string; cedula?: string } | null;
  const doctor = cert.doctor as { first_name: string; last_name: string; speciality?: string; senescyt_registration?: string } | null;
  const tenant = cert.tenant as { name: string; sri_ruc?: string } | null;

  const issuedAt = new Date(cert.issued_at as string).toLocaleDateString('es-EC', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[#1E40AF] flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="text-xl font-bold text-[#1E40AF]">PlexoMed</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Verificación de Certificado</h1>
          <p className="text-sm text-gray-500 mt-1">Código: <span className="font-mono font-semibold">{code.toUpperCase()}</span></p>
        </div>

        {/* Valid badge */}
        <div className="flex items-center justify-center gap-2 bg-green-50 border border-green-200 rounded-xl px-5 py-3 mb-6">
          <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
          <span className="text-green-800 font-semibold text-sm">Certificado válido y auténtico</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-[#1E40AF] to-[#0D9488]" />

          <div className="p-6 space-y-4">

            {/* Tipo y número */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileText className="text-[#1E40AF]" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Tipo</p>
                <p className="font-semibold text-gray-900">{TYPE_LABELS[cert.certificate_type as string] ?? cert.certificate_type}</p>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{cert.certificate_number as string}</p>
              </div>
            </div>

            <div className="border-t border-gray-50" />

            {/* Paciente */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                <User className="text-[#0D9488]" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Paciente</p>
                <p className="font-semibold text-gray-900">
                  {patient ? `${patient.first_name} ${patient.last_name}` : '—'}
                </p>
                {patient?.cedula && (
                  <p className="text-xs text-gray-500 mt-0.5">CI: {patient.cedula}</p>
                )}
              </div>
            </div>

            <div className="border-t border-gray-50" />

            {/* Médico */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Stethoscope className="text-[#1E40AF]" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Médico emisor</p>
                <p className="font-semibold text-gray-900">
                  {doctor ? `Dr. ${doctor.first_name} ${doctor.last_name}` : '—'}
                </p>
                {doctor?.speciality && (
                  <p className="text-xs text-gray-500 mt-0.5">{doctor.speciality}</p>
                )}
                {doctor?.senescyt_registration && (
                  <p className="text-xs text-gray-400 mt-0.5">SENESCYT: {doctor.senescyt_registration}</p>
                )}
              </div>
            </div>

            <div className="border-t border-gray-50" />

            {/* Consultorio y fecha */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                <Calendar className="text-[#0D9488]" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Emisión</p>
                <p className="font-semibold text-gray-900">{issuedAt}</p>
                {tenant && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {tenant.name}{tenant.sri_ruc ? ` · RUC: ${tenant.sri_ruc}` : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Firma digital */}
            {cert.is_signed && (
              <>
                <div className="border-t border-gray-50" />
                <div className="flex items-center gap-2 text-xs text-[#0D9488] bg-teal-50 rounded-lg px-3 py-2">
                  <CheckCircle size={14} />
                  <span className="font-medium">Firmado electrónicamente con certificado digital</span>
                </div>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Verificado en plexomed.com · Este certificado es auténtico y fue emitido a través de PlexoMed
        </p>
      </div>
    </div>
  );
}
