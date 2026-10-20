"use client";

// Google Drive picker (like Asana's "Attach from Google Drive").
// Needs, in Vercel / .env:
//   NEXT_PUBLIC_GOOGLE_CLIENT_ID  (same value as GOOGLE_CLIENT_ID)
//   NEXT_PUBLIC_GOOGLE_API_KEY    (an API key with the Google Picker API enabled)
// Uses the "drive.file" permission: the panel only sees the files people pick.

export type PickedFile = { name: string; url: string; mimeType: string | null; iconUrl: string | null };

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
export const driveConfigured = !!CLIENT_ID && !!API_KEY;

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(el);
  });
}

let token: { value: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  await loadScript("https://accounts.google.com/gsi/client");
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (r: any) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || "Google sign-in was cancelled"));
        token = { value: r.access_token, expires: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e: any) => reject(new Error(e?.message || "Google sign-in was cancelled")),
    });
    client.requestAccessToken({ prompt: token ? "" : "consent" });
  });
}

export async function pickFromDrive(): Promise<PickedFile[]> {
  if (!driveConfigured) throw new Error("Google Drive isn't set up yet. Ask an admin (see Help → FAQ).");
  const [accessToken] = await Promise.all([getToken(), loadScript("https://apis.google.com/js/api.js")]);
  await new Promise<void>((resolve) => window.gapi.load("picker", { callback: () => resolve() }));
  const g = window.google.picker;
  return new Promise((resolve) => {
    const files = new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true);
    const shared = new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true).setEnableDrives(true);
    const picker = new g.PickerBuilder()
      .addView(files)
      .addView(shared)
      .enableFeature(g.Feature.MULTISELECT_ENABLED)
      .enableFeature(g.Feature.SUPPORT_DRIVES)
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .setTitle("Attach from Google Drive")
      .setCallback((data: any) => {
        if (data.action === g.Action.PICKED) {
          resolve(
            (data.docs ?? []).map((d: any) => ({
              name: d.name,
              url: d.url,
              mimeType: d.mimeType ?? null,
              iconUrl: d.iconUrl ?? null,
            })),
          );
        } else if (data.action === g.Action.CANCEL) resolve([]);
      })
      .build();
    picker.setVisible(true);
  });
}
