import dotenv from 'dotenv';

dotenv.config();

if (!process.env.BOT_TOKEN) {
  console.error('BOT_TOKEN .env faylida topilmadi');
  process.exit(1);
}

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL || '@xavsiz_almash';
export const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN;
export const WEBAPP_URL = process.env.WEBAPP_URL || 'https://example.com/webapp';
