import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import PetDetailPanel from '../../src/components/PetRecords/PetDetailPanel';
import { mapRawPetToPetRecord } from '../../src/components/PetRecords/types';
import '../../src/index.css';

const pet = mapRawPetToPetRecord({
    pet_id: 3, pet_name: 'Synthetic Phase 2 Pet', pet_type: 'Dog', status: 'Active',
    owner_id: null, can_edit_record: true, registered_by_user_id: 99,
    adoption_origin: 'barangay_adoption', temperament: 'Calm',
    adoption_info: new URLSearchParams(location.search).has('adopted') ? {state:'adopted', adoption_id:77, adopter_name:'Recorded Earlier Adopter', stage:'Handover', pending_applications:0} : null,
});
const root = createRoot(document.getElementById('fixture')!);
root.render(<MemoryRouter>
    <p className="p-2 bg-amber-50 text-xs">Synthetic test data. API calls are mocked; no real pet or owner information.</p>
    <PetDetailPanel pet={pet} />
</MemoryRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
