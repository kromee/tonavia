module.exports = function handler(request, response) {
  const params = new URLSearchParams();
  for (const key of ['code', 'error', 'state']) {
    const value = request.query[key];
    if (typeof value === 'string' && value) params.set(key, value);
  }

  const query = params.toString();
  response.setHeader('Cache-Control', 'no-store');
  response.statusCode = 302;
  response.setHeader('Location', query ? `/admin?${query}` : '/admin');
  response.end();
};
