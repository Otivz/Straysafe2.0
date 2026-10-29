import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import PetDetailPanel from '../../src/components/PetRecords/PetDetailPanel';
import { mapRawPetToPetRecord } from '../../src/components/PetRecords/types';
import '../../src/index.css';

localStorage.clear(); sessionStorage.clear();
localStorage.setItem('staff_user', JSON.stringify({
    user_id: 42, name: 'Barangay Staff', role_id: 3,
    access_token: 'test.' + btoa(JSON.stringify({ user_id: 42, exp: 4102444800 })) + '.test',
}));
const readOnly = new URLSearchParams(location.search).has('readOnly');
const pet = mapRawPetToPetRecord({ pet_id: 3, pet_name: 'Animal in care', pet_type: 'Dog', status: 'Active',
    registered_by_user_id: 99, can_edit_record: !readOnly,
    record_edit_restriction: readOnly ? 'Staff can only edit dogs or cats currently in official care within their jurisdiction.' : null,
});
const root = createRoot(document.getElementById('fixture')!);
root.render(<MemoryRouter><PetDetailPanel pet={pet} /></MemoryRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
