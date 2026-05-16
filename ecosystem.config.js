export default {
  apps: [
    {
      name: 'carousel-gen-dashboard',
      script: 'src/dashboard.js',
      env: {
        NODE_ENV: 'production',
        START_DAILY_SCHEDULER: 'false'
      }
    },
    {
      name: 'carousel-gen-bot',
      script: 'src/telegram-bot.js',
      env: { NODE_ENV: 'production' }
    }
  ]
};
