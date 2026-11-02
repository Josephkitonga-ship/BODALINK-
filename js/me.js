/* Account page for every role: identity details, alerts, install, sign out. */
(function () {
  const BL = (window.BL = window.BL || {});
  BL.views.me = {
    mount(sec) {
      const $ = (s) => BL.$(s, sec);
      $("#mOut").onclick = () => BL.api.logout();
      $("#mPush").onclick = (e) => BL.busy(e.currentTarget, async () => { await BL.push.enable(); BL.toast("Alerts are on.", "ok"); BL.views.me.show(sec); });
      $("#mInstall").onclick = async () => { await BL.install(); $("#mInstall").hidden = !BL.canInstall(); };
      BL.on("installable", () => ($("#mInstall").hidden = false));
      $("#mSave").onclick = (e) => {
        const nid = $("#mNid").value.trim();
        if (nid && !/^\d{6,10}$/.test(nid)) return BL.toast("Check your ID number.", "err");
        const ep = $("#mEp").value.trim();
        if (ep && !BL.normPhone(ep)) return BL.toast("Check the emergency phone number.", "err");
        BL.busy(e.currentTarget, async () => {
          await BL.api.update("members", BL.api.me.id, { national_id: nid, emergency_name: $("#mEn").value.trim(), emergency_phone: ep ? BL.normPhone(ep) : "" });
          await BL.api.refresh();
          BL.toast("Saved. BodaLink will confirm your ID.", "ok");
          BL.views.me.show(sec);
        });
      };
    },
    show(sec) {
      const me = BL.api.me, $ = (s) => BL.$(s, sec);
      $("#mAv").textContent = BL.initials(me.name);
      $("#mName").textContent = me.name;
      $("#mPhone").textContent = "+" + me.phone;
      const b = $("#mBadge");
      const map = { passenger: me.id_verified ? ["ID verified", "ok"] : ["Phone verified", ""], admin: ["Admin", "ok"],
        rider: { pending: ["In review", "warn"], approved: ["Verified rider", "ok"], rejected: ["Needs attention", "err"], suspended: ["Suspended", "err"] }[me.status] };
      const [text, kind] = map[me.role] || map.rider || ["", ""];
      b.textContent = text; b.className = "badge" + (kind ? " badge--" + kind : "");
      $("#mPass").hidden = me.role !== "passenger";
      $("#mNid").value = me.national_id || ""; $("#mEn").value = me.emergency_name || ""; $("#mEp").value = me.emergency_phone ? "0" + me.emergency_phone.slice(3) : "";
      $("#mRider").hidden = me.role !== "rider";
      $("#mRiderMsg").textContent = { pending: "Finish your documents and starting float. BodaLink reviews riders within a day.", approved: "You are verified and can go online.", rejected: me.reject_reason || "Open your checklist to see what to fix.", suspended: "Your account is suspended. Contact BodaLink." }[me.status] || "";
      $("#mPush").textContent = BL.push.enabled() ? "Alerts are on" : "Turn on job and trip alerts";
      $("#mPush").disabled = BL.push.enabled();
      $("#mInstall").hidden = !BL.canInstall();
    },
  };
})();
