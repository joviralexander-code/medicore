import type { Metadata } from 'next';
import { PharmacySearch } from '@/components/pharmacy/pharmacy-search';

export const metadata: Metadata = { title: 'Farmacia' };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PharmacyPage({ params }: Props) {
  const { slug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comparador de Precios</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Consulta precios de medicamentos en farmacias de Ecuador
        </p>
      </div>

      <PharmacySearch slug={slug} />
    </div>
  );
}
