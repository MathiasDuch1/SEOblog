import * as migration_20260916_073659_initial from './20260916_073659_initial';

export const migrations = [
  {
    up: migration_20260916_073659_initial.up,
    down: migration_20260916_073659_initial.down,
    name: '20260916_073659_initial'
  },
];
