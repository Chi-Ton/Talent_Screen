import { CandidateResumeParsedProfile } from "@/features/candidates/candidate-resume-parsed-profile";

export default async function CandidateProfilePage({ params, searchParams }: { params: Promise<{ candidateId: string }>; searchParams: Promise<{ jobId?: string }> }) {
  const { candidateId } = await params;
  const { jobId } = await searchParams;
  return <CandidateResumeParsedProfile candidateId={candidateId} jobId={jobId} />;
}
