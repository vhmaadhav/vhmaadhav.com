// LeetCode snapshot shared by build.mjs (writes dist/leetcode.json) and the
// Cloudflare Worker at worker/index.js. LeetCode's GraphQL
// endpoint sends no CORS headers, so the browser never calls it directly.

export const LEETCODE_URL = 'https://leetcode.com/graphql';

const QUERY = 'query($u:String!){matchedUser(username:$u){submitStatsGlobal{acSubmissionNum{difficulty count}} userCalendar{streak totalActiveDays submissionCalendar}}}';

// Returns { updated, user, solved: {all, easy, medium, hard}, streak, activeDays, days: {"YYYY-MM-DD": count} }.
export async function fetchLeetcode(username, { signal } = {}) {
  const res = await fetch(LEETCODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com' },
    body: JSON.stringify({ query: QUERY, variables: { u: username } }),
    signal
  });
  if (!res.ok) throw new Error(`leetcode HTTP ${res.status}`);
  return normalize(await res.json(), username);
}

export function normalize(payload, username) {
  if (payload?.errors?.length) throw new Error(`leetcode: ${payload.errors[0].message}`);
  const user = payload?.data?.matchedUser;
  if (!user) throw new Error(`leetcode: no user named ${username}`);

  const solved = { all: 0, easy: 0, medium: 0, hard: 0 };
  for (const row of user.submitStatsGlobal?.acSubmissionNum ?? []) {
    const key = String(row.difficulty).toLowerCase();
    if (key in solved) solved[key] = Number(row.count) || 0;
  }
  if (!solved.all) solved.all = solved.easy + solved.medium + solved.hard;

  // submissionCalendar is a JSON string: unix seconds at UTC midnight -> count.
  const calendar = user.userCalendar ?? {};
  const raw = typeof calendar.submissionCalendar === 'string'
    ? JSON.parse(calendar.submissionCalendar || '{}')
    : (calendar.submissionCalendar || {});
  const days = {};
  for (const [ts, count] of Object.entries(raw)) {
    const date = new Date(Number(ts) * 1000).toISOString().slice(0, 10);
    days[date] = (days[date] || 0) + (Number(count) || 0);
  }

  return {
    updated: new Date().toISOString(),
    user: username,
    solved,
    streak: Number(calendar.streak) || 0,
    activeDays: Number(calendar.totalActiveDays) || 0,
    days
  };
}
