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
    const userMessage = input.trim();
    if (!userMessage || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: userMessage,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/api/chat/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: userMessage }],
          systemPrompt:
            "Tu es l'assistant parental de Mon Bebebou. Tu réponds toujours en français, tu es bienveillant et rassurant. Tu ne remplaces pas un médecin. Réponds en max 3 paragraphes courts.",
        }),
      });
      const data = await response.json();
      const assistantMessage = data.content[0].text;

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: assistantMessage,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Une erreur est survenue. Vérifiez votre connexion et réessayez.",
        },
      ]);
    } finally {
      setSending(false);
    }
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
      <header
        style={{
          backgroundColor: "white",
          borderBottom: "1px solid #F0E8F5",
          padding: "12px 16px",
          textAlign: "center",
        }}
      >
        <img
          src="/logo-horizontal.png"
          alt="Mon Bebebou"
          style={{
            display: "block",
            margin: "0 auto",
            maxWidth: 120,
            width: "100%",
            height: "auto",
          }}
        />
        <p
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#4A3F5C",
            margin: "8px 0 0",
          }}
        >
          💬 Assistant Bébébou
        </p>
      </header>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          paddingBottom: 160,
          maxWidth: 448,
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxSizing: "border-box",
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
                maxWidth: "80%",
              }}
            >
              <div
                style={{
                  backgroundColor:
                    msg.role === "user" ? "#E8406A" : "white",
                  color: msg.role === "user" ? "white" : "#4A3F5C",
                  borderRadius:
                    msg.role === "user"
                      ? "18px 18px 4px 18px"
                      : "18px 18px 18px 4px",
                  padding: "14px 16px",
                  fontSize: 14,
                  lineHeight: 1.5,
                  boxShadow:
                    msg.role === "user"
                      ? "none"
                      : "0 2px 8px rgba(74,63,92,0.08)",
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
          position: "fixed",
          bottom: 72,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: "#FDF8F2",
          padding: "12px 16px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
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
            placeholder="Posez votre question..."
            style={{
              flex: 1,
              padding: "14px 16px",
              borderRadius: 24,
              border: "1.5px solid #F0E8F5",
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
      </div>
    </main>
  );
}
