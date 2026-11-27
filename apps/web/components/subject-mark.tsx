import type { Selection } from "@/lib/types";
import { PlayerAvatar } from "./player-avatar";
import { TeamLogo } from "./team-logo";

/**
 * The picture that identifies a selection's subject: the player's photo for a player market, the team logo for a
 * team market. Game totals have no single subject and show nothing. Missing images fall back to initials / letters.
 */
export function SubjectMark({ s, size = 36 }: { s: Pick<Selection, "subject_type" | "subject_name" | "headshot_url" | "team_abbr" | "team_logo_url">; size?: number }) {
  if (s.subject_type === "player") return <PlayerAvatar name={s.subject_name} src={s.headshot_url} size={size} />;
  if (s.subject_type === "team" && s.team_abbr)
    return <TeamLogo team={{ abbr: s.team_abbr, name: s.subject_name, logo_url: s.team_logo_url ?? null }} size={size} />;
  return null;
}
