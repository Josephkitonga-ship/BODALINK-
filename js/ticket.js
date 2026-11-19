/* The dispatch ticket: a plain-text WhatsApp message with a short token, #BL-XXXX. */
(function () {
  const BL = (window.BL = window.BL || {});
  const SIZE = { small: "Small", medium: "Medium", large: "Large" };
  BL.token = (r) => "BL-" + String(r.id).slice(-4).toUpperCase();

  // r is a request record. senderPhone is who the rider replies to when accepting.
  BL.ticket = (r, senderPhone) => {
    const parcel = r.kind === "parcel", t = BL.token(r);
    const fare = r.fare ? "AGREED FARE: KES " + r.fare
      : BL.fare && BL.fare.enabled() ? "EST. FARE: KES " + BL.fare.estimate({ dropoff: r.dropoff, size: r.weight, kind: r.kind }).amount
      : "FARE: Rider's bid";
    return ["[BODALINK DISPATCH #" + t + "]", "─────────────────────────────",
      "TYPE: " + (parcel ? "Parcel Delivery" : "Passenger"),
      "PICKUP: " + r.pickup + (r.pickup_note ? ", " + r.pickup_note : ""),
      "DROPOFF: " + r.dropoff,
      "ITEMS/DETAILS: " + (parcel ? r.item + ", " + SIZE[r.weight] + " parcel" : "1 passenger"),
      fare, "─────────────────────────────", "ACCEPT DISPATCH:",
      "https://wa.me/" + String(senderPhone).replace(/\D/g, "") + "?text=ACCEPT_" + t].join("\n");
  };
  // What the recipient gets. The pickup code is never in it.
  BL.recipientNote = (r, sender) => "Hi " + (r.recipient_name || "there") + ", " + sender + " is sending you a parcel (" + r.item + ") with BodaLink #" + BL.token(r) +
    ". Rider " + r.rider_name + ", plate " + r.rider_plate + ", will call you on arrival.";
})();
