/* Open URL gateway: any website or order tool can send a customer to BodaLink with the booking filled in.
   Example: https://your-site/?mode=parcel&pickup=Stall%2004&dropoff=Zone%20B&item=2%20bags&size=medium&rname=Joy&rphone=0712345678 */
(function () {
  const BL = (window.BL = window.BL || {});
  const SIZES = ["small", "medium", "large"], PAYERS = ["sender", "recipient"];
  BL.gateway = () => {
    const q = new URLSearchParams(location.search);
    const mode = (q.get("mode") || "").toLowerCase();
    const has = ["pickup", "dropoff", "item"].some((k) => q.get(k));
    if (!["ride", "passenger", "transit", "parcel"].includes(mode) && !has) return false;
    const clean = (k, n) => (q.get(k) || "").replace(/[<>]/g, "").trim().slice(0, n);
    const size = (q.get("size") || "").toLowerCase(), payer = (q.get("payer") || "").toLowerCase();
    localStorage.setItem("bl.draft", JSON.stringify({
      kind: mode === "parcel" ? "parcel" : "ride", pickup: clean("pickup", 120), dropoff: clean("dropoff", 120), note: clean("note", 160),
      item: clean("item", 120), weight: SIZES.includes(size) ? size : "", rname: clean("rname", 80), rphone: clean("rphone", 20), payer: PAYERS.includes(payer) ? payer : "",
    }));
    const dest = BL.api.role === "passenger" ? "#/book" : BL.api.authed ? BL.home() : "#/auth?mode=register&role=passenger&next=/book";
    history.replaceState(null, "", location.pathname + dest);   // drop the query so a refresh does not repeat it
    return true;
  };
})();
