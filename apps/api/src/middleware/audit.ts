/**
 * Middleware de auditoría para compliance LOPDP
 * Registra acceso a datos PHI/PII
 * NUNCA loguear el contenido de los datos, solo los metadatos
 */

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';

interface AuditOptions {
  action: string;
  resourceType: string;
  getResourceId?: (req: Request) => string | undefined;
  getChangedFields?: (req: Request) => string[];
}

/**
 * Crea un middleware de auditoría para una ruta específica
 *
 * @example
 * router.get('/:id',
 *   audit({ action: 'patient.read', resourceType: 'patients', getResourceId: r => r.params.id }),
 *   handler
 * )
 */
export function audit(options: AuditOptions) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Continuar con la request inmediatamente
    next();

    // Loguear en background (no bloqueante)
    // Capturar datos ANTES de que la respuesta se complete
    const { userId, tenantId, role } = req.auth ?? {};

    // NUNCA incluir body (puede contener PHI)
    void supabaseAdmin.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: userId,
      user_role: role,
      action: options.action,
      resource_type: options.resourceType,
      resource_id: options.getResourceId?.(req),
      changed_fields: options.getChangedFields?.(req),
      metadata: {
        method: req.method,
        path: req.path,
        query: sanitizeQuery(req.query as Record<string, string>),
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    }).catch((err: unknown) => {
      console.error('[AUDIT] Error escribiendo audit log:', err instanceof Error ? err.message : String(err));
    });
  };
}

/**
 * Sanitiza query params para auditoría — elimina valores potencialmente sensibles
 */
function sanitizeQuery(query: Record<string, string>): Record<string, string> {
  const sensitiveKeys = ['cedula', 'ruc', 'email', 'phone', 'telefono', 'password'];
  return Object.fromEntries(
    Object.entries(query).map(([k, v]) => [
      k,
      sensitiveKeys.some((sk) => k.toLowerCase().includes(sk)) ? '[REDACTED]' : v,
    ])
  );
}
