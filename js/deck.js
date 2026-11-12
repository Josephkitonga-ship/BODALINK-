/* The advert deck: banners that scroll by themselves under the header. The first slide always welcomes the user.
   Admin edits the rest. If the server cannot be reached, built-in banners show instead. */
(function () {
  const BL = (window.BL = window.BL || {});
  // Finished banner pictures go in the banners folder. Any that are missing are skipped, so the deck still works.
  const BANNERS = ["home", "link", "parcel"].map((n, i) => ({
    files: ["banners/" + n + ".png", "banners/" + n + ".jpg", "banners/" + n + ".webp"],
    label: ["BodaLink offers", "BodaLink offers", "BodaLink offers"][i], act: "choose",
  }));
  const FALLBACK = [
    { title: "Install BodaLink on your phone", subtitle: "Opens full screen, works on weak data and needs no app store.", cta_text: "Install app", cta_link: "install", theme: "forest" },
  ];
  const SLIDE_MS = 5500;
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Built-in pictures for adverts that have no uploaded photo. They use the slide's text colour.
  const S = (inner) => BL.raw('<svg viewBox="0 0 300 220" aria-hidden="true" focusable="false">' + inner + "</svg>");
  const ART = {
    welcome: () => S('<g class="pulse"><circle cx="150" cy="110" r="46"/><circle cx="150" cy="110" r="46"/><circle cx="150" cy="110" r="46"/></g><svg x="96" y="60" width="108" height="100" viewBox="5 5 58 54"><use href="#mark"/></svg>'),
    route: () => S('<path class="trk" d="M30 180 C90 180 70 100 150 100 S230 40 270 40"/><path class="drw" pathLength="1" d="M30 180 C90 180 70 100 150 100 S230 40 270 40"/><circle cx="30" cy="180" r="9" class="ring"/><rect x="259" y="29" width="22" height="22" rx="5" class="solid"/><g class="b b1"><rect x="62" y="120" width="62" height="28" rx="14"/><text x="93" y="139">KSh 120</text></g><g class="b b2"><rect x="150" y="66" width="62" height="28" rx="14"/><text x="181" y="85">KSh 150</text></g><g class="b b3"><rect x="150" y="150" width="62" height="28" rx="14"/><text x="181" y="169">KSh 100</text></g>'),
    parcel: () => S('<g class="float"><path class="solid" d="M150 70 L210 98 L150 126 L90 98 Z" opacity=".9"/><path class="solid" d="M90 98 L150 126 L150 190 L90 160 Z" opacity=".55"/><path class="solid" d="M210 98 L150 126 L150 190 L210 160 Z" opacity=".75"/><path class="tape" d="M120 84 L180 112 L180 124 L120 96 Z"/></g><g class="bounce"><path class="solid" d="M232 36 a18 18 0 1 1 -36 0 c0 -14 18 -30 18 -30 s18 16 18 30z"/><circle cx="214" cy="38" r="6" class="hole"/></g><ellipse cx="150" cy="200" rx="52" ry="8" class="solid" opacity=".25"/>'),
    wallet: () => S('<g class="float"><rect x="62" y="64" width="176" height="112" rx="18" class="solid" opacity=".9"/><rect x="62" y="64" width="176" height="30" rx="18" class="solid" opacity=".5"/><text x="82" y="140" class="big">KSh 100</text><text x="82" y="162" class="small">24 hours online</text></g><g class="coin c1"><circle cx="246" cy="64" r="14"/><text x="246" y="69">K</text></g><g class="coin c2"><circle cx="58" cy="150" r="10"/></g>'),
    phone: () => S('<g class="float"><rect x="104" y="30" width="92" height="162" rx="16" class="solid" opacity=".92"/><rect x="112" y="46" width="76" height="120" rx="8" class="hole"/><svg x="122" y="66" width="56" height="52" viewBox="5 5 58 54"><use href="#mark"/></svg><rect x="120" y="134" width="60" height="22" rx="11" class="solid"/></g>'),
  };
  const pick = (a) => { const l = a.cta_link || ""; return /kind=parcel/.test(l) ? "parcel" : /role=rider/.test(l) ? "wallet" : l === "install" ? "phone" : "route"; };

  function welcome() {
    const me = BL.api.me, role = BL.api.role, first = me ? me.name.split(" ")[0] : "";
    const go = { rider: ["Open jobs", "#/rider"], admin: ["Open dashboard", "#/admin"] }[role] || (me ? ["Book now", "#/book"] : ["Get started", "#/auth?mode=register&role=passenger&next=/book"]);
    return { welcome: true, theme: "forest", title: first ? "Welcome to BodaLink, " + first : "Welcome to BodaLink",
      subtitle: role === "rider" ? "Go online, bid on rides and parcels, and keep every shilling." : role === "admin" ? "Your dashboard is one tap away."
        : "Book a boda or send a parcel. Riders near you bid and you pick the price.", cta_text: go[0], cta_link: go[1] };
  }

  const probe = (urls) => new Promise((resolve) => {
    let k = 0;
    const next = () => { if (k >= urls.length) return resolve(null); const im = new Image(); im.onload = () => resolve(urls[k]); im.onerror = () => { k++; next(); }; im.src = urls[k]; };
    setTimeout(() => resolve(null), 4000);
    next();
  });

  async function load() {
    let ads = [];
    try { ads = await BL.api.list("adverts", { filter: "active = true", sort: "sort,-created", perPage: 10 }); } catch (_) {}
    if (!ads.length) ads = FALLBACK;
    ads = ads.filter((a) => a.cta_link !== "install" || (BL.canInstall && BL.canInstall()));   // an installed app does not need the install banner
    const found = await Promise.all(BANNERS.map((b) => probe(b.files)));
    const banners = BANNERS.map((b, n) => (found[n] ? { picture: found[n], label: b.label, act: b.act } : null)).filter(Boolean);
    return [welcome(), ...banners, ...ads];
  }

  // Tapping a banner asks what the person wants, so it works for any picture
  function bannerGo() {
    const role = BL.api.role;
    const choose = (kind) => { localStorage.setItem("bl.draft", JSON.stringify({ kind })); location.hash = role === "passenger" ? "#/book" : "#/auth?mode=register&role=passenger&next=/book"; };
    if (role === "rider") { location.hash = "#/rider"; return; }
    if (role === "admin") { location.hash = "#/admin"; return; }
    BL.sheet(BL.h`<h3>What would you like to do?</h3><div class="stack" style="margin-top:14px">
      <button class="btn btn--green btn--lg btn--block" data-go="ride">Book a ride</button>
      <button class="btn btn--amber btn--lg btn--block" data-go="parcel">Send a parcel</button>
      ${role ? "" : BL.h`<a class="btn btn--dark btn--lg btn--block" href="#/auth?mode=register&role=rider" data-close>Ride with BodaLink</a>`}</div>`,
      (s, close) => BL.$$("[data-go]", s).forEach((b) => (b.onclick = () => { close(); choose(b.dataset.go); })));
  }
  // A picture-only advert from Admin (no short text, no button) shows as a finished banner
  const isBanner = (a) => a.picture || (a.image && !a.subtitle && !a.cta_text);
  const bannerSlide = (a, n, total) => {
    const src = a.picture || BL.api.fileUrl(a, "image"), label = a.label || a.title;
    const link = a.act ? BL.h`<a class="slide__link" href="#/" data-bact="${a.act}" aria-label="${label}">` : a.cta_link ? BL.h`<a class="slide__link" href="${a.cta_link}" ${/^https?:/i.test(a.cta_link) ? BL.raw('target="_blank" rel="noopener"') : ""} aria-label="${label}">` : BL.h`<span class="slide__link" role="img" aria-label="${label}">`;
    return BL.h`<article class="slide slide--image" role="group" aria-roledescription="slide" aria-label="${n + 1} of ${total}">${link}<img src="${src}" alt="" loading="${n < 2 ? "eager" : "lazy"}">${BL.raw(a.act || a.cta_link ? "</a>" : "</span>")}</article>`;
  };

  const cta = (a) => {
    if (!a.cta_text) return "";
    if (a.cta_link === "install") return BL.h`<button class="btn btn--light btn--sm" data-install>${a.cta_text}</button>`;
    const ext = /^https?:/i.test(a.cta_link || "");
    return BL.h`<a class="btn btn--light btn--sm" href="${a.cta_link || "#/"}" ${ext ? BL.raw('target="_blank" rel="noopener"') : ""}>${a.cta_text}</a>`;
  };
  const art = (a) => (a.image ? BL.h`<img src="${BL.api.fileUrl(a, "image")}" alt="" loading="lazy">` : ART[a.welcome ? "welcome" : pick(a)]());

  BL.deck = {
    async mount(box) {
      if (box._stop) box._stop();
      const ads = await load();
      let i = 0, x0 = null;
      BL.html(box, BL.h`<section class="deck" role="region" aria-roledescription="carousel" aria-label="BodaLink offers">
        <div class="deck__track">${ads.map((a, n) => (isBanner(a) ? bannerSlide(a, n, ads.length) : BL.h`<article class="slide slide--${a.theme || "forest"}" role="group" aria-roledescription="slide" aria-label="${n + 1} of ${ads.length}">
          <div class="slide__txt"><h2 class="a1">${a.title}</h2>${a.subtitle ? BL.h`<p class="a2">${a.subtitle}</p>` : ""}<div class="a3">${cta(a)}</div></div><div class="slide__art">${art(a)}</div></article>`))}</div>
        ${ads.length > 1 ? BL.h`<div class="deck__dots">${ads.map((_, n) => BL.h`<button aria-label="Show offer ${n + 1}"><i></i></button>`)}</div>` : ""}
      </section>`);
      const root = BL.$(".deck", box), track = BL.$(".deck__track", box), slides = BL.$$(".slide", box), dots = BL.$$(".deck__dots button", box);
      root.style.setProperty("--slide-ms", SLIDE_MS + "ms");
      const go = (n) => {
        i = (n + ads.length) % ads.length;
        track.style.transform = "translateX(" + -100 * i + "%)";
        slides.forEach((s, k) => s.classList.toggle("is-active", k === i));
        dots.forEach((d) => d.removeAttribute("aria-current"));
        void root.offsetWidth;                       // restart the timer bar
        if (dots[i]) dots[i].setAttribute("aria-current", "true");
      };
      const hold = () => root.classList.add("paused"), release = () => root.classList.remove("paused");
      dots.forEach((d, n) => (d.onclick = () => go(n)));
      root.addEventListener("animationend", (e) => { if (e.target.matches(".deck__dots i") && !reduce()) go(i + 1); });   // the timer bar finishing moves to the next slide
      let dx = 0;
      root.addEventListener("pointerdown", (e) => { x0 = e.clientX; dx = 0; hold(); });
      root.addEventListener("pointermove", (e) => { if (x0 !== null) dx = e.clientX - x0; });
      root.addEventListener("pointerup", (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 40) go(i + (e.clientX < x0 ? 1 : -1)); x0 = null; release(); });
      root.addEventListener("click", (e) => {
        const b = e.target.closest("[data-bact]"); if (!b) return;
        e.preventDefault();
        if (Math.abs(dx) < 12) bannerGo();    // a swipe is not a tap
      });
      root.addEventListener("pointercancel", () => { x0 = null; release(); });
      root.addEventListener("mouseenter", hold); root.addEventListener("mouseleave", release);
      root.addEventListener("focusin", hold); root.addEventListener("focusout", release);
      box._stop = () => {};
      go(0);
    },
  };
})();
