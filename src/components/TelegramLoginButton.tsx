"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

interface TelegramLoginButtonProps {
  botUsername: string | undefined;
  onAuthenticated?: () => void;
}

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramLogin?: (user: TelegramUser) => void;
  }
}

export function TelegramLoginButton({ botUsername, onAuthenticated }: TelegramLoginButtonProps) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const authenticated = useEffectEvent(() => {
    onAuthenticated?.();
  });

  useEffect(() => {
    if (!botUsername || !container.current) return;
    window.onTelegramLogin = async (user) => {
      setError(undefined);
      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(user),
      });
      if (!response.ok) {
        setError("Telegram sign-in could not be verified. Please try again.");
        return;
      }
      authenticated();
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "6");
    script.setAttribute("data-onauth", "onTelegramLogin(user)");
    container.current.replaceChildren(script);
    return () => {
      delete window.onTelegramLogin;
    };
  }, [botUsername]);

  if (!botUsername) {
    return <p className="text-sm text-warning">Telegram login is not configured yet.</p>;
  }

  return (
    <div>
      <div ref={container} />
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}
