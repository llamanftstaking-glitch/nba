"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ComponentProps } from "react";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The slate date selected in the URL (?date=YYYY-MM-DD). Undefined means "let the API pick today". */
export function useSelectedDate(): string | undefined {
  const sp = useSearchParams();
  const d = sp.get("date");
  return d && DATE_RE.test(d) ? d : undefined;
}

export function useSetDate(): (date: string | undefined) => void {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return useCallback(
    (date) => {
      const next = new URLSearchParams(sp.toString());
      if (date) next.set("date", date);
      else next.delete("date");
      const s = next.toString();
      router.push(s ? `${pathname}?${s}` : pathname);
    },
    [router, pathname, sp],
  );
}

/** Append the selected date to an internal href so navigation keeps the date context. */
export function useDateHref(): (href: string) => string {
  const date = useSelectedDate();
  return useCallback(
    (href: string) => {
      if (!date || href.includes("date=")) return href;
      return `${href}${href.includes("?") ? "&" : "?"}date=${date}`;
    },
    [date],
  );
}

type DLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

/** next/link that preserves ?date= across pages. */
export function DLink({ href, ...rest }: DLinkProps) {
  const withDate = useDateHref();
  return <Link href={withDate(href)} {...rest} />;
}
