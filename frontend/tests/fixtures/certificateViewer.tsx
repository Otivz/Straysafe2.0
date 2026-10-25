import React from 'react';
import { createRoot } from 'react-dom/client';
import AdoptionCertificateViewer from '../../src/components/Adoption/AdoptionCertificateViewer';
import '../../src/index.css';

// Opens the certificate viewer the resident and barangay pages use; the browser check answers its API call.
const root = createRoot(document.getElementById('fixture')!);
root.render(<AdoptionCertificateViewer adoptionId={1} applicationData={{ full_name: 'Emmanuel Vito Cruz' }} refreshKey={0} onClose={() => {}} />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
