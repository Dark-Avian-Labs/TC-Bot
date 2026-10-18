const path = require('path');

module.exports = {
  apps: [
    {
      name: 'TC-Bot',
      script: './dist/tc-bot.js',
      cwd: path.dirname(__filename),
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      // A crash after this window resets the counter, so the limit never trips.
      min_uptime: '10s',
      max_restarts: 10,
      listen_timeout: 10000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
