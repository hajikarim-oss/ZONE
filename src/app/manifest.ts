// "Add to Home screen" support: the panel opens full-screen with the TBM icon.
export default function manifest() {
  return {
    name: "TBM Post Prod Panel",
    short_name: "Post Prod",
    description: "Projects, team and brand tracking for The Bored Monkey post-production.",
    start_url: "/home",
    display: "standalone",
    background_color: "#1e1f21",
    theme_color: "#1e1f21",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
