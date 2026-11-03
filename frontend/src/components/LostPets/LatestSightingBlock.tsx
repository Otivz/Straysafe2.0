import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { SIGHTING_STATUS_LABEL, fmtDateTime, sightingPlace, type Sighting } from '../../utils/lostPets';

/**
 * Location Intelligence on a Lost Pet Report: the most recent neighbor sighting from the Neighborhood Alert, next to the
 * original report location. A neighbor's report, not a confirmed location; the full map and timeline stay on the alert.
 */
export default function LatestSightingBlock({ sighting, number, count, alertHref, onShowOnMap }: {
    sighting: Sighting;
    /** Its number on the maps (same as the tracking map) */
    number: number | null;
    /** Sightings reported in all, as on the tracking map */
    count: number;
    alertHref: string;
    onShowOnMap?: () => void;
}) {
    const verified = sighting.status === 'verified';
    return (
        <div data-latest-sighting className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-sky-400/30">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 flex items-center justify-center text-sky-300 shrink-0">
                <Eye className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-[9px] font-black text-white/50 uppercase tracking-widest flex items-center gap-1.5">
                    {number != null && (
                        <span data-sighting-number aria-label={`Sighting ${number}`}
                            className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-black text-white normal-case tracking-normal ${verified ? 'bg-emerald-600' : 'bg-amber-500'}`}>
                            {number}
                        </span>
                    )}
                    <span>{number != null ? `Sighting ${number} · most recent neighbor sighting` : 'Most recent neighbor sighting'}</span>
                </p>
                <p className="text-sm font-black tracking-tight text-white break-words">{sightingPlace(sighting)}</p>
                <p className="text-[10px] font-semibold text-white/70 mt-0.5">
                    Seen {fmtDateTime(sighting.seen_at)} · reported by {sighting.reported_by}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${verified
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                        : 'bg-amber-500/15 text-amber-200 border-amber-400/30'}`}>
                        {verified ? 'Verified' : SIGHTING_STATUS_LABEL[sighting.status]}
                    </span>
                    <span className="text-[10px] font-bold text-white/50">{count} sighting{count === 1 ? '' : 's'} reported</span>
                </div>
                <p className="text-[10px] text-white/50 mt-1.5">A neighbor's report, not a confirmed location. The original report location stays as it was.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    {onShowOnMap && (
                        <button type="button" onClick={onShowOnMap}
                            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-black uppercase tracking-wider border border-white/15 cursor-pointer">
                            Show on map
                        </button>
                    )}
                    <Link to={alertHref} className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 rounded-lg text-[10px] font-black uppercase tracking-wider border border-sky-400/30">
                        Open tracking map
                    </Link>
                </div>
            </div>
        </div>
    );
}
