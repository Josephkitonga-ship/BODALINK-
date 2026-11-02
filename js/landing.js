/* Landing page: hero booking widget. Booking itself needs a verified passenger account. */
(function () {
  const BL = (window.BL = window.BL || {});
  BL.WEIGHTS = [["light", "Light, small parcel"], ["standard", "Standard retail order"], ["bulk", "Bulk, over 8 kg"]];
  BL.weightChips = (box, selected) => {
    BL.html(box, BL.h`${BL.WEIGHTS.map(([k, l]) => BL.h`<button type="button" class="chip" data-w="${k}" aria-pressed="${k === selected}">${l}, <b>${BL.money(BL.cfg.parcel_fees[k])}</b></button>`)}`);
  };
  const draft = (d) => localStorage.setItem("bl.draft", JSON.stringify(d));

  let weight = "standard";
  BL.views.landing = {
    mount(sec) {
      const $ = (s) => BL.$(s, sec);
      BL.fillStages($("#wStage"));
      const fare = () => ($("#wFare").textContent = BL.money(BL.fareFor($("#wStage").value)));
      $("#wStage").onchange = fare; fare();
      BL.weightChips($("#wWeights"), weight);
      BL.html($("#landFees"), BL.h`${BL.WEIGHTS.map(([k, l]) => BL.h`<div class="item"><span class="grow t">${l}</span><b class="money">${BL.money(BL.cfg.parcel_fees[k])}</b></div>`)}`);

      sec.addEventListener("click", (e) => {
        const tab = e.target.closest(".seg [data-k]");
        if (tab) {
          BL.$$(".seg [data-k]", sec).forEach((b) => b.setAttribute("aria-pressed", b === tab));
          $("#wRide").hidden = tab.dataset.k !== "ride";
          $("#wParcel").hidden = tab.dataset.k !== "parcel";
        }
        const w = e.target.closest("[data-w]");
        if (w) { weight = w.dataset.w; BL.weightChips($("#wWeights"), weight); }
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
      $("#wGo").onclick = () => gate({ kind: "ride", pickup_stage: $("#wStage").value, dropoff: $("#wDest").value.trim() });
      $("#wGo2").onclick = () => gate({ kind: "parcel", merchant: $("#wStore").value.trim(), dropoff: $("#wDrop").value.trim(), weight });
    },
    show(sec) {
      BL.fillStages(BL.$("#wStage", sec));
      BL.$("#wFare", sec).textContent = BL.money(BL.fareFor(BL.$("#wStage", sec).value));
    },
  };
})();
