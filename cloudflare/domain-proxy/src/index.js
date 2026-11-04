// Serves the live site (geesling.expo.app) at geesling.ca, so the custom domain needs no paid Expo plan.
// Every request is fetched from Expo Hosting as-is; deploys to geesling.expo.app show up here straight away.
const ORIGIN = "geesling.expo.app";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // www.geesling.ca → geesling.ca, so there's one address to share.
    if (url.hostname === "www.geesling.ca") {
      url.hostname = "geesling.ca";
      return Response.redirect(url.toString(), 301);
    }
    url.hostname = ORIGIN;
    const response = await fetch(new Request(url.toString(), request), { redirect: "manual" });
    // Keep any redirect from Expo on our own domain.
    const location = response.headers.get("location");
    if (location && location.includes(ORIGIN)) {
      const headers = new Headers(response.headers);
      headers.set("location", location.replace(`https://${ORIGIN}`, "https://geesling.ca"));
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },
};
