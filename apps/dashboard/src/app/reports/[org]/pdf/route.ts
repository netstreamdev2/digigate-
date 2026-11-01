import { callReports } from "@/lib/reports-api";

/** Hands over the report as a file. The function that builds it checks who is asking. */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { searchParams } = new URL(request.url);
  const response = await callReports({
    action: "pdf",
    org,
    client: searchParams.get("client") || null,
    frequency: searchParams.get("report") ?? "daily",
    day: searchParams.get("day") ?? "",
  });
  if (!response.ok) return new Response("That report couldn't be built. Go back and try again.", { status: response.status });

  return new Response(response.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": response.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
