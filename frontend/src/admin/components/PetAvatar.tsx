import type { AnimalType } from '../data/types';
import { cx } from '../../preview/lib/cx';
import { ANIMAL_ICON } from './icons';

/** The pet's photo when the server has one; otherwise the animal's kind on a neutral disc. */
export function PetAvatar({ type, size = 'md', photoUrl }: { type: AnimalType; size?: 'md' | 'lg'; photoUrl?: string }) {
  const Icon = ANIMAL_ICON[type];
  return (
    <span className={cx('sa-avatar', size === 'lg' && 'sa-avatar--lg')} aria-hidden="true">
      {photoUrl ? <img src={photoUrl} alt="" loading="lazy" /> : <Icon size={size === 'lg' ? 26 : 16} strokeWidth={1.7} />}
    </span>
  );
}
