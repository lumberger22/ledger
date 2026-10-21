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
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-light">
        <Icon size={20} className="text-accent-dark" strokeWidth={1.9} />
      </div>
      <h3 className="font-display font-semibold text-ink-900 mb-1">{title}</h3>
      <p className="text-sm text-ink-500 max-w-xs mb-5">{message}</p>
      {showUpload && (
        <button
          onClick={open}
          className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-dark"
        >
          Upload a CSV
        </button>
      )}
    </div>
  );
}
