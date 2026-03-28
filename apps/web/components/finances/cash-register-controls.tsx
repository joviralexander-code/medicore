'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  tenantId: string;
  sessionId: string | null;
  openedBy: string;
  openSession: { id: string; opened_at: string; opening_balance: number } | null;
  expectedBalance: number;
  mode: 'open' | 'close';
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function CashRegisterControls({
  tenantId,
  sessionId,
  openedBy,
  expectedBalance,
  mode,
}: Props) {
  const router = useRouter();
  const [balance, setBalance] = useState('');
  const [notes, setNotes]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleOpenCaja() {
    setError(null);
    const balanceNum = parseFloat(balance) || 0;
    setLoading(true);

    const supabase = createClient();
    const { error: insertError } = await supabase
      .from('cash_register_sessions')
      .insert({
        tenant_id: tenantId,
        opened_by: openedBy,
        opening_balance: balanceNum,
        notes: notes.trim() || null,
      });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.refresh();
  }

  async function handleCloseCaja() {
    if (!sessionId) return;
    setError(null);
    const closingBalance = parseFloat(balance);
    if (isNaN(closingBalance) || closingBalance < 0) {
      setError('Ingrese el saldo físico en caja para cerrar.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const difference = closingBalance - expectedBalance;

    const { error: updateError } = await supabase
      .from('cash_register_sessions')
      .update({
        closed_at: new Date().toISOString(),
        closed_by: openedBy,
        closing_balance: closingBalance,
        expected_balance: expectedBalance,
        difference,
        notes: notes.trim() || null,
      })
      .eq('id', sessionId);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.refresh();
  }

  if (mode === 'open') {
    return (
      <Card className="border-orange-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Abrir caja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700">Saldo inicial en efectivo ($)</Label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-2.5 text-gray-500 text-sm">$</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                className="h-10 pl-7 border-gray-200 bg-gray-50 focus:bg-white focus:border-[#1E40AF] text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700">Notas</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones de apertura..."
              className="h-10 border-gray-200 bg-gray-50 focus:bg-white focus:border-[#1E40AF] text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            onClick={handleOpenCaja}
            disabled={loading}
            className="bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold"
          >
            {loading ? '⟳ Abriendo...' : '🔓 Abrir caja'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Close mode
  const closingBalance = parseFloat(balance);
  const diff = !isNaN(closingBalance) ? closingBalance - expectedBalance : null;

  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cerrar caja</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-muted-foreground text-xs">Saldo esperado (calculado)</p>
            <p className="font-bold text-lg text-gray-900 mt-0.5">{formatCurrency(expectedBalance)}</p>
          </div>
          {diff !== null && (
            <div className={`rounded-lg p-3 ${
              diff === 0 ? 'bg-green-50' : diff > 0 ? 'bg-blue-50' : 'bg-red-50'
            }`}>
              <p className="text-xs text-muted-foreground">Diferencia</p>
              <p className={`font-bold text-lg mt-0.5 ${
                diff === 0 ? 'text-green-700' : diff > 0 ? 'text-blue-700' : 'text-red-700'
              }`}>
                {diff > 0 ? '+' : ''}{formatCurrency(diff)}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-gray-700">Saldo físico en caja ($)</Label>
          <div className="relative max-w-xs">
            <span className="absolute left-3 top-2.5 text-gray-500 text-sm">$</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
              className="h-10 pl-7 border-gray-200 bg-gray-50 focus:bg-white focus:border-[#1E40AF] text-sm"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-gray-700">Notas de cierre</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones del cierre..."
            className="h-10 border-gray-200 bg-gray-50 focus:bg-white focus:border-[#1E40AF] text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button
          onClick={handleCloseCaja}
          disabled={loading}
          variant="outline"
          className="border-orange-300 text-orange-700 hover:bg-orange-50 font-semibold"
        >
          {loading ? '⟳ Cerrando...' : '🔒 Cerrar caja'}
        </Button>
      </CardContent>
    </Card>
  );
}
