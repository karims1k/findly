const titles = [
  "Tower 28 Beauty Tower 28 ShineOn Lip Jelly",
  "Addict Lip Maximizer Gloss Dior",
  "Make Up For Ever Super Boost Lip Gloss",
  "Sephora COLLECTION Outrageous Plump Hydrating Lip Gloss",
  "Rare Beauty Positive Light Luminizing Lip Gloss",
  "Sarah Creal No Further Questions High Glide Peptide Lip Gloss",
  "Charlotte Tilbury Pillow Talk Big Lip Plumpgasm",
  "HAUS LABS PhD Hybrid Lip Glaze Plumping Gloss",
  "MILK MAKEUP Odyssey Hydrating Non-Sticky Lip Oil Gloss",
];

for (const title of titles) {
  const url = `http://localhost:3000/api/compare?q=${encodeURIComponent(title)}&region=WORLDWIDE`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.mode === "single") {
    console.log(`SINGLE (${data.rows.length} rows):`, title);
  } else if (data.mode === "browse") {
    console.log(`BROWSE (${data.products.length} products):`, title);
  } else {
    console.log("ERROR:", title, JSON.stringify(data));
  }
}
