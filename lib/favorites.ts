import { createClient } from "./supabase/client";
import type { Region } from "./retailers";

export interface Favorite {
  id: string;
  productTitle: string;
  imageUrl: string | null;
  region: Region;
  createdAt: string;
}

// Row shape as stored in Supabase (snake_case) vs. the camelCase shape the
// rest of the app uses — converted at the edge here so nothing else in the
// codebase needs to know about the DB's naming convention.
interface FavoriteRow {
  id: string;
  product_title: string;
  image_url: string | null;
  region: string;
  created_at: string;
}

function fromRow(row: FavoriteRow): Favorite {
  return {
    id: row.id,
    productTitle: row.product_title,
    imageUrl: row.image_url,
    region: row.region as Region,
    createdAt: row.created_at,
  };
}

export async function listFavorites(): Promise<Favorite[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("favorites")
    .select("id, product_title, image_url, region, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function addFavorite(productTitle: string, region: Region, imageUrl: string | null): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Sign in to save favorites");

  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: userId, product_title: productTitle, region, image_url: imageUrl });

  // A duplicate save (same product+region already favorited) hits the
  // unique constraint — treat that as a no-op success rather than an error.
  if (error && error.code !== "23505") throw error;
}

export async function removeFavorite(productTitle: string, region: Region): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Sign in to manage favorites");

  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("product_title", productTitle)
    .eq("region", region);

  if (error) throw error;
}
