/**
 * Middleware de tenant
 * Inyecta el cliente Supabase autenticado con el JWT del usuario
 * (respeta RLS automáticamente)
 */

import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUserClient } from '../config/supabase';

declare global {
  namespace Express {
    interface Request {
      supabase: SupabaseClient;
      tenantId: string;
    }
  }
}

/**
 * Inyecta req.supabase (cliente con JWT del usuario — respeta RLS)
 * y req.tenantId
 *
 * Debe usarse después de authMiddleware y requireTenant
 */
export function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { tenantId, jwt } = req.auth;

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant no configurado' });
    return;
  }

  // req.supabase respeta RLS — tenant aislado automáticamente
  req.supabase = createUserClient(jwt);
  req.tenantId = tenantId;

  next();
}
