// Deterministic env for unit tests: no real database, Redis or MinIO is touched.
process.env['APP_ENV'] = 'local';
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'error';
process.env['AUTH_DB_PASSWORD'] = 'test';
process.env['REDIS_HOST'] = '';
process.env['MINIO_ACCESS_KEY'] = 'test';
process.env['MINIO_SECRET_KEY'] = 'test-secret';
process.env['JWT_SIGNING_KEY'] = 'test-jwt-signing-key-test-jwt-signing-key-0123456789';
process.env['PII_ENCRYPTION_KEY'] = Buffer.alloc(32, 3).toString('base64');
process.env['PII_HMAC_KEY'] = Buffer.alloc(32, 7).toString('base64');
process.env['MFA_ENFORCED'] = 'true';
process.env['SMS_PROVIDER'] = 'log';
