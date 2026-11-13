import * as migration_20261113_191624_initial from './20261113_191624_initial';
import * as migration_20261113_192000_order_events_append_only from './20261113_192000_order_events_append_only';
import * as migration_20261113_203439_media_storage_fields from './20261113_203439_media_storage_fields';
import * as migration_20261113_204024_media_filename_per_prefix from './20261113_204024_media_filename_per_prefix';

export const migrations = [
  {
    up: migration_20261113_191624_initial.up,
    down: migration_20261113_191624_initial.down,
    name: '20261113_191624_initial',
  },
  {
    up: migration_20261113_192000_order_events_append_only.up,
    down: migration_20261113_192000_order_events_append_only.down,
    name: '20261113_192000_order_events_append_only',
  },
  {
    up: migration_20261113_203439_media_storage_fields.up,
    down: migration_20261113_203439_media_storage_fields.down,
    name: '20261113_203439_media_storage_fields',
  },
  {
    up: migration_20261113_204024_media_filename_per_prefix.up,
    down: migration_20261113_204024_media_filename_per_prefix.down,
    name: '20261113_204024_media_filename_per_prefix'
  },
];
