// api/prayer-times.ts — Vercel Edge Function proxy for namoz-vaqti.uz
// CORS'ni chetlab o'tadi (server-to-server). Cache 30 min edge'da.

export const config = { runtime: 'edge' }

// Faqat ruxsat etilgan slug'lar (SSRF himoyasi)
const ALLOWED_SLUGS = new Set([
    'toshkent-shahri',
    'toshkent-viloyati',
    'andijon',
    'buxoro',
    'fargona',
    'jizzax',
    'namangan',
    'navoiy',
    'qarshi-shahri',
    'samarqand',
    'guliston',
    'termiz',
    'urganch',
    'nukus',
])

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...CORS_HEADERS,
            ...extraHeaders,
        },
    })
}

export default async function handler(req: Request): Promise<Response> {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (req.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')

    if (!slug || !ALLOWED_SLUGS.has(slug)) {
        return jsonResponse({ error: 'Invalid or unknown slug', slug }, 400)
    }

    const upstreamUrl = `https://namoz-vaqti.uz/lotin/namoz-vaqtlari/${slug}?format=json`

    try {
        const upstream = await fetch(upstreamUrl, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Lokma/1.0 (+https://lokma.uz)',
            },
            // Vercel edge default timeout ~30s
        })

        if (!upstream.ok) {
            return jsonResponse(
                { error: `Upstream ${upstream.status}`, slug },
                502
            )
        }

        const data = await upstream.json()

        // 30 min edge cache — vaqtlar bir kunlik, tez-tez o'zgarmaydi
        return jsonResponse(data, 200, {
            'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
        })
    } catch (e) {
        return jsonResponse(
            { error: 'Fetch failed', message: e instanceof Error ? e.message : String(e) },
            502
        )
    }
}