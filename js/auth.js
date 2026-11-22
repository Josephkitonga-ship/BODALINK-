/* Sign in, create account (passenger or rider) and password reset. Email and password; the phone number is the contact number. */
(function () {
  const BL = (window.BL = window.BL || {});
  const st = { mode: "login", role: "", step: 1, next: "", kind: "" };
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  const pwOk = (p) => p.length >= 8;

  BL.views.auth = {
    mount(sec) {
      const $ = (s) => BL.$(s, sec);
      const forms = { login: $("#fLogin"), register: $("#fReg"), reset: $("#fReset"), newpass: $("#fNew") };
      const showForm = (m) => {
        st.mode = m;
        Object.keys(forms).forEach((k) => (forms[k].hidden = k !== m));
        BL.$$("#aTabs [data-m]", sec).forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === m));
        $("#aTabs").hidden = m === "reset" || m === "newpass";
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
        location.hash = isNew ? "#/photo" : next || BL.home();
      };

      BL.$$("#aTabs [data-m]", sec).forEach((b) => (b.onclick = () => { showForm(b.dataset.m); if (b.dataset.m === "register") step(st.role ? 2 : 1); }));
      $("#toReset").onclick = () => { $("#pEmail").value = $("#lEmail").value; showForm("reset"); };
      $("#toLogin").onclick = () => showForm("login");
      BL.$$("[data-back]", sec).forEach((b) => (b.onclick = () => step(Math.max(1, st.step - 1))));
      BL.$$(".role", sec).forEach((b) => (b.onclick = () => { st.role = b.dataset.role; step(2); }));

      BL.$$('input[type="password"]', sec).forEach((inp) => {
        const field = inp.closest(".field"); if (!field) return;
        field.classList.add("has-toggle");
        const b = document.createElement("button");
        b.type = "button"; b.className = "pwtoggle"; b.textContent = "Show"; b.setAttribute("aria-label", "Show password");
        b.onclick = () => { const show = inp.type === "password"; inp.type = show ? "text" : "password"; b.textContent = show ? "Hide" : "Show"; b.setAttribute("aria-label", show ? "Hide password" : "Show password"); };
        field.appendChild(b);
      });
      forms.login.onsubmit = (e) => {
        e.preventDefault();
        if (!emailOk($("#lEmail").value.trim())) return BL.toast("Enter your email address.", "err");
        if (!$("#lPw").value) return BL.toast("Enter your password.", "err");
        BL.busy(e.submitter, async () => { await BL.api.login($("#lEmail").value, $("#lPw").value); done(false); });
      };

      forms.register.onsubmit = (e) => {
        e.preventDefault();
        if (st.step !== 2) return;
        if ($("#rName").value.trim().length < 2) return BL.toast("Enter your full name.", "err");
        if (!emailOk($("#rEmail").value.trim())) return BL.toast("Enter a valid email address.", "err");
        if (!BL.normPhone($("#rPhone").value)) return BL.toast("Enter a valid phone number.", "err");
        if (st.role === "rider") {
          if (!/^\d{6,10}$/.test($("#rNid").value.trim())) return BL.toast("Enter your national ID number.", "err");
          if ($("#rPlate").value.trim().length < 5) return BL.toast("Enter your motorbike registration.", "err");
        }
        if (!pwOk($("#rPw").value)) return BL.toast("Your password needs at least 8 characters.", "err");
        if ($("#rPw").value !== $("#rPw2").value) return BL.toast("The two passwords do not match.", "err");
        BL.busy(e.submitter, async () => {
          const email = $("#rEmail").value.trim();
          const r = await BL.api.register({
            role: st.role, name: $("#rName").value.trim(), email, phone: $("#rPhone").value, password: $("#rPw").value,
            national_id: $("#rNid").value.trim(), plate: $("#rPlate").value.trim(),
            emergency_name: $("#rEName").value.trim(), emergency_phone: $("#rEPhone").value,
          });
          if (r.confirm) {
            $("#lEmail").value = email; $("#lPw").value = ""; showForm("login");
            BL.sheet(BL.h`<h3>Check your email</h3><p class="muted" style="margin:6px 0 16px">We sent a link to ${email}. Open it to confirm your account, then sign in here.</p><button class="btn btn--dark btn--block" data-close>Got it</button>`);
          } else done(true);
        });
      };

      forms.reset.onsubmit = (e) => {
        e.preventDefault();
        const email = $("#pEmail").value.trim();
        if (!emailOk(email)) return BL.toast("Enter your email address.", "err");
        BL.busy(e.submitter, async () => {
          await BL.api.resetPassword(email);
          BL.toast("If that email has an account, a reset link is on its way.", "ok");
          showForm("login");
        });
      };

      forms.newpass.onsubmit = (e) => {
        e.preventDefault();
        if (!pwOk($("#nPw").value)) return BL.toast("Your password needs at least 8 characters.", "err");
        if ($("#nPw").value !== $("#nPw2").value) return BL.toast("The two passwords do not match.", "err");
        BL.busy(e.submitter, async () => {
          await BL.api.updatePassword($("#nPw").value);
          BL.recovery = false;
          BL.toast("Password saved.", "ok");
          location.hash = BL.home();
        });
      };
      sec._show = (m) => { showForm(m); if (m === "register") step(st.role ? 2 : 1); };
    },
    show(sec, p) {
      if (BL.api.authed && p.mode === "newpass") { sec._show("newpass"); return; }
      if (BL.api.authed) {   // a signed-in passenger who taps a "Book a ride" or "Send a parcel" banner goes straight to booking
        const toBook = BL.api.role === "passenger" && p.next;
        if (toBook && p.kind === "parcel") localStorage.setItem("bl.draft", JSON.stringify({ kind: "parcel" }));
        location.hash = toBook ? "#" + p.next : BL.home();
        return;
      }
      st.next = p.next || ""; st.kind = p.kind || "";
      if (p.role === "passenger" || p.role === "rider") st.role = p.role;
      if (st.kind === "parcel") localStorage.setItem("bl.draft", JSON.stringify({ kind: "parcel" }));
      sec._show(p.mode === "register" ? "register" : "login");
    },
  };
})();
