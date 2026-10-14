// The AI on/off switch. Set NEXT_PUBLIC_AI_FEATURES_ENABLED=false (in Vercel,
// then redeploy) to pause every Claude call on the site: the research page
// hides its AI panels, the AI routes answer 503 without calling Anthropic,
// and the two AI signal refreshes skip (the last results stay cached).
// Unset or anything else means on.
//
// NEXT_PUBLIC_ so the research page (a client component) can read it too.
// It is a plain on/off flag, not a key, so it is safe in the browser.
export const AI_ENABLED = process.env.NEXT_PUBLIC_AI_FEATURES_ENABLED !== "false";

export const AI_PAUSED_MESSAGE = "AI features are paused right now.";
