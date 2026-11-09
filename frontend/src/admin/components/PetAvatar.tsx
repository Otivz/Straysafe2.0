import type { AnimalType } from '../data/types';
import { cx } from '../../preview/lib/cx';
import { ANIMAL_ICON } from './icons';

/** Stand-in for a pet photo: the animal's kind on a neutral disc. Real photos replace it once the API provides them. */
export function PetAvatar({ type, size = 'md' }: { type: AnimalType; size?: 'md' | 'lg' }) {
  const Icon = ANIMAL_ICON[type];
  return <span className={cx('sa-avatar', size === 'lg' && 'sa-avatar--lg')} aria-hidden="true"><Icon size={size === 'lg' ? 26 : 16} strokeWidth={1.7} /></span>;
}
