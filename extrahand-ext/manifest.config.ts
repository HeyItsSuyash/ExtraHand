import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest(async (env) => ({
  manifest_version: 3,
  name: "Extra Hand",
  version: "1.0.0",
  description: "Do lazy browsing with the help of AI.",
  permissions: [
    "storage",
    "alarms",
    "tabs",
    "scripting",
    "webNavigation",
    "idle",
    "notifications",
    "sidePanel"
  ],
  host_permissions: [
    "<all_urls>"
  ],
  externally_connectable: {
    matches: [
      "http://localhost:*/*",
      "https://*.vercel.app/*",
      "https://*.suyashshukla.com/*"
    ]
  },
  background: {
    service_worker: "src/background.ts",
    type: "module"
  },
  icons: {
    "16": "extrahand.png",
    "48": "extrahand.png",
    "128": "extrahand.png"
  },
  action: {
    default_title: "Open Extra Hand",
    default_icon: "extrahand.png"
  },
  side_panel: {
    default_path: "src/sidepanel/index.html"
  },
  options_page: "src/options/index.html",
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content.ts", "src/content/recorder.ts"],
      run_at: "document_idle"
    },
    {
      matches: [
        "http://localhost:3000/*",
        "https://*.vercel.app/*",
        "https://*.suyashshukla.com/*"
      ],
      js: ["src/content/auth.ts"]
    }
  ]
}));
