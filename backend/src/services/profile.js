import { supabaseService } from '../config/supabase.js';

export async function ensureProfile(user) {
  if (!user?.id) return;

  const fullName = `${user.user_metadata?.full_name ?? ''}`.trim() || null;
  const email = user.email ?? null;

  const { error } = await supabaseService.from('profiles').upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new Error(error.message ?? 'Failed to sync user profile');
  }
}

