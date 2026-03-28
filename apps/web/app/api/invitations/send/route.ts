import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

interface SendInvitationBody {
  token: string;
  email: string;
  tenantName: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin:      'Médico / Administrador',
  secretaria: 'Secretaria',
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as SendInvitationBody;
  const { token, email, tenantName, role } = body;

  if (!token || !email || !tenantName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Verify the token exists in DB before sending — prevents using this endpoint
  // to send arbitrary phishing emails with our template
  const supabaseAdmin = createSupabaseAdmin(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } }
  );
  const { data: inv } = await supabaseAdmin
    .from('tenant_invitations')
    .select('id')
    .eq('token', token)
    .eq('email', email.toLowerCase())
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!inv) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 404 });
  }

  const RESEND_API_KEY = process.env['RESEND_API_KEY'];
  const FROM_EMAIL     = process.env['RESEND_FROM'] ?? 'noreply@medicore.ec';
  const APP_URL        = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://medicore.ec';

  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
  }

  const inviteUrl  = `${APP_URL}/accept-invitation?token=${token}`;
  const roleLabel  = ROLE_LABELS[role] ?? role;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background-color:#f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
        <!-- Top bar -->
        <tr><td style="height:5px;background:linear-gradient(90deg,#1E40AF,#0D9488);"></td></tr>
        <!-- Header -->
        <tr><td style="padding:32px 40px 24px;text-align:center;">
          <table cellpadding="0" cellspacing="0" style="display:inline-table;">
            <tr>
              <td style="vertical-align:middle;padding-right:8px;">
                <div style="width:36px;height:36px;background:#1E40AF;border-radius:8px;display:flex;align-items:center;justify-content:center;">
                  <span style="color:#fff;font-weight:700;font-size:18px;line-height:36px;text-align:center;display:block;">M</span>
                </div>
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:22px;font-weight:700;color:#1E40AF;">MediCore</span>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:0 40px 32px;">
          <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">
            Has sido invitado a ${tenantName}
          </h2>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Alguien de <strong>${tenantName}</strong> te invitó a unirte a su consultorio en MediCore
            con el rol de <strong>${roleLabel}</strong>.
          </p>
          <!-- Invite box -->
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#1e40af;font-weight:600;">
              ${tenantName} · ${roleLabel}
            </p>
            <p style="margin:4px 0 0;font-size:12px;color:#3b82f6;">
              Este enlace expira en 7 días
            </p>
          </div>
          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td align="center">
              <a href="${inviteUrl}"
                style="display:inline-block;background:#1E40AF;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:10px;">
                Aceptar invitación
              </a>
            </td></tr>
          </table>
          <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
            Si no esperabas esta invitación, puedes ignorar este correo.
          </p>
          <!-- Link fallback -->
          <p style="margin:12px 0 0;font-size:11px;color:#d1d5db;text-align:center;word-break:break-all;">
            ${inviteUrl}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [email],
      subject: `Invitación a ${tenantName} en MediCore`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('[invitations/send] Resend error:', detail);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
