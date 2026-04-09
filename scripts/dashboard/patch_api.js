const fs = require('fs');
const path = require('path');

const apiPath = path.join(process.env.HOME, 'Desktop/aloomii/scripts/dashboard/command-api.js');
let code = fs.readFileSync(apiPath, 'utf8');

if (!code.includes('module.exports.query = query;')) {
  code = code.replace(
    'module.exports = function registerCommandAPI(app, pool = null) {',
    'module.exports = registerCommandAPI;\n\nfunction registerCommandAPI(app, pool = null) {'
  );
  code += '\nmodule.exports.query = query;\nmodule.exports.getPool = getPool;\n';
}

const endpointCode = `
  // POST /api/command/learn-loop/run
  app.post('/api/command/learn-loop/run', async (req, res) => {
    try {
      const { runLearnLoop } = require('./learn-loop-cron');
      const client = await getPool().connect();
      try {
        const result = await runLearnLoop(client);
        res.json(result);
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('Learn loop manual run failed:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
`;

if (!code.includes('/api/command/learn-loop/run')) {
  code = code.replace(
    '// === CONTENT DRAFT WORKFLOW ===',
    endpointCode + '\n  // === CONTENT DRAFT WORKFLOW ==='
  );
}

fs.writeFileSync(apiPath, code);
console.log('Patched command-api.js');
