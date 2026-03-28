'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface OnboardingWizardProps {
  userEmail?: string;
}

type Step = 1 | 2 | 3;

const SPECIALITIES = [
  'Medicina General', 'Medicina Familiar', 'Pediatría',
  'Ginecología y Obstetricia', 'Medicina Interna', 'Cardiología',
  'Traumatología', 'Dermatología', 'Oftalmología', 'Otorrinolaringología',
  'Urología', 'Neurología', 'Psiquiatría', 'Oncología', 'Endocrinología',
  'Reumatología', 'Gastroenterología', 'Neumología', 'Hematología',
  'Cirugía General', 'Odontología', 'Otra especialidad',
];

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 63);
}

const STEPS = [
  { label: 'Tu perfil', icon: '👤' },
  { label: 'Consultorio', icon: '🏥' },
  { label: 'Listo', icon: '🎉' },
];

export function OnboardingWizard({ userEmail: _userEmail }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [createdSlug, setCreatedSlug] = useState('');

  const [profile, setProfile] = useState({
    firstName: '', lastName: '', cedula: '',
    speciality: '', senescytRegistration: '', phone: '',
  });
  const [tenant, setTenant] = useState({ name: '', slug: '' });

  // Refrescar sesión al montar para asegurar JWT actualizado
  useState(() => {
    const supabase = createClient();
    supabase.auth.refreshSession().catch(() => null);
  });

  function handleProfileChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setProfile(p => ({ ...p, [e.target.name]: e.target.value }));
  }

  function handleTenantNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    const slug = generateSlug(name);
    setTenant({ name, slug });
    setSlugAvailable(null);
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
    setTenant(t => ({ ...t, slug }));
    setSlugAvailable(null);
  }

  async function checkSlug() {
    if (!tenant.slug || tenant.slug.length < 3) return;
    setCheckingSlug(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenant.slug)
      .maybeSingle();
    setSlugAvailable(data === null);
    setCheckingSlug(false);
  }

  async function submitProfile() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      // Refrescar por si el JWT está desactualizado
      await supabase.auth.refreshSession();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No hay sesión activa. Por favor recarga la página.');

      const { error: updateError, data: updated } = await supabase
        .from('user_profiles')
        .update({
          first_name: profile.firstName,
          last_name: profile.lastName,
          cedula: profile.cedula,
          speciality: profile.speciality,
          senescyt_registration: profile.senescytRegistration || null,
          phone: profile.phone || null,
        })
        .eq('id', user.id)
        .select('id');

      if (updateError) throw new Error(updateError.message);
      if (!updated?.length) throw new Error('No se pudo guardar el perfil. Intenta cerrar sesión y volver a ingresar.');
      setStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      toast({ title: 'Error al guardar perfil', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function submitTenant() {
    if (!tenant.name || tenant.slug.length < 3) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      // RPC atómico con SECURITY DEFINER — crea tenant y vincula usuario
      const { data, error: rpcError } = await supabase.rpc('create_onboarding_tenant', {
        p_tenant_name: tenant.name,
        p_tenant_slug: tenant.slug,
      });

      if (rpcError) throw new Error(rpcError.message);

      const result = data as { id: string; slug: string };

      // Refrescar JWT para que incluya tenant_id en los claims
      await supabase.auth.refreshSession();

      setCreatedSlug(result.slug);
      setStep(3);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      toast({ title: 'Error al crear consultorio', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function goToDashboard() {
    router.push(`/app/${createdSlug}/dashboard`);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Stepper */}
      <div className="flex items-center justify-center">
        {STEPS.map((s, idx) => (
          <div key={s.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 shadow-sm',
                idx + 1 < step ? 'bg-[#0D9488] text-white shadow-teal-200 shadow-md' :
                idx + 1 === step ? 'bg-[#1E40AF] text-white shadow-blue-200 shadow-md scale-110' :
                'bg-gray-100 text-gray-400'
              )}>
                {idx + 1 < step ? '✓' : s.icon}
              </div>
              <span className={cn(
                'text-xs mt-1 font-medium',
                idx + 1 === step ? 'text-[#1E40AF]' : 'text-gray-400'
              )}>{s.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn(
                'w-16 h-0.5 mx-2 mb-4 transition-colors duration-300',
                idx + 1 < step ? 'bg-[#0D9488]' : 'bg-gray-200'
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <Card className="shadow-xl border-0 bg-white">
          <CardHeader className="pb-4 bg-gradient-to-r from-blue-50 to-teal-50 rounded-t-lg">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#1E40AF] flex items-center justify-center text-xl">👤</div>
              <div>
                <CardTitle className="text-lg text-gray-800">Tu perfil médico</CardTitle>
                <CardDescription>Esta información aparecerá en tus recetas y facturas</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-gray-700">Nombre <span className="text-red-400">*</span></Label>
                <Input id="firstName" name="firstName" value={profile.firstName} onChange={handleProfileChange} placeholder="Juan" className="border-gray-200 focus:border-[#1E40AF]" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-gray-700">Apellido <span className="text-red-400">*</span></Label>
                <Input id="lastName" name="lastName" value={profile.lastName} onChange={handleProfileChange} placeholder="García" className="border-gray-200 focus:border-[#1E40AF]" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cedula" className="text-gray-700">Cédula de identidad <span className="text-red-400">*</span></Label>
              <Input id="cedula" name="cedula" value={profile.cedula} onChange={handleProfileChange} placeholder="1234567890" maxLength={10} className="border-gray-200 focus:border-[#1E40AF]" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="speciality" className="text-gray-700">Especialidad <span className="text-red-400">*</span></Label>
              <select
                id="speciality" name="speciality" value={profile.speciality} onChange={handleProfileChange}
                className="flex h-10 w-full rounded-md border border-gray-200 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:ring-offset-1"
                required
              >
                <option value="">Selecciona tu especialidad...</option>
                {SPECIALITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="senescytRegistration" className="text-gray-700">
                  Registro SENESCYT <span className="text-gray-400 font-normal">(opcional)</span>
                </Label>
                <Input id="senescytRegistration" name="senescytRegistration" value={profile.senescytRegistration} onChange={handleProfileChange} placeholder="1020-2015-1234567" className="border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-gray-700">
                  Teléfono <span className="text-gray-400 font-normal">(opcional)</span>
                </Label>
                <Input id="phone" name="phone" type="tel" value={profile.phone} onChange={handleProfileChange} placeholder="0991234567" className="border-gray-200" />
              </div>
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}
            <Button
              onClick={submitProfile}
              className="w-full h-11 bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold shadow-md shadow-blue-200 transition-all"
              disabled={loading || !profile.firstName || !profile.lastName || !profile.cedula || !profile.speciality}
            >
              {loading ? (
                <span className="flex items-center space-x-2"><span className="animate-spin">⟳</span><span>Guardando...</span></span>
              ) : 'Continuar →'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <Card className="shadow-xl border-0 bg-white">
          <CardHeader className="pb-4 bg-gradient-to-r from-blue-50 to-teal-50 rounded-t-lg">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#0D9488] flex items-center justify-center text-xl">🏥</div>
              <div>
                <CardTitle className="text-lg text-gray-800">Tu consultorio</CardTitle>
                <CardDescription>Elige un nombre y subdominio único</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tenantName" className="text-gray-700">Nombre del consultorio <span className="text-red-400">*</span></Label>
              <Input
                id="tenantName" value={tenant.name} onChange={handleTenantNameChange}
                placeholder="Consultorio Dr. García" className="border-gray-200 focus:border-[#1E40AF] h-11 text-base" required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tenantSlug" className="text-gray-700">Tu URL en MediCore <span className="text-red-400">*</span></Label>
              <div className="flex items-center rounded-md border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#1E40AF] focus-within:ring-offset-1">
                <span className="px-3 py-2.5 bg-gray-50 text-gray-400 text-sm border-r border-gray-200 whitespace-nowrap">medicore.ec/</span>
                <input
                  id="tenantSlug"
                  value={tenant.slug}
                  onChange={handleSlugChange}
                  onBlur={checkSlug}
                  placeholder="dr-garcia"
                  minLength={3}
                  maxLength={63}
                  className="flex-1 px-3 py-2.5 text-sm outline-none bg-white"
                />
              </div>
              {checkingSlug && <p className="text-xs text-gray-400 flex items-center space-x-1"><span className="animate-spin inline-block">⟳</span><span>Verificando...</span></p>}
              {slugAvailable === true && (
                <p className="text-xs text-[#0D9488] flex items-center space-x-1">
                  <span>✓</span><span>Disponible — tu URL será <strong>{tenant.slug}.medicore.ec</strong></span>
                </p>
              )}
              {slugAvailable === false && (
                <p className="text-xs text-red-500 flex items-center space-x-1"><span>✗</span><span>No disponible, elige otro nombre</span></p>
              )}
              <p className="text-xs text-gray-400">Solo letras minúsculas, números y guiones. Mínimo 3 caracteres.</p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="flex space-x-3 pt-2">
              <Button variant="outline" onClick={() => { setStep(1); setError(null); }} className="flex-1 h-11 border-gray-200">
                ← Atrás
              </Button>
              <Button
                onClick={submitTenant}
                className="flex-[2] h-11 bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold shadow-md shadow-blue-200"
                disabled={loading || !tenant.name || tenant.slug.length < 3}
              >
                {loading ? (
                  <span className="flex items-center space-x-2"><span className="animate-spin">⟳</span><span>Creando...</span></span>
                ) : 'Crear consultorio →'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <Card className="shadow-xl border-0 bg-white overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-[#1E40AF] to-[#0D9488]" />
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-teal-50 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
              <span className="text-4xl">🎉</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Bienvenido a MediCore!</h2>
            <p className="text-gray-500 mb-6">
              Tu consultorio <strong className="text-gray-700">{tenant.name}</strong> está listo en<br/>
              <a href={`https://${createdSlug}.medicore.ec`} target="_blank" rel="noopener noreferrer"
                className="text-[#1E40AF] font-medium hover:underline">
                {createdSlug}.medicore.ec
              </a>
            </p>

            <div className="grid grid-cols-3 gap-3 mb-7 max-w-xs mx-auto">
              {[
                { icon: '✓', text: 'Perfil médico' },
                { icon: '✓', text: 'Consultorio creado' },
                { icon: '✓', text: 'Plan Free activo' },
              ].map(item => (
                <div key={item.text} className="flex flex-col items-center p-3 bg-teal-50 rounded-xl">
                  <span className="text-[#0D9488] font-bold text-sm">{item.icon}</span>
                  <span className="text-xs text-gray-600 mt-1 text-center leading-tight">{item.text}</span>
                </div>
              ))}
            </div>

            <Button
              onClick={goToDashboard}
              className="w-full max-w-xs h-12 bg-gradient-to-r from-[#1E40AF] to-[#0D9488] hover:from-[#1e3a8a] hover:to-[#0f766e] text-white font-semibold text-base shadow-lg shadow-blue-200 transition-all"
            >
              Ir a mi dashboard →
            </Button>
            <p className="text-xs text-gray-400 mt-3">Configura facturación SRI desde Configuración</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
