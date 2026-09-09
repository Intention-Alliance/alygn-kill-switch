import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BRAND_FULL_NAME } from "@/lib/branding";

export const metadata: Metadata = {
  title: `Cluster Details — ${BRAND_FULL_NAME}`,
};

export default async function ClusterDetailsPage() {
  redirect("/kill-switch");
}
