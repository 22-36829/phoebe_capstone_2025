const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy API requests to backend
  app.use(
    '/api',
    createProxyMiddleware({
      target: process.env.REACT_APP_API_BASE || 'http://localhost:5000',
      changeOrigin: true,
      logLevel: 'warn', // Reduce log noise
      onError: (err, req, res) => {
        // Only log errors for API endpoints, not static files
        if (req.path.startsWith('/api')) {
          console.error('Proxy error:', err.message);
        }
      },
      onProxyReq: (proxyReq, req, res) => {
        // Suppress favicon requests from proxy logs
        if (req.path === '/favicon.ico') {
          return;
        }
      }
    })
  );
  
  // Ignore favicon requests to prevent proxy errors
  app.use('/favicon.ico', (req, res) => {
    res.status(204).end();
  });
};

