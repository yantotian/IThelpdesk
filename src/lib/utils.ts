import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const APP_TIME_ZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

export const PASSWORD_MIN_LENGTH = 6;

export function validatePassword(pw: string): string | null {
  if (!pw) return "Password is required";
  if (pw.length < PASSWORD_MIN_LENGTH)
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  return null;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toUtc8(date: Date | string | number): Date {
  return new Date(new Date(date).getTime() + APP_TIME_ZONE_OFFSET_MS);
}

export function formatUtc8(
  date: Date | string | number,
  opts: Intl.DateTimeFormatOptions = {}
): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(
    toUtc8(date)
  );
}

export function formatUtc8Stamp(date: Date | string | number, length = 19): string {
  return toUtc8(date).toISOString().slice(0, length).replace("T", " ");
}

export function formatUtc8DateStamp(date: Date | string | number): string {
  return toUtc8(date).toISOString().slice(0, 10);
}

export function formatUtc8Date(date: Date | string | number): string {
  return formatUtc8(date, { year: "numeric", month: "numeric", day: "numeric" });
}

export function formatUtc8ShortDate(date: Date | string | number): string {
  return formatUtc8(date, { month: "short", day: "numeric" });
}

export function formatUtc8DateTime(date: Date | string | number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).format(toUtc8(date));
}

export type Params = Partial<
  Record<keyof URLSearchParams, string | number | null | undefined>
>;

export function createQueryString(
  params: Params,
  searchParams: URLSearchParams
) {
  const newSearchParams = new URLSearchParams(searchParams?.toString());

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      newSearchParams.delete(key);
    } else {
      newSearchParams.set(key, String(value));
    }
  }

  return newSearchParams.toString();
}

export function formatDate(
  date: Date | string | number,
  opts: Intl.DateTimeFormatOptions = {}
) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: opts.month ?? "long",
    day: opts.day ?? "numeric",
    year: opts.year ?? "numeric",
    ...opts,
  }).format(new Date(date));
}
