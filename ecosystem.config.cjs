// PM2: pm2 start ecosystem.config.cjs  (lee .env con las variables TUBIO_*)
module.exports = {
  apps: [
    {
      name: 'tubio',
      script: 'src/server.ts',
      interpreter: 'node',
      node_args: '--env-file=.env',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
      out_file: 'data/logs/out.log',
      error_file: 'data/logs/error.log',
      time: true,
    },
  ],
}
