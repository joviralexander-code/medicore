import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Proxies to the Express API which has @anthropic-ai/sdk
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as {
      tenantName: string;
      contentType: string;
      topic: string;
      platforms: string[];
    };

    const apiUrl = process.env['API_URL'] ?? 'http://localhost:3001';
    const res = await fetch(`${apiUrl}/v1/social/generate-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || 'API error' }, { status: res.status });
    }

    const data = await res.json() as { caption: string };
    return NextResponse.json(data);
  } catch (err) {
    console.error('[SOCIAL_GENERATE]', {
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Error al generar contenido. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
