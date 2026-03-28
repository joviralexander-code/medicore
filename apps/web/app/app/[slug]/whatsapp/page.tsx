import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPanel } from '@/components/whatsapp/whatsapp-panel';

export const metadata: Metadata = { title: 'WhatsApp' };

interface Props {
  params: Promise<{ slug: string }>;
}

interface WhatsAppConnection {
  id: string;
  connection_type: string;
  phone_number: string | null;
  is_connected: boolean;
  last_connected_at: string | null;
}

interface Conversation {
  id: string;
  phone_number: string;
  contact_name: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_bot_active: boolean;
  patients: { first_name: string; last_name: string } | null;
}

export default async function WhatsAppPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  if (!profile?.tenant_id) redirect('/onboarding');

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  const [connectionResult, conversationsResult] = await Promise.all([
    supabase
      .from('whatsapp_connections')
      .select('id, connection_type, phone_number, is_connected, last_connected_at')
      .eq('tenant_id', tenant.id)
      .maybeSingle(),
    supabase
      .from('whatsapp_conversations')
      .select('id, phone_number, contact_name, last_message_at, unread_count, is_bot_active, patients(first_name, last_name)')
      .eq('tenant_id', tenant.id)
      .order('last_message_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <WhatsAppPanel
      slug={slug}
      tenantId={tenant.id}
      connection={connectionResult.data as unknown as WhatsAppConnection | null}
      conversations={(conversationsResult.data as unknown as Conversation[]) ?? []}
    />
  );
}
