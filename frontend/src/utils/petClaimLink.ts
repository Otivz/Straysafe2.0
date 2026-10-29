// Shortcut from a confirmed pet match to its pet claim (the claims pages open the claim from ?claim_id=).
// Only the Subdivision Leader and Barangay have a claims page; elsewhere there is no shortcut.
export function petClaimPath(claimId: number | null | undefined, pathname: string): string | null {
    if (!claimId) return null;
    if (pathname.startsWith('/subd')) return `/subd/pet-claims?claim_id=${claimId}`;
    if (pathname.startsWith('/brgy')) return `/brgy/pet-claims?claim_id=${claimId}`;
    return null;
}
