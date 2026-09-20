import { useState } from "react";

const card =
  "rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm";

function Chevron({ open }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Collapsible help topic. Closed by default to keep the page calm. */
function Topic({ id, title, hint, openId, setOpenId, children }) {
  const open = openId === id;
  return (
    <div className={`${card} overflow-hidden`}>
      <button
        onClick={() => setOpenId(open ? null : id)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left active:bg-gray-50 dark:active:bg-gray-800/40"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-gray-900 dark:text-gray-50">{title}</span>
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{hint}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="space-y-3 px-5 pb-5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {children}
        </div>
      )}
    </div>
  );
}

/** A term + its plain-language meaning, used in the glossary. */
function Term({ name, children }) {
  return (
    <p>
      <span className="font-semibold text-gray-900 dark:text-gray-50">{name}</span> — {children}
    </p>
  );
}

/**
 * Help / FAQ — explains every feature: logging, editing/deleting, the global
 * vs per-week settings, the dashboard glossary, and how the numbers are
 * calculated. One topic open at a time so it never feels like a wall of text.
 */
export default function Help() {
  const [openId, setOpenId] = useState(null);
  const props = { openId, setOpenId };

  return (
    <div className="min-h-full space-y-3 bg-gray-50 px-4 pt-5 pb-4 dark:bg-gray-950">
      <header className="mb-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Help</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Everything budge· can do. Tap a topic to open it.
        </p>
      </header>

      <Topic id="log" title="Logging an expense" hint="The home screen, built for speed" {...props}>
        <p>
          budge· opens straight to the keypad. Type an amount, tap a category, add an optional note,
          then <b>Save</b>. The entry lands in <b>This Week</b> instantly.
        </p>
        <p>Tap the chart shortcut at the top, or the Dashboard tab, anytime to see where you stand.</p>
      </Topic>

      <Topic id="edit" title="Editing or deleting an entry" hint="Fix the amount, category, note, date or time" {...props}>
        <p>
          Open the <b>History</b> tab and tap any entry. The sheet that slides up lets you change the
          <b> amount</b>, <b>category</b>, <b>note</b>, and the <b>date and time</b> it happened —
          useful when you log yesterday's lunch this morning. Tap <b>Save</b> to update that entry.
        </p>
        <p>
          Changing the date moves the money with it. If the new date lands in a different week, the
          sheet warns you first, because two weekly totals change: the week it left and the week it
          joined.
        </p>
        <p>
          To remove it, tap <b>Delete</b>. Either way, your totals and charts update right away.
        </p>
      </Topic>

      <Topic id="tabs" title="Finding your way around" hint="The four dashboard tabs" {...props}>
        <p>The Dashboard is split into four tabs so no single page runs long:</p>
        <Term name="Overview">this week — the ring, your daily limit, and the tiles. Where you check in day to day.</Term>
        <Term name="Categories">where the money goes, over whichever period you pick.</Term>
        <Term name="Trends">spending over time, by weekday, and by time of day.</Term>
        <Term name="Saved">whether you're actually up or down overall.</Term>
        <p>
          Categories, Trends and Saved share one <b>range switcher</b> (Week / Month / 3 Months /
          1 Year). Changing it moves every chart on the page together, so they always describe the
          same stretch of time.
        </p>
      </Topic>

      <Topic id="saved" title="Saved — am I actually up?" hint="Savings, minus the weeks you went over" {...props}>
        <p>
          Every finished week you logged in contributes <b>budget minus spending</b>. A week you came
          in under adds; a week you went over <b>subtracts</b>. The headline is the two netted off, so
          it tells you the truth rather than only counting good weeks — and it can be negative.
        </p>
        <p>
          Under it, <b>Put aside</b> and <b>Spent over</b> show those two halves separately, so a
          healthy net doesn't hide a rough patch.
        </p>
        <p>
          The <b>week-by-week</b> chart draws kept above the line and overspent below it. Tap any bar
          to read that week. The current week is shown but left out of the totals until it ends — you
          can change that in Settings → Advanced.
        </p>
      </Topic>

      <Topic
        id="budget"
        title="Budget & spend days"
        hint="Your defaults, and changing just one week"
        {...props}
      >
        <p>Two settings drive all the math:</p>
        <p>
          <b>Weekly allowance</b> — your normal weekly budget.
        </p>
        <p>
          <b>Spend days per week</b> — how many days you actually spend (e.g. 5 school days). Your
          daily limit splits your budget across these days, not all 7.
        </p>
        <p>
          Set your <b>defaults</b> in <b>Settings</b>. To change just one week without touching your
          defaults, use the <b>Dashboard</b>: <b>Adjust</b> (above the ring) overrides that week's
          budget, and the <b>Spend days</b> tile's <b>Edit</b> overrides that week's spend days.
        </p>
        <p>
          Adjusted weeks show a small “adjusted / this week” tag, and everything returns to your
          defaults the following week.
        </p>
      </Topic>

      <Topic id="terms" title="Dashboard terms, explained" hint="What each number means" {...props}>
        <Term name="This Week · Resets [day]">your current budget week; it restarts on the day you choose.</Term>
        <Term name="Budget">the allowance for this week (shows “adjusted” if you overrode it).</Term>
        <Term name="Left / over budget">what's remaining — the big number in the ring.</Term>
        <Term name="Daily limit">how much you can spend per remaining spend day and still stay on budget.</Term>
        <Term name="spend days left">spend days still remaining this week.</Term>
        <Term name="Today">the total you've logged so far today.</Term>
        <Term name="pace (under / over)">whether you're ahead of or behind an even spending rate for how far into the week you are.</Term>
        <Term name="Spent this week">total logged, with % of budget and the change vs last week.</Term>
        <Term name="Spend days">your spend-days setting for this week (tap Edit to change only this week).</Term>
        <Term name="Projected end">your estimated total by week's end at your current pace, and whether that lands over or under budget.</Term>
        <Term name="Avg / spend day">average spent per spend day so far this week.</Term>
        <Term name="This month">total across all weeks in the current calendar month.</Term>
        <Term name="No-spend days">days this week where you logged nothing.</Term>
        <Term name="Net saved">what you've put aside minus what you've overspent, across finished weeks. Tap it to open the Saved tab.</Term>
        <Term name="Biggest spend">your largest single entry this week.</Term>
        <Term name="🔥 streak">consecutive finished weeks you stayed within budget (“best” is your record).</Term>
        <Term name="Expense by Category">where this week's money went, with a trend vs your 4-week average.</Term>
        <Term name="Spend by day">your average spend for each weekday, over the selected range. By default only days you actually spent on count, and a weekday you never spend on is left out entirely.</Term>
        <Term name="Time of day">when money leaves — morning, midday, afternoon or evening. A purchase after midnight counts toward the evening before.</Term>
        <Term name="Spending over time">a bar per day, week or month, with a dashed line showing that period's own budget — not this week's.</Term>
        <Term name="Pace / Purchases / Best streak / Week progress">extra tiles that appear at the Detailed level (Settings → Advanced).</Term>
      </Topic>

      <Topic id="math" title="How the numbers are calculated" hint="For the curious" {...props}>
        <Term name="Daily limit">money left ÷ spend days left — so it adapts as the week goes on.</Term>
        <Term name="Projected end">what you've spent ÷ spend days used so far × your total spend days.</Term>
        <Term name="Pace">what you'd expect to have spent by now (budget spread evenly across spend days) minus what you actually spent. Positive means under pace.</Term>
        <Term name="Streak">counts finished weeks where total spend ≤ that week's budget; the current week doesn't count until it ends.</Term>
        <Term name="Net saved">the sum of (that week's budget − what you spent) over every finished week you logged in. Weeks you went over come out negative and pull the total down. Weeks you logged nothing are skipped — a week before you started using budge· isn't a week you saved a full budget.</Term>
        <Term name="Spend by day">a weekday's total ÷ the number of days you actually spent on it. A ₱0 day usually means no classes rather than a cheap day, so counting it would say more about your timetable than your spending. You can switch that in Settings → Advanced.</Term>
        <Term name="The budget line">each bar is compared against the budget that applied to <i>that</i> week or month, including any one-off adjustment you made — so an adjusted week shows its own step rather than being judged against this week's number.</Term>
        <p className="pt-1 text-gray-500 dark:text-gray-400">
          Everything is tracked to the centavo and only rounded when shown.
        </p>
      </Topic>

      <Topic id="advanced" title="Advanced settings" hint="Tune what the dashboard shows and how it counts" {...props}>
        <p>
          <b>Settings → Advanced</b> holds the options that change how budge· presents and counts
          things. Every default is the behaviour you already had, so you only need these if something
          doesn't match how you actually live.
        </p>
        <Term name="Dashboard detail">
          <b>Simple</b> keeps the ring, what you've spent and where it went. <b>Standard</b> is the
          full set of tiles. <b>Detailed</b> adds pace, purchase count, best streak and week progress.
        </Term>
        <Term name="Count days with no spending">
          off by default. Leave it off if a ₱0 day usually means no classes — counting those days
          drags every weekday's average toward zero. Turn it on if you spend on a normal day and want
          the quiet ones to count against the average.
        </Term>
        <Term name="Count this week in Saved">
          off by default, so the Saved total only moves when a week finishes. Turn it on if you'd
          rather watch it update live — it starts the week looking like a full week's saving and
          shrinks as you spend.
        </Term>
        <Term name="Category trend lines">the small sparkline beside each category. It hides itself on very narrow screens regardless.</Term>
        <Term name="Dashboard opens on / Default range">which tab and which period you land on, so the view you check most is one tap away — or none.</Term>
      </Topic>

      <Topic id="privacy" title="Your money & data" hint="What we can see, and how it's kept safe" {...props}>
        <p>
          <b>budge· can't touch your money.</b> It isn't linked to any bank, card, or e-wallet —
          every amount is something you type in yourself. There's no account to move money out of,
          so even we can't.
        </p>
        <p>
          <b>We don't know who you are.</b> No name, email, or password — your account is just a
          random private key stored on your device. We don't collect contact details or sell your
          data, and there are no ads or cross-app tracking.
        </p>
        <p>
          <b>How it's stored.</b> Your connection is encrypted in transit (HTTPS/TLS) between your
          phone and the database, and the data sits on a managed database that encrypts it at rest.
          Entries can only be read or written by a request carrying your key.
        </p>
        <p className="text-gray-500 dark:text-gray-400">
          To be straight with you: your data isn't end-to-end encrypted, so treat budge· as a
          personal spending log rather than a vault. Your key is what protects it — keep it private,
          and remember there's no password reset.
        </p>
      </Topic>

      <Topic id="account" title="Account, sync & offline" hint="Your key, the cloud, and going offline" {...props}>
        <p>
          There's no email or password — your account is a private <b>key</b> (Settings → Your
          account key). Copy it to sign in on another device. Anyone with the key can open your data
          and there's no password reset, so keep it somewhere safe.
        </p>
        <p>
          Your data lives in the cloud and is cached on your device, so budge· opens instantly and
          works offline. Anything you log offline is saved on your device and syncs automatically the
          moment you're back online.
        </p>
        <p>
          If a new version is out and you still see the old one, use <b>Settings → Check for
          updates</b>. On iPhone, add budge· to your Home Screen so it reliably keeps your offline
          data.
        </p>
      </Topic>

      <p className="px-1 pt-2 text-center text-xs text-gray-400">budge· — make it to Friday 🌱</p>
    </div>
  );
}
