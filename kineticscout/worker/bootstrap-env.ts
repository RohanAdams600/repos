// Imported first by worker/index.ts. ES module imports are evaluated in order, so these defaults
// are in place before any module that reads them at load time (the logger, the env schema).
process.env.SERVICE_ROLE ??= 'worker'
process.env.SERVICE_NAME ??= 'kineticscout-worker'

export {}
