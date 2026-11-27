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
    show() { if (!root && location.hash !== "#license") mount(); },   // back home: a fresh folder
    hide() {                               // another page was opened by its address
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

  // the Hunter License card: opens its own page (license.js)
  function openLicense() {
    if (launched || !window.ffhLicense) return;
    launched = true;
    notify();
    window.ffhLicense.go();                  // in the tap: #license goes in the address
    setTimeout(() => {                       // the same zoom-and-fade as the flowers
      box.classList.add("gone");
      setTimeout(() => {
        if (root) { root.unmount(); root = null; }
        box.hidden = true;
        box.classList.remove("gone");
        window.ffhLicense.enter();
      }, 700);
    }, 450);
  }

  // ---------------------------------------------------------------- the papers
  // the one real card: the bouquet, its name with a "new" badge, a little note, and the song
  const flowers = h("div", { className: "paper polaroid" },
    h("span", { className: "fl-pic" },
      h("img", { src: "bouquet.webp", alt: "A bouquet of ASCII lilies", draggable: false }),
      h("span", { className: "up-spark s1", "aria-hidden": "true" }, "✦"),
      h("span", { className: "up-spark s2", "aria-hidden": "true" }, "✦")),
    h("span", { className: "up-row" },
      h("span", { className: "up-title fl-title" }, "Flowers for her"),
      h("span", { className: "up-badge fl-badge" }, "new")),
    h("span", { className: "fl-desc" }, "A little bouquet of lilies, blooming just for you"),
    h("span", { className: "up-foot fl-foot" },
      h("span", { className: "fl-song" }, "♪ Heartbeat"),
      h("span", { className: "up-heart", "aria-hidden": "true" }, "<3")));

  // a thank-you for Hunter x Hunter, with her very own Hunter License inside
  const hunter = h("div", { className: "paper polaroid", "aria-label": "Your Hunter License" },
    h("span", { className: "hx-pic" },
      h("img", { src: "hunter-license.webp", alt: "", draggable: false }),
      h("span", { className: "up-spark s1", "aria-hidden": "true" }, "✦"),
      h("span", { className: "up-spark s2", "aria-hidden": "true" }, "✦")),
    h("span", { className: "up-row" },
      h("span", { className: "up-title fl-title" }, "Hunter License"),
      h("span", { className: "up-badge hx-badge" }, "yours")),
    h("span", { className: "fl-desc" }, "Thank you for getting me into HxH! Here's your very own Hunter License"),
    h("span", { className: "up-foot fl-foot" },
      h("span", { className: "hx-chip" }, "✦ Exam passed"),
      h("span", { className: "up-heart", "aria-hidden": "true" }, "<3")));

  // placeholder cards for what's coming next: a skeleton picture with a little icon, a title
  // with a "soon" badge, two skeleton lines and an "in the making" progress bar
  const svg = (paths) => h("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", fill: "none", stroke: "currentColor",
    strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" }, ...paths.map((d) => h("path", { d })));
  const GIFT = ["M4 11h16v9H4z", "M3 7.5h18V11H3z", "M12 7.5V20", "M12 7.5C10.5 4 7 4 7.2 6.2 7.4 7.5 12 7.5 12 7.5z",
    "M12 7.5c1.5-3.5 5-3.5 4.8-1.3-.2 1.3-4.8 1.3-4.8 1.3z"];
  const upcoming = (icon, lines, progress) => h("div", { className: "paper upcoming", "aria-label": "Upcoming, coming soon" },
    h("span", { className: "sk up-pic" },
      h("span", { className: "up-icon" }, svg(icon)),
      h("span", { className: "up-spark s1", "aria-hidden": "true" }, "✦"),
      h("span", { className: "up-spark s2", "aria-hidden": "true" }, "✦")),
    h("span", { className: "up-row" },
      h("span", { className: "up-title" }, "Upcoming"),
      h("span", { className: "up-badge" }, "soon")),
    ...lines.map((w) => h("span", { className: "sk sk-line", style: { width: w } })),
    h("span", { className: "up-foot" },
      h("span", { className: "up-bar" }, h("span", { style: { width: progress } })),
      h("span", { className: "up-heart", "aria-hidden": "true" }, "<3")));
  const soon = upcoming(GIFT, ["90%", "66%"], "62%");

  // wide screens: the papers fan out in a row with the flowers in the middle;
  // narrow screens: they stand up in a stack with the flowers in front
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const spread = Math.min((vw - 32) / (224 * 2.35), (vh - 140) / 270, 2);
    if (spread >= 0.95) return { layout: "spread", size: spread, order: [hunter, flowers, soon] };
    const stack = Math.max(0.6, Math.min((vw - 40) / 224, (vh - 150) / 300, 2));
    return { layout: "stack", size: stack, order: [flowers, hunter, soon] };
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

    // only "tap the folder" while it's closed; once open, nothing (unless the music is still loading)
    const hint = launched ? "" : !open ? "tap the folder" : canLaunch() ? "" : "one moment…";
    return h(React.Fragment, null,
      h(Folder, {
        items: view.order.map((content) => ({ content })),
        label: LABEL,
        color: "#3A506B",
        paperColor: "#FBF1E4",
        layout: view.layout,
        size: view.size,
        tabPosition: "right",
        tilt: 0.6,
        open,
        onOpenChange: setOpen,
        onItemClick: (item, index) => {
          const paper = view.order[index];
          if (paper === flowers) launch();
          else if (paper === hunter) openLicense();
        },
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
  // a link straight to the flowers page or the license skips the folder
  if (location.hash !== "#flowers" && location.hash !== "#license") mount();
})();
