export function GET(): Response {
  const team = process.env.IOS_TEAM_ID;
  const bundle = process.env.IOS_BUNDLE_IDENTIFIER;
  const configured =
    team && /^[A-Z0-9]{10}$/.test(team) && bundle && /^[a-zA-Z0-9.-]+$/.test(bundle);
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
