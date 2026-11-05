// The words of Geesling's two daily heads-ups, from that day's numbers. Pure (tests/pushMessages.test.ts).

export type AlertKind = "morning" | "evening";

export interface PushNumbers {
  total: number; // on in the alert's window today
  free: number;
  music: number;
  new_day: number; // events added in the last 24 hours
  new_free_day: number;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "+ 32 new events added today" when a big batch came in; empty otherwise. */
function newLine(n: PushNumbers): string {
  return n.new_day >= 25 ? ` + ${n.new_day} new events added since yesterday.` : "";
}

/**
 * weekday: 0 = Sunday … 6 = Saturday, in Toronto. Morning goes out every day; evening on weekdays only (the caller
 * checks). Quiet days (few things on) get a softer line instead of a small number.
 */
export function composeAlert(kind: AlertKind, n: PushNumbers, weekday: number): PushMessage {
  const tag = `geesling-${kind}`;
  if (kind === "morning") {
    const url = "/?from=push-morning";
    if (n.free < 3) {
      return { title: "☕ Slow day in the city", body: `A few free gems are still on. Tap for a cheap-and-cozy route.${newLine(n)}`, url, tag };
    }
    if (weekday === 6 || weekday === 0) {
      const day = weekday === 6 ? "Saturday" : "Sunday";
      return { title: `☀️ ${day}'s wide open`, body: `${plural(n.free, "free thing")} on today, from markets to galleries. Tell me your budget and I'll map it out.${newLine(n)}`, url, tag };
    }
    if (weekday === 5) {
      return { title: "🎉 Friday! Weekend's nearly here", body: `${plural(n.total, "thing")} on today, ${n.free} free. Want me to plan tonight or Saturday?${newLine(n)}`, url, tag };
    }
    const fresh = n.new_free_day > 0 ? ` Plus ${plural(n.new_free_day, "new free event")} since yesterday.` : "";
    return { title: `☀️ Morning! ${plural(n.free, "free thing")} on today`, body: `Tap and I'll plan your day around your budget.${fresh}`, url, tag };
  }
  const url = "/?from=push-evening";
  if (n.total < 5) {
    return { title: "🌙 Easy evening?", body: `A few free spots are open late downtown. Tap for a 2-hour wind-down route.${newLine(n)}`, url, tag };
  }
  if (weekday === 5) {
    return { title: "🎉 You made it. Weekend starts now", body: `${plural(n.total, "thing")} on tonight, ${n.free} free. Tell me your budget and I'll plan tonight.${newLine(n)}`, url, tag };
  }
  if (weekday === 4) {
    return { title: "🍻 Almost Friday", body: `${plural(n.total, "thing")} on tonight, ${n.free} free. Grab a cheap bite, catch a show, still home by 10.${newLine(n)}`, url, tag };
  }
  // A music-heavy night: lots of shows, or shows are most of what's on.
  if (n.music >= 25 || (n.music >= 15 && n.music * 2 >= n.total)) {
    return { title: `🎶 ${plural(n.music, "show")} on tonight`, body: `From free jazz to club nights. Want a quick plan before you head home?${newLine(n)}`, url, tag };
  }
  return { title: `🌆 Clocking out? ${plural(n.free, "free thing")} tonight`, body: `Live music, film, galleries. Tell me how long you've got and I'll plan a route from your office.${newLine(n)}`, url, tag };
}

/**
 * Which alert is due at this Toronto time, if any: morning from 8 am, evening from 5 pm on weekdays. Each window is
 * two hours wide because GitHub's scheduler can start late; push_sends keeps it to one send a day.
 */
export function dueAlert(hour: number, weekday: number): AlertKind | null {
  if (hour === 8 || hour === 9) return "morning";
  if ((hour === 17 || hour === 18) && weekday >= 1 && weekday <= 5) return "evening";
  return null;
}
