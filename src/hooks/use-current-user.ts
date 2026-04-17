"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface CurrentUser {
  id: string;
  email: string;
  isDemo: boolean;
}

export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user?.email) return;
      setUser({
        id: data.user.id,
        email: data.user.email,
        isDemo: data.user.email.endsWith("@demo.local"),
      });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user?.email) {
        setUser(null);
        return;
      }
      setUser({
        id: session.user.id,
        email: session.user.email,
        isDemo: session.user.email.endsWith("@demo.local"),
      });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return user;
}
