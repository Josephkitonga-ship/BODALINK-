/* About, Policies and terms, Contact us. Prices on these pages come from the live settings, so they never go stale. */
(function () {
  const BL = (window.BL = window.BL || {});
  const fill = (sec) => {
    BL.$$("[data-pass-price]", sec).forEach((e) => (e.textContent = BL.money(BL.cfg.pass_price)));
    BL.$$("[data-pass-hours]", sec).forEach((e) => (e.textContent = BL.cfg.pass_hours));
    BL.$$("[data-freeday]", sec).forEach((e) => (e.hidden = !BL.cfg.free_first_day));
  };
  const doc = {
    mount(sec) {
      sec.addEventListener("click", (e) => {
        const j = e.target.closest("[data-jump]"); if (!j) return;
        const t = BL.$("#" + j.dataset.jump, sec); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    show(sec) { fill(sec); window.scrollTo(0, 0); },
  };
  BL.views.about = doc;
  BL.views.terms = doc;

  const spaced = (d) => "+" + d.replace(/^(\d{3})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4");
  BL.views.contact = {
    mount() {},
    show(sec) {
      window.scrollTo(0, 0);
      const C = BL.config || {}, rows = [];
      const wa = String(C.SUPPORT_WHATSAPP || "").replace(/\D/g, ""), ph = String(C.SUPPORT_PHONE || "").replace(/\D/g, ""), em = String(C.SUPPORT_EMAIL || "").trim();
      if (wa) rows.push(["WhatsApp", spaced(wa), BL.waLink(wa, "Hello BodaLink, I have a question."), "Message us"]);
      if (ph) rows.push(["Phone", spaced(ph), BL.tel(ph), "Call us"]);
      if (em) rows.push(["Email", em, "mailto:" + em, "Write to us"]);
      BL.html(BL.$("#cList", sec), rows.length ? BL.h`${rows.map(([k, v, href, cta]) => BL.h`<div class="card ccard"><p class="muted small">${k}</p><p class="ccard__v">${v}</p>
          <a class="btn btn--${k === "WhatsApp" ? "green" : "soft"} btn--block" ${k === "WhatsApp" ? BL.raw('target="_blank" rel="noopener"') : ""} href="${href}">${cta}</a></div>`)}`
        : BL.h`<div class="card"><p>Contact details will be added here soon.</p></div>`);
    },
  };
})();
