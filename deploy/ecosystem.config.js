module.exports = {
  apps: [{
    name: 'interview-agent-api',
    script: './server/dist/index.js',
    cwd: '/var/www/interview-agent',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      DB_PATH: '/data/interview-agent/interview.db',
    },
    env_file: '/var/www/interview-agent/server/.env',
  }]
};
