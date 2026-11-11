// The Archivkiste's built-in list: well-known runs that sit in the subscriptions.
// The sync resolves each against Metron when it needs more envelopes.
// series + year: the volume (Metron's series name and the year it began).
// from/to + years: a stretch of an ongoing series and the cover years it spans;
// without them the whole (limited) series is the run.

export interface Classic {
  publisher: "DC Comics" | "Marvel";
  series: string;
  year: number;
  title: string;
  writer: string;
  from?: number;
  to?: number;
  years?: number[];
}

export const CLASSICS: Classic[] = [
  // DC
  { publisher: "DC Comics", series: "Batman", year: 1940, from: 404, to: 407, years: [1987], title: "Year One", writer: "Frank Miller" },
  { publisher: "DC Comics", series: "Batman: The Long Halloween", year: 1996, title: "The Long Halloween", writer: "Jeph Loeb" },
  { publisher: "DC Comics", series: "Batman", year: 1940, from: 608, to: 619, years: [2002, 2003], title: "Hush", writer: "Jeph Loeb" },
  { publisher: "DC Comics", series: "Batman", year: 1940, from: 655, to: 658, years: [2006], title: "Batman and Son", writer: "Grant Morrison" },
  { publisher: "DC Comics", series: "Batman", year: 2011, from: 1, to: 7, years: [2011, 2012], title: "Court of Owls", writer: "Scott Snyder" },
  { publisher: "DC Comics", series: "Batman", year: 2011, from: 13, to: 17, years: [2012, 2013], title: "Death of the Family", writer: "Scott Snyder" },
  { publisher: "DC Comics", series: "Detective Comics", year: 1937, from: 871, to: 881, years: [2011], title: "The Black Mirror", writer: "Scott Snyder" },
  { publisher: "DC Comics", series: "Batman: The Killing Joke", year: 1988, title: "The Killing Joke", writer: "Alan Moore" },
  { publisher: "DC Comics", series: "Batman: The Dark Knight Returns", year: 1986, title: "The Dark Knight Returns", writer: "Frank Miller" },
  { publisher: "DC Comics", series: "Batman: White Knight", year: 2017, title: "White Knight", writer: "Sean Murphy" },
  { publisher: "DC Comics", series: "Batgirl: Year One", year: 2003, title: "Batgirl: Year One", writer: "Chuck Dixon" },
  { publisher: "DC Comics", series: "Robin: Year One", year: 2000, title: "Robin: Year One", writer: "Chuck Dixon" },
  { publisher: "DC Comics", series: "Nightwing", year: 1996, from: 101, to: 106, years: [2005], title: "Nightwing: Year One", writer: "Chuck Dixon" },
  { publisher: "DC Comics", series: "Gotham Central", year: 2003, from: 1, to: 5, years: [2003], title: "In the Line of Duty", writer: "Ed Brubaker" },
  { publisher: "DC Comics", series: "Watchmen", year: 1986, title: "Watchmen", writer: "Alan Moore" },
  { publisher: "DC Comics", series: "Kingdom Come", year: 1996, title: "Kingdom Come", writer: "Mark Waid" },
  { publisher: "DC Comics", series: "All-Star Superman", year: 2006, title: "All-Star Superman", writer: "Grant Morrison" },
  { publisher: "DC Comics", series: "Superman: For All Seasons", year: 1998, title: "For All Seasons", writer: "Jeph Loeb" },
  { publisher: "DC Comics", series: "Superman: Birthright", year: 2003, title: "Birthright", writer: "Mark Waid" },
  { publisher: "DC Comics", series: "Superman: Red Son", year: 2003, title: "Red Son", writer: "Mark Millar" },
  { publisher: "DC Comics", series: "Superman: Secret Identity", year: 2004, title: "Secret Identity", writer: "Kurt Busiek" },
  { publisher: "DC Comics", series: "Green Lantern: Rebirth", year: 2004, title: "Rebirth", writer: "Geoff Johns" },
  { publisher: "DC Comics", series: "Green Arrow: Year One", year: 2007, title: "Green Arrow: Year One", writer: "Andy Diggle" },
  { publisher: "DC Comics", series: "Wonder Woman", year: 2011, from: 1, to: 6, years: [2011, 2012], title: "Blood", writer: "Brian Azzarello" },
  { publisher: "DC Comics", series: "Crisis on Infinite Earths", year: 1985, title: "Crisis on Infinite Earths", writer: "Marv Wolfman" },
  { publisher: "DC Comics", series: "Identity Crisis", year: 2004, title: "Identity Crisis", writer: "Brad Meltzer" },
  { publisher: "DC Comics", series: "Infinite Crisis", year: 2005, title: "Infinite Crisis", writer: "Geoff Johns" },
  { publisher: "DC Comics", series: "Flashpoint", year: 2011, title: "Flashpoint", writer: "Geoff Johns" },
  { publisher: "DC Comics", series: "DC: The New Frontier", year: 2004, title: "The New Frontier", writer: "Darwyn Cooke" },
  { publisher: "DC Comics", series: "Doomsday Clock", year: 2017, title: "Doomsday Clock", writer: "Geoff Johns" },
  { publisher: "DC Comics", series: "Mister Miracle", year: 2017, title: "Mister Miracle", writer: "Tom King" },
  { publisher: "DC Comics", series: "Strange Adventures", year: 2020, title: "Strange Adventures", writer: "Tom King" },
  { publisher: "DC Comics", series: "Animal Man", year: 1988, from: 1, to: 9, years: [1988], title: "Animal Man", writer: "Grant Morrison" },
  { publisher: "DC Comics", series: "The Sandman", year: 1989, from: 1, to: 8, years: [1989], title: "Preludes & Nocturnes", writer: "Neil Gaiman" },
  { publisher: "DC Comics", series: "Saga of the Swamp Thing", year: 1982, from: 21, to: 24, years: [1984], title: "The Anatomy Lesson", writer: "Alan Moore" },
  // Marvel (read on Webtoon; not checked, the reader can say "nicht im Abo")
  { publisher: "Marvel", series: "The Vision", year: 2015, title: "The Vision", writer: "Tom King" },
  { publisher: "Marvel", series: "Daredevil", year: 1964, from: 227, to: 233, years: [1986], title: "Born Again", writer: "Frank Miller" },
  { publisher: "Marvel", series: "Daredevil", year: 2011, from: 1, to: 6, years: [2011, 2012], title: "Daredevil", writer: "Mark Waid" },
  { publisher: "Marvel", series: "Hawkeye", year: 2012, from: 1, to: 11, years: [2012, 2013], title: "My Life as a Weapon", writer: "Matt Fraction" },
  { publisher: "Marvel", series: "Immortal Hulk", year: 2018, from: 1, to: 6, years: [2018], title: "Or Is He Both?", writer: "Al Ewing" },
  { publisher: "Marvel", series: "Wolverine", year: 2003, from: 66, to: 72, years: [2008, 2009], title: "Old Man Logan", writer: "Mark Millar" },
  { publisher: "Marvel", series: "Civil War", year: 2006, title: "Civil War", writer: "Mark Millar" },
  { publisher: "Marvel", series: "House of X", year: 2019, title: "House of X", writer: "Jonathan Hickman" },
  { publisher: "Marvel", series: "Ultimate Spider-Man", year: 2000, from: 1, to: 7, years: [2000, 2001], title: "Power and Responsibility", writer: "Brian Michael Bendis" },
  { publisher: "Marvel", series: "Ms. Marvel", year: 2014, from: 1, to: 5, years: [2014], title: "No Normal", writer: "G. Willow Wilson" },
  { publisher: "Marvel", series: "Marvels", year: 1994, title: "Marvels", writer: "Kurt Busiek" },
  { publisher: "Marvel", series: "Thor: God of Thunder", year: 2012, from: 1, to: 5, years: [2012, 2013], title: "The God Butcher", writer: "Jason Aaron" },
];

/** Where to look for holiday specials: series names that carry the season. */
export const SEASON_TERMS: Record<"hw" | "xm", string[]> = {
  hw: ["Halloween", "Terrors Through Time", "Trick or Treat"],
  xm: ["Christmas", "Holiday Special", "Reindeer"],
};

/** The days a season's envelope lies in the box (month-day, inclusive). */
export const SEASONS: Record<"hw" | "xm", { from: string; to: string; build: string }> = {
  // build: from this day on the sync looks for the season's special.
  hw: { from: "10-15", to: "10-31", build: "10-01" },
  xm: { from: "12-01", to: "12-26", build: "11-15" },
};
