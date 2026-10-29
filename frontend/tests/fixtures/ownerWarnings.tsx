import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import '../../src/index.css';

localStorage.clear(); sessionStorage.clear();
localStorage.setItem('staff_user', JSON.stringify({
    user_id: 7, name: 'Leo Leader', email: 'leader@example.test', role_id: 2,
    is_verified: true, is_profile_complete: true, subdivision_id: 1,
    access_token: 'test.' + btoa(JSON.stringify({ user_id: 7, exp: 4102444800 })) + '.test',
}));
const view = new URLSearchParams(location.search).get('view');  // owner | custody | pet
if (view === 'owner') {   // the pet owner (a resident) on their report page
    localStorage.clear();
    localStorage.setItem('resident_user', JSON.stringify({
        user_id: 21, name: 'Olga Owner', email: 'owner@example.test', role_id: 1, is_verified: true, is_profile_complete: true, subdivision_id: 1,
        access_token: 'test.' + btoa(JSON.stringify({ user_id: 21, exp: 4102444800 })) + '.test',
    }));
}

const OwnerFollowUpCard = (await import('../../src/components/OwnerFollowUpCard')).default;
const RepeatedReportBanner = (await import('../../src/components/RepeatedReportBanner')).default;
const LeaderIdentityConfirm = (await import('../../src/components/LeaderIdentityConfirm')).default;
const PetDetailPanel = (await import('../../src/components/PetRecords/PetDetailPanel')).default;
const OwnerFollowUpOwnerPanel = (await import('../../src/components/OwnerFollowUpOwnerPanel')).default;
const CustodyQuestion = (await import('../../src/components/CustodyQuestion')).default;
const ClaimNotNeededPanel = (await import('../../src/components/ClaimNotNeededPanel')).default;
const RescueTimeline = (await import('../../src/components/RescueTimeline')).default;
const closedClaims: unknown[] = [];
Object.assign(window, { closedClaims: () => closedClaims });
const { mapRawPetToPetRecord } = await import('../../src/components/PetRecords/types');

const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 19);
const anHourAgo = new Date(Date.now() - 3600 * 1000).toISOString().slice(0, 19);
const confirmed: unknown[] = [];
const warningTargets: unknown[] = [];
Object.assign(window, { identityConfirmed: () => confirmed.length, warningTargets: () => warningTargets });

const root = createRoot(document.getElementById('fixture')!);
// ?view=pet: the pet record with its owner follow-ups in Pet History (Phase 5F)
if (view === 'timeline') {   // the report's Activity Timeline with an owner follow-up
    const history = [
        { history_id: 1, report_status_id: 2, remarks: 'Report verified', created_at: '2026-10-29T08:00:00' },
        { history_id: 2, report_status_id: null, remarks: "Owner follow-up started: the subdivision contacted the pet's owner and is observing until Nov 01, 2026.", created_at: '2026-10-29T09:00:00' },
        { history_id: 3, report_status_id: null, remarks: 'Owner follow-up extended: the subdivision is observing until Nov 04, 2026.', created_at: '2026-10-31T09:00:00' },
        { history_id: 4, report_status_id: 11, remarks: 'Owner follow-up ended (Owner complied): dog kept inside', created_at: '2026-11-01T09:00:00' },
    ];
    root.render(<MemoryRouter><ThemeProvider><ToastProvider><div data-testid="timeline" className="p-4 max-w-xl mx-auto">
        <RescueTimeline history={history as never} currentStatusId={11} reportCreatedAt="2026-10-29T07:00:00" animalType="Dog" />
    </div></ToastProvider></ThemeProvider></MemoryRouter>);
} else if (view === 'custody') {   // Phase 6: the owner's "is it home?" and the staff "Close: not needed"
    root.render(<MemoryRouter><ThemeProvider><ToastProvider><div className="p-4 space-y-4 max-w-xl mx-auto">
        <div data-testid="custody"><CustodyQuestion reportId={1} petId={3} petName="Rocky" /></div>
        <div data-testid="not-needed"><ClaimNotNeededPanel claimId={77} petName="Rocky" ownerAnswer="home" onClosed={c => closedClaims.push(c)} /></div>
    </div></ToastProvider></ThemeProvider></MemoryRouter>);
} else if (view === 'owner') {
    root.render(<MemoryRouter><ThemeProvider><ToastProvider><div data-testid="owner"><OwnerFollowUpOwnerPanel reportId={2} /></div></ToastProvider></ThemeProvider></MemoryRouter>);
} else if (view === 'pet') {
    const pet = mapRawPetToPetRecord({ pet_id: 3, pet_name: 'Bantay', pet_type: 'Dog', status: 'Active', owner_id: 21 });
    root.render(<MemoryRouter initialEntries={['/subd/pets']}><ThemeProvider><ToastProvider><PetDetailPanel pet={pet} /></ToastProvider></ThemeProvider></MemoryRouter>);
} else root.render(
    <MemoryRouter initialEntries={['/subd/reports/1']}>
        <ThemeProvider><ToastProvider>
            <div className="p-4 space-y-4 max-w-2xl mx-auto">
                <div data-testid="observing">
                    <OwnerFollowUpCard reportId={1} eligible canAct petName="Bantay" ownerName="Olga Owner" ownerHasAccount
                        categoryId={2} priority="High" onEscalate={() => {}} onIssueWarning={t => warningTargets.push(t)} />
                </div>
                <div data-testid="offline-owner">
                    <OwnerFollowUpCard reportId={12} eligible canAct petName="Brownie" ownerName="Mr Santos" ownerPhone="09177654321"
                        ownerHasAccount={false} categoryId={4} />
                </div>
                <div data-testid="rabies">
                    <OwnerFollowUpCard reportId={9} eligible canAct petName="Brownie" ownerName="Olga Owner" ownerHasAccount
                        categoryId={3} onEscalate={() => {}} />
                </div>
                <div data-testid="caution-before-start">
                    <OwnerFollowUpCard reportId={10} eligible canAct petName="Choco" ownerName="Olga Owner" ownerHasAccount categoryId={1} />
                </div>
                <div data-testid="repeat-banner">
                    <RepeatedReportBanner reportId={5} observedReportId={1} petName="Bantay" canAct />
                </div>
                <div data-testid="identity-ready">
                    <LeaderIdentityConfirm match={{ match_id: 3, owner_confirmation_status: 'PENDING', verified_at: twoDaysAgo, created_at: twoDaysAgo }}
                        onConfirmed={m => confirmed.push(m)} />
                </div>
                <div data-testid="identity-waiting">
                    <LeaderIdentityConfirm match={{ match_id: 4, owner_confirmation_status: 'PENDING', verified_at: anHourAgo, created_at: anHourAgo }}
                        onConfirmed={m => confirmed.push(m)} />
                </div>
            </div>
        </ToastProvider></ThemeProvider>
    </MemoryRouter>,
);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
