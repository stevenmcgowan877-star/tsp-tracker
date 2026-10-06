// Open Graph and Twitter card tags. The image needs an absolute URL, which
// Vercel supplies at build time (see next.config.mjs); locally it is omitted.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "";

export default function ShareMeta({ title, description, path = "/" }) {
  return (
    <>
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="TSP Fund Signal Tracker" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {SITE && <meta property="og:url" content={`${SITE}${path}`} />}
      {SITE && <meta property="og:image" content={`${SITE}/og.png`} />}
      {SITE && <meta property="og:image:width" content="1200" />}
      {SITE && <meta property="og:image:height" content="630" />}
      <meta name="twitter:card" content={SITE ? "summary_large_image" : "summary"} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {SITE && <meta name="twitter:image" content={`${SITE}/og.png`} />}
    </>
  );
}
