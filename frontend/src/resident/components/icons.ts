import {
  Bird, CircleHelp, Dog, Cat, Eye, Fence, FileText, Footprints, Megaphone, MessageSquare, PawPrint, Rabbit, Search, ShieldAlert, Squirrel,
  Stethoscope, Turtle, CircleCheck, ArrowRightLeft, type LucideIcon,
} from 'lucide-react';
import type { AnimalType, CategoryId, NoticeType, Notification, ReportUpdate } from '../data/types';

export const CATEGORY_ICON: Record<CategoryId, LucideIcon> = {
  lost_pet: Search, found_animal: PawPrint, nuisance: Megaphone, safety: ShieldAlert, injured: Stethoscope, other: CircleHelp,
};

export const ANIMAL_ICON: Record<AnimalType, LucideIcon> = {
  dog: Dog, cat: Cat, bird: Bird, small_mammal: Rabbit, reptile: Turtle, livestock: Fence, wildlife: Squirrel, other: PawPrint,
};

export const NOTICE_ICON: Record<NoticeType, LucideIcon> = { lost_pet: Search, found_animal: PawPrint, safety_advisory: ShieldAlert };

export const NOTIFICATION_ICON: Record<Notification['kind'], LucideIcon> = {
  report_update: FileText, sighting: Eye, claim_update: CircleCheck, community_notice: Megaphone, safety_advisory: ShieldAlert,
};

export const UPDATE_ICON: Record<ReportUpdate['kind'], LucideIcon> = {
  received: FileText, status: ArrowRightLeft, message: MessageSquare, you: MessageSquare, sighting: Footprints, outcome: CircleCheck,
};
