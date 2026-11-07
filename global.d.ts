import type { Locale } from "@/i18n/config";
import type messages from "./messages/fi.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
