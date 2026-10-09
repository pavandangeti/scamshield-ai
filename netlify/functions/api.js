// Netlify Function: wraps the Express app so /api/* works on Netlify.
const serverless = require('serverless-http');
const app = require('../../server');

// Netlify may pass either the original path (/api/check) or the rewritten
// function path (/.netlify/functions/api/check). Normalize to the Express route.
function normalize(path) {
  if (!path) return '/api';
  if (path.startsWith('/.netlify/functions/api')) {
    const rest = path.replace('/.netlify/functions/api', '');
    return rest ? '/api' + rest : '/api';
  }
  return path;
}

const handler = serverless(app);

exports.handler = async (event, context) => {
  event.path = normalize(event.path);
  return handler(event, context);
};
