/** Curated IANA zones for the home-timezone selector (no runtime Intl lookups). */
export const TIMEZONE_OPTIONS: {
  group: string;
  options: { value: string; label: string }[];
}[] = [
  {
    group: "settings.timezoneGroupAmericas",
    options: [
      { value: "Pacific/Honolulu", label: "(UTC−10:00) Honolulu" },
      { value: "America/Anchorage", label: "(UTC−09:00) Anchorage" },
      { value: "America/Los_Angeles", label: "(UTC−08:00) Los Angeles" },
      { value: "America/Vancouver", label: "(UTC−08:00) Vancouver" },
      { value: "America/Denver", label: "(UTC−07:00) Denver" },
      { value: "America/Phoenix", label: "(UTC−07:00) Phoenix" },
      { value: "America/Chicago", label: "(UTC−06:00) Chicago" },
      { value: "America/Mexico_City", label: "(UTC−06:00) Mexico City" },
      { value: "America/New_York", label: "(UTC−05:00) New York" },
      { value: "America/Toronto", label: "(UTC−05:00) Toronto" },
      { value: "America/Halifax", label: "(UTC−04:00) Halifax" },
      { value: "America/Sao_Paulo", label: "(UTC−03:00) São Paulo" },
      { value: "America/Argentina/Buenos_Aires", label: "(UTC−03:00) Buenos Aires" },
      { value: "America/Santiago", label: "(UTC−04:00) Santiago" },
    ],
  },
  {
    group: "settings.timezoneGroupEuropeAfrica",
    options: [
      { value: "Atlantic/Reykjavik", label: "(UTC+00:00) Reykjavik" },
      { value: "Europe/London", label: "(UTC+00:00) London" },
      { value: "Europe/Dublin", label: "(UTC+00:00) Dublin" },
      { value: "Europe/Paris", label: "(UTC+01:00) Paris" },
      { value: "Europe/Berlin", label: "(UTC+01:00) Berlin" },
      { value: "Europe/Amsterdam", label: "(UTC+01:00) Amsterdam" },
      { value: "Europe/Madrid", label: "(UTC+01:00) Madrid" },
      { value: "Europe/Rome", label: "(UTC+01:00) Rome" },
      { value: "Europe/Stockholm", label: "(UTC+01:00) Stockholm" },
      { value: "Europe/Warsaw", label: "(UTC+01:00) Warsaw" },
      { value: "Europe/Athens", label: "(UTC+02:00) Athens" },
      { value: "Europe/Helsinki", label: "(UTC+02:00) Helsinki" },
      { value: "Europe/Istanbul", label: "(UTC+03:00) Istanbul" },
      { value: "Africa/Cairo", label: "(UTC+02:00) Cairo" },
      { value: "Africa/Johannesburg", label: "(UTC+02:00) Johannesburg" },
      { value: "Africa/Lagos", label: "(UTC+01:00) Lagos" },
      { value: "Africa/Nairobi", label: "(UTC+03:00) Nairobi" },
    ],
  },
  {
    group: "settings.timezoneGroupAsiaPacific",
    options: [
      { value: "Asia/Dubai", label: "(UTC+04:00) Dubai" },
      { value: "Asia/Karachi", label: "(UTC+05:00) Karachi" },
      { value: "Asia/Kolkata", label: "(UTC+05:30) Kolkata" },
      { value: "Asia/Dhaka", label: "(UTC+06:00) Dhaka" },
      { value: "Asia/Bangkok", label: "(UTC+07:00) Bangkok" },
      { value: "Asia/Singapore", label: "(UTC+08:00) Singapore" },
      { value: "Asia/Hong_Kong", label: "(UTC+08:00) Hong Kong" },
      { value: "Asia/Shanghai", label: "(UTC+08:00) Shanghai" },
      { value: "Asia/Tokyo", label: "(UTC+09:00) Tokyo" },
      { value: "Asia/Seoul", label: "(UTC+09:00) Seoul" },
      { value: "Australia/Perth", label: "(UTC+08:00) Perth" },
      { value: "Australia/Adelaide", label: "(UTC+09:30) Adelaide" },
      { value: "Australia/Sydney", label: "(UTC+10:00) Sydney" },
      { value: "Australia/Melbourne", label: "(UTC+10:00) Melbourne" },
      { value: "Pacific/Auckland", label: "(UTC+12:00) Auckland" },
      { value: "Pacific/Fiji", label: "(UTC+12:00) Fiji" },
    ],
  },
];

export const TIMEZONE_VALUES = new Set(
  TIMEZONE_OPTIONS.flatMap((g) => g.options.map((o) => o.value)),
);
