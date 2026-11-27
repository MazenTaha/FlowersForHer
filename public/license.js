// The Hunter License: its own page at #license, opened from its card in the folder.
// The license is a HoloCard (holocard.js): it tilts toward the pointer, or a finger dragged
// over it, and its foil catches the light; left alone it drifts slowly by itself.
//
// Talks to welcome.js through window.ffhLicense:
//   go()      inside the tap on the folder card: puts #license in the address
//   enter()   the folder has faded away: show the page (or the folder again, if you went back)
// The browser's back/forward buttons move between this page and the folder.
(() => {
  "use strict";
  const box = document.getElementById("license");
  const welcome = window.ffhWelcome;
  if (!box || !welcome || !window.React || !window.ReactDOM || !window.HoloCard) return;

  const React = window.React;
  const h = React.createElement;
  const { useEffect, useState } = React;
  const HoloCard = window.HoloCard;
  const mountAt = box.querySelector(".license-stage");
  const homeBtn = box.querySelector(".home-btn");

  const params = new URLSearchParams(location.search);
  const say = params.has("say") ? params.get("say") : "Asmaa!";
  const name = say.replace(/[\s!?.,~]+$/u, "").trim();

  const LICENSE = "#license";
  const IMAGE = "hunter-license.webp";
  const RATIO = 654 / 1035;              // the picture's own shape
  const onPage = () => location.hash === LICENSE;
  const homeUrl = () => location.pathname + location.search;

  // as big as fits: room for the note below and the home button above
  const fitWidth = () => Math.round(Math.max(170, Math.min(340, window.innerWidth - 56, (window.innerHeight - 190) * RATIO)));

  function Page() {
    const [width, setWidth] = useState(fitWidth);
    useEffect(() => {
      let timer = 0;
      const onResize = () => { clearTimeout(timer); timer = setTimeout(() => setWidth(fitWidth()), 120); };
      window.addEventListener("resize", onResize);
      return () => { window.removeEventListener("resize", onResize); clearTimeout(timer); };
    }, []);
    return h(React.Fragment, null,
      h(HoloCard, {
        image: IMAGE,
        alt: name ? `${name}'s Hunter License` : "A Hunter License",
        preset: "shards",
        intensity: 0.7,
        frame: 4.5,
        edgeSparkle: 0.9,
        glare: 0.55,
        radius: Math.round(width * 0.04),
        width,
      }),
      h("p", { className: "license-note" },
        name ? `Licensed Hunter: ${name}` : "Licensed Hunter", h("span", { "aria-hidden": "true" }, " (●'◡'●)")));
  }

  let root = null, cameFromHome = false, hideTimer = 0;
  function show() {
    clearTimeout(hideTimer);
    if (!root) { root = window.ReactDOM.createRoot(mountAt); root.render(h(Page)); }
    box.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("show")));
  }
  function hide(then) {                  // fade out, then let the card (and its WebGL) go
    if (!root) { if (then) then(); return; }
    box.classList.remove("show");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (root) { root.unmount(); root = null; }
      box.hidden = true;
      cameFromHome = false;
      if (then) then();
    }, 450);
  }

  // show whichever page the address says
  function route() {
    if (onPage()) { welcome.hide(); show(); return; }
    if (root) hide(() => { if (!onPage() && location.hash !== "#flowers") welcome.show(); });
  }

  window.ffhLicense = {
    go() { history.pushState({ ffh: "license" }, "", LICENSE); cameFromHome = true; },
    enter() {
      if (onPage()) show();
      else { cameFromHome = false; welcome.show(); }   // went back while the folder faded
    },
  };

  homeBtn.addEventListener("click", () => {
    if (cameFromHome) { history.back(); return; }      // popstate -> route()
    history.pushState(null, "", homeUrl());
    route();
  });
  window.addEventListener("popstate", route);
  if (onPage()) show();                  // a link straight to the license
})();
