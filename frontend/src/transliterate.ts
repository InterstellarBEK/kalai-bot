// O'zbek Latin → Kirill transliteratsiya (oddiy)
const RULES: [RegExp, string][] = [
    [/Oʻ|O'/g, 'Ў'], [/oʻ|o'/g, 'ў'],
    [/Gʻ|G'/g, 'Ғ'], [/gʻ|g'/g, 'ғ'],
    [/Ch/g, 'Ч'], [/ch/g, 'ч'],
    [/Sh/g, 'Ш'], [/sh/g, 'ш'],
    [/Yo/g, 'Ё'], [/yo/g, 'ё'],
    [/Yu/g, 'Ю'], [/yu/g, 'ю'],
    [/Ya/g, 'Я'], [/ya/g, 'я'],
    [/A/g, 'А'], [/a/g, 'а'],
    [/B/g, 'Б'], [/b/g, 'б'],
    [/D/g, 'Д'], [/d/g, 'д'],
    [/E/g, 'Е'], [/e/g, 'е'],
    [/F/g, 'Ф'], [/f/g, 'ф'],
    [/G/g, 'Г'], [/g/g, 'г'],
    [/H/g, 'Ҳ'], [/h/g, 'ҳ'],
    [/I/g, 'И'], [/i/g, 'и'],
    [/J/g, 'Ж'], [/j/g, 'ж'],
    [/K/g, 'К'], [/k/g, 'к'],
    [/L/g, 'Л'], [/l/g, 'л'],
    [/M/g, 'М'], [/m/g, 'м'],
    [/N/g, 'Н'], [/n/g, 'н'],
    [/O/g, 'О'], [/o/g, 'о'],
    [/P/g, 'П'], [/p/g, 'п'],
    [/Q/g, 'Қ'], [/q/g, 'қ'],
    [/R/g, 'Р'], [/r/g, 'р'],
    [/S/g, 'С'], [/s/g, 'с'],
    [/T/g, 'Т'], [/t/g, 'т'],
    [/U/g, 'У'], [/u/g, 'у'],
    [/V/g, 'В'], [/v/g, 'в'],
    [/X/g, 'Х'], [/x/g, 'х'],
    [/Y/g, 'Й'], [/y/g, 'й'],
    [/Z/g, 'З'], [/z/g, 'з'],
]

export function uzLatinToCyrl(s: string): string {
    if (!s) return s
    let out = s
    for (const [re, rep] of RULES) out = out.replace(re, rep)
    return out
}