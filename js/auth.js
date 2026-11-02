/* Sign in, create account (passenger or rider) and PIN reset. Phone number is the login. */
(function () {
  const BL = (window.BL = window.BL || {});
  const st = { mode: "login", role: "", step: 1, next: "", kind: "" };

  BL.views.auth = {
    mount(sec) {
      const $ = (s) => BL.$(s, sec);
      const forms = { login: $("#fLogin"), register: $("#fReg"), reset: $("#fReset") };
      const showForm = (m) => {
        st.mode = m;
        Object.keys(forms).forEach((k) => (forms[k].hidden = k !== m));
        BL.$$("#aTabs [data-m]", sec).forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === m));
        $("#aTabs").hidden = m === "reset";
      };
      const step = (n) => {
        st.step = n;
        BL.$$("[data-step]", forms.register).forEach((d) => (d.hidden = +d.dataset.step !== n));
        $("#rRider").hidden = st.role !== "rider";
        $("#rPass").hidden = st.role !== "passenger";
      };
      const done = (isNew) => {
        BL.toast(isNew ? "Welcome to BodaLink." : "Signed in.", "ok");
        const next = st.next && st.next !== "/auth" ? "#" + st.next : null;
        location.hash = BL.api.role === "rider" && isNew ? "#/join" : next || BL.home();
      };
      const pinOk = (p) => /^\d{6}$/.test(p);
      const devFill = (r, input, hint) => { if (r.dev_code) { input.value = r.dev_code; hint.textContent = "Test mode: your code was filled in for you."; } };

      BL.fillStages($("#rStage"), true);
      BL.$$("#aTabs [data-m]", sec).forEach((b) => (b.onclick = () => { showForm(b.dataset.m); if (b.dataset.m === "register") step(st.role ? 2 : 1); }));
      $("#toReset").onclick = () => showForm("reset");
      $("#toLogin").onclick = () => showForm("login");
      BL.$$("[data-back]", sec).forEach((b) => (b.onclick = () => step(Math.max(1, st.step - 1))));
      BL.$$(".role", sec).forEach((b) => (b.onclick = () => { st.role = b.dataset.role; step(2); }));

      forms.login.onsubmit = (e) => {
        e.preventDefault();
        if (!pinOk($("#lPin").value)) return BL.toast("Your PIN is 6 digits.", "err");
        BL.busy(e.submitter, async () => { await BL.api.login($("#lPhone").value, $("#lPin").value); done(false); });
      };

      forms.register.onsubmit = (e) => {
        e.preventDefault();
        if (st.step === 2) {
          if ($("#rName").value.trim().length < 2) return BL.toast("Enter your full name.", "err");
          if (!BL.normPhone($("#rPhone").value)) return BL.toast("Enter a valid phone number.", "err");
          if (st.role === "rider") {
            if (!/^\d{6,10}$/.test($("#rNid").value.trim())) return BL.toast("Enter your national ID number.", "err");
            if ($("#rPlate").value.trim().length < 5) return BL.toast("Enter your motorbike registration.", "err");
            if (!$("#rStage").value) return BL.toast("Pick your home stage.", "err");
          }
          BL.busy(e.submitter, async () => {
            const r = await BL.api.otp($("#rPhone").value, "register");
            $("#rSent").textContent = "We sent a code to " + $("#rPhone").value + ".";
            devFill(r, $("#rCode"), $("#rSent"));
            step(3);
          });
        } else if (st.step === 3) {
          if (!pinOk($("#rPin").value)) return BL.toast("Your PIN must be 6 digits.", "err");
          if ($("#rPin").value !== $("#rPin2").value) return BL.toast("The two PINs do not match.", "err");
          BL.busy(e.submitter, async () => {
            await BL.api.register({
              role: st.role, name: $("#rName").value.trim(), phone: $("#rPhone").value, otp: $("#rCode").value.trim(), pin: $("#rPin").value,
              national_id: $("#rNid").value.trim(), plate: $("#rPlate").value.trim(), home_stage: $("#rStage").value,
              emergency_name: $("#rEName").value.trim(), emergency_phone: $("#rEPhone").value,
            });
            done(true);
          });
        }
      };

      $("#pSend").onclick = (e) => BL.busy(e.currentTarget, async () => {
        const r = await BL.api.otp($("#pPhone").value, "reset");
        BL.toast("Code sent.", "ok");
        devFill(r, $("#pCode"), document.createElement("p"));
      });
      forms.reset.onsubmit = (e) => {
        e.preventDefault();
        if (!pinOk($("#pPin").value)) return BL.toast("Your new PIN must be 6 digits.", "err");
        BL.busy(e.submitter, async () => { await BL.api.reset({ phone: $("#pPhone").value, otp: $("#pCode").value.trim(), pin: $("#pPin").value }); done(false); });
      };
      sec._show = (m) => { showForm(m); if (m === "register") step(st.role ? 2 : 1); };
    },
    show(sec, p) {
      if (BL.api.authed) { location.hash = BL.home(); return; }
      st.next = p.next || ""; st.kind = p.kind || "";
      if (p.role === "passenger" || p.role === "rider") st.role = p.role;
      if (st.kind === "parcel") localStorage.setItem("bl.draft", JSON.stringify({ kind: "parcel" }));
      sec._show(p.mode === "register" ? "register" : "login");
    },
  };
})();
