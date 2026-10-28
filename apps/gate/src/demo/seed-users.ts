// Demo sign-in list until Phase 2 syncs real users from the dashboard. Never ship these accounts.
// Employee number → PIN: 1001 → 246810 (guard), 1002 → 135790 (guard), 2001 → 802460 (supervisor).
// Hashes made with scripts/hash-pin.mjs.
import type { GateUser } from '@/auth/users';

export const seedUsers: readonly GateUser[] = [
  {
    id: 'user-1001',
    employeeNumber: '1001',
    firstName: 'Thabo',
    lastName: 'Khumalo',
    role: 'guard',
    pin: {
      algorithm: 'pbkdf2-sha256',
      iterations: 20000,
      salt: 'ud1r8nMdjDUlEmsDZ7enbQ==',
      hash: 'tl6g3j2ZKNvPNuMyQUh6poi4HlLrBZ7wwMXQzWYrzuI=',
    },
  },
  {
    id: 'user-1002',
    employeeNumber: '1002',
    firstName: 'Zanele',
    lastName: 'Mthembu',
    role: 'guard',
    pin: {
      algorithm: 'pbkdf2-sha256',
      iterations: 20000,
      salt: 'v1SJ4VSD7kggX27WAMJTpA==',
      hash: 'RoLOix+KzzZlD1sZFq+RlvU1gb3tKmtxWwKpY5WvI1I=',
    },
  },
  {
    id: 'user-2001',
    employeeNumber: '2001',
    firstName: 'Kagiso',
    lastName: 'Molefe',
    role: 'supervisor',
    pin: {
      algorithm: 'pbkdf2-sha256',
      iterations: 20000,
      salt: 'lWmmwUd3njJwr8vxe1lfNA==',
      hash: 'w4m/oMnCt0d/vonxxNSKLQkZ6CWbZyqqU2L4EjrmoNA=',
    },
  },
];
