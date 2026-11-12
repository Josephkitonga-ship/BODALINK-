/* Verified rider directory. Reads /api/bl/directory, which only returns first name, rating, jobs and badges. */
(function () {
  const BL = (window.BL = window.BL || {});
  BL.directory = {
    async mount(box) {
      let list = [];
      try { list = (await BL.api.get("/api/bl/directory")).riders || []; } catch (_) {}
      if (!list.length) return BL.html(box, "");
      BL.html(box, BL.h`<section class="stack" aria-label="Verified riders"><div class="row between"><h3>Verified riders</h3><span class="small muted">${list.filter((r) => r.online).length} online now</span></div>
        <div class="dir">${list.map((r) => BL.h`<article class="dcard"><div class="row"><div class="avatar">${BL.initials(r.name)}</div><div class="grow"><div class="t">${r.name}</div>
          <div class="s">${r.rated ? "★ " + r.rating.toFixed(1) + " (" + r.rated + ")" : "New rider"}, ${r.jobs} job${r.jobs === 1 ? "" : "s"}</div></div>${r.online ? BL.raw('<i class="live" title="Online now"></i>') : ""}</div>
          <div class="row wrap" style="gap:6px;margin-top:10px"><span class="badge badge--ok">ID verified</span>${r.helmet ? BL.raw('<span class="badge badge--ok">Helmet verified</span>') : ""}</div></article>`)}</div></section>`);
    },
  };
})();
