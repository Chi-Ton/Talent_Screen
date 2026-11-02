import { JobOpeningDetail } from "@/features/jobs/job-opening-detail";

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <JobOpeningDetail jobId={jobId} />;
}
