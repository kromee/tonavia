let cachedToken = null;

async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify no está configurado en el servidor.');
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    throw new Error('No se pudo autenticar con Spotify.');
  }

  const payload = await response.json();
  cachedToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000
  };

  return cachedToken.accessToken;
}

async function searchTracks(query) {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    q: query,
    type: 'track',
    limit: '10',
    market: 'MX'
  });

  const response = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error('Spotify no pudo completar la búsqueda.');
  }

  const payload = await response.json();
  return (payload.tracks?.items ?? []).map((track) => ({
    albumImageUrl: track.album?.images?.[2]?.url ?? track.album?.images?.[0]?.url ?? null,
    artist: (track.artists ?? []).map((artist) => artist.name).join(', '),
    spotifyTrackId: track.id,
    title: track.name
  }));
}

module.exports = { searchTracks };
