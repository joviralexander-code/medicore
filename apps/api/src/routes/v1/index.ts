import { Router } from 'express';
import { authMiddleware, requireTenant } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';
import { patientsRouter } from './patients';
import { consultations_Router as consultationsRouter } from './consultations';
import { appointments_Router as appointmentsRouter } from './appointments';
import { sri_Router as sriRouter } from './sri';
import { prescriptions_Router as prescriptionsRouter } from './prescriptions';
import { pharmacy_Router as pharmacyRouter } from './pharmacy';
import { finances_Router as financesRouter } from './finances';
import { social_Router as socialRouter } from './social';
import { whatsapp_Router as whatsappRouter } from './whatsapp';
import { aiRouter } from './ai';
import { tenant_Router as tenantRouter } from './tenant';
import { authRouter } from './auth';
import { dataBusiness_Router as dataBusinessRouter } from './data-business';

export const v1Router = Router();

// -------------------------------------------------------
// Rutas públicas (sin auth)
// -------------------------------------------------------
v1Router.use('/auth', authRouter);
v1Router.use('/tenant', tenantRouter); // Para verificar slug disponible

// -------------------------------------------------------
// Rutas protegidas (requieren JWT + tenant)
// -------------------------------------------------------
const protected_ = Router();
protected_.use(authMiddleware, requireTenant, tenantMiddleware);

protected_.use('/patients', patientsRouter);
protected_.use('/consultations', consultationsRouter);
protected_.use('/appointments', appointmentsRouter);
protected_.use('/billing', sriRouter);
protected_.use('/prescriptions', prescriptionsRouter);
protected_.use('/pharmacy', pharmacyRouter);
protected_.use('/finances', financesRouter);
protected_.use('/social', socialRouter);
protected_.use('/whatsapp', whatsappRouter);
protected_.use('/ai', aiRouter);
protected_.use('/data-business', dataBusinessRouter);

v1Router.use(protected_);
