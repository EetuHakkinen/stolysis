import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isLocale, localeCookie, matchLocale } from "./config";

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(localeCookie)?.value;
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : matchLocale(((await headers()).get("accept-language") ?? "").split(","));

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
