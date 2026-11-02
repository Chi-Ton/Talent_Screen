import { BatchDetailFailureRecovery } from "@/features/batches/batch-detail-failure-recovery";

export default async function BatchDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  return <BatchDetailFailureRecovery batchId={batchId} />;
}
