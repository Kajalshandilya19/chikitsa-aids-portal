import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HIV Pension Portal",
    short_name: "HIV Pension",
    description: "HIV Pension Portal, Rajasthan State AIDS Control Society, Government of Rajasthan",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#c8102e",
    lang: "en",
    categories: ["government", "health"],
    icons: [{ src: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
  };
}
