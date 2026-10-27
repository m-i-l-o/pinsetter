// Pinsetter sync words.
// POST /api/sync  { kind: "sync" | "friend", code: "<packed games>" }  -> { word, expires }
// GET  /api/sync?w=maple-strike-42                                    -> { kind, code, expires }
// Words last 24 hours. Data is kept in Netlify Blobs on your own Netlify account.

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CODE = 2_000_000; // about 2 MB of packed games, far more than anyone bowls

const WORDS = ("alley,ball,bumper,cherry,corner,double,frame,gutter,hook,kingpin,lane,mark,oil,pin,pocket,ring,series,spare,split,strike," +
  "turkey,apple,amber,arrow,aspen,badger,banjo,basil,beacon,berry,birch,bison,blaze,bloom,bolt,breeze,brook,cactus,canyon,cedar," +
  "cinder,clover,cobalt,comet,coral,cosmo,cricket,crystal,dahlia,delta,dune,eagle,echo,ember,falcon,fern,fig,flint,frost,galaxy," +
  "garnet,ginger,glacier,granite,harbor,hazel,heron,honey,indigo,iris,ivory,jade,jasper,juniper,kayak,kiwi,koala,lagoon,lemon,lilac," +
  "lotus,lunar,lynx,mango,maple,marble,meadow,melon,mint,mocha,nectar,nova,oak,ocean,olive,onyx,opal,orbit,otter,panda," +
  "pebble,pepper,pine,pixel,plum,polar,poppy,prism,quartz,quill,rapid,raven,reef,river,robin,rocket,ruby,saffron,sage,salmon," +
  "sierra,silver,slate,sonic,sparrow,spruce,stellar,stone,summit,sunny,tango,thunder,tiger,topaz,tulip,tundra,velvet,violet,walnut,willow," +
  "zephyr,zinc,acorn,anchor,atlas,aurora,bamboo,bayou,blossom,breaker,cabin,candle,caramel,cascade,cosmic,crimson,daisy,denim,dolphin").split(",");

function randomWord() {
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  const a = WORDS[r[0] % WORDS.length], b = WORDS[r[1] % WORDS.length], n = 10 + (r[2] % 90);
  return `${a}-${b}-${n}`;
}
const clean = w => String(w || "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "");
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// The core logic takes any store with get/setJSON/delete, so it can be tested without Netlify.
export async function handle(req, store, now = Date.now()) {
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "That request wasn't readable." }, 400); }
    const kind = body && body.kind === "friend" ? "friend" : "sync";
    const code = body && typeof body.code === "string" ? body.code : "";
    if (!/^[zj][A-Za-z0-9_-]+$/.test(code)) return json({ error: "Nothing to save." }, 400);
    if (code.length > MAX_CODE) return json({ error: "That's too much to send as a word. Use a sync link or a backup file instead." }, 413);
    let word = randomWord();
    for (let i = 0; i < 5 && (await store.get(word, { type: "json" })); i++) word = randomWord();
    const expires = now + TTL_MS;
    await store.setJSON(word, { kind, code, expires });
    return json({ word, expires });
  }
  if (req.method === "GET") {
    const word = clean(new URL(req.url).searchParams.get("w"));
    if (!/^[a-z]+-[a-z]+-\d{2}$/.test(word)) return json({ error: "That doesn't look like a sync word. It should look like maple-strike-42." }, 400);
    const rec = await store.get(word, { type: "json" });
    if (!rec) return json({ error: "No games found for that word. Check the spelling, or make a new word." }, 404);
    if (rec.expires < now) { await store.delete(word); return json({ error: "That word has expired. Words last 24 hours, so make a new one." }, 410); }
    return json({ kind: rec.kind, code: rec.code, expires: rec.expires });
  }
  return json({ error: "Not supported." }, 405);
}

export default async (req) => {
  const { getStore } = await import("@netlify/blobs");
  return handle(req, getStore("pinsetter-sync"));
};

export const config = { path: "/api/sync" };
