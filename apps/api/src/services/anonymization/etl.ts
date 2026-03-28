/**
 * Pipeline ETL LOPDP-compliant para Data Business
 * Extrae, anonimiza y valida k-anonimidad antes de exportar
 */

import { supabaseAdmin } from '../../config/supabase';
import { anonymizeConsultation, applyKAnonymity, type AnonRecord } from './k-anonymity';

export interface EtlFilters {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  consultationType?: string;
}

export interface EtlResult {
  records: AnonRecord[];
  totalRaw: number;
  totalSafe: number;
  suppressedCount: number;
  k: number;
  valid: boolean;
}

/**
 * Extrae consultas del tenant, anonimiza y aplica k-anonimidad
 * Retorna solo registros seguros (k >= 5)
 */
export async function runEtlPipeline(filters: EtlFilters): Promise<EtlResult> {
  let query = supabaseAdmin
    .from('consultations')
    .select(`
      consultation_type,
      consultation_date,
      diagnoses,
      patients(birth_date, sex, province)
    `)
    .eq('tenant_id', filters.tenantId)
    .eq('is_signed', true)  // Only signed consultations
    .gte('consultation_date', filters.dateFrom)
    .lte('consultation_date', filters.dateTo);

  if (filters.consultationType) {
    query = query.eq('consultation_type', filters.consultationType);
  }

  const { data, error } = await query;

  if (error) throw new Error(`ETL extraction error: ${error.message}`);

  const raw = (data ?? []) as Array<Record<string, unknown>>;

  // Anonymize each record
  const anonRecords: AnonRecord[] = raw.map(anonymizeConsultation);

  // Apply k-anonymity
  const { valid, safeRecords, suppressedCount, k } = applyKAnonymity(anonRecords);

  return {
    records: safeRecords,
    totalRaw: raw.length,
    totalSafe: safeRecords.length,
    suppressedCount,
    k,
    valid,
  };
}

/**
 * Genera CSV desde registros anonimizados
 */
export function toCSV(records: AnonRecord[]): string {
  if (records.length === 0) return '';

  const headers = ['age_group', 'sex', 'province', 'diagnosis_category', 'consultation_type'];
  const rows = records.map((r) =>
    headers.map((h) => `"${(r[h as keyof AnonRecord] ?? '').toString().replace(/"/g, '""')}"`).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Genera resumen estadístico agregado (sin registros individuales)
 */
export function toAggregated(records: AnonRecord[]): Record<string, unknown> {
  const byAgeGroup: Record<string, number> = {};
  const bySex: Record<string, number> = {};
  const byProvince: Record<string, number> = {};
  const byDiagnosis: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const r of records) {
    byAgeGroup[r.age_group] = (byAgeGroup[r.age_group] ?? 0) + 1;
    bySex[r.sex] = (bySex[r.sex] ?? 0) + 1;
    byProvince[r.province] = (byProvince[r.province] ?? 0) + 1;
    byDiagnosis[r.diagnosis_category] = (byDiagnosis[r.diagnosis_category] ?? 0) + 1;
    byType[r.consultation_type] = (byType[r.consultation_type] ?? 0) + 1;
  }

  return {
    totalRecords: records.length,
    byAgeGroup,
    bySex,
    byProvince,
    byDiagnosisCategory: byDiagnosis,
    byConsultationType: byType,
  };
}
