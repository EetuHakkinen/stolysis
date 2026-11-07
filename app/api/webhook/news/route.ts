import { after } from "next/server";
import { extractResultsAfterResponse, saveNewsFromEmail } from "@/lib/news";
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
  const email = {
    subject,
    text: field("text"),
    html: field("html"),
    headers: field("headers"),
  };
  // Saving can take a while when the company is created from its report, so respond to SendGrid
  // first. It gets 200 either way: retrying the same email won't change the outcome.
  after(async () => {
    try {
      const result = await saveNewsFromEmail(email);
      if (result.saved) {
        console.log("Saved inbound news email", { subject, ...result });
        extractResultsAfterResponse(result);
      } else {
        console.warn("Inbound news email was not saved", { from, subject, ...result });
      }
    } catch (error) {
      console.error("Saving inbound news email failed", { from, subject, error });
    }
  });

  return new Response(null, { status: 200 });
}
