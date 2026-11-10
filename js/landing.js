/* Landing page: hero booking widget. Booking itself needs a verified passenger account. */
(function () {
  const BL = (window.BL = window.BL || {});
  const draft = (d) => localStorage.setItem("bl.draft", JSON.stringify(d));
  let size = "small";

  BL.views.landing = {
    mount(sec) {
      const $ = (s) => BL.$(s, sec);
      BL.sizeChips($("#wWeights"), size);
      sec.addEventListener("click", (e) => {
        const tab = e.target.closest(".seg [data-k]");
        if (tab) {
          BL.$$(".seg [data-k]", sec).forEach((b) => b.setAttribute("aria-pressed", b === tab));
          $("#wRide").hidden = tab.dataset.k !== "ride";
          $("#wParcel").hidden = tab.dataset.k !== "parcel";
        }
        const w = e.target.closest("[data-w]");
        if (w) { size = w.dataset.w; BL.sizeChips($("#wWeights"), size); }
      });
      $("#srv").onclick = () => BL.sheet(BL.h`<h3>Server settings</h3><p class="muted small" style="margin:6px 0 12px">Where PocketBase is running. On this phone it is usually http://localhost:8090. Leave empty to use this page's own address.</p>
        <input class="input" id="srvUrl" value="${localStorage.getItem("bl.server") || ""}" placeholder="http://localhost:8090" inputmode="url" style="margin-bottom:12px"><button class="btn btn--green btn--block" id="srvSave">Save and reload</button>`,
        (s) => (BL.$("#srvSave", s).onclick = () => BL.setServer(BL.$("#srvUrl", s).value)));
      const gate = (d) => {
        draft(d);
        if (!BL.api.authed) location.hash = "#/auth?mode=register&role=passenger&next=/book";
        else if (BL.api.role === "passenger") location.hash = "#/book";
        else BL.toast("Sign in with a passenger account to book.", "err");
      };
      $("#wGo").onclick = () => gate({ kind: "ride", pickup: $("#wFrom").value.trim(), dropoff: $("#wDest").value.trim() });
      $("#wGo2").onclick = () => gate({ kind: "parcel", pickup: $("#wPFrom").value.trim(), dropoff: $("#wDrop").value.trim(), weight: size });
    },
    show(sec) {
      BL.$("#landPass", sec).textContent = BL.money(BL.cfg.pass_price);
      BL.$$(".install-hero", sec).forEach((b) => (b.hidden = !BL.canInstall()));
      BL.deck.mount(BL.$("#lDeck", sec));
    },
  };
})();
