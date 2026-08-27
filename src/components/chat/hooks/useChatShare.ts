import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { useConfirm } from "@/components/ConfirmDialog";
import type { useLocale } from "@/components/LocaleProvider";
import { useIsMounted } from "@/lib/use-mounted";

type Translate = ReturnType<typeof useLocale>["t"];

type UseChatShareOptions = {
  activeId: string | null;
  token: string | null;
  setToken: (token: string | null) => void;
  setError: (message: string) => void;
  confirm: ReturnType<typeof useConfirm>;
  t: Translate;
};

export const useChatShare = ({
  activeId,
  token,
  setToken,
  setError,
  confirm,
  t,
}: UseChatShareOptions) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    right: 0,
    fullWidth: false,
  });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isPortalReady = useIsMounted();

  const updatePosition = useCallback(() => {
    const element = buttonRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const fullWidth = window.innerWidth < 640;
    setPosition({
      top: rect.bottom + 8,
      right: fullWidth ? 12 : Math.max(8, window.innerWidth - rect.right),
      fullWidth,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !token) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, token, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  const url = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${token}`
    : "";

  const createShare = async (rotate = false) => {
    if (!activeId) return;
    if (rotate && token) {
      const ok = await confirm({
        title: t("chat.newLink"),
        description: t("chat.shareConfirmNew"),
        confirmLabel: t("common.confirm"),
      });
      if (!ok) return;
    }
    setIsBusy(true);
    setIsCopied(false);
    try {
      const res = await fetch(`/api/conversations/${activeId}/share`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        share_token?: string;
        error?: string;
      };
      if (!res.ok || !data.share_token) {
        setError(data.error || t("chat.couldNotCreateShare"));
        return;
      }
      setToken(data.share_token);
      setIsOpen(true);
    } catch {
      setError(t("chat.couldNotCreateShare"));
    } finally {
      setIsBusy(false);
    }
  };

  const revokeShare = async () => {
    if (!activeId) return;
    setIsBusy(true);
    try {
      const res = await fetch(`/api/conversations/${activeId}/share`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(t("chat.couldNotRevokeShare"));
        return;
      }
      setToken(null);
      setIsCopied(false);
      setIsOpen(false);
    } catch {
      setError(t("chat.couldNotRevokeShare"));
    } finally {
      setIsBusy(false);
    }
  };

  const copyShare = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch {
      setError(t("chat.couldNotCopyLink"));
    }
  };

  return {
    isOpen,
    setIsOpen,
    isBusy,
    isCopied,
    setIsCopied,
    position,
    buttonRef,
    menuRef,
    isPortalReady,
    url,
    createShare,
    revokeShare,
    copyShare,
  };
};
