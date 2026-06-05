import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import FoodSearch from './FoodSearch'
import Dashboard from './Dashboard'
import { initTelegram, getTelegramId, getTelegramFirstName } from './telegram'

function App() {
  const [tab, setTab] = useState<'today' | 'profile' | 'foods'>('today')
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [age, setAge] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [activity, setActivity] = useState('1.375')
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>('maintain')
  const [result, setResult] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    initTelegram()
  }, [])

  const calculate = async () => {
    const a = parseFloat(age)
    const w = parseFloat(weight)
    const h = parseFloat(height)
    if (!a || !w || !h) return

    let bmr = 10 * w + 6.25 * h - 5 * a
    bmr += gender === 'male' ? 5 : -161

    let tdee = bmr * parseFloat(activity)
    if (goal === 'lose') tdee -= 500
    if (goal === 'gain') tdee += 500

    const finalKcal = Math.round(tdee)
    setResult(finalKcal)
    setSaving(true)
    setSaved(false)

    const { error } = await supabase.from('users').upsert({
      telegram_id: getTelegramId(),
      age: a,
      weight_kg: w,
      height_cm: h,
      gender,
      activity,
      goal,
      daily_calories_goal: finalKcal,
    }, { onConflict: 'telegram_id' })

    setSaving(false)
    if (error) {
      alert('Xato: ' + error.message)
      return
    }
    setSaved(true)
  }

  const firstName = getTelegramFirstName()

  return (
    <div className="min-h-screen bg-green-50 p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-green-700 mb-1 text-center">KalAI</h1>
        {firstName && (
          <p className="text-sm text-gray-600 text-center mb-5">Salom, {firstName}!</p>
        )}

        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('today')}
            className={`flex-1 py-2 rounded ${tab === 'today' ? 'bg-green-600 text-white' : 'bg-white border'}`}>
            Bugun
          </button>
          <button onClick={() => setTab('foods')}
            className={`flex-1 py-2 rounded ${tab === 'foods' ? 'bg-green-600 text-white' : 'bg-white border'}`}>
            Taomlar
          </button>
          <button onClick={() => setTab('profile')}
            className={`flex-1 py-2 rounded ${tab === 'profile' ? 'bg-green-600 text-white' : 'bg-white border'}`}>
            Profil
          </button>
        </div>

        {tab === 'today' ? <Dashboard /> : tab === 'foods' ? <FoodSearch /> : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Jins</label>
              <div className="flex gap-2">
                <button onClick={() => setGender('male')}
                  className={`flex-1 py-2 rounded ${gender === 'male' ? 'bg-green-600 text-white' : 'bg-white border'}`}>Erkak</button>
                <button onClick={() => setGender('female')}
                  className={`flex-1 py-2 rounded ${gender === 'female' ? 'bg-green-600 text-white' : 'bg-white border'}`}>Ayol</button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Yosh</label>
              <input type="number" value={age} onChange={e => setAge(e.target.value)}
                className="w-full px-3 py-2 border rounded" placeholder="19" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Og'irlik (kg)</label>
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)}
                className="w-full px-3 py-2 border rounded" placeholder="70" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Bo'y (sm)</label>
              <input type="number" value={height} onChange={e => setHeight(e.target.value)}
                className="w-full px-3 py-2 border rounded" placeholder="175" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Faollik</label>
              <select value={activity} onChange={e => setActivity(e.target.value)}
                className="w-full px-3 py-2 border rounded bg-white">
                <option value="1.2">Kam (o'tirib ishlash)</option>
                <option value="1.375">Yengil (1-3 marta/hafta)</option>
                <option value="1.55">O'rtacha (3-5 marta/hafta)</option>
                <option value="1.725">Yuqori (6-7 marta/hafta)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Maqsad</label>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setGoal('lose')}
                  className={`py-2 rounded text-sm ${goal === 'lose' ? 'bg-green-600 text-white' : 'bg-white border'}`}>Ozayish</button>
                <button onClick={() => setGoal('maintain')}
                  className={`py-2 rounded text-sm ${goal === 'maintain' ? 'bg-green-600 text-white' : 'bg-white border'}`}>Saqlash</button>
                <button onClick={() => setGoal('gain')}
                  className={`py-2 rounded text-sm ${goal === 'gain' ? 'bg-green-600 text-white' : 'bg-white border'}`}>To'yish</button>
              </div>
            </div>

            <button onClick={calculate} disabled={saving}
              className="w-full bg-green-600 text-white py-3 rounded font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Saqlanmoqda...' : 'Hisoblash'}
            </button>

            {result && (
              <div className="bg-white p-4 rounded border-2 border-green-600 text-center">
                <div className="text-sm text-gray-600">Kunlik maqsad</div>
                <div className="text-3xl font-bold text-green-700">{result} kcal</div>
                {saved && <div className="text-xs text-green-600 mt-2">Saqlandi ✓</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App