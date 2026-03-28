/**
 * Middleware de autenticación
 * Verifica el JWT de Supabase usando supabaseAdmin.auth.getUser()
 * y extrae userId, tenantId, role desde los claims inyectados por el Custom Access Token Hook
 */

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';

export interface AuthUser {
  userId: string;
  tenantId: string | null;
  role: 'admin' | 'secretaria' | 'paciente';
  email: string | null;
  onboardingRequired: boolean;
  jwt: string;
}

declare global {
  namespace Express {
    interface Request {
      auth: AuthUser;
    }
  }
}

const validRoles = ['admin', 'secretaria', 'paciente'] as const;
type ValidRole = typeof validRoles[number];

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado — token requerido' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // Validate token via Supabase Auth API (no JWT secret needed)
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error ?? !user) {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }

    // Decode JWT payload to read custom claims injected by Custom Access Token Hook
    // Already validated by supabaseAdmin.auth.getUser — safe to decode without re-verify
    const parts = token.split('.');
    const payloadB64 = parts[1];
    if (!payloadB64) {
      res.status(401).json({ error: 'Token malformado' });
      return;
    }

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8')
    ) as Record<string, unknown>;

    // Custom Access Token Hook injects `user_role` (NOT `role`) and `tenant_id`
    const userRole = (payload['user_role'] as string | undefined) ?? 'paciente';

    req.auth = {
      userId: user.id,
      tenantId: (payload['tenant_id'] as string | null) ?? null,
      role: (validRoles.includes(userRole as ValidRole) ? userRole : 'paciente') as ValidRole,
      email: user.email ?? null,
      onboardingRequired: (payload['onboarding_required'] as boolean | undefined) ?? false,
      jwt: token,
    };

    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

/**
 * Guard para requerir onboarding completo (tenant_id presente)
 */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth.tenantId) {
    res.status(403).json({
      error: 'Onboarding requerido',
      code: 'ONBOARDING_REQUIRED',
    });
    return;
  }
  next();
}
