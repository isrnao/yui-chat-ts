import { useState } from "react";
import { validateName } from "../utils/validation";

export function useEntryForm(onEnter: (form: { name: string; color: string; email: string }) => Promise<void>) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#ff69b4");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit() {
    const err = validateName(name);
    if (err) return setError(err);
    setIsPending(true);
    setError(null);
    try {
      await onEnter({ name, color, email });
    } catch (e) {
      setError((e as Error)?.message ?? "登録に失敗しました");
    } finally {
      setIsPending(false);
    }
  }
  return { name, setName, color, setColor, email, setEmail, error, isPending, handleSubmit };
}
