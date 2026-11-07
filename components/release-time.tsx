import { getFormatter } from "next-intl/server";
import { TIME_ZONE } from "@/lib/helsinki-time";

// Release time of a news item, shown in Finnish time like the releases themselves.
export async function ReleaseTime({ date }: { date: Date }) {
  const format = await getFormatter();

  return (
    <time dateTime={date.toISOString()} className="text-sm text-muted-foreground">
      {format.dateTime(date, { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE })}
    </time>
  );
}
