import { BatchProcessingMonitor } from "@/features/batches/batch-processing-monitor";

export default async function BatchProcessingPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  return <BatchProcessingMonitor batchId={batchId} />;
}
