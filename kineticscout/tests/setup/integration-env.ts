import './unit-env'

// Integration tests run against a real Postgres database (see README: Testing).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://kinetic:kinetic_dev_only@localhost:5432/kineticscout_test'
process.env.STRIPE_SECRET_KEY = 'sk_test_integration_only'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_integration_test_secret'
