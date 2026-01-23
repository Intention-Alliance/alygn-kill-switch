import { ClusterDetails } from "@/components/cluster/cluster-details";

export default async function ClusterDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClusterDetails slug={slug || ""} />;
}
