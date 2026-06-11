// Vercel serverless entry point. Re-exports the Express app from server/index.js
// as the request handler. The vercel.json rewrite sends every /api/* request
// here, and Express routes it by the original path (/api/match, /api/email, …).
//
// server/index.js only starts a listener / background timers when run directly
// (`npm run server`), so importing it here just builds the routed app.
import app from '../server/index.js'

export default app
