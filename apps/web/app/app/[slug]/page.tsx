import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function TenantRootPage({ params }: Props) {
  const { slug } = await params;
  redirect(`/app/${slug}/dashboard`);
}
