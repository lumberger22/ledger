import { useState } from "react";
import { X, UploadCloud, FileText, Loader2, AlertCircle } from "lucide-react";
import { uploadPaystub } from "../api/income";

export default function PaystubUploadModal({ isOpen, onClose, onParsed }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  function resetAndClose() {
    setFile(null);
    setError(null);
    setUploading(false);
    onClose();
  }

  async function handleSubmit() {
    if (!file) {
      setError("Choose a PDF payslip to upload.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await uploadPaystub(file);
      onParsed(result.paystubs);
      resetAndClose();
    } catch (err) {
      setError(err.message);
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={resetAndClose}
    >
      <div
        className="bg-surface rounded-xl2 shadow-cardHover w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display font-bold text-lg text-ink-900">
            Upload Payslip
          </h2>
          <button
            onClick={resetAndClose}
            className="p-1.5 rounded-md text-ink-500 hover:bg-black/5"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-ink-500 mb-5">
          The PDF is parsed in memory for the pay-period, deductions, benefits,
          and payment destinations. The uploaded file is not stored.
        </p>

        <label className="flex items-center gap-3 border border-dashed border-line rounded-xl px-4 py-5 cursor-pointer hover:bg-black/[0.015]">
          <FileText size={20} className="text-ink-300 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900 truncate">
              {file ? file.name : "Choose a PDF payslip"}
            </p>
            <p className="text-xs text-ink-500 mt-0.5">
              A PDF can contain multiple paystubs.
            </p>
          </div>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>

        {error && (
          <div className="flex items-start gap-2 text-sm text-over mt-3 bg-over/10 border border-over/30 rounded-lg px-3 py-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-line">
          <button
            onClick={resetAndClose}
            className="text-sm font-medium text-ink-500 px-3.5 py-2 rounded-lg hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {uploading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <UploadCloud size={15} />
            )}
            {uploading ? "Parsing…" : "Review Payslip"}
          </button>
        </div>
      </div>
    </div>
  );
}
