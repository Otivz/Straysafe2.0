interface PersonnelStatus {
    status?: string | null;
}

export type PersonnelAvailability = 'available' | 'on_mission' | 'off_duty';

/** A rescue assignment does not make an inactive account available for duty. */
export function getPersonnelAvailability(person: PersonnelStatus, hasActiveAssignment: boolean): PersonnelAvailability {
    if (person.status?.trim().toLowerCase() !== 'active') return 'off_duty';
    return hasActiveAssignment ? 'on_mission' : 'available';
}

export function getPersonnelCounts<T extends PersonnelStatus>(people: T[], isAssigned: (person: T) => boolean) {
    const counts = { total: people.length, available: 0, onMission: 0, offDuty: 0, onDuty: 0 };
    for (const person of people) {
        const status = getPersonnelAvailability(person, isAssigned(person));
        if (status === 'off_duty') counts.offDuty++;
        else {
            counts.onDuty++;
            if (status === 'on_mission') counts.onMission++;
            else counts.available++;
        }
    }
    return counts;
}
