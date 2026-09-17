import * as migration_20260916_073659_initial from './20260916_073659_initial';
import * as migration_20260916_090452_pages from './20260916_090452_pages';
import * as migration_20260916_124439_generation_batches from './20260916_124439_generation_batches';
import * as migration_20260916_124740_domain_affiliate from './20260916_124740_domain_affiliate';

export const migrations = [
  {
    up: migration_20260916_073659_initial.up,
    down: migration_20260916_073659_initial.down,
    name: '20260916_073659_initial',
  },
  {
    up: migration_20260916_090452_pages.up,
    down: migration_20260916_090452_pages.down,
    name: '20260916_090452_pages',
  },
  {
    up: migration_20260916_124439_generation_batches.up,
    down: migration_20260916_124439_generation_batches.down,
    name: '20260916_124439_generation_batches',
  },
  {
    up: migration_20260916_124740_domain_affiliate.up,
    down: migration_20260916_124740_domain_affiliate.down,
    name: '20260916_124740_domain_affiliate'
  },
];
