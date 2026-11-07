import Link from "next/link";
import { Button } from "@/components/ui/button";

// A shadcn Button that navigates like a Next.js Link.
export function ButtonLink({
  href,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "render" | "nativeButton"> & {
  href: string;
}) {
  return <Button render={<Link href={href} />} nativeButton={false} {...props} />;
}
