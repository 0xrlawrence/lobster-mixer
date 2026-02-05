export const prerender = false;
import type { APIRoute } from 'astro';
import { getProfile, getGlobalTwitterProfile } from '../../lib/db';

export const GET: APIRoute = async ({ url }) => {
    const index = url.searchParams.get('index');
    const owner = url.searchParams.get('owner');

    if (!index) {
        return new Response('Missing index parameter', { status: 400 });
    }

    let profile = getProfile(parseInt(index));
    let avatarUrl = profile?.twitterAvatar;

    // Fallback to global owner-based Twitter info if node profile is missing or lacks Twitter avatar
    if ((!avatarUrl || avatarUrl.length === 0) && owner) {
        const globalTwitter = getGlobalTwitterProfile(owner);
        if (globalTwitter?.twitterAvatar) {
            avatarUrl = globalTwitter.twitterAvatar;
        }
    }

    // 1. Prioritize Twitter Avatar redirect
    if (avatarUrl && avatarUrl.length > 0) {
        return new Response(null, {
            status: 302,
            headers: {
                'Location': avatarUrl as string,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }

    // 2. Final fallback to a transparent SVG (Ghost state) - NO LOBSTER PICTURE
    const transparentSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`;
    return new Response(transparentSvg, {
        status: 200,
        headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*'
        }
    });
};
