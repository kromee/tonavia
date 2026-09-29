const { searchTracks } = require('../_lib/spotify-catalog');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const query = String(request.query.q ?? '').trim();
  if (query.length < 2 || query.length > 80) {
    response.status(200).json({ tracks: [] });
    return;
  }

  try {
    const tracks = await searchTracks(query);
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({ tracks });
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'No se pudo buscar en Spotify.'
    });
  }
};
