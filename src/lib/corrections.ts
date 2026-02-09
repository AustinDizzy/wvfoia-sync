import rawCorrections from "$/data/corrections.json";
import type { Entry } from "$/lib/types";
import { titlify } from "$/lib/utils";

interface EntryCorrections {
  entries: Record<string, Partial<Entry>>;
  agencies: Record<string, string[]>;
  organizations?: Record<string, string>;
}

interface DateCorrection {
  id: number;
  requestDate?: string;
  completionDate?: string;
}

const corrections = rawCorrections as EntryCorrections;
const dateCorrections: DateCorrection[] = Object.entries(corrections.entries)
  .map(([id, patch]) => ({
    id: Number(id),
    requestDate: patch.request_date ?? undefined,
    completionDate: patch.completion_date ?? undefined,
  }))
  .filter((entry) => Number.isFinite(entry.id) && (entry.requestDate || entry.completionDate));

function normalizeToken(value: string): string {
  return titlify(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalAgencyMatch(agency: string): string | null {
  const target = titlify(agency).toLowerCase();
  const normalizedTarget = normalizeToken(agency);
  if (!target && !normalizedTarget) return null;
  const matched = Object.entries(corrections.agencies).find(([canonical, aliases]) => {
    if (titlify(canonical).toLowerCase() === target) return true;
    if (normalizeToken(canonical) === normalizedTarget) return true;
    return aliases.some((candidate) =>
      titlify(candidate).toLowerCase() === target || normalizeToken(candidate) === normalizedTarget
    );
  });
  return matched?.[0] ?? null;
}

export function normalizeAgencyName(agency: string): string {
  agency = agency.replace(/Departm[ei]n?t/ig, "Department").replace(/Tcity/ig, "City");
  const canonical = canonicalAgencyMatch(agency);
  if (canonical) return canonical;
  const normalizedSpacing = agency.replace(/\s+/g, " ").trim();
  const preservedMcTokens = new Map<string, string>();
  for (const token of normalizedSpacing.match(/\bMc[A-Z][A-Za-z]*\b/g) ?? []) {
    preservedMcTokens.set(token.toLowerCase(), token);
  }
  const normalized = titlify(normalizedSpacing.toLowerCase(), true)
    .replace(/\bMc[a-z]+\b/g, (token) => preservedMcTokens.get(token.toLowerCase()) ?? token)
    .replace(/\bWv\b/g, "WV");
  return normalized;
}

export function agencyNameCandidates(agency: string): string[] {
  const canonical = canonicalAgencyMatch(agency);
  if (!canonical) return [agency];
  const aliases = corrections.agencies[canonical] ?? [];
  return [canonical, ...aliases];
}

export function getDateCorrections(): DateCorrection[] {
  return dateCorrections;
}

export function applyCorrections(entry: Entry): Entry {
  const patched = {
    ...entry,
    ...(corrections.entries[String(entry.id)] ?? {}),
  };

  const cleanedAgency = patched.agency.replace(/'{2,}/g, "'");
  const normalizedAgency = normalizeAgencyName(cleanedAgency);

  if (normalizedAgency !== patched.agency) {
    patched.agency = normalizedAgency;
  }

  if (patched.organization && (corrections.organizations ?? {})[patched.organization]) {
    patched.organization = (corrections.organizations ?? {})[patched.organization];
  }

  return patched;
}
