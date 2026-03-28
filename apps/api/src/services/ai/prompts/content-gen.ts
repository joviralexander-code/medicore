/**
 * Prompts para generación de contenido médico para redes sociales
 */

export interface ContentGenContext {
  doctorSpeciality: string;
  doctorName?: string;
  country: string;
}

export function buildContentGenPrompt(
  mode: 'mejorar_texto' | 'desde_tema' | 'plantilla',
  input: string,
  context: ContentGenContext,
  platform: 'instagram' | 'facebook' | 'tiktok' | 'linkedin' = 'instagram'
): string {
  const platformGuide: Record<string, string> = {
    instagram: 'Instagram: máx 2200 caracteres, usa emojis con moderación, hashtags al final (5-10)',
    facebook: 'Facebook: tono más conversacional, puede ser más largo, 1-3 hashtags',
    tiktok: 'TikTok: muy breve y dinámico, hooks fuertes, hashtags trending',
    linkedin: 'LinkedIn: tono profesional, sin emojis excesivos, valor educativo, 3-5 hashtags',
  };

  const platformInstructions = platformGuide[platform] ?? platformGuide['instagram'];

  const baseContext = `Eres un experto en marketing médico digital para el Dr./Dra. especialista en ${context.doctorSpeciality} en ${context.country}.

Plataforma objetivo: ${platform}
Guía de formato: ${platformInstructions}

Principios:
- Contenido educativo, nunca alarmista
- Lenguaje accesible para pacientes, no jerga médica excesiva
- Incluir call-to-action sutil (consulta, pregunta, etc.)
- Nunca incluir casos clínicos de pacientes reales
- Cumplir con ética médica`;

  if (mode === 'mejorar_texto') {
    return `${baseContext}

El médico ha escrito el siguiente borrador para ${platform}:
"""
${input}
"""

Mejora este texto para ${platform}:
1. Hazlo más atractivo y fácil de leer
2. Agrega estructura (emojis, espacios) apropiada para la plataforma
3. Sugiere hashtags relevantes
4. Mantén el mensaje original del médico

Responde en JSON:
{
  "caption": "texto mejorado completo",
  "hashtags": ["hashtag1", "hashtag2"],
  "suggestions": ["sugerencia1", "sugerencia2"]
}`;
  }

  if (mode === 'desde_tema') {
    return `${baseContext}

El médico quiere crear una publicación sobre este tema:
"""
${input}
"""

Genera una publicación completa para ${platform} sobre este tema médico.
Incluye datos relevantes, consejos prácticos y call-to-action.

Responde en JSON:
{
  "caption": "publicación completa",
  "hashtags": ["hashtag1", "hashtag2"],
  "alt_versions": ["versión alternativa más corta"]
}`;
  }

  // mode === 'plantilla'
  return `${baseContext}

Tipo de plantilla solicitada: "${input}"

Genera 3 variaciones de plantillas reutilizables para ${platform} de este tipo.
Usa [PLACEHOLDER] para contenido que el médico debe personalizar.

Responde en JSON:
{
  "templates": [
    {
      "name": "nombre de la plantilla",
      "caption": "plantilla con [PLACEHOLDERS]",
      "hashtags": ["hashtag1"],
      "use_case": "cuándo usar esta plantilla"
    }
  ]
}`;
}
