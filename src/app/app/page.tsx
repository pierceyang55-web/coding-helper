import { redirect } from 'next/navigation';
import Workspace from '@/components/Workspace';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AppPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return <Workspace userId={user.id} email={user.email ?? ''} />;
}
