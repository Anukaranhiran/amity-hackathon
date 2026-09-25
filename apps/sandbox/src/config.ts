export const SANDBOX_JWT_SECRET = process.env.SANDBOX_JWT_SECRET || 'shulkerlab-demo-secret';
export const SANDBOX_PORT = Number(process.env.SANDBOX_PORT || 8700);

/** Seed test identities — the scanner's actors. */
export const SEED_USERS = [
  { username: 'alice@example.com', password: 'alice-password-1', role: 'user', name: 'Alice Chen' },
  { username: 'bob@example.com', password: 'bob-password-2', role: 'user', name: 'Bob Martinez' },
  { username: 'admin@shulkerlab.io', password: 'admin-secret-9', role: 'admin', name: 'Shulker Admin' },
];
