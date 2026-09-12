// Shared test environment. Integration tests that need real services should
// read these URLs (they match docker-compose.yml and .github/workflows/ci.yml).
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.DATABASE_URL ??= "postgres://findremind:findremind@localhost:5432/findremind_test";
process.env.ELASTICSEARCH_URL ??= "http://localhost:9200";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.AI_KEYS_ENCRYPTION_KEY ??= "test-encryption-key-test-encryption";
