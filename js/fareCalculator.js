/* Optional fare guide, worked out on the phone with no API call.
   Estimate = base rate + zone add-on + parcel size surcharge. It only shows when an admin switches
   "Fare estimates" on, and riders still set the real price on every job. */
(function () {
  const BL = (window.BL = window.BL || {});
  const round10 = (n) => Math.round(n / 10) * 10;
  BL.fare = {
    enabled: () => !!BL.cfg.fare_estimates,
    estimate({ dropoff, size, kind }) {
      const c = BL.cfg, text = String(dropoff || "").toLowerCase();
      const zone = text.length > 1 ? (BL.zones || []).find((z) => text.indexOf(z.name.toLowerCase()) > -1) : null;
      const addon = zone ? zone.addon : 0;
      const surcharge = kind === "parcel" ? { small: 0, medium: c.fare_medium, large: c.fare_large }[size] || 0 : 0;
      return { amount: round10(c.fare_base + addon + surcharge), base: c.fare_base, zone: zone ? zone.name : null, addon, surcharge };
    },
    line(opts) {
      const e = BL.fare.estimate(opts);
      return "Typical fare " + (e.zone ? "about " : "from ") + BL.money(e.amount) + ". Riders set the final price.";
    },
  };
})();
