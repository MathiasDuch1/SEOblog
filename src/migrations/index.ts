import * as migration_20260916_073659_initial from './20260916_073659_initial';
import * as migration_20260916_090452_pages from './20260916_090452_pages';

export const migrations = [
  {
    up: migration_20260916_073659_initial.up,
    down: migration_20260916_073659_initial.down,
    name: '20260916_073659_initial',
  },
  {
    up: migration_20260916_090452_pages.up,
    down: migration_20260916_090452_pages.down,
    name: '20260916_090452_pages'
  },
];
