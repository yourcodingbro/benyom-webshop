import * as migration_20261113_191624_initial from './20261113_191624_initial';
import * as migration_20261113_192000_order_events_append_only from './20261113_192000_order_events_append_only';
import * as migration_20261113_203439_media_storage_fields from './20261113_203439_media_storage_fields';
import * as migration_20261113_204024_media_filename_per_prefix from './20261113_204024_media_filename_per_prefix';
import * as migration_20261116_161931_admin_temporary_passwords from './20261116_161931_admin_temporary_passwords';
import * as migration_20261116_170823_product_identity_and_media_uploads from './20261116_170823_product_identity_and_media_uploads';
import * as migration_20261116_175758_slug_history_ordering_and_sales from './20261116_175758_slug_history_ordering_and_sales';
import * as migration_20261116_205853_email_settings_in_store from './20261116_205853_email_settings_in_store';
import * as migration_20261119_194111_delivery_fee_free_or_fixed from './20261119_194111_delivery_fee_free_or_fixed';
import * as migration_20261119_205652_payload_native_email_template from './20261119_205652_payload_native_email_template';
import * as migration_20261127_152944_content_settings_restructure from './20261127_152944_content_settings_restructure';
import * as migration_20261127_153043_remove_general_seo_settings from './20261127_153043_remove_general_seo_settings';
import * as migration_20261127_155841_settings_pages_split from './20261127_155841_settings_pages_split';
import * as migration_20261127_155926_remove_moved_settings from './20261127_155926_remove_moved_settings';
import * as migration_20261127_163034_remove_listing_titles from './20261127_163034_remove_listing_titles';
import * as migration_20261127_163234_payment_settings_global from './20261127_163234_payment_settings_global';
import * as migration_20261127_163314_remove_payment_from_store from './20261127_163314_remove_payment_from_store';
import * as migration_20261127_163632_status_emails_into_email_settings from './20261127_163632_status_emails_into_email_settings';
import * as migration_20261127_163659_remove_notification_settings from './20261127_163659_remove_notification_settings';
import * as migration_20261127_170320_payment_knowledge_group from './20261127_170320_payment_knowledge_group';
import * as migration_20261127_170347_remove_old_payment_items from './20261127_170347_remove_old_payment_items';
import * as migration_20261127_171516_preorder_steps_group from './20261127_171516_preorder_steps_group';
import * as migration_20261127_171543_remove_old_process_steps from './20261127_171543_remove_old_process_steps';
import * as migration_20261127_172209_process_heading_group from './20261127_172209_process_heading_group';
import * as migration_20261127_172226_remove_old_process_heading from './20261127_172226_remove_old_process_heading';

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
    name: '20261119_194111_delivery_fee_free_or_fixed',
  },
  {
    up: migration_20261119_205652_payload_native_email_template.up,
    down: migration_20261119_205652_payload_native_email_template.down,
    name: '20261119_205652_payload_native_email_template',
  },
  {
    up: migration_20261127_152944_content_settings_restructure.up,
    down: migration_20261127_152944_content_settings_restructure.down,
    name: '20261127_152944_content_settings_restructure',
  },
  {
    up: migration_20261127_153043_remove_general_seo_settings.up,
    down: migration_20261127_153043_remove_general_seo_settings.down,
    name: '20261127_153043_remove_general_seo_settings',
  },
  {
    up: migration_20261127_155841_settings_pages_split.up,
    down: migration_20261127_155841_settings_pages_split.down,
    name: '20261127_155841_settings_pages_split',
  },
  {
    up: migration_20261127_155926_remove_moved_settings.up,
    down: migration_20261127_155926_remove_moved_settings.down,
    name: '20261127_155926_remove_moved_settings',
  },
  {
    up: migration_20261127_163034_remove_listing_titles.up,
    down: migration_20261127_163034_remove_listing_titles.down,
    name: '20261127_163034_remove_listing_titles',
  },
  {
    up: migration_20261127_163234_payment_settings_global.up,
    down: migration_20261127_163234_payment_settings_global.down,
    name: '20261127_163234_payment_settings_global',
  },
  {
    up: migration_20261127_163314_remove_payment_from_store.up,
    down: migration_20261127_163314_remove_payment_from_store.down,
    name: '20261127_163314_remove_payment_from_store',
  },
  {
    up: migration_20261127_163632_status_emails_into_email_settings.up,
    down: migration_20261127_163632_status_emails_into_email_settings.down,
    name: '20261127_163632_status_emails_into_email_settings',
  },
  {
    up: migration_20261127_163659_remove_notification_settings.up,
    down: migration_20261127_163659_remove_notification_settings.down,
    name: '20261127_163659_remove_notification_settings',
  },
  {
    up: migration_20261127_170320_payment_knowledge_group.up,
    down: migration_20261127_170320_payment_knowledge_group.down,
    name: '20261127_170320_payment_knowledge_group',
  },
  {
    up: migration_20261127_170347_remove_old_payment_items.up,
    down: migration_20261127_170347_remove_old_payment_items.down,
    name: '20261127_170347_remove_old_payment_items',
  },
  {
    up: migration_20261127_171516_preorder_steps_group.up,
    down: migration_20261127_171516_preorder_steps_group.down,
    name: '20261127_171516_preorder_steps_group',
  },
  {
    up: migration_20261127_171543_remove_old_process_steps.up,
    down: migration_20261127_171543_remove_old_process_steps.down,
    name: '20261127_171543_remove_old_process_steps',
  },
  {
    up: migration_20261127_172209_process_heading_group.up,
    down: migration_20261127_172209_process_heading_group.down,
    name: '20261127_172209_process_heading_group',
  },
  {
    up: migration_20261127_172226_remove_old_process_heading.up,
    down: migration_20261127_172226_remove_old_process_heading.down,
    name: '20261127_172226_remove_old_process_heading'
  },
];
