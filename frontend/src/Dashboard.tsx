import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getTelegramId } from './telegram';

export default function Dashboard() {
    const [logs, setLogs] = useState<any[]>([]);
    const [target, setTarget] = useState(2000);

    useEffect(() => {
        loadToday();
        loadTarget();
    }, []);

    async function loadTarget() {
        const { data } = await supabase
            .from('users')
            .select('daily_calories_goal')
            .eq('telegram_id', getTelegramId())
            .single();
        if (data?.daily_calories_goal) setTarget(data.daily_calories_goal);
    }

    async function loadToday() {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const { data, error } = await supabase
            .from('food_logs')
            .select('*')
            .eq('user_id', getTelegramId())
            .gte('logged_at', start.toISOString())
            .order('logged_at', { ascending: false });
        if (error) {
            alert('Xato: ' + error.message);
            return;
        }
        setLogs(data || []);
    }

    async function deleteLog(id: number) {
        if (!confirm('O\'chirishni tasdiqlaysizmi?')) return;
        const { error } = await supabase.from('food_logs').delete().eq('id', id);
        if (error) alert('Xato: ' + error.message);
        else loadToday();
    }

    const total = logs.reduce(
        (acc, l) => ({
            calories: acc.calories + Number(l.calories || 0),
            protein: acc.protein + Number(l.protein || 0),
            fat: acc.fat + Number(l.fat || 0),
            carbs: acc.carbs + Number(l.carbs || 0),
        }),
        { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    const percent = Math.min(100, Math.round((total.calories / target) * 100));

    return (
        <div style={{ padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Bugun</h2>

            <div style={{ background: 'white', padding: 16, borderRadius: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#1D9E75' }}>
                    {Math.round(total.calories)} <span style={{ fontSize: 16, color: '#888' }}>/ {target} kcal</span>
                </div>
                <div style={{ height: 8, background: '#eee', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${percent}%`, height: '100%', background: '#1D9E75' }} />
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <Macro label="Oqsil" value={total.protein} color="#3B82F6" />
                <Macro label="Yog'" value={total.fat} color="#EF9F27" />
                <Macro label="Uglevod" value={total.carbs} color="#A855F7" />
            </div>

            <h3>Bugungi taomlar ({logs.length})</h3>
            {logs.map((l) => (
                <div
                    key={l.id}
                    style={{
                        background: 'white',
                        padding: 10,
                        borderRadius: 8,
                        marginBottom: 6,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <div>
                        <strong>{l.food_name}</strong>
                        <div style={{ fontSize: 13, color: '#666' }}>{Math.round(l.calories)} kcal</div>
                    </div>
                    <button
                        onClick={() => deleteLog(l.id)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#A32D2D',
                            fontSize: 18,
                            cursor: 'pointer',
                            padding: '4px 8px',
                        }}
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{ flex: 1, background: 'white', padding: 10, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color }}>{Math.round(value)}g</div>
        </div>
    );
}