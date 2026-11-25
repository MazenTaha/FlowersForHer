// The opening screen: a little folder. Tap it to open, then tap the "Flowers for her"
// paper and the page begins (cat, then lilies, with the music). That tap is also what lets
// phones play the song, so flowers.js only starts once it happens.
//
// Talks to flowers.js through window.ffhWelcome:
//   connect(fn)    flowers.js hands over its launcher. fn() runs inside the tap; it returns
//                  start() to call once the folder has faded away, or null if not ready yet
//   setReady(ok)   flowers.js says whether the page can open yet (the music is still loading)
//   show()/hide()  home / the flowers page (#flowers): put the folder back (fresh, closed) or away
// ?folder=0 skips this screen (the plain "tap to open" is used instead).
(() => {
  "use strict";
  const box = document.getElementById("welcome");
  const params = new URLSearchParams(location.search);
  if (!box || params.get("folder") === "0" || !window.React || !window.ReactDOM || !window.FolderComponent) return;

  const React = window.React;
  const h = React.createElement;
  const { useEffect, useState } = React;
  const Folder = window.FolderComponent;

  const say = params.has("say") ? params.get("say") : "Asmaa!";
  const name = say.replace(/[\s!?.,~]+$/u, "").trim();
  const LABEL = name ? `For ${name}` : "For you";

  // ---------------------------------------------------------------- talking to flowers.js
  let launcher = null, ready = false, launched = false;
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());
  window.ffhWelcome = {
    connect(fn) { launcher = fn; notify(); },
    setReady(ok) { ready = !!ok; notify(); },
    show() { if (!root) mount(); },        // back home: a fresh folder
    hide() {                               // the flowers page was opened by its address
      if (!root) return;
      root.unmount(); root = null;
      box.hidden = true; box.classList.remove("gone");
    },
  };
  const canLaunch = () => !!launcher && ready && !launched;

  function launch() {
    if (!canLaunch()) return;
    const start = launcher();                // in the tap: primes the music
    if (!start) return;
    launched = true;
    notify();
    setTimeout(() => {                       // let the paper zoom up, then fade into the page
      box.classList.add("gone");
      setTimeout(() => {
        if (root) { root.unmount(); root = null; }   // gone completely while the flowers play
        box.hidden = true;
        box.classList.remove("gone");
        start();
      }, 700);
    }, 450);
  }

  // ---------------------------------------------------------------- the papers
  const flowers = h("div", { className: "paper polaroid" },
    h("img", { src: "bouquet.webp", alt: "A bouquet of ASCII lilies", draggable: false }),
    h("span", { className: "caption" }, "Flowers for her"));

  // placeholder cards for what's coming next: a skeleton picture and text lines
  const upcoming = (lines) => h("div", { className: "paper upcoming", "aria-label": "Upcoming" },
    h("span", { className: "sk sk-pic" }),
    h("span", { className: "up-row" },
      h("span", { className: "up-title" }, "Upcoming"),
      h("span", { className: "up-badge" }, "soon")),
    ...lines.map((w) => h("span", { className: "sk sk-line", style: { width: w } })));
  const soon1 = upcoming(["92%", "74%"]);
  const soon2 = upcoming(["84%", "58%"]);

  // wide screens: the papers fan out in a row with the flowers in the middle;
  // narrow screens: they stand up in a stack with the flowers in front
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const spread = Math.min((vw - 32) / (224 * 2.35), (vh - 140) / 270, 2);
    if (spread >= 0.95) return { layout: "spread", size: spread, order: [soon1, flowers, soon2], flowersAt: 1 };
    const stack = Math.max(0.6, Math.min((vw - 40) / 224, (vh - 150) / 300, 2));
    return { layout: "stack", size: stack, order: [flowers, soon1, soon2], flowersAt: 0 };
  }

  function Welcome() {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState(fit);
    const [, bump] = useState(0);
    useEffect(() => {
      const onChange = () => bump((n) => n + 1);
      listeners.add(onChange);
      let timer = 0;
      const onResize = () => { clearTimeout(timer); timer = setTimeout(() => setView(fit()), 120); };
      window.addEventListener("resize", onResize);
      return () => { listeners.delete(onChange); window.removeEventListener("resize", onResize); clearTimeout(timer); };
    }, []);

    const hint = launched ? "" : !open ? "tap the folder" : canLaunch() ? "tap the flowers" : "one moment…";
    return h(React.Fragment, null,
      h(Folder, {
        items: view.order.map((content) => ({ content })),
        label: LABEL,
        color: "#4a8cff",
        paperColor: "#fffaf3",
        layout: view.layout,
        size: view.size,
        tabPosition: "right",
        tilt: 0.6,
        open,
        onOpenChange: setOpen,
        onItemClick: (item, index) => { if (index === view.flowersAt) launch(); },
      }),
      h("p", { className: "welcome-hint", "aria-live": "polite" }, hint));
  }

  let root = null;
  function mount() {                         // a fresh folder: closed, papers dropping in
    launched = false;
    box.hidden = false;
    root = window.ReactDOM.createRoot(box);
    root.render(h(Welcome));
  }
  if (location.hash !== "#flowers") mount();   // a link straight to the flowers page skips the folder
})();
