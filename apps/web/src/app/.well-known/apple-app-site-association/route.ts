export function GET(): Response {
  const team = process.env.IOS_TEAM_ID;
  const bundle = process.env.IOS_BUNDLE_IDENTIFIER;
  const configured =
    team && /^[A-Z0-9]{10}$/.test(team) && bundle && /^[a-zA-Z0-9.-]+$/.test(bundle);
  if (!configured && process.env.NODE_ENV === "production") {
    console.warn(
      "[well-known] apple-app-site-association served empty: set IOS_TEAM_ID and IOS_BUNDLE_IDENTIFIER",
    );
  }
  return Response.json(
    {
      applinks: {
        apps: [],
        details: configured
          ? [{ appID: `${team}.${bundle}`, paths: ["/join", "/claim", "/groups/*"] }]
          : [],
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
