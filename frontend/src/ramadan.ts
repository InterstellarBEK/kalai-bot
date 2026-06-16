// Ramazon sanalari (taxminiy, yiliga ~10 kun siljiydi)
const RAMADAN_DATES = [
    { start: '2026-02-17', end: '2026-03-18' },
    { start: '2027-02-06', end: '2027-03-07' },
    { start: '2028-01-27', end: '2028-02-24' },
    { start: '2029-01-15', end: '2029-02-13' },
    { start: '2030-01-05', end: '2030-02-02' },
];

// O'zbekiston viloyatlari + Qoraqalpog'iston Respublikasi
export interface Region {
    id: string;
    name: string;
    lat: number;
    lon: number;
}

export const UZ_REGIONS: Region[] = [
    { id: 'tashkent_city', name: 'Toshkent sh.', lat: 41.2995, lon: 69.2401 },
    { id: 'tashkent', name: 'Toshkent vil.', lat: 41.0156, lon: 69.3471 },
    { id: 'andijan', name: 'Andijon', lat: 40.7821, lon: 72.3442 },
    { id: 'bukhara', name: 'Buxoro', lat: 39.7681, lon: 64.4556 },
    { id: 'fergana', name: "Farg'ona", lat: 40.3864, lon: 71.7864 },
    { id: 'jizzakh', name: 'Jizzax', lat: 40.1158, lon: 67.8422 },
    { id: 'namangan', name: 'Namangan', lat: 40.9983, lon: 71.6726 },
    { id: 'navoi', name: 'Navoiy', lat: 40.0844, lon: 65.3792 },
    { id: 'kashkadarya', name: 'Qashqadaryo', lat: 38.8606, lon: 65.7886 },
    { id: 'samarkand', name: 'Samarqand', lat: 39.6542, lon: 66.9597 },
    { id: 'sirdarya', name: 'Sirdaryo', lat: 40.4897, lon: 68.7842 },
    { id: 'surkhandarya', name: 'Surxondaryo', lat: 37.2242, lon: 67.2783 },
    { id: 'khorezm', name: 'Xorazm', lat: 41.5500, lon: 60.6333 },
    { id: 'karakalpakstan', name: "Qoraqalpog'iston", lat: 42.4531, lon: 59.6103 },
];

const DEFAULT_REGION_ID = 'tashkent_city';

export function getSelectedRegion(): Region {
    if (typeof localStorage === 'undefined') return UZ_REGIONS[0];
    const id = localStorage.getItem('region_id') || DEFAULT_REGION_ID;
    return UZ_REGIONS.find((r) => r.id === id) || UZ_REGIONS[0];
}

export function setSelectedRegion(id: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('region_id', id);
}

export function isRamadanForce(): boolean {
    return typeof localStorage !== 'undefined' && localStorage.getItem('ramadan_force') === '1';
}

export function isRamadanActive(date: Date = new Date()): boolean {
    if (isRamadanForce()) return true;
    const ds = date.toISOString().split('T')[0];
    return RAMADAN_DATES.some((r) => ds >= r.start && ds <= r.end);
}

/** Keyingi (yoki hozirgi) Ramazon davrini qaytaradi */
export function getNextRamadan(date: Date = new Date()): { start: string; end: string } | null {
    const ds = date.toISOString().split('T')[0];
    const upcoming = RAMADAN_DATES.find((r) => ds <= r.end);
    return upcoming || null;
}

/** Keyingi Ramazongacha kun soni (agar hozir Ramazon bo'lsa — 0) */
export function getDaysUntilRamadan(date: Date = new Date()): number {
    if (isRamadanActive(date)) return 0;
    const next = getNextRamadan(date);
    if (!next) return -1;
    const today = new Date(date.toISOString().split('T')[0]);
    const start = new Date(next.start);
    const diff = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
}

export interface PrayerTimes {
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
    date: string;
}

const memCache = new Map<string, PrayerTimes>();

export async function getPrayerTimes(date: Date = new Date(), region?: Region): Promise<PrayerTimes> {
    const r = region || getSelectedRegion();
    const ds = date.toISOString().split('T')[0];
    const cacheKey = `${r.id}_${ds}`;

    if (memCache.has(cacheKey)) return memCache.get(cacheKey)!;

    const stored = localStorage.getItem(`prayer_${cacheKey}`);
    if (stored) {
        const parsed = JSON.parse(stored) as PrayerTimes;
        memCache.set(cacheKey, parsed);
        return parsed;
    }

    // Aladhan API — method=2 (ISNA), school=1 (Hanafi)
    const [y, m, d] = ds.split('-');
    const url = `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${r.lat}&longitude=${r.lon}&method=2&school=1`;
    const res = await fetch(url);
    const json = await res.json();
    const t = json.data.timings;
    const times: PrayerTimes = {
        fajr: t.Fajr.slice(0, 5),
        sunrise: t.Sunrise.slice(0, 5),
        dhuhr: t.Dhuhr.slice(0, 5),
        asr: t.Asr.slice(0, 5),
        maghrib: t.Maghrib.slice(0, 5),
        isha: t.Isha.slice(0, 5),
        date: ds,
    };
    memCache.set(cacheKey, times);
    localStorage.setItem(`prayer_${cacheKey}`, JSON.stringify(times));
    return times;
}

export function parseTimeToToday(hhmm: string, baseDate: Date = new Date()): Date {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d;
}

export interface RamadanStatus {
    isRamadan: boolean;
    isFasting: boolean;
    fajrTime: Date | null;
    maghribTime: Date | null;
    nextEventLabel: 'iftar' | 'sahur_end' | null;
    nextEventTime: Date | null;
}

export async function getRamadanStatus(now: Date = new Date()): Promise<RamadanStatus> {
    if (!isRamadanActive(now)) {
        return {
            isRamadan: false,
            isFasting: false,
            fajrTime: null,
            maghribTime: null,
            nextEventLabel: null,
            nextEventTime: null,
        };
    }

    const today = await getPrayerTimes(now);
    const fajr = parseTimeToToday(today.fajr, now);
    const maghrib = parseTimeToToday(today.maghrib, now);
    const isFasting = now >= fajr && now < maghrib;

    let nextEventTime: Date;
    let nextEventLabel: 'iftar' | 'sahur_end';

    if (isFasting) {
        nextEventTime = maghrib;
        nextEventLabel = 'iftar';
    } else if (now < fajr) {
        nextEventTime = fajr;
        nextEventLabel = 'sahur_end';
    } else {
        // maghrib'dan keyin — ertangi fajr
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowTimes = await getPrayerTimes(tomorrow);
        nextEventTime = parseTimeToToday(tomorrowTimes.fajr, tomorrow);
        nextEventLabel = 'sahur_end';
    }

    return {
        isRamadan: true,
        isFasting,
        fajrTime: fajr,
        maghribTime: maghrib,
        nextEventLabel,
        nextEventTime,
    };
}

export function formatCountdown(totalSeconds: number): string {
    const s = Math.max(0, totalSeconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}