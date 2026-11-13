import {
  Bird, CircleHelp, Dog, Cat, Eye, Fence, FileText, Footprints, Megaphone, MessageSquare, PawPrint, Rabbit, Search, ShieldAlert, Squirrel,
  Stethoscope, Turtle, CircleCheck, ArrowRightLeft, BellRing, Info, type LucideIcon,
} from 'lucide-react';
import type { EntryId } from '../data/entries';
import type { AnimalType, CategoryId, NoticeType, Notification, ReportUpdate } from '../data/types';

export const CATEGORY_ICON: Record<CategoryId, LucideIcon> = {
  lost_pet: Search, found_animal: PawPrint, nuisance: Megaphone, safety: ShieldAlert, injured: Stethoscope, other: CircleHelp,
};

/** The three entries of the first Report screen. */
export const ENTRY_ICON: Record<EntryId, LucideIcon> = { lost_pet: Search, complaint: Megaphone, animal: PawPrint };

export const ANIMAL_ICON: Record<AnimalType, LucideIcon> = {
  dog: Dog, cat: Cat, bird: Bird, small_mammal: Rabbit, reptile: Turtle, livestock: Fence, wildlife: Squirrel, other: PawPrint,
};

export const NOTICE_ICON: Record<NoticeType, LucideIcon> = { lost_pet: Search, found_animal: PawPrint, safety_advisory: ShieldAlert };

export const NOTIFICATION_ICON: Record<Notification['kind'], LucideIcon> = {
  report_update: FileText, sighting: Eye, claim_update: CircleCheck, community_notice: Megaphone, safety_advisory: ShieldAlert, alert: BellRing,
};

export const UPDATE_ICON: Record<ReportUpdate['kind'], LucideIcon> = {
  received: FileText, status: ArrowRightLeft, message: MessageSquare, you: MessageSquare, sighting: Footprints, outcome: CircleCheck, info: Info,
};
