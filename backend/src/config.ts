import * as dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  host: optionalEnv('HOST', '0.0.0.0'),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  databaseUrl: requireEnv('DATABASE_URL'),
  redisUrl: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiry: optionalEnv('JWT_EXPIRY', '8h'),
  deviceTokenSecret: optionalEnv('DEVICE_TOKEN_SECRET', 'change-me-device-token-secret'),
  corsOrigin: optionalEnv('CORS_ORIGIN', 'http://localhost:5173'),
  updateFilesPath: optionalEnv('UPDATE_FILES_PATH', './updates'),
} as const;

export type Config = typeof config;
