// Deterministic, non-secret environment for unit tests. No network services are contacted.
Object.assign(process.env, { NODE_ENV: 'test' })
process.env.DEPLOY_ENV = 'local'
process.env.APP_URL = 'http://localhost:3000'
process.env.DATABASE_URL ??= 'postgresql://kinetic:kinetic_dev_only@localhost:5432/kineticscout_test'
process.env.SUPABASE_URL = 'https://example-project.supabase.co'
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key_000000000000'
process.env.HASH_PEPPER = 'test-pepper-0123456789abcdef0123456789abcdef' // gitleaks:allow (test fixture)
process.env.INTERNAL_API_SECRET = 'test-internal-secret-0123456789abcdef0123' // gitleaks:allow (test fixture)
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_test_monthly'
process.env.STRIPE_PRICE_PRO_YEARLY = 'price_test_yearly'
process.env.LOG_LEVEL = 'fatal'
