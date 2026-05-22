import { useState } from 'react';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import Button from '../../components/Button';

interface EndorsementDocument {
    doc_id: string;
    report_id: number;
    title: string;
    date_sent: string;
    recipient: string;
    status: 'Received' | 'In Review' | 'Accepted';
    file_type: 'PDF' | 'DOCX';
    file_size: string;
}

const EndorsementArch = () => {
    const [searchTerm, setSearchTerm] = useState('');

    const mockDocs: EndorsementDocument[] = [
        {
            doc_id: "END-2024-0512",
            report_id: 1042,
            title: "Endorsement for Aggressive Stray Rescue - Sector 4",
            date_sent: "May 12, 2024",
            recipient: "Barangay San Vicente Ops",
            status: "Received",
            file_type: "PDF",
            file_size: "1.2 MB"
        },
        {
            doc_id: "END-2024-0511",
            report_id: 1039,
            title: "Endorsement for Injured Animal Rescue - Block 5",
            date_sent: "May 11, 2024",
            recipient: "Barangay San Vicente Ops",
            status: "Accepted",
            file_type: "PDF",
            file_size: "850 KB"
        },
        {
            doc_id: "END-2024-0510",
            report_id: 1025,
            title: "Endorsement for Perimeter Pack Control",
            date_sent: "May 10, 2024",
            recipient: "Barangay San Vicente Ops",
            status: "Accepted",
            file_type: "PDF",
            file_size: "1.1 MB"
        }
    ];

    const filteredDocs = mockDocs.filter(doc => 
        doc.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        doc.doc_id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <SubdNavbar />

                <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto">
                        
                        {/* Header Section */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Endorsement Archive</h1>
                                <p className="text-gray-500 text-sm mt-1">Repository of all official endorsement letters sent to the Barangay.</p>
                            </div>
                            <div className="relative w-full md:w-80">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search documents..."
                                    className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#F97316] outline-none transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Document Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredDocs.map((doc) => (
                                <div key={doc.doc_id} className="group bg-white rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 p-6 flex flex-col h-full">
                                    <div className="flex items-start justify-between mb-6">
                                        <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-[#F97316] shadow-inner group-hover:bg-[#F97316] group-hover:text-white transition-colors duration-300">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                            doc.status === 'Accepted' ? 'bg-green-50 text-green-600 border-green-100' : 
                                            'bg-blue-50 text-blue-600 border-blue-100'
                                        }`}>
                                            {doc.status}
                                        </span>
                                    </div>

                                    <h3 className="text-sm font-bold text-gray-900 mb-2 line-clamp-2 leading-relaxed">
                                        {doc.title}
                                    </h3>
                                    
                                    <div className="flex flex-col space-y-1.5 mb-6 mt-auto">
                                        <div className="flex items-center text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                                            <span className="w-4">🆔</span> {doc.doc_id}
                                        </div>
                                        <div className="flex items-center text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                                            <span className="w-4">📅</span> {doc.date_sent}
                                        </div>
                                        <div className="flex items-center text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                                            <span className="w-4">📂</span> {doc.file_size} • {doc.file_type}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-50">
                                        <Button variant="light" size="sm" className="!text-[10px] !font-black uppercase tracking-widest !rounded-xl">
                                            Preview
                                        </Button>
                                        <Button variant="primary" size="sm" className="!text-[10px] !font-black uppercase tracking-widest !rounded-xl !bg-gray-900 !border-gray-900 hover:!bg-[#F97316] hover:!border-[#F97316]">
                                            Download
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            {filteredDocs.length === 0 && (
                                <div className="col-span-full bg-white rounded-3xl border border-dashed border-gray-200 p-20 text-center">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-gray-900 font-bold">No documents found</h3>
                                    <p className="text-gray-400 text-sm mt-1">Try adjusting your search terms.</p>
                                </div>
                            )}
                        </div>

                        {/* Policy Note */}
                        <div className="mt-12 p-8 bg-gray-900 rounded-[2.5rem] text-white relative overflow-hidden shadow-2xl">
                            <div className="absolute top-0 right-0 p-8 opacity-10">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-32 w-32" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div className="relative z-10">
                                <h4 className="text-lg font-black uppercase tracking-widest mb-4 flex items-center gap-3">
                                    <span className="p-1 bg-[#F97316] rounded-md">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                        </svg>
                                    </span>
                                    Archive Protocol
                                </h4>
                                <p className="text-gray-400 text-sm leading-relaxed max-w-2xl">
                                    The Endorsement Archive stores every official communication sent to the Barangay operations hub. 
                                    These documents serve as legal proof of subdivision request and are used for audit and security 
                                    purposes. Documents are automatically archived upon successful escalation from the Incident Report module.
                                </p>
                            </div>
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
};

export default EndorsementArch;
