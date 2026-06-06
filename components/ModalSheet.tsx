"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

type ModalSheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  sheetStyle?: CSSProperties;
  centered?: boolean;
};

export function ModalSheet({
  open,
  onClose,
  children,
  sheetStyle,
  centered = false,
}: ModalSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {centered ? (
            <motion.div
              key="centered-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(0,0,0,0.5)",
                zIndex: 1000,
                padding: "20px",
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  maxWidth: "400px",
                  backgroundColor: "white",
                  borderRadius: 24,
                  padding: 28,
                  margin: "auto",
                  maxHeight: "90vh",
                  overflowY: "auto",
                  boxShadow: "0 8px 32px rgba(74,63,92,0.15)",
                  ...sheetStyle,
                }}
              >
                {children}
              </motion.div>
            </motion.div>
          ) : (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 50,
              }}
            >
              <motion.div
                key="overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "rgba(0,0,0,0.4)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  padding: "0 16px 16px",
                  pointerEvents: "none",
                }}
              >
                <motion.div
                  key="sheet"
                  initial={{ y: "100%", opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: "100%", opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    pointerEvents: "auto",
                    width: "100%",
                    maxWidth: 384,
                    borderRadius: 24,
                    backgroundColor: "white",
                    padding: 24,
                    boxShadow: "0 8px 32px rgba(74,63,92,0.15)",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    ...sheetStyle,
                  }}
                >
                  {children}
                </motion.div>
              </div>
            </div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
