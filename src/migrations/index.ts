import * as migration_20260916_073659_initial from './20260916_073659_initial';
import * as migration_20260916_090452_pages from './20260916_090452_pages';
import * as migration_20260916_124439_generation_batches from './20260916_124439_generation_batches';
import * as migration_20260916_124740_domain_affiliate from './20260916_124740_domain_affiliate';
import * as migration_20260916_131158_keyword_source_dataforseo from './20260916_131158_keyword_source_dataforseo';
import * as migration_20260917_074423_domain_scheduling from './20260917_074423_domain_scheduling';
import * as migration_20260917_080354_redirects_publish_error_scheduler_status from './20260917_080354_redirects_publish_error_scheduler_status';
import * as migration_20260917_130916_domain_dataforseo from './20260917_130916_domain_dataforseo';
import * as migration_20260917_131614_keyword_research from './20260917_131614_keyword_research';

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
    name: '20260916_124740_domain_affiliate',
  },
  {
    up: migration_20260916_131158_keyword_source_dataforseo.up,
    down: migration_20260916_131158_keyword_source_dataforseo.down,
    name: '20260916_131158_keyword_source_dataforseo',
  },
  {
    up: migration_20260917_074423_domain_scheduling.up,
    down: migration_20260917_074423_domain_scheduling.down,
    name: '20260917_074423_domain_scheduling',
  },
  {
    up: migration_20260917_080354_redirects_publish_error_scheduler_status.up,
    down: migration_20260917_080354_redirects_publish_error_scheduler_status.down,
    name: '20260917_080354_redirects_publish_error_scheduler_status',
  },
  {
    up: migration_20260917_130916_domain_dataforseo.up,
    down: migration_20260917_130916_domain_dataforseo.down,
    name: '20260917_130916_domain_dataforseo',
  },
  {
    up: migration_20260917_131614_keyword_research.up,
    down: migration_20260917_131614_keyword_research.down,
    name: '20260917_131614_keyword_research'
  },
];
