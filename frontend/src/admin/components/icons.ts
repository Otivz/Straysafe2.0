import {
  AlertTriangle, ArrowRightLeft, Bell, Bird, CalendarClock, Camera, Cat, ClipboardCheck, ClipboardList, Dog, Fence, FileText, Film, Flag, Footprints, Handshake,
  HelpCircle, Info, Landmark, Link2, Lock, Megaphone, MessageSquare, NotebookPen, PawPrint, Rabbit, RotateCcw, ScanSearch, Search,
  ShieldAlert, ShieldCheck, Siren, Squirrel, Stethoscope, Turtle, Unlink, UserRound, Users, Video, type LucideIcon,
} from 'lucide-react';
import type { AdminNotification, AnimalType, CategoryId, Evidence, EventKind, NoticeType } from '../data/types';

export const CATEGORY_ICON: Record<CategoryId, LucideIcon> = {
  lost_pet: Search, found_animal: PawPrint, nuisance: Megaphone, safety: ShieldAlert, injured: Stethoscope, other: HelpCircle,
};

export const EVIDENCE_ICON: Record<Evidence['kind'], LucideIcon> = { photo: Camera, video: Video, sighting: Footprints, cctv: Film, document: FileText };

export const NOTICE_ICON: Record<NoticeType, LucideIcon> = { lost_pet: Search, found_animal: PawPrint, safety_advisory: ShieldAlert };

export const ANIMAL_ICON: Record<AnimalType, LucideIcon> = {
  dog: Dog, cat: Cat, bird: Bird, small_mammal: Rabbit, reptile: Turtle, livestock: Fence, wildlife: Squirrel, other: PawPrint,
};

export const EVENT_ICON: Record<EventKind, { icon: LucideIcon; tone?: 'brand' | 'sage' | 'amber' | 'red' }> = {
  reported: { icon: FileText },
  status: { icon: ArrowRightLeft, tone: 'brand' },
  priority: { icon: Flag, tone: 'amber' },
  assessment: { icon: ClipboardCheck },
  identity: { icon: ScanSearch },
  ownership: { icon: UserRound },
  claim: { icon: Users, tone: 'amber' },
  note: { icon: NotebookPen },
  follow_up: { icon: CalendarClock },
  owner_contact: { icon: MessageSquare },
  warning: { icon: AlertTriangle, tone: 'amber' },
  compliance: { icon: ShieldCheck, tone: 'sage' },
  referral: { icon: Landmark, tone: 'brand' },
  referral_update: { icon: Handshake, tone: 'brand' },
  link: { icon: Link2 },
  unlink: { icon: Unlink },
  notice: { icon: Megaphone },
  closure: { icon: Lock, tone: 'sage' },
  reopen: { icon: RotateCcw, tone: 'amber' },
  info: { icon: Info },
};

export const NOTIFICATION_ICON: Record<AdminNotification['kind'], { icon: LucideIcon; tone: 'brand' | 'red' | 'amber' | 'sage' | 'neutral' }> = {
  new_report: { icon: ClipboardList, tone: 'amber' },
  urgent: { icon: Siren, tone: 'red' },
  follow_up: { icon: CalendarClock, tone: 'amber' },
  ownership_claim: { icon: Users, tone: 'brand' },
  case_activity: { icon: Bell, tone: 'neutral' },
  referral: { icon: Handshake, tone: 'brand' },
};
