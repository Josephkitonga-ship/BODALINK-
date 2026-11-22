/* Profile photo: required for everyone, taken on sign-up and changeable from the account page. */
(function () {
  const BL = (window.BL = window.BL || {});
  let blob = null, change = false;
  const MIN = 200;   // smallest side of the original photo, in pixels
  // measure the photo the person picked, before it is resized
  const measure = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve({ w: im.naturalWidth, h: im.naturalHeight }); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that photo. Try another one.")); };
    im.src = url;
  });

  BL.views.photo = {
    mount(sec) {
      const $ = (s) => BL.$(s, sec);
      // one handler for both the camera and the gallery
      const onFile = async (e) => {
        const input = e.target, f = input.files[0];
        if (!f) return;
        try {
          const { w, h } = await measure(f);
          if (Math.min(w, h) < MIN) throw new Error("That photo is only " + w + " by " + h + " pixels. Choose one that is at least " + MIN + " by " + MIN + ".");
          const b = await BL.shrink(f, 800);
          blob = b;
          const c = $("#phCircle"); c.style.backgroundImage = "url(" + URL.createObjectURL(b) + ")"; c.classList.add("has");
          $("#phSave").disabled = false;
        } catch (er) { BL.toast(er.message, "err"); }
        finally { input.value = ""; }   // reset only after the photo is read, some phones lose the file if it is cleared early
      };
      $("#phCam").onchange = onFile;
      $("#phGal").onchange = onFile;
      $("#phCamBtn").onclick = () => $("#phCam").click();
      $("#phGalBtn").onclick = () => $("#phGal").click();
      $("#phSave").onclick = (e) => BL.busy(e.currentTarget, async () => {
        if (!blob) throw new Error("Choose a photo first.");
        await BL.api.uploadPhoto(blob);
        BL.toast("Photo saved.", "ok");
        const me = BL.api.me;
        location.hash = change ? "#/me" : me.role === "rider" && me.status !== "approved" ? "#/join" : BL.home();
      });
      $("#phOut").onclick = () => BL.api.logout();
    },
    show(sec, p) {
      const $ = (s) => BL.$(s, sec), me = BL.api.me;
      change = !!(p && p.change) && !!me.photo;
      blob = null;
      const c = $("#phCircle"); c.style.backgroundImage = ""; c.classList.remove("has");
      $("#phSave").disabled = true;
      $("#phEye").textContent = change ? "Your account" : "One last step";
      $("#phTitle").textContent = change ? "Change your photo" : "Add your photo";
      $("#phOut").hidden = change;
    },
  };
})();
