import type { MetadataRoute } from "next";

/** A government back office: nothing here is for search engines. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
