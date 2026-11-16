import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
} from "payload";

import { adminOnly, serverOnly } from "@/collections/utils/access";
import { importJobEndpoints } from "@/collections/utils/endpoints";
import { NAV_GROUPS } from "@/collections/utils/nav-groups";

export const IMPORT_JOB_STATUS_LABELS: Record<string, string> = {
  previewed: "Előnézet kész",
  running: "Folyamatban",
  completed: "Befejezve",
  failed: "Sikertelen",
};

/** Records are created only by the dry-run service (upload on the create view), never by a form save or API call. */
const onlyFromPreview: CollectionBeforeChangeHook = ({
  data,
  operation,
  req,
}) => {
  if (operation === "create" && req.context.importJobFromPreview !== true) {
    throw new APIError(
      "Új import csak CSV-feltöltéssel és próbafuttatással hozható létre.",
      403
    );
  }
  return data;
};

/**
 * Persisted CSV import jobs ("Termékimportok"): the list is the import history, the create view uploads
 * a CSV and runs the dry run, the detail view shows progress and reports and offers the explicit apply,
 * resume and retry. Both views are one custom `views.edit.root` (no editable form). Preview (dry run) and apply are separate steps. Apply processes
 * product groups in short batches and records each finished group in `results`, so an interrupted
 * run (timeout, deploy) resumes without redoing or losing work. Nothing is ever deleted.
 */
export const ImportJobs: CollectionConfig = {
  slug: "import-jobs",
  labels: { singular: "Import", plural: "Importok" },
  admin: {
    useAsTitle: "fileName",
    group: NAV_GROUPS.SYSTEM,
    defaultColumns: [
      "createdAt",
      "fileName",
      "status",
      "createdByLabel",
      "finishedAt",
    ],
    description:
      "CSV-termékimportok előzményei. Új import: „Új létrehozása” → feltöltés, próbafuttatás, majd megerősítés.",
    components: {
      views: {
        edit: {
          root: { Component: "@/components/admin/ImportJobView#ImportJobView" },
        },
      },
    },
  },
  access: {
    read: adminOnly,
    // Admins may open the create view; the hook still refuses any create that is not a dry run.
    create: adminOnly,
    update: serverOnly,
    delete: serverOnly,
  },
  defaultSort: "-createdAt",
  endpoints: importJobEndpoints,
  hooks: { beforeChange: [onlyFromPreview] },
  fields: [
    {
      name: "fileName",
      label: "Fájl",
      type: "text",
      required: true,
      admin: { readOnly: true },
    },
    {
      name: "status",
      label: "Állapot",
      type: "select",
      required: true,
      index: true,
      options: Object.entries(IMPORT_JOB_STATUS_LABELS).map(
        ([value, label]) => ({ value, label })
      ),
      admin: { readOnly: true },
    },
    {
      name: "createdBy",
      label: "Indította",
      type: "relationship",
      relationTo: "users",
      admin: { readOnly: true },
    },
    {
      name: "createdByLabel",
      label: "Indította (e-mail)",
      type: "text",
      admin: { readOnly: true },
    },
    {
      name: "startedAt",
      label: "Alkalmazás kezdete",
      type: "date",
      admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "heartbeatAt",
      label: "Utolsó előrehaladás",
      type: "date",
      admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "finishedAt",
      label: "Befejezve",
      type: "date",
      admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "error",
      label: "Hiba",
      type: "textarea",
      admin: { readOnly: true },
    },
    {
      name: "previewReport",
      label: "Előnézet (próbafuttatás) eredménye",
      type: "json",
      admin: { readOnly: true },
    },
    {
      name: "results",
      label: "Feldolgozott termékcsoportok",
      type: "json",
      admin: { readOnly: true },
    },
    {
      name: "finalReport",
      label: "Végeredmény",
      type: "json",
      admin: { readOnly: true },
    },
    {
      name: "csv",
      label: "CSV tartalom",
      type: "textarea",
      required: true,
      admin: { readOnly: true, hidden: true },
    },
  ],
};
