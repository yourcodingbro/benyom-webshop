import { AdminAccountActions as AdminAccountActions_d4c1a39377ab97ab5ac19fd57fa55511 } from '@/components/admin/AdminAccountActions'
import { InviteAdminForm as InviteAdminForm_c52446367466bfc4359a86ca37f98bd2 } from '@/components/admin/InviteAdminForm'
import { OrderActions as OrderActions_bd9a3eb0969675b027902d6a22a18ee7 } from '@/components/admin/OrderActions'
import { EmailPreview as EmailPreview_26ff0c3c8c64756354667624f7216f27 } from '@/components/admin/EmailPreview'
import { AdminNavLinks as AdminNavLinks_f5da5fa50c48fc2ef14afcb84f969fcf } from '@/components/admin/AdminNavLinks'
import { MustChangePasswordGate as MustChangePasswordGate_daf2dde71dcc88e9704b93b54ab0a1d6 } from '@/components/admin/MustChangePasswordGate'
import { CsvImportView as CsvImportView_b94aa5cdb66d1325eb1e92408003b805 } from '@/components/admin/CsvImportView'
import { ChangePasswordView as ChangePasswordView_1df2e6e12fd92054767cf0e411cb1120 } from '@/components/admin/ChangePasswordView'
import { CollectionCards as CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1 } from '@payloadcms/next/rsc'
import { S3ClientUploadHandler as S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24 } from '@payloadcms/storage-s3/client'

/** @type import('payload').ImportMap */
export const importMap = {
  "@/components/admin/AdminAccountActions#AdminAccountActions": AdminAccountActions_d4c1a39377ab97ab5ac19fd57fa55511,
  "@/components/admin/InviteAdminForm#InviteAdminForm": InviteAdminForm_c52446367466bfc4359a86ca37f98bd2,
  "@/components/admin/OrderActions#OrderActions": OrderActions_bd9a3eb0969675b027902d6a22a18ee7,
  "@/components/admin/EmailPreview#EmailPreview": EmailPreview_26ff0c3c8c64756354667624f7216f27,
  "@/components/admin/AdminNavLinks#AdminNavLinks": AdminNavLinks_f5da5fa50c48fc2ef14afcb84f969fcf,
  "@/components/admin/MustChangePasswordGate#MustChangePasswordGate": MustChangePasswordGate_daf2dde71dcc88e9704b93b54ab0a1d6,
  "@/components/admin/CsvImportView#CsvImportView": CsvImportView_b94aa5cdb66d1325eb1e92408003b805,
  "@/components/admin/ChangePasswordView#ChangePasswordView": ChangePasswordView_1df2e6e12fd92054767cf0e411cb1120,
  "@payloadcms/next/rsc#CollectionCards": CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1,
  "@payloadcms/storage-s3/client#S3ClientUploadHandler": S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24
}
