/**
 * Prompt para sugerencia de diagnósticos CIE-10 desde síntomas
 * El contexto del médico (especialidad + país) es obligatorio
 */

export interface Cie10SuggestContext {
  doctorSpeciality: string;
  country: string;  // 'Ecuador'
}

export function buildCie10SuggestPrompt(
  symptoms: string,
  context: Cie10SuggestContext
): string {
  return `Eres un asistente médico de apoyo diagnóstico para un médico ${context.doctorSpeciality} en ${context.country}.

El médico describe los siguientes síntomas del paciente:
"""
${symptoms}
"""

Basándote en los síntomas descritos, sugiere hasta 5 diagnósticos posibles en formato CIE-10, ordenados de mayor a menor probabilidad.

Para cada diagnóstico indica:
1. Código CIE-10 exacto (ej: J00, A09.0)
2. Nombre del diagnóstico en español
3. Tipo: "definitivo", "presuntivo" o "descartable"
4. Brevísima justificación (máx 1 línea)

Responde ÚNICAMENTE en JSON válido con este esquema:
{
  "sugerencias": [
    {
      "cie10_code": "string",
      "description": "string",
      "type": "definitivo" | "presuntivo" | "descartable",
      "justificacion": "string"
    }
  ]
}

Importante:
- No incluyas datos del paciente en tu respuesta
- Solo sugiere, el diagnóstico final es responsabilidad exclusiva del médico
- Si los síntomas son insuficientes, sugiere los más probables con type="presuntivo"`;
}
