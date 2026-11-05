// Web push: Geesling's morning and after-work heads-ups, only for people who tick "Send me Geesling updates" on the
// "about you" form AND allow notifications in their browser. The browser hands us a subscription (an address only
// Geesling's server can send to, signed with its VAPID key); it's saved against the device's account and removed when
// they untick the box or delete their details. Sending lives in supabase/functions/push-alerts.
// Not on iPhone Safari tabs (Apple allows web push only for sites added to the Home Screen) or in the native app yet.
import { Platform } from "react-native";
import { ensureSession, supabase } from "./supabase";

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Whether this browser can get Geesling's notifications. */
export function pushSupported(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    VAPID_PUBLIC_KEY.length > 0 &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Asks the browser for permission. Call it straight from the tap (before any `await`), since some browsers only show
 * the prompt in direct response to one. Resolves to the browser's answer.
 */
export function askPushPermission(): Promise<NotificationPermission> {
  if (!pushSupported()) return Promise.resolve("denied");
  if (Notification.permission !== "default") return Promise.resolve(Notification.permission);
  return Notification.requestPermission();
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** With permission granted: subscribe this browser and save the subscription. Returns whether it's on. */
export async function enablePush(permission: NotificationPermission): Promise<boolean> {
  if (!pushSupported() || permission !== "granted") return false;
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
  await ensureSession();
  const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth });
  if (error) throw new Error(error.message);
  return true;
}

/** Stops notifications to this device: unsubscribes the browser and forgets every subscription saved for it. */
export async function disablePush(): Promise<void> {
  if (Platform.OS !== "web" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  await subscription?.unsubscribe().catch(() => false);
  await supabase.rpc("delete_my_push_subscriptions");
}
