export const USER_ROLES = ['admin', 'secretaria', 'paciente'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Permisos por módulo y rol */
export const ROLE_PERMISSIONS = {
  admin: {
    patients: ['read', 'write', 'delete'],
    consultations: ['read', 'write', 'delete'],
    appointments: ['read', 'write', 'delete'],
    billing: ['read', 'write', 'delete'],
    prescriptions: ['read', 'write', 'delete'],
    finances: ['read', 'write', 'delete'],
    pharmacy: ['read'],
    social: ['read', 'write', 'delete'],
    whatsapp: ['read', 'write'],
    settings: ['read', 'write'],
    reports: ['read'],
  },
  secretaria: {
    patients: ['read', 'write'],
    consultations: ['read'],
    appointments: ['read', 'write', 'delete'],
    billing: ['read', 'write'],
    prescriptions: ['read'],
    finances: [],
    pharmacy: ['read'],
    social: [],
    whatsapp: ['read', 'write'],
    settings: [],
    reports: [],
  },
  paciente: {
    patients: ['read'], // solo propio
    consultations: ['read'], // solo propias
    appointments: ['read', 'write'], // solo propias via portal
    billing: ['read'], // solo propias facturas
    prescriptions: ['read'], // solo propias
    finances: [],
    pharmacy: [],
    social: [],
    whatsapp: [],
    settings: [],
    reports: [],
  },
} as const;
