import { CandidateMatchAnalysis } from "@/features/candidates/candidate-match-analysis";

export default async function CandidateMatchAnalysisPage({ params, searchParams }: { params: Promise<{ candidateId: string }>; searchParams: Promise<{ jobId?: string }> }) {
  const { candidateId } = await params;
  const { jobId } = await searchParams;
  return <CandidateMatchAnalysis candidateId={candidateId} jobId={jobId} />;
}
