import { createContext, useContext, useState, useCallback } from "react";
import UploadModal from "../components/UploadModal";

const UploadModalContext = createContext(null);

export function UploadModalProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <UploadModalContext.Provider value={{ open }}>
      {children}
      <UploadModal isOpen={isOpen} onClose={close} />
    </UploadModalContext.Provider>
  );
}

export function useUploadModal() {
  const ctx = useContext(UploadModalContext);
  if (!ctx) {
    throw new Error(
      "useUploadModal must be used within an UploadModalProvider",
    );
  }
  return ctx;
}
