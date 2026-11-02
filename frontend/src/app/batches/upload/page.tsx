import { UploadCvBatch } from "@/features/batches/upload-cv-batch";

export default async function UploadBatchPage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const params = await searchParams;
  return <UploadCvBatch jobId={params.jobId} />;
}
