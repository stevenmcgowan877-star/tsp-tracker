// Market episodes replayed on the /crises page. Kept free of imports so the
// page can ship the list without pulling the server-side engine into the
// client bundle. Windows start a few months before the peak and run past the
// recovery or the next flip, so the whole round trip is visible.
export const EPISODES = [
  { id: "gfc2008", name: "2008 financial crisis", start: "2007-07-02", end: "2010-06-30" },
  { id: "debt2011", name: "2011 debt-ceiling scare", start: "2011-03-01", end: "2012-03-30" },
  { id: "china2015", name: "2015-16 China and oil selloff", start: "2015-05-01", end: "2016-07-29" },
  { id: "rates2018", name: "Late-2018 rate scare", start: "2018-08-01", end: "2019-06-28" },
  { id: "covid2020", name: "2020 COVID crash", start: "2020-01-02", end: "2020-09-30" },
  { id: "bear2022", name: "2022 bear market", start: "2021-11-01", end: "2023-06-30" },
  { id: "spring2025", name: "Spring 2025 selloff", start: "2025-01-02", end: "2025-09-30" },
  { id: "spring2026", name: "Spring 2026 dip", start: "2026-01-02", end: null },
];

export function findEpisode(id) {
  return EPISODES.find((e) => e.id === id) || null;
}
