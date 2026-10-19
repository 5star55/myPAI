/**
 * commandRules.ts — allow/deny rules for terminal commands, like Claude Code's
 * `Bash(git push:*)` permissions.
 *
 *   "git push:*"   any command that starts with `git push`
 *   "npm test"     exactly `npm test`
 *
 * Deny rules win over everything. Allow rules let a matching command run
 * without asking (even a risky one), but only when it is ONE simple command:
 * `git status && rm -rf x` never matches an allow rule for `git status:*`.
 */

export interface CommandRules {
  allow: string[]
  deny: string[]
}

export const emptyRules = (): CommandRules => ({ allow: [], deny: [] })

const MAX_RULES = 200
const MAX_RULE_CHARS = 200

const squash = (s: string): string => s.trim().replace(/\s+/g, ' ')

/** Shell operators that chain or redirect commands. */
const OPERATORS = /&&|\|\||[;|&`\n<>]|\$\(/

export const isCompound = (command: string): boolean => OPERATORS.test(command)

/** The simple commands inside a compound one (for deny rules). */
export function segments(command: string): string[] {
  return command
    .split(/&&|\|\||[;|&\n]|\$\(|`/)
    .map((s) => squash(s.replace(/^[()\s]+|[()\s]+$/g, '')))
    .filter(Boolean)
}

export function ruleMatches(rule: string, command: string): boolean {
  const r = squash(rule)
  const c = squash(command)
  if (!r) return false
  if (r.endsWith(':*')) {
    const prefix = r.slice(0, -2).trim()
    return !!prefix && (c === prefix || c.startsWith(`${prefix} `))
  }
  return c === r
}

/** The deny rule this command breaks, if any (checks every part of a compound command). */
export function deniedBy(rules: CommandRules, command: string): string | null {
  for (const rule of rules.deny) {
    if (ruleMatches(rule, command) || segments(command).some((s) => ruleMatches(rule, s))) return rule
  }
  return null
}

/** The allow rule that lets this command run without asking, if any. */
export function allowedBy(rules: CommandRules, command: string): string | null {
  if (isCompound(command)) return null
  return rules.allow.find((rule) => ruleMatches(rule, command)) ?? null
}

/**
 * The rule offered by "don't ask again": the command name plus its
 * subcommand, like Claude Code ("git push:*", "npm run build:*").
 * Null for compound commands.
 */
export function suggestRule(command: string): string | null {
  if (isCompound(command)) return null
  const words = squash(command).split(' ')
  const keep: string[] = []
  for (const w of words) {
    if (keep.length && (/^[-'"~/.$]/.test(w) || w.includes('/') || w.includes('='))) break
    keep.push(w)
    const max = ['run', 'exec', 'x'].includes(words[1] ?? '') ? 3 : 2
    if (keep.length >= max) break
  }
  return keep.length ? `${keep.join(' ')}:*` : null
}

export function sanitizeRules(raw: unknown): CommandRules {
  const list = (v: unknown): string[] =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === 'string').map(squash).filter((x) => x && x !== ':*' && x.length <= MAX_RULE_CHARS))].slice(0, MAX_RULES)
      : []
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return { allow: list(r.allow), deny: list(r.deny) }
}
