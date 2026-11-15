import { requireUserId } from "@/lib/auth";
import { checkReport } from "@/lib/report-check";
import { fieldsRequestSchema, type FieldsResponse } from "@/lib/report-check-api";

// The fields of a company being created that the report doesn't have, and its revenue breakdowns.
export async function POST(request: Request) {
  await requireUserId();
  const parsed = fieldsRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { issuer, report, reportingCycle, fields } = parsed.data;

  try {
    const checked = await checkReport({
      issuer,
      report: { ...report, publishedAt: new Date(report.publishedAt) },
      cycle: reportingCycle,
      fields,
    });
    return Response.json((checked ?? null) satisfies FieldsResponse);
  } catch (error) {
    console.error("Checking fields against report failed", { issuer, reportId: report.id, error });
    return new Response(null, { status: 502 });
  }
}
