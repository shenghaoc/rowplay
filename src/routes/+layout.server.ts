import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
  return {
    user: event.locals.user,
    demo: event.locals.demo,
    // Whether the OAuth "Connect Concept2" flow is available (app configured).
    oauthEnabled: !!event.platform?.env?.CONCEPT2_CLIENT_ID,
    // Locale + theme resolved server-side from cookies (SSR-consistent).
    lang: event.locals.lang,
    theme: event.locals.theme,
  };
};
