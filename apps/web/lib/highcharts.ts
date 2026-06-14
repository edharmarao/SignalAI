/**
 * Global Highcharts initialisation — IST timezone (UTC+5:30).
 * Import this module in every file that uses Highcharts so the settings
 * are applied exactly once (Highcharts is a singleton).
 *
 *   import "@/lib/highcharts";
 */
import Highcharts from "highcharts/highstock";

// IST = UTC+5:30 → Highcharts timezoneOffset uses negative of UTC offset
// (i.e. −330 minutes for IST)
Highcharts.setOptions({
  time: {
    timezoneOffset: -330,   // display all x-axis labels in IST
  },
  lang: {
    // 24-hour clock labels that match market session times
    months: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    shortMonths: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    weekdays: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],
  },
});

/**
 * Parse a DB timestamp string (IST, no timezone suffix) to epoch ms.
 * Handles both "2025-01-01 09:15:00" and "2025-01-01T09:15:00" formats.
 */
export function istToMs(t: string): number {
  return new Date(t.replace(" ", "T") + "+05:30").getTime();
}
