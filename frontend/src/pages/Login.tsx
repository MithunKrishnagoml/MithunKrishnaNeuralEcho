import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const LOGIN_EMAIL = "goml@neuralecho.app";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (username !== "goML") {
      setError("Invalid username");
      setLoading(false);
      return;
    }

    try {
      // Try sign in first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: LOGIN_EMAIL,
        password,
      });

      if (signInError) {
        // If user doesn't exist yet, sign up
        if (signInError.message.includes("Invalid login")) {
          const { error: signUpError } = await supabase.auth.signUp({
            email: LOGIN_EMAIL,
            password,
            options: { emailRedirectTo: window.location.origin },
          });
          if (signUpError) {
            setError(signUpError.message);
            setLoading(false);
            return;
          }
        } else {
          setError(signInError.message);
          setLoading(false);
          return;
        }
      }

      navigate("/");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-background flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <img src="/favicon.png" alt="NeuralEcho" className="w-14 h-14 rounded-xl border border-border/50 mx-auto" />
          <h1 className="font-mono-display text-xl font-semibold text-foreground tracking-tight">NeuralEcho</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Enter username"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Enter password"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in" : "Sign In"}
          </button>
        </form>

        <footer className="text-center">
          <p className="text-xs text-muted-foreground/40 tracking-wide">Neuralgo, Inc.  Internal & Confidential</p>
        </footer>
      </div>
    </div>
  );
}
