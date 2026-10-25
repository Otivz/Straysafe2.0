import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ReportChatDrawer from '../../src/components/Chat/ReportChatDrawer';
import { clearAuthStorage } from '../../src/utils/api';
import '../../src/index.css';

// The browser test sets localStorage (signed-in user, cached messages) before this page loads.
(window as any).__clearAuthStorage = clearAuthStorage;
const adoptionId = Number(new URLSearchParams(location.search).get('adoption') || 7);
const root = createRoot(document.getElementById('fixture')!);
root.render(
    <MemoryRouter>
        <ReportChatDrawer isOpen onClose={() => {}} report={null} threadMode="adoption" adoptionId={adoptionId}
            currentUser={{ user_id: 31, name: 'Applicant B', role_id: 1 }} />
    </MemoryRouter>
);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
