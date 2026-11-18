import { requireUserId } from "@/lib/auth";
import { suggestReportFieldChanges } from "@/lib/report-check";
import { suggestionsRequestSchema, type SuggestionsResponse } from "@/lib/report-check-api";

// Changes to the fields of a company being created that its reports don't have.
export async function POST(request: Request) {
  await requireUserId();
  const parsed = suggestionsRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { issuer, reports, fields } = parsed.data;

  try {
    const suggestions = await suggestReportFieldChanges({
      issuer,
      reports: reports.map((report) => ({ ...report, publishedAt: new Date(report.publishedAt) })),
      fields,
    });
    return Response.json({ suggestions } satisfies SuggestionsResponse);
  } catch (error) {
    console.error("Suggesting field changes failed", { issuer, error });
    return new Response(null, { status: 502 });
  }
}
