"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LiveRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/equity/strategies"); }, [router]);
  return null;
}
