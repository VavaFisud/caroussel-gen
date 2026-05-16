import dotenv from 'dotenv';
import { createDashboardApp } from './dashboard-app.js';

dotenv.config();

const port = Number(process.env.PORT || 3000);
const app = createDashboardApp({ startScheduler: process.env.START_DAILY_SCHEDULER === 'true' });

app.listen(port, () => {
  console.log(`Carousel Generator dashboard: http://localhost:${port}`);
});
