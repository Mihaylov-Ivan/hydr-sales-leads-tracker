import fs from "fs";
const j = JSON.parse(
  fs.readFileSync("templates/warehouse-data/WH_reorg_mapping_updated.json", "utf8"),
);
console.log(JSON.stringify(j.counts, null, 2));
console.log("\nTop categories:");
Object.entries(j.category_item_counts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25)
  .forEach(([k, v]) => console.log(String(v).padStart(4), k));
console.log("\nMerge candidates:", j.merge_candidates?.length);
console.log(JSON.stringify(j.merge_candidates?.slice(0, 6), null, 2));
