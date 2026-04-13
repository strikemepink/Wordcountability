// api/fetch-title.js
// Fetches the name/title of a charity website server-side (avoids CORS).
// POST { url: "https://www.redcross.org" }
// Returns { name: "Red Cross" } or { name: null } on failure.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let url;
  try {
    url = req.body?.url;
    if (!url) return res.status(400).json({ name: null });
    // Ensure protocol
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    new URL(url); // validate
  } catch {
    return res.status(400).json({ name: null });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Wordcountability/1.0)",
        "Accept": "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    const html = await response.text();

    // Try og:site_name first
    const ogSite = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"'<]+)["']/i)
                || html.match(/<meta[^>]*content=["']([^"'<]+)["'][^>]*property=["']og:site_name["']/i);
    if (ogSite) return res.status(200).json({ name: ogSite[1].trim() });

    // Try og:title
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"'<]+)["']/i)
                  || html.match(/<meta[^>]*content=["']([^"'<]+)["'][^>]*property=["']og:title["']/i);
    if (ogTitle) {
      const name = ogTitle[1].trim().split(/[|\-–]/)[0].trim();
      if (name) return res.status(200).json({ name });
    }

    // Fall back to <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const name = titleMatch[1].trim().split(/[|\-–]/)[0].trim();
      if (name) return res.status(200).json({ name });
    }

    // Last resort: derive from hostname
    const hostname = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
    const name = hostname.charAt(0).toUpperCase() + hostname.slice(1);
    return res.status(200).json({ name });

  } catch {
    // Return null — the UI will let the user type the name manually
    return res.status(200).json({ name: null });
  }
}
