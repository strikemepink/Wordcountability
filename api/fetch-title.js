// api/fetch-title.js
// Fetches the name/title of a charity website server-side (avoids CORS).
// POST { url: "https://www.redcross.org" }  (signed-in app users only)
// Returns { name: "Red Cross" } or { name: null } on failure.
//
// Safety: this fetches a web address someone typed, so it only answers signed-in users,
// only visits normal public websites (never private or internal network addresses, checked
// again on every redirect), and only reads the start of the page.

const dns = require("dns").promises;
const net = require("net");
const { getCallerUid } = require("./_lib/server");

const MAX_REDIRECTS = 3;
const MAX_BYTES = 300 * 1024;

// True for addresses on private, local or otherwise non-public networks
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||   // carrier-grade NAT
      (a === 169 && b === 254) ||             // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));   // IPv4 written as IPv6
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") ||
    v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

// Throws unless the address is a normal public http(s) website on the standard ports
async function assertPublicUrl(rawUrl) {
  const u = new URL(rawUrl);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("bad port");
  if (u.username || u.password) throw new Error("credentials in url");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new Error("private host");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) throw new Error("private address");
  return u;
}

// Reads at most MAX_BYTES of the response body as text
async function readStart(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = []; let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); total += value.length;
  }
  try { await reader.cancel(); } catch {}
  return Buffer.concat(chunks.map(c => Buffer.from(c))).toString("utf8").slice(0, MAX_BYTES);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!(await getCallerUid(req))) return res.status(401).json({ name: null, error: "Sign-in required" });

  let url;
  try {
    url = req.body?.url;
    if (!url || typeof url !== "string" || url.length > 500) return res.status(400).json({ name: null });
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    new URL(url);
  } catch {
    return res.status(400).json({ name: null });
  }

  try {
    // Follow redirects by hand so every hop gets the same public-address check
    let current = url, response;
    const deadline = AbortSignal.timeout(8000);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(current);
      response = await fetch(current, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Wordcountability/1.0)",
          "Accept": "text/html",
        },
        redirect: "manual",
        signal: deadline,
      });
      const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
      if (!location) break;
      current = new URL(location, current).toString();
      if (hop === MAX_REDIRECTS) return res.status(200).json({ name: null });
    }

    const html = await readStart(response);

    const ogSite = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"'<]+)["']/i)
                || html.match(/<meta[^>]*content=["']([^"'<]+)["'][^>]*property=["']og:site_name["']/i);
    if (ogSite) return res.status(200).json({ name: ogSite[1].trim() });

    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"'<]+)["']/i)
                  || html.match(/<meta[^>]*content=["']([^"'<]+)["'][^>]*property=["']og:title["']/i);
    if (ogTitle) {
      const name = ogTitle[1].trim().split(/[|\-–]/)[0].trim();
      if (name) return res.status(200).json({ name });
    }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const name = titleMatch[1].trim().split(/[|\-–]/)[0].trim();
      if (name) return res.status(200).json({ name });
    }

    const hostname = new URL(current).hostname.replace(/^www\./, "").split(".")[0];
    const name = hostname.charAt(0).toUpperCase() + hostname.slice(1);
    return res.status(200).json({ name });

  } catch {
    return res.status(200).json({ name: null });
  }
};
