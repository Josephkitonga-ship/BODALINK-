/* Alerts tab: every notification, newest first. */
(function () {
  const BL = (window.BL = window.BL || {});
  let sec, unsub = null;
  async function paint() {
    let items = [];
    try { items = await BL.api.q(BL.db("notifications").select("*").order("created_at", { ascending: false }).limit(50)); } catch (e) { BL.toast(e.message, "err"); }
    BL.html(BL.$("#aList", sec), items.length ? BL.h`${items.map((n) => BL.h`<a class="item alert ${n.read ? "" : "unread"}" href="${(n.url || "/#/").replace("/#", "#")}" style="text-decoration:none">
      <div class="grow"><div class="t">${n.title}</div><div class="s">${n.body}</div></div><span class="s">${BL.ago(n.created_at)}</span></a>`)}`
      : BL.h`<div class="empty"><h3>No alerts yet</h3><p>Job and trip updates show up here.</p></div>`);
    return items;
  }
  BL.views.alerts = {
    mount(s) {
      sec = s;
      BL.$("#aRead", s).onclick = async () => {
        await BL.db("notifications").update({ read: true }).eq("member_id", BL.api.me.id).eq("read", false);
        BL.notifications.refresh(); paint();
      };
    },
    async show() {
      await paint();
      BL.notifications.markSeen = true;
      unsub = BL.realtime.on("notifications/*", () => setTimeout(paint, 300));
    },
    hide() { if (unsub) unsub(); },
  };
})();
