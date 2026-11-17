"use client";

import {
  EmailField,
  Form,
  FormSubmit,
  PasswordField,
  useAuth,
  useFormProcessing,
} from "@payloadcms/ui";
import { SpinnerIcon } from "@payloadcms/ui/icons/Spinner";
import { email } from "payload/shared";
import Link from "next/link";
import type React from "react";
import { useEffect, useRef } from "react";

type AdminLoginFormProps = {
  /** Safe post-login target (Payload's getSafeRedirect on the server). */
  redirect: string;
  forgotHref: string;
};

type LoginSubmitProps = {
  sendingRef: React.RefObject<boolean>;
  processingRef: React.RefObject<boolean>;
};

/** Payload's submit button with the spinner and "Bejelentkezés…" while the login request runs; disabled meanwhile. */
function LoginSubmit(props: LoginSubmitProps): React.JSX.Element {
  const processing = useFormProcessing();
  const { sendingRef, processingRef } = props;
  // Release the duplicate-submit guard once Payload has finished the request (success or failure).
  useEffect(() => {
    processingRef.current = processing;
    if (!processing) sendingRef.current = false;
  }, [processing, sendingRef, processingRef]);
  return (
    <>
      <span
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        {processing ? "Bejelentkezés folyamatban…" : ""}
      </span>
      <FormSubmit size="large">
        {processing ? (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <SpinnerIcon size="sm" />
            Bejelentkezés…
          </span>
        ) : (
          "Bejelentkezés"
        )}
      </FormSubmit>
    </>
  );
}

/**
 * Admin login on Payload's own Form, fields and submit button: the native request, error toasts (wrong
 * credentials, lockout) and redirect are unchanged; only the pending label is added. Payload's Form keeps
 * the entered values and re-enables the button after a failure.
 */
export function AdminLoginForm(props: AdminLoginFormProps): React.JSX.Element {
  const { setUser } = useAuth();
  // A second submit before Payload re-renders as processing would send another login attempt (and count
  // toward the lockout); the capture handler drops it.
  const sendingRef = useRef<boolean>(false);
  const processingRef = useRef<boolean>(false);
  const guard = (event: React.FormEvent): void => {
    if (sendingRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    sendingRef.current = true;
    // If Payload stops the submit itself (a required field is empty), no request starts: release the guard.
    window.setTimeout(() => {
      if (!processingRef.current) sendingRef.current = false;
    }, 500);
  };
  return (
    <div onSubmitCapture={guard}>
      <Form
        action="/api/users/login"
        method="POST"
        className="login__form"
        disableSuccessStatus
        initialState={{
          email: { initialValue: "", valid: true, value: undefined },
          password: { initialValue: "", valid: true, value: undefined },
        }}
        onSuccess={(data) => setUser(data as Parameters<typeof setUser>[0])}
        redirect={props.redirect}
        waitForAutocomplete
      >
        <div className="login__form__inputWrap">
          <EmailField
            field={{
              name: "email",
              label: "E-mail",
              required: true,
              admin: { autoComplete: "email" },
            }}
            path="email"
            validate={email}
          />
          <PasswordField
            autoComplete="current-password"
            field={{ name: "password", label: "Jelszó", required: true }}
            path="password"
          />
        </div>
        <Link href={props.forgotHref} prefetch={false}>
          Elfelejtette a jelszavát?
        </Link>
        <LoginSubmit sendingRef={sendingRef} processingRef={processingRef} />
      </Form>
    </div>
  );
}
