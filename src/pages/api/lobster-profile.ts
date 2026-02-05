export const prerender = false;
import type { APIRoute } from 'astro';
import { getProfile, upsertProfile, getGlobalTwitterProfile } from '../../lib/db';

export const GET: APIRoute = async ({ params, url }) => {
    const index = url.searchParams.get('index');
    const owner = url.searchParams.get('owner');

    if (!index) {
        return new Response(JSON.stringify({ error: 'Missing index parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    let profile = getProfile(parseInt(index));

    // Fallback to global owner-based Twitter info if node profile is missing or lacks Twitter data
    if ((!profile || !profile.twitterUsername) && owner) {
        const globalTwitter = getGlobalTwitterProfile(owner);
        if (globalTwitter) {
            profile = {
                satelliteIndex: parseInt(index),
                ownerAddress: owner,
                twitterUsername: globalTwitter.twitterUsername,
                twitterAvatar: globalTwitter.twitterAvatar
            };
        }
    }

    if (!profile) {
        return new Response(JSON.stringify({ profile: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Don't send raw icon data in JSON, send a URL to fetch it
    return new Response(JSON.stringify({
        profile: {
            satelliteIndex: profile.satelliteIndex,
            ownerAddress: profile.ownerAddress,
            iconUrl: `/api/lobster-icon?index=${profile.satelliteIndex}`,
            twitterUsername: profile.twitterUsername,
            twitterAvatar: profile.twitterAvatar
        }
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const contentType = (request.headers.get('content-type') || '').toLowerCase();
        console.log(`[API] POST /api/lobster-profile - Content-Type: ${contentType || 'none'}`);

        let satelliteIndex: number = -1;
        let ownerAddress: string = "";
        let twitterUsername: string | undefined = undefined;
        let twitterAvatar: string | undefined = undefined;

        // Strictly JSON for profile updates (Twitter-only)
        try {
            const body = await request.json();
            satelliteIndex = parseInt(body.satelliteIndex);
            ownerAddress = body.ownerAddress;
            twitterUsername = body.twitterUsername;
            twitterAvatar = body.twitterAvatar;
        } catch (e) {
            return new Response(JSON.stringify({
                error: `Failed to parse request body. Please use application/json.`
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (isNaN(satelliteIndex) || !ownerAddress) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        upsertProfile({
            satelliteIndex,
            ownerAddress,
            twitterUsername,
            twitterAvatar
        });

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        console.error('Error saving profile:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
