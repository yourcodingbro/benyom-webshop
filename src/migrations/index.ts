import * as migration_20261113_191624_initial from './20261113_191624_initial';
import * as migration_20261113_192000_order_events_append_only from './20261113_192000_order_events_append_only';
import * as migration_20261113_203439_media_storage_fields from './20261113_203439_media_storage_fields';
import * as migration_20261113_204024_media_filename_per_prefix from './20261113_204024_media_filename_per_prefix';
import * as migration_20261116_161931_admin_temporary_passwords from './20261116_161931_admin_temporary_passwords';
import * as migration_20261116_170823_product_identity_and_media_uploads from './20261116_170823_product_identity_and_media_uploads';
import * as migration_20261116_175758_slug_history_ordering_and_sales from './20261116_175758_slug_history_ordering_and_sales';
import * as migration_20261116_205853_email_settings_in_store from './20261116_205853_email_settings_in_store';
import * as migration_20261119_194111_delivery_fee_free_or_fixed from './20261119_194111_delivery_fee_free_or_fixed';

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
    name: '20261113_204024_media_filename_per_prefix',
  },
  {
    up: migration_20261116_161931_admin_temporary_passwords.up,
    down: migration_20261116_161931_admin_temporary_passwords.down,
    name: '20261116_161931_admin_temporary_passwords',
  },
  {
    up: migration_20261116_170823_product_identity_and_media_uploads.up,
    down: migration_20261116_170823_product_identity_and_media_uploads.down,
    name: '20261116_170823_product_identity_and_media_uploads',
  },
  {
    up: migration_20261116_175758_slug_history_ordering_and_sales.up,
    down: migration_20261116_175758_slug_history_ordering_and_sales.down,
    name: '20261116_175758_slug_history_ordering_and_sales',
  },
  {
    up: migration_20261116_205853_email_settings_in_store.up,
    down: migration_20261116_205853_email_settings_in_store.down,
    name: '20261116_205853_email_settings_in_store',
  },
  {
    up: migration_20261119_194111_delivery_fee_free_or_fixed.up,
    down: migration_20261119_194111_delivery_fee_free_or_fixed.down,
    name: '20261119_194111_delivery_fee_free_or_fixed'
  },
];
