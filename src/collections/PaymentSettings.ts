import type { Field, GlobalConfig } from "payload";

import { adminOnly } from "@/collections/utils/access";
import { textListField } from "@/collections/utils/fields";
import { NAV_GROUPS } from "@/collections/utils/nav-groups";

/** Payment page texts, delivery methods (with fees) and the collection point. */
export const paymentSettingsFields: Field[] = [
  {
    name: "paymentPage",
    label: "„Fizetés és szállítás” oldal szövegei",
    type: "group",
    admin: {
      description:
        "A „Fizetés és szállítás” oldal címe, bevezetője és szakaszcímei. Ezek a szövegek csak ezen az oldalon jelennek meg. A szállítási módokat, a díjakat és az átvételi helyet az oldal a lenti csoportokból veszi, azokat itt nem kell megismételni.",
    },
    fields: [
      {
        name: "title",
        label: "Oldalcím",
        type: "text",
        required: true,
        defaultValue: "Fizetés és szállítás",
      },
      {
        name: "intro",
        label: "Bevezető",
        type: "textarea",
        defaultValue:
          "Előrendelés esetén online fizetés nincs: a vételárat személyes átvételkor vagy kiszállításkor kell kiegyenlíteni.",
      },
      {
        name: "methodsHeading",
        label: "„Szállítási módok” szakasz címe",
        type: "text",
        required: true,
        defaultValue: "Átvételi és szállítási módok",
      },
      {
        name: "collectionHeading",
        label: "„Személyes átvétel” szakasz címe",
        type: "text",
        required: true,
        defaultValue: "Személyes átvétel",
      },
      {
        name: "openingHoursHeading",
        label: "„Nyitvatartás” szakasz címe",
        type: "text",
        required: true,
        defaultValue: "Nyitvatartás",
      },
    ],
  },
  {
    name: "preorderSteps",
    label: "Előrendelés menete",
    type: "group",
    fields: [
      {
        name: "processHeading",
        label: "„Előrendelés menete” szakasz címe",
        type: "text",
        required: true,
        defaultValue: "Az előrendelés menete",
      },
      textListField(
        "processSteps",
        "Az előrendelés lépései (számozott lista)",
        "Lépés"
      ),
    ],
  },
  {
    name: "paymentKnowledge",
    label: "Fizetési tudnivalók",
    type: "group",
    fields: [
      {
        name: "paymentHeading",
        label: "„Fizetés” szakasz címe",
        type: "text",
        required: true,
        defaultValue: "Fizetés",
      },
      textListField(
        "paymentItems",
        "Fizetési tudnivalók (felsorolás)",
        "Tudnivaló"
      ),
    ],
  },
  {
    name: "deliveryMethods",
    label: "Szállítási módok",
    type: "array",
    fields: [
      { name: "methodId", label: "Azonosító", type: "text", required: true },
      {
        name: "kind",
        label: "Típus",
        type: "select",
        required: true,
        options: [
          { label: "Személyes átvétel", value: "collection" },
          { label: "Kiszállítás", value: "delivery" },
        ],
      },
      { name: "name", label: "Név", type: "text", required: true },
      { name: "description", label: "Leírás", type: "textarea" },
      {
        name: "enabled",
        label: "Elérhető",
        type: "checkbox",
        defaultValue: true,
      },
      {
        name: "feeKind",
        label: "Díj típusa",
        type: "select",
        required: true,
        defaultValue: "free",
        options: [
          { label: "Ingyenes", value: "free" },
          { label: "Fix díj", value: "fixed" },
        ],
      },
      {
        name: "feeAmount",
        label: "Díj (Ft)",
        type: "number",
        min: 0,
        admin: { condition: (_data, sibling) => sibling?.feeKind === "fixed" },
        validate: (
          value: number | null | undefined,
          { siblingData }: { siblingData: Record<string, unknown> }
        ) =>
          siblingData.feeKind !== "fixed" ||
          (typeof value === "number" &&
            Number.isSafeInteger(value) &&
            value >= 0)
            ? true
            : "Fix díjhoz egész forintösszeg szükséges.",
      },
    ],
  },
  {
    name: "collection",
    label: "Személyes átvétel",
    type: "group",
    fields: [
      { name: "address", label: "Átvételi cím", type: "text" },
      {
        name: "openingHours",
        label: "Nyitvatartás",
        type: "array",
        fields: [{ name: "line", label: "Sor", type: "text", required: true }],
      },
      { name: "note", label: "Megjegyzés", type: "textarea" },
    ],
  },
];

export const PaymentSettings: GlobalConfig = {
  slug: "payment-settings",
  label: "Fizetési és szállítási beállítások",
  admin: { group: NAV_GROUPS.SETTINGS },
  access: { read: () => true, update: adminOnly },
  fields: paymentSettingsFields,
};
