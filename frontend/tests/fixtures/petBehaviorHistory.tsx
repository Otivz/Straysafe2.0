import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import PetDetailPanel from '../../src/components/PetRecords/PetDetailPanel';
import BehaviorHistoryField from '../../src/components/PetRecords/BehaviorHistoryField';
import { mapRawPetToPetRecord } from '../../src/components/PetRecords/types';
import '../../src/index.css';

localStorage.clear(); sessionStorage.clear();
localStorage.setItem('staff_user', JSON.stringify({
    user_id: 42, name: 'Barangay Staff', role_id: 3,
    access_token: 'test.' + btoa(JSON.stringify({ user_id: 42, exp: 4102444800 })) + '.test',
}));

// ?view=fields: the resident form (saved bite declaration locked, 2 verified bites) and the staff form (unlocked)
const Fields = () => {
    const [resident, setResident] = useState({ bite: true, chase: false });
    const [staff, setStaff] = useState({ bite: true });
    return (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
            <section data-form="resident" className="space-y-4">
                <BehaviorHistoryField label="Bite history" question="My pet has bitten a person or another animal before"
                    verifiedCount={2} declared={resident.bite} locked onChange={(v) => setResident({ ...resident, bite: v })} />
                <BehaviorHistoryField label="Chasing" question="My pet chases people, animals or vehicles"
                    verifiedCount={0} declared={resident.chase} onChange={(v) => setResident({ ...resident, chase: v })} />
                <output data-state>{JSON.stringify(resident)}</output>
            </section>
            <section data-form="staff" className="space-y-4">
                <BehaviorHistoryField label="Bite history" question="Declared: has bitten a person or another animal before"
                    verifiedCount={0} declared={staff.bite} accent="accent-role" onChange={(v) => setStaff({ bite: v })} />
                <output data-state>{JSON.stringify(staff)}</output>
            </section>
        </div>
    );
};

const view = new URLSearchParams(location.search).get('view');
const pet = mapRawPetToPetRecord({ pet_id: 3, pet_name: 'Brownie', pet_type: 'Dog', status: 'Active', registered_by_user_id: 99,
    can_edit_record: true, temperament: 'Aggressive', has_bite_history: true, bite_incident_count: 2,
    chase_behavior: false, chase_incident_count: 0, declared_bite_history: true, declared_chase_behavior: true });
const root = createRoot(document.getElementById('fixture')!);
root.render(<MemoryRouter>{view === 'fields' ? <Fields /> : <PetDetailPanel pet={pet} />}</MemoryRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
