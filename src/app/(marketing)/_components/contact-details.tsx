import Link from "next/link";

import { routes } from "@/lib/navigation";
import { site } from "@/lib/site";

/**
 * "E-mail us at ..." sentence fragment for policy pages. When no support
 * address is configured it points to the contact form instead of inventing one.
 */
export function ContactLine({ prefix = "Contact us" }: { prefix?: string }) {
  return site.supportEmail ? (
    <>
      {prefix} at <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> or through the{" "}
      <Link href={routes.contact}>contact form</Link>.
    </>
  ) : (
    <>
      {prefix} through the <Link href={routes.contact}>contact form</Link>.
    </>
  );
}
