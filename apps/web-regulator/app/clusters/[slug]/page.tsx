import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cluster Details — ALYGN Regulator",
};

export default async function ClusterDetailsPage() {
  redirect("/kill-switch");
}
