import { Briefcase, Eye, Lightbulb, MapPin, Package, UserRound, UserSearch, type LucideIcon } from 'lucide-react';
import type { EntityType } from '@/types';

/**
 * One place that knows how each record type looks and where it lives.
 * Colours are the validated categorical set (see index.css). Identity is never colour-only:
 * every type also has its own icon and a text label wherever it is shown.
 */
export interface TypeMeta { label: string; plural: string; icon: LucideIcon; color: string; path: string | null }

export const TYPE_META: Record<EntityType, TypeMeta> = {
  case: { label: 'Case', plural: 'Cases', icon: Briefcase, color: '#1f1f1f', path: 'cases' },
  suspect: { label: 'Suspect', plural: 'Suspects', icon: UserSearch, color: '#eb6834', path: 'suspects' },
  victim: { label: 'Victim', plural: 'Victims', icon: UserRound, color: '#2a78d6', path: 'victims' },
  witness: { label: 'Witness', plural: 'Witnesses', icon: Eye, color: '#e87ba4', path: 'witnesses' },
  evidence: { label: 'Evidence', plural: 'Evidence', icon: Package, color: '#008300', path: 'evidence' },
  clue: { label: 'Clue', plural: 'Clues', icon: Lightbulb, color: '#eda100', path: 'clues' },
  location: { label: 'Location', plural: 'Locations', icon: MapPin, color: '#1baf7a', path: 'locations' },
};

export const TYPE_ORDER: EntityType[] = ['case', 'suspect', 'victim', 'witness', 'evidence', 'clue', 'location'];

export const recordPath = (type: EntityType, id: number) => `/${TYPE_META[type].path}/${id}`;
export const graphPath = (type: EntityType, id: number) => `/graph?focus=${type}:${id}`;

export function TypeIcon({ type, size = 16, className }: { type: EntityType; size?: number; className?: string }) {
  const Icon = TYPE_META[type].icon;
  return <Icon size={size} className={className} aria-hidden />;
}
