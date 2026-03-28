'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PharmacyProduct {
  id: string;
  brand_name: string;
  pharmaceutical_form: string | null;
  concentration: string | null;
  presentation: string | null;
  molecules: { name: string; atc_code: string | null } | null;
}

interface PharmacyPrice {
  id: string;
  pharmacy_name: string;
  price: number | null;
  pvp: number | null;
  stock_status: string | null;
  scraped_at: string | null;
  cache_expires_at: string | null;
  pharmacy_products: PharmacyProduct | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHARMACY_COLORS: Record<string, string> = {
  fybeca:    'bg-blue-600',
  'cruz-azul': 'bg-sky-600',
  'sana-sana': 'bg-teal-600',
  pharmacys: 'bg-purple-600',
  medicity:  'bg-indigo-600',
};

function pharmacyColor(name: string): string {
  const key = name.toLowerCase().replace(/\s+/g, '-');
  return PHARMACY_COLORS[key] ?? 'bg-gray-500';
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return '—';
  return `$${amount.toFixed(2)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'hace menos de 1h';
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PharmacySearch({ slug: _slug }: { slug: string }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<PharmacyPrice[]>([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || query.trim().length < 3) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from('pharmacy_prices')
      .select(`
        id, pharmacy_name, price, pvp, stock_status, scraped_at, cache_expires_at,
        pharmacy_products(
          id, brand_name, pharmaceutical_form, concentration, presentation,
          molecules(name, atc_code)
        )
      `)
      .ilike('pharmacy_products.brand_name', `%${query.trim()}%`)
      .order('pvp', { ascending: true })
      .limit(50) as { data: PharmacyPrice[] | null; error: unknown };

    if (queryError) {
      setError('Error al buscar. Intente nuevamente.');
    } else {
      setResults(data ?? []);
    }
    setLoading(false);
  }

  // Group by product
  const grouped = results.reduce<Record<string, PharmacyPrice[]>>((acc, r) => {
    const key = r.pharmacy_products?.id ?? 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar medicamento (nombre comercial o principio activo)..."
          className="flex-1 h-11 text-sm border-gray-200 bg-white focus:border-[#1E40AF]"
          autoComplete="off"
        />
        <Button
          type="submit"
          disabled={loading || query.trim().length < 3}
          className="h-11 px-6 bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold"
        >
          {loading ? '⟳ Buscando...' : 'Buscar'}
        </Button>
      </form>

      {/* Info banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <span className="font-semibold">Farmacias incluidas:</span>{' '}
        Fybeca, Cruz Azul, Sana Sana, Pharmacy's, Medicity
        {' · '}
        <span className="text-blue-600">Precios actualizados cada 6 horas</span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* No results */}
      {searched && !loading && results.length === 0 && !error && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-medium">No se encontraron resultados para "{query}"</p>
            <p className="text-sm mt-1">
              Los precios se actualizan automáticamente. Si el medicamento no aparece,
              puede no estar disponible en las farmacias monitoreadas.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results grouped by product */}
      {Object.entries(grouped).map(([productId, prices]) => {
        const product = prices[0]?.pharmacy_products;
        if (!product) return null;

        const minPrice = Math.min(...prices.map((p) => p.pvp ?? p.price ?? Infinity).filter(isFinite));

        return (
          <Card key={productId}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{product.brand_name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {product.molecules?.name ?? ''}
                    {product.concentration ? ` · ${product.concentration}` : ''}
                    {product.pharmaceutical_form ? ` · ${product.pharmaceutical_form}` : ''}
                    {product.presentation ? ` · ${product.presentation}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-xs text-muted-foreground">Precio mínimo</p>
                  <p className="text-xl font-bold text-[#1E40AF]">
                    {isFinite(minPrice) ? formatCurrency(minPrice) : '—'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {prices
                  .sort((a, b) => (a.pvp ?? a.price ?? 9999) - (b.pvp ?? b.price ?? 9999))
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-5 py-3">
                      {/* Pharmacy */}
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${pharmacyColor(p.pharmacy_name)}`}
                        >
                          {p.pharmacy_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 capitalize">{p.pharmacy_name}</p>
                          {p.scraped_at && (
                            <p className="text-xs text-muted-foreground">{timeAgo(p.scraped_at)}</p>
                          )}
                        </div>
                      </div>

                      {/* Stock + Price */}
                      <div className="flex items-center gap-4">
                        {p.stock_status && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              p.stock_status === 'disponible'
                                ? 'bg-green-100 text-green-700'
                                : p.stock_status === 'agotado'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {p.stock_status}
                          </span>
                        )}
                        <div className="text-right">
                          <p className="text-base font-bold text-gray-900">
                            {formatCurrency(p.pvp ?? p.price)}
                          </p>
                          {p.pvp !== null && p.price !== null && p.price !== p.pvp && (
                            <p className="text-xs text-muted-foreground line-through">
                              {formatCurrency(p.price)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Empty state before search */}
      {!searched && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-4xl mb-3">🏥</p>
            <p className="font-medium">Comparador de precios de medicamentos</p>
            <p className="text-sm mt-2 max-w-md mx-auto">
              Busque cualquier medicamento para ver su precio en tiempo real
              en las principales farmacias de Ecuador.
              Los datos se actualizan automáticamente cada 6 horas.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
