'use client';

import { useState } from 'react';
import { Mail, X, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  type: 'certificate' | 'prescription' | 'invoice';
  id: string;
  defaultEmail?: string;
  label?: string;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'default';
}

export function SendByEmailButton({
  type,
  id,
  defaultEmail = '',
  label = 'Enviar por email',
  variant = 'outline',
  size = 'default',
}: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSend() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg('Ingrese un correo válido.');
      return;
    }
    setLoading(true);
    setResult(null);
    setErrorMsg('');
    try {
      const res = await fetch('/api/send/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, email }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setResult('error');
        setErrorMsg(data.error ?? 'Error al enviar el correo.');
      } else {
        setResult('success');
      }
    } catch {
      setResult('error');
      setErrorMsg('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setResult(null);
    setErrorMsg('');
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Mail size={14} />
        {label}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Enviar por correo</h3>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {result === 'success' ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <Send size={20} className="text-green-600" />
                </div>
                <p className="font-medium text-gray-900 mb-1">Correo enviado</p>
                <p className="text-sm text-muted-foreground">
                  El documento fue enviado a <strong>{email}</strong>.
                </p>
                <Button className="mt-4 w-full" variant="outline" onClick={handleClose}>
                  Cerrar
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Correo electrónico
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setErrorMsg('');
                      }}
                      placeholder="paciente@ejemplo.com"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
                      disabled={loading}
                    />
                    {errorMsg && (
                      <p className="mt-1 text-xs text-red-600">{errorMsg}</p>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Se enviará el documento adjunto como PDF al correo indicado.
                  </p>
                </div>

                <div className="flex gap-3 mt-5">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleClose}
                    disabled={loading}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 gap-1.5"
                    onClick={() => void handleSend()}
                    disabled={loading}
                  >
                    {loading ? (
                      <><Loader2 size={14} className="animate-spin" /> Enviando…</>
                    ) : (
                      <><Send size={14} /> Enviar</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
