'use client';

import { useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExistingPatient {
  id: string;
  first_name: string;
  last_name: string;
  cedula_type: string | null;
  cedula: string | null;
  birth_date: string | null;
  sex: string | null;
  civil_status: string | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  blood_type: string | null;
  allergies: string[] | null;
  chronic_conditions: string[] | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  insurance_type: string | null;
  insurance_number: string | null;
  insurance_company: string | null;
  insurance_coverage_pct: number | null;
  data_consent: boolean;
  marketing_consent: boolean | null;
}

interface PatientFormProps {
  slug: string;
  tenantId: string;
  patient?: ExistingPatient;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ECUADOR_PROVINCES = [
  'Azuay', 'Bolívar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi',
  'El Oro', 'Esmeraldas', 'Galápagos', 'Guayas', 'Imbabura', 'Loja',
  'Los Ríos', 'Manabí', 'Morona Santiago', 'Napo', 'Orellana', 'Pastaza',
  'Pichincha', 'Santa Elena', 'Santo Domingo de los Tsáchilas', 'Sucumbíos',
  'Tungurahua', 'Zamora Chinchipe',
];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'desconocido'];

// ---------------------------------------------------------------------------
// Sub-component: TagsInput
// ---------------------------------------------------------------------------

interface TagsInputProps {
  id: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

function TagsInput({ id, tags, onChange, placeholder }: TagsInputProps) {
  const [inputValue, setInputValue] = useState('');

  function addTag(value: string) {
    const trimmed = value.trim().replace(/,$/, '').trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function handleChange(value: string) {
    if (value.endsWith(',')) {
      addTag(value);
    } else {
      setInputValue(value);
    }
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div className="min-h-[42px] flex flex-wrap gap-1.5 items-center border border-input rounded-md px-3 py-2 bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {tags.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="ml-0.5 text-blue-600 hover:text-blue-900 leading-none"
            aria-label={`Eliminar ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={inputValue}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] outline-none text-sm bg-transparent placeholder:text-muted-foreground"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PatientForm({ slug, tenantId, patient }: PatientFormProps) {
  const router = useRouter();
  const isEditing = Boolean(patient);

  // --- Datos personales ---
  const [firstName, setFirstName] = useState(patient?.first_name ?? '');
  const [lastName, setLastName] = useState(patient?.last_name ?? '');
  const [cedulaType, setCedulaType] = useState(patient?.cedula_type ?? 'cedula');
  const [cedula, setCedula] = useState(patient?.cedula ?? '');
  const [birthDate, setBirthDate] = useState(patient?.birth_date ?? '');
  const [sex, setSex] = useState(patient?.sex ?? '');
  const [civilStatus, setCivilStatus] = useState(patient?.civil_status ?? '');
  const [nationality, setNationality] = useState(patient?.nationality ?? 'Ecuatoriana');

  // --- Contacto ---
  const [phone, setPhone] = useState(patient?.phone ?? '');
  const [email, setEmail] = useState(patient?.email ?? '');
  const [address, setAddress] = useState(patient?.address ?? '');
  const [province, setProvince] = useState(patient?.province ?? '');
  const [city, setCity] = useState(patient?.city ?? '');

  // --- Datos médicos ---
  const [bloodType, setBloodType] = useState(patient?.blood_type ?? '');
  const [allergies, setAllergies] = useState<string[]>(patient?.allergies ?? []);
  const [chronicConditions, setChronicConditions] = useState<string[]>(
    patient?.chronic_conditions ?? []
  );
  const [emergencyContactName, setEmergencyContactName] = useState(
    patient?.emergency_contact_name ?? ''
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    patient?.emergency_contact_phone ?? ''
  );

  // --- Seguro médico ---
  const [insuranceType, setInsuranceType] = useState(patient?.insurance_type ?? 'ninguno');
  const [insuranceNumber, setInsuranceNumber] = useState(patient?.insurance_number ?? '');
  const [insuranceCompany, setInsuranceCompany] = useState(patient?.insurance_company ?? '');
  const [insuranceCoveragePct, setInsuranceCoveragePct] = useState<string>(
    patient?.insurance_coverage_pct != null ? String(patient.insurance_coverage_pct) : ''
  );

  // --- Consentimiento ---
  const [dataConsent, setDataConsent] = useState(patient?.data_consent ?? false);
  const [marketingConsent, setMarketingConsent] = useState(patient?.marketing_consent ?? false);

  // --- UI state ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!dataConsent) {
      setError('El consentimiento de datos (LOPDP) es obligatorio para registrar el paciente.');
      return;
    }

    setLoading(true);

    const payload = {
      first_name: firstName,
      last_name: lastName,
      cedula_type: cedulaType || null,
      cedula: cedula || null,
      birth_date: birthDate || null,
      sex: sex || null,
      civil_status: civilStatus || null,
      nationality: nationality || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      province: province || null,
      city: city || null,
      blood_type: bloodType || null,
      allergies: allergies,
      chronic_conditions: chronicConditions,
      emergency_contact_name: emergencyContactName || null,
      emergency_contact_phone: emergencyContactPhone || null,
      insurance_type: insuranceType || null,
      insurance_number: insuranceNumber || null,
      insurance_company: insuranceCompany || null,
      insurance_coverage_pct: insuranceCoveragePct !== '' ? Number(insuranceCoveragePct) : null,
      data_consent: dataConsent,
      marketing_consent: marketingConsent,
    };

    const supabase = createClient();

    try {
      if (isEditing && patient) {
        const { data, error: updateError } = await supabase
          .from('patients')
          .update(payload)
          .eq('id', patient.id)
          .select('id')
          .single();

        if (updateError) throw updateError;
        router.push(`/app/${slug}/patients/${data.id}`);
      } else {
        const { data, error: insertError } = await supabase
          .from('patients')
          .insert({ ...payload, tenant_id: tenantId })
          .select('id')
          .single();

        if (insertError) throw insertError;
        router.push(`/app/${slug}/patients/${data.id}`);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err);
      setError(message);
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const sectionClass = 'bg-white rounded-xl border shadow-sm overflow-hidden';
  const sectionHeaderClass =
    'px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]';
  const sectionTitleClass = 'font-semibold text-white text-sm tracking-wide';
  const sectionBodyClass = 'p-6 grid grid-cols-1 gap-5 sm:grid-cols-2';
  const fieldClass = 'space-y-1.5';
  const labelClass = 'text-sm font-medium text-gray-700';
  const inputClass =
    'h-10 border-gray-200 focus:border-[#1E40AF] bg-gray-50 focus:bg-white transition-colors text-sm';
  const selectClass =
    'flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors';

  function RequiredMark() {
    return <span className="text-red-500 ml-0.5">*</span>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Datos personales                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>👤 Datos personales</p>
        </div>
        <div className={sectionBodyClass}>
          <div className={fieldClass}>
            <Label htmlFor="first_name" className={labelClass}>
              Nombre(s)<RequiredMark />
            </Label>
            <Input
              id="first_name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              placeholder="Juan Carlos"
              className={inputClass}
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="last_name" className={labelClass}>
              Apellido(s)<RequiredMark />
            </Label>
            <Input
              id="last_name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              placeholder="García López"
              className={inputClass}
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="cedula_type" className={labelClass}>
              Tipo de documento
            </Label>
            <select
              id="cedula_type"
              value={cedulaType}
              onChange={(e) => setCedulaType(e.target.value)}
              className={selectClass}
            >
              <option value="cedula">Cédula</option>
              <option value="pasaporte">Pasaporte</option>
              <option value="ruc">RUC</option>
            </select>
          </div>

          <div className={fieldClass}>
            <Label htmlFor="cedula" className={labelClass}>
              Número de documento
            </Label>
            <Input
              id="cedula"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              placeholder="1712345678"
              className={inputClass}
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="birth_date" className={labelClass}>
              Fecha de nacimiento
            </Label>
            <Input
              id="birth_date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="sex" className={labelClass}>
              Sexo
            </Label>
            <select
              id="sex"
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className={selectClass}
            >
              <option value="">— Seleccionar —</option>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div className={fieldClass}>
            <Label htmlFor="civil_status" className={labelClass}>
              Estado civil
            </Label>
            <select
              id="civil_status"
              value={civilStatus}
              onChange={(e) => setCivilStatus(e.target.value)}
              className={selectClass}
            >
              <option value="">— Seleccionar —</option>
              <option value="soltero">Soltero/a</option>
              <option value="casado">Casado/a</option>
              <option value="divorciado">Divorciado/a</option>
              <option value="viudo">Viudo/a</option>
              <option value="unión libre">Unión libre</option>
            </select>
          </div>

          <div className={fieldClass}>
            <Label htmlFor="nationality" className={labelClass}>
              Nacionalidad
            </Label>
            <Input
              id="nationality"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              placeholder="Ecuatoriana"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Contacto                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>📞 Contacto</p>
        </div>
        <div className={sectionBodyClass}>
          <div className={fieldClass}>
            <Label htmlFor="phone" className={labelClass}>Teléfono</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0991234567"
              className={inputClass}
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="email" className={labelClass}>Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="paciente@ejemplo.com"
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="address" className={labelClass}>Dirección</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Av. Amazonas N21-147 y Roca"
              className={inputClass}
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="province" className={labelClass}>Provincia</Label>
            <select
              id="province"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className={selectClass}
            >
              <option value="">— Seleccionar —</option>
              {ECUADOR_PROVINCES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className={fieldClass}>
            <Label htmlFor="city" className={labelClass}>Ciudad</Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Quito"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Datos médicos                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>🩺 Datos médicos</p>
        </div>
        <div className={sectionBodyClass}>
          <div className={fieldClass}>
            <Label htmlFor="blood_type" className={labelClass}>Tipo de sangre</Label>
            <select
              id="blood_type"
              value={bloodType}
              onChange={(e) => setBloodType(e.target.value)}
              className={selectClass}
            >
              <option value="">— Seleccionar —</option>
              {BLOOD_TYPES.map((bt) => (
                <option key={bt} value={bt}>{bt}</option>
              ))}
            </select>
          </div>

          <div className={fieldClass}>
            <Label htmlFor="emergency_contact_name" className={labelClass}>
              Contacto de emergencia
            </Label>
            <Input
              id="emergency_contact_name"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              placeholder="María García"
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="allergies" className={labelClass}>
              Alergias
              <span className="ml-2 text-xs font-normal text-gray-400">
                (Enter o coma para agregar)
              </span>
            </Label>
            <TagsInput
              id="allergies"
              tags={allergies}
              onChange={setAllergies}
              placeholder="Penicilina, látex..."
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="chronic_conditions" className={labelClass}>
              Condiciones crónicas
              <span className="ml-2 text-xs font-normal text-gray-400">
                (Enter o coma para agregar)
              </span>
            </Label>
            <TagsInput
              id="chronic_conditions"
              tags={chronicConditions}
              onChange={setChronicConditions}
              placeholder="Diabetes, hipertensión..."
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="emergency_contact_phone" className={labelClass}>
              Teléfono de emergencia
            </Label>
            <Input
              id="emergency_contact_phone"
              type="tel"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
              placeholder="0998765432"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Seguro médico                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>🏥 Seguro médico</p>
        </div>
        <div className={sectionBodyClass}>
          <div className={fieldClass}>
            <Label htmlFor="insurance_type" className={labelClass}>Tipo de seguro</Label>
            <select
              id="insurance_type"
              value={insuranceType}
              onChange={(e) => setInsuranceType(e.target.value)}
              className={selectClass}
            >
              <option value="ninguno">Ninguno</option>
              <option value="iess">IESS</option>
              <option value="issfa">ISSFA</option>
              <option value="isspol">ISSPOL</option>
              <option value="privado">Privado</option>
            </select>
          </div>

          <div className={fieldClass}>
            <Label htmlFor="insurance_number" className={labelClass}>Número de afiliado</Label>
            <Input
              id="insurance_number"
              value={insuranceNumber}
              onChange={(e) => setInsuranceNumber(e.target.value)}
              placeholder="001234567890"
              disabled={insuranceType === 'ninguno'}
              className={inputClass}
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="insurance_company" className={labelClass}>Compañía aseguradora</Label>
            <Input
              id="insurance_company"
              value={insuranceCompany}
              onChange={(e) => setInsuranceCompany(e.target.value)}
              placeholder="Seguros Equinoccial"
              disabled={insuranceType === 'ninguno'}
              className={inputClass}
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="insurance_coverage_pct" className={labelClass}>
              Cobertura (%)
            </Label>
            <Input
              id="insurance_coverage_pct"
              type="number"
              min={0}
              max={100}
              value={insuranceCoveragePct}
              onChange={(e) => setInsuranceCoveragePct(e.target.value)}
              placeholder="80"
              disabled={insuranceType === 'ninguno'}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Consentimiento LOPDP                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className={sectionClass}>
        <div className={sectionHeaderClass}>
          <p className={sectionTitleClass}>📋 Consentimiento LOPDP</p>
        </div>
        <div className="p-6 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={dataConsent}
              onChange={(e) => setDataConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#1E40AF] focus:ring-[#1E40AF]"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              El paciente consiente el almacenamiento y tratamiento de sus datos de salud (LOPDP Ecuador)
              <RequiredMark />
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#1E40AF] focus:ring-[#1E40AF]"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              El paciente consiente recibir comunicaciones de marketing y recordatorios (opcional)
            </span>
          </label>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Error + Submit                                                      */}
      {/* ------------------------------------------------------------------ */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/app/${slug}/patients`)}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold px-8"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⟳</span>
              {isEditing ? 'Guardando...' : 'Registrando...'}
            </span>
          ) : isEditing ? 'Guardar cambios' : 'Registrar paciente'}
        </Button>
      </div>
    </form>
  );
}
