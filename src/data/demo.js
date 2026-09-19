// Deterministic demo library — mirrors Stock_Template.csv shape (45 days × 2 plants).
import { f2 } from "../lib/warehouse";

const ARTS = [
  ["Poly Film Family Elaichi 250g", "44000260", "KG", 520, 38, "Yuva Polyprint & Packaging"],
  ["Polyester Film 10 Rs", "44000234", "KG", 900, 52, "Abhinav Enterprises - Mumbai"],
  ["Carton Elaichi 250g Box", "44000252", "NOS", 2400, 165, "Vardhaman Packaging Industries"],
  ["HDPE Bag Family Elaichi", "44000019", "NOS", 1800, 95, "Shubham Packaging Industries"],
  ["CTC Tea Bulk - Grade BP", "71002033", "KG", 1400, 72, "Laxmi Steel - Sangamner"],
  ["Elaichi Flavour 5kg Can", "44000180", "KG", 320, 9, "Abhinav Enterprises - Mumbai"],
  ["Masala Chai Blend - Premium", "71002041", "KG", 640, 21, "Laxmi Steel - Sangamner"],
  ["Green Tea Loose - Grade OP", "71002055", "KG", 410, 12, "Laxmi Steel - Sangamner"],
  ["BOPP Tape 2 inch", "71020747", "NOS", 420, 11, "M K Steel India - Mumbai"],
  ["Tea Chest Liners", "44000261", "NOS", 900, 26, "Shubham Packaging Industries"],
  ["Sugar Sachet 5g", "44000310", "NOS", 5200, 410, "Vardhaman Packaging Industries"],
  ["Outer Corrugated Box", "44000255", "NOS", 1100, 48, "Vardhaman Packaging Industries"],
  ["Foil Pouch 1kg Gold", "44000270", "KG", 410, 6, "Yuva Polyprint & Packaging"],
  ["Ginger Tea Premix 1kg", "71002060", "KG", 380, 14, "Abhinav Enterprises - Mumbai"],
];

export function genDemo() {
  const plants = ["Sangamner", "Mumbai"];
  const out = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const p of plants) {
    for (const a of ARTS) {
      let stock = a[3] * (p === "Mumbai" ? 0.55 : 1) * (0.9 + rnd() * 0.2);
      for (let k = 44; k >= 0; k--) {
        const d = new Date(today);
        d.setDate(d.getDate() - k);
        const base = a[4] * (p === "Mumbai" ? 0.6 : 1);
        const weekly = 1 + 0.25 * Math.sin((k / 7) * Math.PI * 2);
        const use = Math.max(0, base * weekly * (0.7 + rnd() * 0.6));
        let receipt = 0;
        if (k % 9 === 3 || stock - use * 2 < base * 4) receipt = Math.round(base * (6 + rnd() * 5));
        const opening = Math.round(stock);
        const cons = Math.min(stock + receipt, Math.round(use));
        const closing = Math.max(0, Math.round(stock + receipt - cons));
        out.push({
          date: f2(d), plant: p, article: a[0], code: a[1], uom: a[2], vendor: a[5] || "",
          opening, receipt, cons, closing, hasCons: true,
        });
        stock = closing;
      }
    }
  }
  return out;
}
