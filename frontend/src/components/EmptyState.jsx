import { Inbox } from "lucide-react";
import { useUploadModal } from "../context/UploadModalContext";

export default function EmptyState({
  icon: Icon = Inbox,
  title = "No data yet",
  message = "Upload a CSV to get started.",
  showUpload = true,
}) {
  const { open } = useUploadModal();

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-full bg-black/[0.05] flex items-center justify-center mb-4">
        <Icon size={20} className="text-ink-500" strokeWidth={1.75} />
      </div>
      <h3 className="font-display font-semibold text-ink-900 mb-1">{title}</h3>
      <p className="text-sm text-ink-500 max-w-xs mb-5">{message}</p>
      {showUpload && (
        <button
          onClick={open}
          className="bg-accent hover:bg-accent-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Upload a CSV
        </button>
      )}
    </div>
  );
}
