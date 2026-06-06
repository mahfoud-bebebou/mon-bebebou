"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send } from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "Bonjour ! Je suis votre assistant Mon Bebebou. Posez-moi vos questions sur le sommeil, l'alimentation ou le bien-être de bébé 🌙",
  },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Merci pour votre question ! L'assistant intelligent arrive bientôt — en attendant, consultez votre dashboard pour suivre les repas et le sommeil de bébé.",
        },
      ]);
      setSending(false);
    }, 600);
  }

  return (
    <main
      style={{
        backgroundColor: "#FDF8F2",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          padding: "24px 16px 12px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#4A3F5C",
            margin: 0,
          }}
        >
          💬 Assistant
        </h1>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 16px 16px",
          maxWidth: 448,
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300 }}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
              }}
            >
              <div
                style={{
                  backgroundColor:
                    msg.role === "user" ? "#E8406A" : "white",
                  color: msg.role === "user" ? "white" : "#4A3F5C",
                  borderRadius: 18,
                  padding: "12px 16px",
                  fontSize: 14,
                  lineHeight: 1.5,
                  boxShadow:
                    msg.role === "user"
                      ? "0 4px 12px rgba(232,64,106,0.25)"
                      : "0 4px 12px rgba(74,63,92,0.06)",
                }}
              >
                {msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div
        style={{
          padding: "12px 16px 16px",
          maxWidth: 448,
          width: "100%",
          margin: "0 auto",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Votre question..."
          style={{
            flex: 1,
            padding: "14px 16px",
            borderRadius: 24,
            border: "1.5px solid #F0E8F8",
            fontSize: 15,
            backgroundColor: "white",
            color: "#4A3F5C",
            outline: "none",
          }}
        />
        <motion.button
          type="button"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          whileTap={{ scale: 0.9, rotate: 15 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            backgroundColor: "#E8406A",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: sending || !input.trim() ? "default" : "pointer",
            opacity: sending || !input.trim() ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          <Send size={20} color="white" />
        </motion.button>
      </div>
    </main>
  );
}
