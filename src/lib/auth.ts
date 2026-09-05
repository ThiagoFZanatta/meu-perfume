import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;

export function useSession() {
  const queryClient = useQueryClient();

  const query = useQuery<Session | null>({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      queryClient.setQueryData(["auth", "session"], session);
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return query;
}

export function useProfile(userId: string | undefined) {
  return useQuery<Profile>({
    queryKey: ["profiles", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId as string)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

export function useAuth() {
  const session = useSession();
  const profile = useProfile(session.data?.user.id);

  return {
    session: session.data ?? null,
    profile: profile.data ?? null,
    isLoading: session.isPending || (!!session.data && profile.isPending),
  };
}

export async function signOut() {
  await supabase.auth.signOut();
}
