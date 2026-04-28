// Vercel Serverless entrypoint for /health
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
};
//added 