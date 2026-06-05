import { useState } from 'react';
import { supabase } from './supabase';
import { getTelegramId } from './telegram';

const PORTIONS = [50, 100, 150, 200, 300];

export default function FoodSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [portions, setPortions] = useState<Record<number, number>>({});

    async function search() {
        if (!query.trim()) {
            setResults([]);
            return;
        }
        const { data, error } = await supabase
            .from('foods')
            .select('*')
            .ilike('name_uz', `%${query}%`)
            .limit(10);
        if (error) {
            alert('Xato: ' + error.message);
            return;
        }
        setResults(data || []);
    }

    function setPortion(foodId: number, grams: number) {
        setPortions((p) => ({ ...p, [foodId]: grams }));
    }

    async function addFood(food: any) {
        const grams = portions[food.id] || 100;
        const ratio = grams / 100;

        const { error } = await supabase.from('food_logs').insert({
            user_id: getTelegramId(),
            food_name: food.name_uz,
            calories: Math.round(food.calories * ratio),
            protein: +(food.protein * ratio).toFixed(1),
            fat: +(food.fat * ratio).toFixed(1),
            carbs: +(food.carbs * ratio).toFixed(1),
        });
        if (error) alert('Xato: ' + error.message);
        else alert(`${food.name_uz} (${grams}g) qo'shildi!`);
    }

    return (
        <div style={{ padding: 16 }}>
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="Taom qidirish..."
                style={{
                    width: '100%',
                    padding: 10,
                    fontSize: 16,
                    borderRadius: 8,
                    border: '1px solid #ccc',
                    outline: 'none',
                }}
            />
            {results.map((food) => {
                const selectedPortion = portions[food.id] || 100;
                const displayCal = Math.round(food.calories * (selectedPortion / 100));
                return (
                    <div
                        key={food.id}
                        style={{
                            padding: 12,
                            background: 'white',
                            marginTop: 8,
                            borderRadius: 8,
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div>
                                <strong>{food.name_uz}</strong>
                                <div style={{ fontSize: 13, color: '#666' }}>
                                    {displayCal} kcal / {selectedPortion}g
                                </div>
                            </div>
                            <button
                                onClick={() => addFood(food)}
                                style={{
                                    padding: '8px 14px',
                                    background: '#1D9E75',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                }}
                            >
                                + Qo'shish
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {PORTIONS.map((g) => (
                                <button
                                    key={g}
                                    onClick={() => setPortion(food.id, g)}
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: 12,
                                        background: selectedPortion === g ? '#1D9E75' : '#f0f0f0',
                                        color: selectedPortion === g ? 'white' : '#333',
                                        border: 'none',
                                        borderRadius: 4,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {g}g
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}