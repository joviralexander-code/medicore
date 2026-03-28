# Coolify Deployment — apps/web

## Configuración en Coolify

### Source
- **Repository**: tu repositorio GitHub/GitLab
- **Branch**: main
- **Base Directory**: `apps/web`
- **Build Pack**: Dockerfile

### Build Arguments (NEXT_PUBLIC_* se inyectan en build time)

| Variable | Ejemplo |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://niathkonsnfegowxwqit.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `medicore.ec` |
| `NEXT_PUBLIC_APP_URL` | `https://medicore.ec` |
| `NEXT_PUBLIC_API_URL` | `https://api.medicore.ec` |

### Environment Variables (runtime — server-side only)

| Variable | Descripción |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key de Supabase |
| `RESEND_API_KEY` | API key de Resend para emails |
| `RESEND_FROM` | `noreply@medicore.ec` |
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_PRO` | `price_...` |
| `STRIPE_PRICE_CLINICA` | `price_...` |
| `STRIPE_PRICE_ENTERPRISE` | `price_...` |

### Port
- Container port: **3000**

### Health Check
- Path: `/`
- Interval: 30s

## Notas
- Las variables `NEXT_PUBLIC_*` deben configurarse como **Build Variables** en Coolify,
  no como Environment Variables, porque Next.js las bake en el bundle al compilar.
- Las variables sin `NEXT_PUBLIC_` van solo como Environment Variables (runtime).
- Supabase sigue en Supabase Cloud — no cambia nada en la BD.
