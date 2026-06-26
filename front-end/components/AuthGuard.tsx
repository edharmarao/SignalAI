"use client";
/**
 * AuthGuard — client component that protects all authenticated routes.
 *
 * On mount it reads sessionStorage (browser-only). If no credentials are
 * present, it immediately redirects to /login.  Renders nothing (null) until
 * the check completes so protected pages never flash before the redirect.
 */
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { auth } from "@/lib/auth";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Never guard the login page itself
    if (pathname.startsWith("/login")) {
      setChecked(true);
      return;
    }
    if (!auth.isLoggedIn()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else {
      setChecked(true);
    }
  }, [pathname, router]);

  if (!checked) return null;
  return <>{children}</>;
}
