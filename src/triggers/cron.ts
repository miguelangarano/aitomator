export function cronMatches(expression: string, date = new Date(), timezone?: string): boolean {
  let minute = date.getMinutes(), hour = date.getHours(), day = date.getDate(), month = date.getMonth() + 1, weekday = date.getDay()
  if (timezone) { const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, minute: "numeric", hour: "numeric", hourCycle: "h23", day: "numeric", month: "numeric", weekday: "short" }).formatToParts(date); const value = (type: string) => parts.find(p => p.type === type)?.value ?? "0"; minute = Number(value("minute")); hour = Number(value("hour")); day = Number(value("day")); month = Number(value("month")); weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday")) }
  const fields = expression.trim().split(/\s+/); if (fields.length !== 5) return false
  return match(fields[0]!, minute) && match(fields[1]!, hour) && match(fields[2]!, day) && match(fields[3]!, month) && match(fields[4]!, weekday)
}
function match(field: string, value: number): boolean { if (field === "*") return true; if (field.startsWith("*/")) return value % Number(field.slice(2)) === 0; return field.split(",").some(part => { const [a, b] = part.split("-").map(Number); return b === undefined ? value === a : value >= a! && value <= b }) }
