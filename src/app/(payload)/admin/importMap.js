import { OrderActions as OrderActions_bd9a3eb0969675b027902d6a22a18ee7 } from '@/components/admin/OrderActions'
import { EmailPreview as EmailPreview_26ff0c3c8c64756354667624f7216f27 } from '@/components/admin/EmailPreview'
import { AdminNavLinks as AdminNavLinks_f5da5fa50c48fc2ef14afcb84f969fcf } from '@/components/admin/AdminNavLinks'
import { CsvImportView as CsvImportView_b94aa5cdb66d1325eb1e92408003b805 } from '@/components/admin/CsvImportView'
import { CollectionCards as CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1 } from '@payloadcms/next/rsc'
import { S3ClientUploadHandler as S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24 } from '@payloadcms/storage-s3/client'

/** @type import('payload').ImportMap */
export const importMap = {
  "@/components/admin/OrderActions#OrderActions": OrderActions_bd9a3eb0969675b027902d6a22a18ee7,
  "@/components/admin/EmailPreview#EmailPreview": EmailPreview_26ff0c3c8c64756354667624f7216f27,
  "@/components/admin/AdminNavLinks#AdminNavLinks": AdminNavLinks_f5da5fa50c48fc2ef14afcb84f969fcf,
  "@/components/admin/CsvImportView#CsvImportView": CsvImportView_b94aa5cdb66d1325eb1e92408003b805,
  "@payloadcms/next/rsc#CollectionCards": CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1,
  "@payloadcms/storage-s3/client#S3ClientUploadHandler": S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24
}
