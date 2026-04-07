export const config = {
  port: parseInt(process.env.PORT ?? '3220', 10),

  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'marketplace',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'accessSecret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'refreshSecret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  },

  orderRateLimitMinutes: parseInt(process.env.ORDER_RATE_LIMIT_MINUTES ?? '1', 10),
};
