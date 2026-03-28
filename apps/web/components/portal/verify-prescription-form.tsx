'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function VerifyPrescriptionForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (cleaned) {
      router.push(`/portal/${slug}/verify?code=${cleaned}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-gray-700">Código de verificación</Label>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Ej: A1B2C3D4E5F6G7H8"
          className="h-12 font-mono text-lg tracking-widest border-gray-200 bg-gray-50 focus:bg-white focus:border-[#1E40AF]"
          maxLength={16}
        />
        <p className="text-xs text-muted-foreground">
          El código de 16 caracteres aparece en la receta impresa
        </p>
      </div>
      <Button
        type="submit"
        disabled={code.trim().length < 8}
        className="bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold"
      >
        Verificar receta
      </Button>
    </form>
  );
}
