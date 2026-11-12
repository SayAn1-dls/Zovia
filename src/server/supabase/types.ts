import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * The typed Supabase client every repository receives. Import this type instead of
 * "@supabase/supabase-js" (lint restricts that package to the Supabase modules and repositories).
 */
export type AppSupabaseClient = SupabaseClient<Database>;
export type { Database };
