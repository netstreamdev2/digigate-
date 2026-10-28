// Made-up people and vehicles for the design mock-up. Phase 1 replaces this with the local database.

export const demoGuard = {
  firstName: 'Thabo',
  gate: 'Main Gate',
  lane: 'Vehicle lane',
  shift: '06:00–18:00',
} as const;

export const demoSiteStats = {
  vehiclesOnSite: 64,
  peopleOnSite: 118,
  averageStay: '1:49',
  openAlerts: 3,
} as const;

export const demoLastScan = {
  name: 'Lerato Mokoena',
  initials: 'LM',
  visitType: 'Visitor',
  direction: 'in',
  time: '2 min ago',
  fields: [
    { label: 'Plate', value: 'CA ***-456' },
    { label: 'Licence', value: '*****087' },
    { label: 'Vehicle', value: 'Toyota Corolla' },
    { label: 'People', value: '3' },
  ],
} as const;

export const demoVisitTypes = ['Visitor', 'Staff', 'Delivery', 'Contractor', 'Drop-off', 'Emergency'] as const;

export type DemoVisitType = (typeof demoVisitTypes)[number];

export const demoEntry = {
  disc: { make: 'Toyota', model: 'Corolla', colour: 'White', plate: 'CA 123-456', expires: '31 Mar 2027' },
  driver: { name: 'Lerato Mokoena', code: 'B', expires: '14 Aug 2029' },
  occupants: 3,
  visitType: 'Visitor' satisfies DemoVisitType,
} as const;

export const demoExit = {
  driver: { name: 'Sipho Dlamini', initials: 'SD', timeOnSite: '1h 49m' },
  arrivedIn: { vehicle: 'VW Polo · Silver', plate: 'CA 987-654', time: '10:12' },
  leavingIn: { vehicle: 'Toyota Corolla · White', plate: 'CA 123-456', entryDriver: 'Lerato Mokoena', entryTime: '09:31' },
} as const;
