import { supabaseService } from '../config/supabase.js';

export async function getUserTeamIds({ businessId, userId }) {
  const { data, error } = await supabaseService
    .from('team_members')
    .select('team_id, teams!inner(id, business_id)')
    .eq('user_id', userId)
    .eq('teams.business_id', businessId);

  if (error) return { error };

  return {
    error: null,
    teamIds: (data ?? []).map((row) => row.team_id),
  };
}

