/**
 * Verificación de k-anonimidad para exportaciones de datos
 * k mínimo = 5 (ningún grupo de atributos cuasi-identificadores
 * puede identificar a menos de 5 individuos)
 */

export const K_MIN = 5;

export interface AnonRecord {
  age_group: string;      // ej. "30-39"
  sex: string;            // "M" | "F" | "otro"
  province: string;
  diagnosis_category: string;  // Primer carácter del CIE-10 (ej. "J")
  consultation_type: string;
}

/**
 * Agrupa registros por sus quasi-identificadores y verifica k-anonimidad
 * Retorna los grupos que cumplen k >= K_MIN
 */
export function applyKAnonymity(records: AnonRecord[]): {
  valid: boolean;
  safeRecords: AnonRecord[];
  suppressedCount: number;
  k: number;
} {
  // Group by quasi-identifiers
  const groups = new Map<string, AnonRecord[]>();

  for (const rec of records) {
    const key = [
      rec.age_group,
      rec.sex,
      rec.province,
      rec.diagnosis_category,
    ].join('|');

    const group = groups.get(key) ?? [];
    group.push(rec);
    groups.set(key, group);
  }

  const safeRecords: AnonRecord[] = [];
  let suppressedCount = 0;
  let minGroupSize = Infinity;

  for (const [, group] of groups) {
    if (group.length >= K_MIN) {
      safeRecords.push(...group);
      minGroupSize = Math.min(minGroupSize, group.length);
    } else {
      suppressedCount += group.length;
    }
  }

  const k = minGroupSize === Infinity ? 0 : minGroupSize;

  return {
    valid: suppressedCount === 0 && k >= K_MIN,
    safeRecords,
    suppressedCount,
    k,
  };
}

/**
 * Convierte edad en años a grupo etario
 */
export function toAgeGroup(birthDate: string | null): string {
  if (!birthDate) return 'desconocido';
  const birth = new Date(birthDate);
  const age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (age < 10) return '0-9';
  if (age < 20) return '10-19';
  if (age < 30) return '20-29';
  if (age < 40) return '30-39';
  if (age < 50) return '40-49';
  if (age < 60) return '50-59';
  if (age < 70) return '60-69';
  return '70+';
}

/**
 * Elimina PII de un registro de consulta
 */
export function anonymizeConsultation(raw: Record<string, unknown>): AnonRecord {
  const patient = raw['patients'] as Record<string, string | null> | null;
  const diagnoses = raw['diagnoses'] as Array<{ cie10_code?: string }> | null;

  const firstDx = diagnoses?.[0]?.['cie10_code'] ?? '';

  return {
    age_group: toAgeGroup(patient?.['birth_date'] ?? null),
    sex: (patient?.['sex'] as string | undefined) ?? 'otro',
    province: (patient?.['province'] as string | undefined) ?? 'desconocido',
    diagnosis_category: firstDx.charAt(0).toUpperCase() || 'otro',
    consultation_type: (raw['consultation_type'] as string | undefined) ?? 'desconocido',
  };
}
