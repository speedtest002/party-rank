interface Env {
  VIDEO_CDN_PREFIX?: string;
}

interface EventContext {
  env: Env;
  params: { slug: string };
  request: Request;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, Content-Type",
};

export const onRequest = async (context: EventContext) => {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const videoPath = url.searchParams.get("url");

  if (!videoPath) {
    return new Response(JSON.stringify({ error: "Missing ?url= parameter." }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const prefix = env.VIDEO_CDN_PREFIX || "";
  const targetUrl = `${prefix}${videoPath}`;

  try {
    const upstreamHeaders: Record<string, string> = {};
    const range = request.headers.get("Range");
    if (range) upstreamHeaders["Range"] = range;

    const upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    const responseHeaders: Record<string, string> = { ...CORS_HEADERS };

    const ct = upstream.headers.get("Content-Type");
    if (ct) responseHeaders["Content-Type"] = ct;

    const cl = upstream.headers.get("Content-Length");
    if (cl) responseHeaders["Content-Length"] = cl;

    const cr = upstream.headers.get("Content-Range");
    if (cr) responseHeaders["Content-Range"] = cr;

    const ar = upstream.headers.get("Accept-Ranges");
    if (ar) responseHeaders["Accept-Ranges"] = ar;

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[video-proxy] error:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch video." }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
};
