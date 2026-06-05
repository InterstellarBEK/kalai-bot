import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)
export async function searchFoods(query: string) {
    const { data, error } = await supabase
        .from('foods')
        .select('*')
        .ilike('name_uz', `%${query}%`)
        .limit(20);

    if (error) {
        console.error('Search error:', error);
        return [];
    }
    return data;
}