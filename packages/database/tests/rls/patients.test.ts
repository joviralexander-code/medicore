/**
 * Tests de RLS para la tabla patients
 * OBLIGATORIO ejecutar: npm run test:rls
 * Antes de cualquier PR que toque DB
 */

import {
  supabaseAdmin,
  createClientWithRole,
  createTestTenant,
  createTestUser,
  cleanupTestData,
} from './helpers';

const TENANT_A_NAME = 'Test Tenant A';
const TENANT_B_NAME = 'Test Tenant B';

let tenantAId: string;
let tenantBId: string;
let adminAId: string;
let secretariaAId: string;
let adminBId: string;
let patientAId: string;
let patientBId: string;

beforeAll(async () => {
  // Crear dos tenants independientes
  tenantAId = await createTestTenant(TENANT_A_NAME);
  tenantBId = await createTestTenant(TENANT_B_NAME);

  // Crear usuarios en cada tenant
  adminAId = await createTestUser('admin-a@test.com', tenantAId, 'admin');
  secretariaAId = await createTestUser('secretaria-a@test.com', tenantAId, 'secretaria');
  adminBId = await createTestUser('admin-b@test.com', tenantBId, 'admin');

  // Crear pacientes en cada tenant
  const { data: pA } = await supabaseAdmin.from('patients').insert({
    tenant_id: tenantAId,
    first_name: 'Juan',
    last_name: 'Pérez',
    data_consent: true,
  }).select('id').single();
  patientAId = pA!.id as string;

  const { data: pB } = await supabaseAdmin.from('patients').insert({
    tenant_id: tenantBId,
    first_name: 'María',
    last_name: 'García',
    data_consent: true,
  }).select('id').single();
  patientBId = pB!.id as string;
});

afterAll(async () => {
  await cleanupTestData([tenantAId, tenantBId]);
});

describe('RLS: patients — aislamiento multi-tenant', () => {
  it('admin del tenant A puede leer pacientes del tenant A', async () => {
    const client = await createClientWithRole(adminAId, tenantAId, 'admin');
    const { data, error } = await client.from('patients').select('*');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((p: { tenant_id: string }) => p.tenant_id === tenantAId)).toBe(true);
  });

  it('admin del tenant A NO puede ver pacientes del tenant B', async () => {
    const client = await createClientWithRole(adminAId, tenantAId, 'admin');
    const { data } = await client
      .from('patients')
      .select('*')
      .eq('id', patientBId);

    // RLS filtra — devuelve array vacío, no error
    expect(data).toHaveLength(0);
  });

  it('secretaria puede leer pacientes del tenant', async () => {
    const client = await createClientWithRole(secretariaAId, tenantAId, 'secretaria');
    const { data, error } = await client.from('patients').select('id, first_name');

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('secretaria puede crear pacientes', async () => {
    const client = await createClientWithRole(secretariaAId, tenantAId, 'secretaria');
    const { error } = await client.from('patients').insert({
      tenant_id: tenantAId,
      first_name: 'Test',
      last_name: 'Secretaria',
      data_consent: true,
    });

    expect(error).toBeNull();
  });

  it('secretaria NO puede ver pacientes de otro tenant aunque lo intente', async () => {
    const client = await createClientWithRole(secretariaAId, tenantAId, 'secretaria');
    const { data } = await client
      .from('patients')
      .select('*')
      .eq('tenant_id', tenantBId); // Intento explícito de cross-tenant

    expect(data).toHaveLength(0);
  });
});

describe('RLS: financial_transactions — solo admin', () => {
  it('secretaria NO puede leer transacciones financieras', async () => {
    const client = await createClientWithRole(secretariaAId, tenantAId, 'secretaria');
    const { data } = await client.from('financial_transactions').select('*');

    // RLS bloquea — devuelve array vacío
    expect(data).toHaveLength(0);
  });

  it('admin puede leer transacciones financieras', async () => {
    const client = await createClientWithRole(adminAId, tenantAId, 'admin');
    const { error } = await client.from('financial_transactions').select('*');

    expect(error).toBeNull();
  });
});

describe('RLS: cross-tenant isolation', () => {
  it('admin tenant B NO puede ver nada del tenant A', async () => {
    const client = await createClientWithRole(adminBId, tenantBId, 'admin');

    const { data: patients } = await client
      .from('patients')
      .select('*')
      .eq('tenant_id', tenantAId);

    expect(patients).toHaveLength(0);
  });

  it('insertar con tenant_id ajeno es bloqueado por RLS', async () => {
    const client = await createClientWithRole(adminAId, tenantAId, 'admin');

    const { error } = await client.from('patients').insert({
      tenant_id: tenantBId,  // Intentar insertar en tenant B
      first_name: 'Hack',
      last_name: 'Attempt',
      data_consent: false,
    });

    // Debe fallar por RLS WITH CHECK
    expect(error).not.toBeNull();
  });
});
