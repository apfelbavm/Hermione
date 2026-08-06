// A literal inline-script string (see app/layout.tsx's THEME_BOOTSTRAP_SCRIPT for why this can't be
// a normal module import) that patches window.fetch to attach the "per tab" session token (see
// client/authClient.ts) as an Authorization header on every same-origin request — including
// Next.js's own client-side navigation fetches, which client/api.ts's requestJson() never sees.
// A no-op whenever sessionStorage holds no token (i.e. "per browser" scope, or not signed in yet).
import { TAB_TOKEN_KEY } from "./authClient";

export const TAB_FETCH_BOOTSTRAP_SCRIPT = `(function(){try{var KEY=${JSON.stringify(TAB_TOKEN_KEY)};var orig=window.fetch.bind(window);window.fetch=function(input,init){try{var token=window.sessionStorage.getItem(KEY);if(token){init=init||{};var h=new Headers(init.headers||{});if(!h.has("Authorization"))h.set("Authorization","Bearer "+token);init=Object.assign({},init,{headers:h});}}catch(e){}return orig(input,init);};}catch(e){}})();`;
