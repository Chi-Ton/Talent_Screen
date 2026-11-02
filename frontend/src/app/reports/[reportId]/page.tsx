import { ScreeningReportDetail } from "@/features/reports/screening-report-detail";

export default async function ReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <ScreeningReportDetail reportId={reportId} />;
}
