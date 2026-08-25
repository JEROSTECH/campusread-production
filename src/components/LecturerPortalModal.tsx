import React, { useState } from 'react';
import { X, Upload, Sparkles, CheckCircle2, ShieldCheck, DollarSign, BookOpen, Building2 } from 'lucide-react';

interface LecturerPortalModalProps {
  onClose: () => void;
  onAddCustomBook: (newBook: any) => void;
}

export const LecturerPortalModal: React.FC<LecturerPortalModalProps> = ({
  onClose,
  onAddCustomBook,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [authorTitle, setAuthorTitle] = useState('Senior Lecturer');
  const [department, setDepartment] = useState('Engineering');
  const [institution, setInstitution] = useState('University of Lagos (UNILAG)');
  const [price, setPrice] = useState(4500);
  const [excerpt, setExcerpt] = useState('');
  const [published, setPublished] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !author) return;

    const newBook = {
      id: `custom-${Date.now()}`,
      title,
      author,
      authorTitle,
      department,
      faculty: department,
      institution,
      price: Number(price),
      rating: 5.0,
      reviewCount: 1,
      coverGradient: 'from-blue-600 via-indigo-700 to-slate-900',
      format: 'Course Pack',
      edition: '2024 Author Edition',
      publishedYear: 2024,
      pages: 280,
      isbn: `978-978-${Math.floor(10000 + Math.random() * 90000)}`,
      isFeatured: true,
      description: `Official digital course material and lecture pack authored for students of ${department} at ${institution}.`,
      tableOfContents: [
        'Module 1: Foundations & Core Concepts',
        'Module 2: Analytical Methods & Principles',
        'Module 3: Case Studies & Lab Guidelines',
      ],
      sampleExcerpt: excerpt || `This textbook was published via the Lecturer Self-Publishing Rights Portal.`,
    };

    onAddCustomBook(newBook);
    setPublished(true);
  };

  return (
    <div id="lecturer-portal-overlay" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div id="lecturer-portal-container" className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-600 rounded-lg">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base">Faculty & Lecturer Publishing Portal</h2>
              <p className="text-xs text-slate-300">Publish authorized course packs & earn direct royalties</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {published ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900">Course Material Published!</h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Your material is now listed on CampusRead with DRM copyright protection. Students at <strong>{institution}</strong> can now purchase or access it online.
              </p>

              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-blue-700 text-white font-bold rounded-lg shadow hover:bg-blue-800 transition-colors text-sm"
              >
                Return to Marketplace
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-3 text-xs text-blue-900 font-medium">
                <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0" />
                <span>
                  All publications carry automated DRM anti-piracy watermarking with verified institutional attribution.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Textbook / Course Pack Title</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Advanced Organic Chemistry Notes"
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Author Name & Title</label>
                  <input
                    type="text"
                    required
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="e.g. Prof. O. B. Williams"
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Faculty / Department</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Medical Sciences">Medical Sciences</option>
                    <option value="Faculty of Law">Faculty of Law</option>
                    <option value="Social Sciences">Social Sciences</option>
                    <option value="Biological Sciences">Biological Sciences</option>
                    <option value="Business & Tech">Business & Tech</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Institution</label>
                  <select
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none"
                  >
                    <option value="University of Lagos (UNILAG)">UNILAG</option>
                    <option value="University of Ibadan (UI)">UI</option>
                    <option value="Obafemi Awolowo University (OAU)">OAU</option>
                    <option value="Covenant University (CU)">CU</option>
                    <option value="University of Nigeria Nsukka (UNN)">UNN</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Student Price (₦)</label>
                  <input
                    type="number"
                    required
                    min={1000}
                    step={500}
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Sample Excerpt / Introduction</label>
                <textarea
                  rows={3}
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Paste syllabus introduction or key chapter summary for students to preview..."
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none resize-none"
                />
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
                <Upload className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <span className="font-bold text-slate-800 text-sm block">Upload PDF Manuscript / Syllabus Pack</span>
                <span className="text-xs text-slate-500 block mt-0.5">Drag & drop or click to attach manuscript (PDF, DOCX)</span>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-blue-700 text-white font-bold rounded-lg shadow-md hover:bg-blue-800 transition-all text-sm flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Publish Material to CampusRead Marketplace
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
