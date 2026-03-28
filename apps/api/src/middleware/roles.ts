/**
 * Middleware de control de roles
 * Verifica que el usuario tenga el rol requerido
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthUser } from './auth';

type Role = AuthUser['role'];

/**
 * Requiere que el usuario tenga uno de los roles especificados
 * Se usa después de authMiddleware
 *
 * @example
 * router.get('/finances', requireRole('admin'), handler)
 * router.get('/patients', requireRole('admin', 'secretaria'), handler)
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    if (!roles.includes(req.auth.role)) {
      res.status(403).json({
        error: 'No tienes permisos para realizar esta acción',
        required: roles,
        current: req.auth.role,
      });
      return;
    }

    next();
  };
}

/** Shorthand para rutas solo de admin */
export const adminOnly = requireRole('admin');

/** Shorthand para rutas de staff (admin + secretaria) */
export const staffOnly = requireRole('admin', 'secretaria');
