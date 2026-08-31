import { identifyImage } from "@/lib/lens";
import { classifyUpstreamError } from "@/lib/errors";

const MAX_IMAGE_BYTES = 500 * 1024;

export async function POST(request: Request) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.error("[api/lens] SERPAPI_KEY is not configured");
    return Response.json(
      { error: "Something's misconfigured on our end. We're on it — please try again shortly." },
      { status: 500 }
    );
  }

  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "Missing image file" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Image too large (max 500KB)" }, { status: 400 });
  }

  try {
    const result = await identifyImage(file, apiKey);
    return Response.json(result);
  } catch (err) {
    console.error("[api/lens] upstream error:", err);
    const { message, status } = classifyUpstreamError(
      err,
      "Something went wrong identifying that photo. Please try again."
    );
    return Response.json({ error: message }, { status });
  }
}
