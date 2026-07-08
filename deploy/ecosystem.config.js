module.exports = {
  apps: [{
    name: 'interview-agent-api',
    // 通过 current 符号链接指向当前激活的版本，回滚时只需改链接 + reload
    script: './server/dist/index.js',
    cwd: '/var/www/interview-agent/current',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      // 数据库放在 shared 目录，不随版本切换而变动
      DB_PATH: '/var/www/interview-agent/shared/data/interview.db',
    },
    // 环境变量从 shared 目录读取，避免每次部署覆盖
    env_file: '/var/www/interview-agent/shared/.env',
  }]
};
