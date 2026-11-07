import { after } from "next/server";
import { saveNewsFromEmail } from "@/lib/news";
import { extractResultsFromNews, isReportCategory } from "@/lib/report-extraction";
import {
  emailAddress,
  parseAddressList,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySendgridSignature,
} from "@/lib/sendgrid";

// SendGrid Inbound Parse webhook. Company news emailed to the parse address are POSTed here
// as multipart/form-data (parsed fields mode, not raw MIME).
export async function POST(request: Request) {
  // Lets scripts/send-test-email.sh post unsigned emails locally.
  // Never honored outside development.
  const skipSignature =
    process.env.NODE_ENV === "development" &&
    process.env.SENDGRID_SKIP_SIGNATURE === "true";
  const publicKey = process.env.SENDGRID_INBOUND_PUBLIC_KEY;
  const allowedSenders = parseAddressList(
    process.env.SENDGRID_ALLOWED_SENDERS ?? "",
  );
  if ((!publicKey && !skipSignature) || allowedSenders.length === 0) {
    console.error(
      "SENDGRID_INBOUND_PUBLIC_KEY or SENDGRID_ALLOWED_SENDERS is not set",
    );
    return new Response(null, { status: 500 });
  }

  const signature = request.headers.get(SIGNATURE_HEADER);
  const timestamp = request.headers.get(TIMESTAMP_HEADER);
  // The signature covers the exact bytes received, so read the body raw before parsing it.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (
    !skipSignature &&
    (!publicKey ||
      !signature ||
      !timestamp ||
      !verifySendgridSignature({ publicKey, signature, timestamp, rawBody }))
  ) {
    return new Response(null, { status: 401 });
  }

  let form: FormData;
  try {
    form = await new Response(rawBody, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return new Response(null, { status: 400 });
  }

  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : undefined;
  };

  const from = field("from");
  if (!from || !allowedSenders.includes(emailAddress(from))) {
    // Respond 200 so SendGrid doesn't keep retrying an email we will never accept.
    console.warn("Inbound news email from a sender that is not allowed", {
      from,
    });
    return new Response(null, { status: 200 });
  }

  const subject = field("subject");
  const result = await saveNewsFromEmail({
    subject,
    text: field("text"),
    html: field("html"),
    headers: field("headers"),
  });

  if (result.saved) {
    console.log("Saved inbound news email", { subject, ...result });
    if (isReportCategory(result.category)) {
      // Only reports have results to extract. Reading one takes a while, so do it after
      // responding to SendGrid.
      const { newsId } = result;
      after(async () => {
        try {
          const extraction = await extractResultsFromNews(newsId);
          console.log("Extracted results from news", { newsId, ...extraction });
        } catch (error) {
          console.error("Extracting results from news failed", { newsId, error });
        }
      });
    }
  } else {
    // Respond 200 anyway: retrying the same email won't change the outcome.
    console.warn("Inbound news email was not saved", { from, subject, ...result });
  }

  return new Response(null, { status: 200 });
}
