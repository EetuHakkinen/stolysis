"use client";

import dynamic from "next/dynamic";

// The steps of creating a company, rendered only in the browser, since they start from the draft
// in session storage.
export const CreateCompanyDetailsStep = dynamic(
  () => import("@/components/create-company-form").then((module) => module.CreateCompanyForm),
  { ssr: false },
);

export const CreateCompanyFieldsStep = dynamic(
  () => import("@/components/create-company-fields").then((module) => module.CreateCompanyFields),
  { ssr: false },
);
