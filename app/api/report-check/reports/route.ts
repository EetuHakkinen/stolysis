import { requireUserId } from "@/lib/auth";
import { companyIssuer, findLatestReports } from "@/lib/report-check";
import { reportsRequestSchema, type ReportsResponse } from "@/lib/report-check-api";

// The latest financial statements release and interim report of a company being created, from its
// Nasdaq issuer or, without one, the issuer matching its name.
export async function POST(request: Request) {
  await requireUserId();
  const parsed = reportsRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { name, nasdaqName, reportingCycle } = parsed.data;

  try {
    const issuer = await companyIssuer(name, nasdaqName || null);
    const reports = issuer ? await findLatestReports(issuer, reportingCycle) : [];
    return Response.json({
      issuer: issuer ?? null,
      reports: reports.map((report) => ({ ...report, publishedAt: report.publishedAt.toISOString() })),
    } satisfies ReportsResponse);
  } catch (error) {
    console.error("Finding reports of company being created failed", { name, nasdaqName, error });
    return new Response(null, { status: 502 });
  }
}
