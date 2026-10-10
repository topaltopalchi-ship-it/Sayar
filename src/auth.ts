const PIN_KEY = "sai-sai-pin";

export function hasPin(): boolean {
  return Boolean(localStorage.getItem(PIN_KEY));
}

export function savePin(pin: string): void {
  localStorage.setItem(PIN_KEY, pin);
}

export function checkPin(pin: string): boolean {
  return localStorage.getItem(PIN_KEY) === pin;
}

export function clearPin(): void {
  localStorage.removeItem(PIN_KEY);
}

export function authScreen(onSuccess: () => void): void {
  const existing = hasPin();
  const title = existing ? "ورود به سای‌سای" : "ساخت رمز ورود سای‌سای";
  const action = existing ? "ورود" : "ساخت رمز";

  document.body.innerHTML += `
    <div id="auth-lock" class="modal-backdrop">
      <section class="modal">
        <h2>${title}</h2>
        <p class="muted">برای محافظت از اطلاعات مالی خود یک رمز ۴ تا ۶ رقمی وارد کنید.</p>
        <input id="auth-pin" type="password" inputmode="numeric" maxlength="6" placeholder="رمز ورود">
        <button id="auth-submit" class="primary-button wide">${action}</button>
      </section>
    </div>`;

  document.querySelector("#auth-submit")?.addEventListener("click", () => {
    const input = document.querySelector<HTMLInputElement>("#auth-pin");
    const pin = input?.value.trim() ?? "";
    if (!/^\d{4,6}$/.test(pin)) return;

    if (existing && !checkPin(pin)) return;
    if (!existing) savePin(pin);

    document.querySelector("#auth-lock")?.remove();
    onSuccess();
  });
}
