import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import PetDetailPanel from '../../src/components/PetRecords/PetDetailPanel';
import { mapRawPetToPetRecord } from '../../src/components/PetRecords/types';
import '../../src/index.css';

localStorage.clear();
sessionStorage.clear();
localStorage.setItem('staff_user', JSON.stringify({
    user_id: 42, name: 'Test Leader', role_id: 2,
    access_token: 'test.' + btoa(JSON.stringify({ user_id: 42, exp: 4102444800 })) + '.test',
}));
const pet = mapRawPetToPetRecord({ pet_id: 10, pet_name: 'Kobe', owner_id: 1, pet_type: 'Dog',
    status: 'Active', owner: { user_id: 1, name: 'Pet Owner' } });
const root = createRoot(document.getElementById('fixture')!);
root.render(<MemoryRouter><PetDetailPanel pet={pet} /></MemoryRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
