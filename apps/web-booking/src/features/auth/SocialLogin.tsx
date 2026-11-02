import { useEffect, useRef } from "react";
import { Button } from "../../components/ui";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>,
          ) => void;
        };
      };
    };
    FB?: {
      init: (config: {
        appId: string;
        cookie: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: {
          authResponse?: { accessToken: string };
        }) => void,
        options: { scope: string },
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
  | string
  | undefined;
const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID as
  | string
  | undefined;

export const SOCIAL_LOGIN_AVAILABLE = Boolean(
  GOOGLE_CLIENT_ID || FACEBOOK_APP_ID,
);

function loadScript(id: string, src: string) {
  if (document.getElementById(id)) {
    return;
  }
  const script = document.createElement("script");
  script.id = id;
  script.src = src;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

/**
 * Google y Facebook solo aportan nombre y correo: el telefono se verifica igual con un
 * codigo, porque es el dato con el que el negocio contacta al cliente.
 */
export function SocialLogin({
  onGoogle,
  onFacebook,
  onError,
  disabled,
}: {
  onGoogle: (idToken: string) => void;
  onFacebook: (accessToken: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const googleButton = useRef<HTMLDivElement>(null);
  const onGoogleRef = useRef(onGoogle);
  onGoogleRef.current = onGoogle;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      return;
    }
    loadScript("google-gsi-script", "https://accounts.google.com/gsi/client");
    const timer = window.setInterval(() => {
      if (!window.google || !googleButton.current) {
        return;
      }
      window.clearInterval(timer);
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: ({ credential }) => onGoogleRef.current(credential),
      });
      googleButton.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButton.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        locale: "es",
      });
    }, 300);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!FACEBOOK_APP_ID) {
      return;
    }
    window.fbAsyncInit = () =>
      window.FB?.init({
        appId: FACEBOOK_APP_ID,
        cookie: true,
        xfbml: false,
        version: "v23.0",
      });
    loadScript("facebook-jssdk", "https://connect.facebook.net/es_LA/sdk.js");
  }, []);

  const loginWithFacebook = () => {
    if (!window.FB) {
      onError("Facebook aún no está listo. Intenta de nuevo en unos segundos.");
      return;
    }
    window.FB.login(
      (response) => {
        const token = response.authResponse?.accessToken;
        if (token) {
          onFacebook(token);
        } else {
          onError("No se completó el inicio con Facebook.");
        }
      },
      { scope: "public_profile,email" },
    );
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {GOOGLE_CLIENT_ID && <div ref={googleButton} className="min-h-10" />}
      {FACEBOOK_APP_ID && (
        <Button
          variant="secondary"
          className="w-full"
          disabled={disabled}
          onClick={loginWithFacebook}
        >
          Continuar con Facebook
        </Button>
      )}
    </div>
  );
}
