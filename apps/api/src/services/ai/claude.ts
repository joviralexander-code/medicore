/**
 * Cliente Claude AI para PlexoMed
 * Modelo: claude-sonnet-4-20250514
 * Todos los casos de uso médicos pasan por este servicio
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-20250514' as const;

export interface ClaudeResponse<T = unknown> {
  content: T;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Llamada base a Claude con respuesta JSON
 * Todos los prompts médicos deben incluir contexto del médico (especialidad + país)
 */
export async function callClaude<T = unknown>(
  prompt: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    system?: string;
  } = {}
): Promise<ClaudeResponse<T>> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.3,
    ...(options.system !== undefined ? { system: options.system } : {}),
    messages: [
      { role: 'user', content: prompt },
    ],
  });

  const textContent = message.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('Claude no retornó contenido de texto');
  }

  // Intentar parsear JSON
  let parsed: T;
  try {
    // Extraer JSON del markdown code block si está envuelto
    const jsonMatch = /```json\n?([\s\S]*?)\n?```/.exec(textContent.text);
    const jsonStr = jsonMatch?.[1] ?? textContent.text;
    parsed = JSON.parse(jsonStr) as T;
  } catch {
    // Si no es JSON válido, retornar como string
    parsed = textContent.text as unknown as T;
  }

  return {
    content: parsed,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}

/**
 * Streaming para chatbot WhatsApp
 */
export async function streamClaude(
  prompt: string,
  onChunk: (text: string) => void,
  options: { system?: string; maxTokens?: number } = {}
): Promise<void> {
  const stream = await anthropic.messages.create({
    model: MODEL,
    max_tokens: options.maxTokens ?? 512,
    ...(options.system !== undefined ? { system: options.system } : {}),
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      onChunk(event.delta.text);
    }
  }
}
